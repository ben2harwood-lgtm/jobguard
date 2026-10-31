import type { Pool, PoolClient } from "pg";
import { EnterpriseIdentityRepository, type SsoSession } from "./enterprise-identity-repository.js";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";

export interface StoredOidcRequest { connection:unknown; request:unknown; linkSessionId:string|null }
/** Identity credential only. Request secrets are returned solely by the one-use claim routine. */
export class OidcRepository {
 readonly enterprise:EnterpriseIdentityRepository;
 constructor(readonly pool:Pool) {this.enterprise=new EnterpriseIdentityRepository(pool);}
 transaction<T>(work:(client:PoolClient)=>Promise<T>):Promise<T> {return this.enterprise.transaction(work);}
 audit(...args:Parameters<EnterpriseIdentityRepository['audit']>):Promise<void> {return this.enterprise.audit(...args);}
 refusal(route:string,code:string):Promise<void> {return this.enterprise.refusal(route,code);}
 async load(id:string):Promise<unknown> {return this.transaction(c=>this.enterprise.connection(c,id));}
 async create(context:VerifiedTenantContext,digest:string,metadata:unknown):Promise<void> {
  await withTenant(this.pool,context,async db=>{
   const row=(await db.$client.query<{id:string}>("SELECT identity.oidc_create($1,$2::jsonb) id",[digest,JSON.stringify(metadata)])).rows[0]!;
   await this.audit(db.$client,row.id,"sso.oidc.connection.created","identity:oidc");
  });
 }
 async save(id:string,request:unknown,connection:unknown,link:{sessionId:string;userId:string;digest:string;csrf:string}|null):Promise<void> {
  await this.transaction(async c=>{
   await c.query("SELECT identity.oidc_save($1,$2::jsonb,$3::jsonb,$4,$5,$6,$7)",[id,JSON.stringify(request),JSON.stringify(connection),link?.sessionId??null,link?.userId??null,link?.digest??null,link?.csrf??null]);
   await this.audit(c,id,"sso.oidc.request.issued","identity:oidc");
  });
 }
 async claim(id:string,state:string,browser:string):Promise<StoredOidcRequest> {
  return this.transaction(async c=>{
   const r=(await c.query<{result:StoredOidcRequest}>("SELECT identity.oidc_claim($1,$2,$3) result",[id,state,browser])).rows[0]!.result;
   await this.audit(c,id,"sso.oidc.request.claimed","identity:oidc");return r;
  });
 }
 async fail(id:string,state:string):Promise<void> {
  await this.transaction(async c=>{
   await c.query("SELECT identity.oidc_fail($1,$2)",[id,state]);
   await this.audit(c,id,"sso.oidc.exchange.unknown","identity:oidc");
  });
 }
 async finish(c:PoolClient,id:string,state:string,claims:unknown,session:Pick<SsoSession,"id"|"tokenDigest"|"csrfToken">):Promise<{tenantId:string;membershipId:string}|{code:string}> {
  return (await c.query<{result:{tenantId:string;membershipId:string}|{code:string}}>("SELECT identity.oidc_complete($1,$2,$3::jsonb,$4,$5,$6) result",[id,state,JSON.stringify(claims),session.id,session.tokenDigest,session.csrfToken])).rows[0]!.result;
 }
}
