import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { withTenant, type VerifiedTenantContext, type TenantTransaction } from "./tenant-context.js";
import { auditEventInputV1Schema, canonicalAuditHash } from "./audit.js";

export class SsoRepositoryError extends Error {
  constructor(readonly code:string, options?:ErrorOptions) { super(code,options); this.name="SsoRepositoryError"; }
}
const knownErrors = new Set(["SSO_ROUTE_BLOCKED","SSO_NOT_FOUND","SSO_FORBIDDEN","INVALID_SSO_INPUT","DOMAIN_UNVERIFIED","DOMAIN_CLAIMED","ASSERTION_REPLAY","REQUEST_REFUSED","LINK_REQUIRED","LINK_FORBIDDEN","MEMBERSHIP_REVOKED","NO_MAPPED_GRANTS","STALE_MAPPING"]);
export function ssoRepositoryError(error:unknown):SsoRepositoryError {
  if(error instanceof SsoRepositoryError)return error;
  const e=(error??{}) as {code?:string;message?:string;constraint?:string};
  if(e.message && knownErrors.has(e.message))return new SsoRepositoryError(e.message);
  if(e.code==="23505")return new SsoRepositoryError(e.constraint?.includes("verified_domain")?"DOMAIN_CLAIMED":e.constraint?.includes("sso_assertion_use")?"ASSERTION_REPLAY":"INVALID_SSO_INPUT");
  return new SsoRepositoryError("SSO_UNAVAILABLE",{cause:error});
}
export interface SsoClaims {assertionId:string;requestId:string;subject:string;email:string;groups:string[]}
export interface SsoSession {id:string;tokenDigest:string;csrfToken:string;expiresAt:Date}
export interface SsoRequestCache {
  saveAsync(key:string,value:string):Promise<{value:string;createdAt:number}|null>;
  getAsync(key:string):Promise<string|null>;
  removeAsync(key:string|null):Promise<string|null>;
}
export interface SsoView {
  version:"sso-admin-view.v1";environment:"synthetic_demo";tenantId:string;
  connections:Array<{id:string;idpEntityId:string;spEntityId:string;callbackUrl:string;sessionLimitSeconds:number}>;
  domains:Array<{connection_id:string;domain:string}>;
  mappings:Array<{connection_id:string;idp_group:string;revision:number;role:string;scope_kind:string;scope_id:string;enabled:boolean}>;
  events:Array<{id:string;event_type:string;created_at:Date}>;
}
const canonical = (v:unknown):string => v===null||typeof v!=="object"?JSON.stringify(v):Array.isArray(v)?`[${v.map(canonical).join(",")}]`:`{${Object.entries(v as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>`${JSON.stringify(k)}:${canonical(x)}`).join(",")}}`;
const hash = (v:string) => createHash("sha256").update(v).digest("hex");
/** Restricted identity credentials; context is accepted per call, never retained. */
export class EnterpriseIdentityRepository {
  constructor(readonly pool:Pool) {}
  async transaction<T>(work:(client:PoolClient)=>Promise<T>):Promise<T> {
    const client=await this.pool.connect();
    try { await client.query("BEGIN");const result=await work(client);await client.query("COMMIT");return result; }
    catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
  }
  async connection(client:PoolClient,id:string):Promise<unknown> {
    try { return (await client.query<{metadata:unknown}>("SELECT identity.sso_load_connection($1) metadata",[id])).rows[0]!.metadata; }
    catch(error){throw ssoRepositoryError(error);}
  }
  cache(client:PoolClient,connectionId:string,stateDigest:string|null=null,linkSessionId:string|null=null):SsoRequestCache {
    const run=async(key:string|null,value:string|null,operation:string) => (await client.query<{value:string|null}>("SELECT identity.sso_cache($1,$2,$3,$4,$5,$6) value",[connectionId,key,value,stateDigest,linkSessionId,operation])).rows[0]!.value;
    return {
      saveAsync:async(key,value)=>{await run(key,value,"save");return {value,createdAt:Date.now()};},
      getAsync:key=>run(key,null,"get"),removeAsync:key=>key===null?Promise.resolve(null):run(key,null,"remove"),
    };
  }
  async complete(client:PoolClient,connectionId:string,claims:SsoClaims,session:SsoSession,stateDigest:string):Promise<{tenantId:string;userId:string;membershipId:string}|{code:string}> {
    try { return (await client.query<{result:{tenantId:string;userId:string;membershipId:string}|{code:string}}>("SELECT identity.sso_complete($1,$2::jsonb,$3,$4,$5,$6,$7) result",[connectionId,JSON.stringify({...claims,subjectHash:hash(claims.subject),emailHash:hash(claims.email)}),stateDigest,session.id,session.tokenDigest,session.csrfToken,session.expiresAt])).rows[0]!.result; }
    catch(error){throw ssoRepositoryError(error);}
  }
  async audit(client:PoolClient,connectionId:string,eventType:string,actorRef="identity:saml",code?:string,commandHash?:string):Promise<void> {
    const payload={references:{environment:"synthetic_demo",...(code?{code}: {})},...(commandHash?{hashes:{document:commandHash}}:{}),classifications:{action:"security" as const}};
    const input=auditEventInputV1Schema.parse({id:randomUUID(),version:"audit.v1",actorRef,eventType,subjectType:"sso-connection",subjectRef:connectionId,payload});
    const h=(await client.query<{tenant_id:string;sequence:string;previous_hash:string|null;occurred_at:Date}>("SELECT * FROM identity.sso_audit_head($1)",[connectionId])).rows[0]!;
    const e={...input,tenantId:h.tenant_id,sequence:Number(h.sequence),previousHash:h.previous_hash,occurredAt:h.occurred_at,payloadHash:hash(canonical(payload))};
    await client.query("SELECT identity.sso_audit_append($1,$2::jsonb)",[connectionId,JSON.stringify({...e,eventHash:canonicalAuditHash(e)})]);
  }
  async refusal(route:string,code:string):Promise<void> {
    // Unknown/malformed routes have no tenant authority. Always append the global bootstrap event.
    await this.pool.query("INSERT INTO identity.sso_refusal_event(id,route_hash,code) VALUES($1,$2,$3)",[randomUUID(),hash(route),code]);
    if(!/^[0-9a-f-]{36}$/iu.test(route))return;
    try {await this.transaction(async client=>{await this.connection(client,route);await this.audit(client,route,"sso.refused","identity:saml",code);});}
    catch(error){if(ssoRepositoryError(error).code!=="SSO_NOT_FOUND" && ssoRepositoryError(error).code!=="SSO_ROUTE_BLOCKED")throw error;}
  }
  async admin(context:VerifiedTenantContext,sessionDigest:string,input:Record<string,unknown>):Promise<void> {
    try {await withTenant(this.pool,context,async db=>{
      const actor=(await db.$client.query<{actor:string}>("SELECT identity.sso_admin_command($1,$2::jsonb) actor",[sessionDigest,JSON.stringify(input)])).rows[0]!.actor;
      const c=String(input.action==="connection.create"?input.id:input.connectionId);
      await this.audit(db.$client,c,`sso.${String(input.action)}`,`membership:${actor}`,undefined,hash(canonical(input)));
    });}catch(error){throw ssoRepositoryError(error);}
  }
  async view(context:VerifiedTenantContext,sessionDigest:string):Promise<SsoView> {
    return withTenant(this.pool,context,async db=>{
      await db.$client.query("SELECT identity.sso_require_admin($1,$2)",[sessionDigest,context.tenantId]);
      const connections=(await db.$client.query<{metadata:SsoView['connections'][number]}>("SELECT metadata FROM identity.sso_connection ORDER BY created_at,id")).rows.map(({metadata})=>({id:metadata.id,idpEntityId:metadata.idpEntityId,spEntityId:metadata.spEntityId,callbackUrl:metadata.callbackUrl,sessionLimitSeconds:metadata.sessionLimitSeconds}));
      const domains=(await db.$client.query<SsoView['domains'][number]>("SELECT connection_id,domain FROM identity.verified_domain ORDER BY domain")).rows;
      const mappings=(await db.$client.query<SsoView['mappings'][number]>("SELECT DISTINCT ON(connection_id,idp_group) connection_id,idp_group,revision,role,scope_kind,scope_id,enabled FROM identity.idp_group_role_mapping ORDER BY connection_id,idp_group,revision DESC")).rows;
      const events=(await db.$client.query<SsoView['events'][number]>("SELECT * FROM identity.sso_admin_events($1,$2)",[sessionDigest,context.tenantId])).rows;
      return {version:"sso-admin-view.v1",environment:"synthetic_demo",tenantId:context.tenantId,connections,domains,mappings,events};
    });
  }
  async sessionScope(sessionId:string):Promise<{tenantId:string;membershipId:string;revoked?:boolean}|null> {
    return (await this.pool.query<{scope:{tenantId:string;membershipId:string;revoked?:boolean}|null}>("SELECT identity.sso_session_scope($1) scope",[sessionId])).rows[0]!.scope;
  }
  async allowed(context:VerifiedTenantContext,connectionId:string,sessionId:string,membershipId:string,permission:string,targetId:string):Promise<boolean> {
    return withTenant(this.pool,context,async(db:TenantTransaction)=> (await db.$client.query<{allowed:boolean}>("SELECT identity.sso_action_allowed($1,$2,$3,$4,$5) allowed",[connectionId,sessionId,membershipId,permission,targetId])).rows[0]!.allowed);
  }
}
