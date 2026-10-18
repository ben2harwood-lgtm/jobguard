import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { OidcRepository } from "@jobguard/db";
import type { DeploymentMode } from "@jobguard/config";
import type { PersistedAuthProvider } from "../persisted-auth-provider.js";
import { resolveVerifiedTenantContext, type TenantRequestCredentials } from "../principal-bridge.js";
import { SsoAuthProvider } from "./sso.application.js";
import { OidcAdapter } from "./oidc.js";
import { OidcError, oidcRequestV1 } from "./oidc.contracts.js";
import { oidcAdminV1, oidcCallbackV1, oidcConnectionV1, oidcStartV1, type OidcConnection } from "./oidc-persistence.contracts.js";
import { TestOidcIssuer } from "./test-oidc-issuer.js";

/** Each server process hosts only the fictional issuer. Losing its codes requires a fresh sign-in. */
const localIssuers=new Map<string,TestOidcIssuer>();
export class OidcApplication {
 readonly provider:SsoAuthProvider;
 constructor(readonly base:PersistedAuthProvider,readonly repository:OidcRepository,readonly allowedOrigin:string,readonly mode:DeploymentMode,
  readonly issuer?:TestOidcIssuer) {this.provider=new SsoAuthProvider(base,repository.enterprise);}
 private fixture(id:string):TestOidcIssuer {
  if(this.issuer)return this.issuer;
  let issuer=localIssuers.get(id);
  if(!issuer){issuer=new TestOidcIssuer();issuer.claims={sub:`fictional-${id}`,email:`person@${id}.oidc.invalid`,groups:["site"]};localIssuers.set(id,issuer);}
  return issuer;
 }
 private async guarded<T>(id:string,work:()=>Promise<T>):Promise<T> {
  try {if(this.mode!=="synthetic_demo")throw new OidcError();return await work();}
  catch {try {await this.repository.refusal(id,"OIDC_REFUSED");} finally {throw new OidcError();}}
 }
 private origin(origin:string|undefined):void {if(origin!==this.allowedOrigin)throw new OidcError();}
 private async connection(id:string):Promise<OidcConnection> {
  z.string().uuid().parse(id);const c=oidcConnectionV1.parse(await this.repository.load(id));
  if(c.config.connectionId!==id)throw new OidcError();return c;
 }
 async admin(raw:unknown,credentials:TenantRequestCredentials) {
  return this.guarded("oidc-admin",async()=>{
   this.origin(credentials.origin);const p=oidcAdminV1.parse(raw);
   const context=await resolveVerifiedTenantContext(this.provider,{...credentials,requestedTenantId:p.requested_tenant_id},this.allowedOrigin);
   await this.repository.create(context,this.base.digest(`session:${credentials.sessionToken}`),p.connection);
   return {version:"oidc-admin-result.v1",connectionId:p.connection.config.connectionId};
  });
 }
 async start(id:string,raw:unknown,credentials:TenantRequestCredentials) {
  return this.guarded(id,async()=>{
   this.origin(credentials.origin);const p=oidcStartV1.parse(raw),connection=await this.connection(id);
   let link:{sessionId:string;userId:string;digest:string;csrf:string}|null=null;
   if(p.linkExisting) {
    const context=await resolveVerifiedTenantContext(this.provider,{...credentials,requestedTenantId:connection.config.tenantId},this.allowedOrigin);
    if(context.tenantId!==connection.config.tenantId)throw new OidcError();
    const principal=await this.provider.authenticate(credentials.sessionToken!);if(!principal)throw new OidcError();
    link={sessionId:principal.sessionId,userId:principal.identityUserId,digest:this.base.digest(`session:${credentials.sessionToken}`),csrf:credentials.csrfToken!};
   }
   const browser=randomBytes(32).toString("base64url");
   const started=await new OidcAdapter(connection.config,this.fixture(id).transport).start(browser);
   await this.repository.save(id,started.request,connection,link);
   // Local practice callback carries only code/state/issuer. Never return verifier, nonce or tokens.
   return {version:"oidc-started.v1",callback:this.fixture(id).authorize(started.authorizationUrl),browser};
  });
 }
 async callback(id:string,raw:unknown,browser:string|undefined,origin:string|undefined) {
  return this.guarded(id,async()=>{
   this.origin(origin);z.string().uuid().parse(id);const input=oidcCallbackV1.parse(raw);
   const binding=z.string().regex(/^[A-Za-z0-9_-]{43}$/u).parse(browser);
   const url=new URL(input.callback),state=z.string().regex(/^[A-Za-z0-9_-]{43}$/u).parse(url.searchParams.get("state"));
   // Claim commits and releases its client before even discovery/exchange begins.
   const stored=await this.repository.claim(id,state,binding);
   let committed=false;
   try {
    const connection=oidcConnectionV1.parse(stored.connection),request=oidcRequestV1.parse(stored.request);
    const claims=await new OidcAdapter(connection.config,this.fixture(id).transport).validate(input.callback,request,binding);
    const sessionToken=randomBytes(32).toString("base64url"),csrfToken=randomBytes(24).toString("base64url");
    const result=await this.repository.transaction(async c=>{
     const outcome=await this.repository.finish(c,id,state,claims,{id:randomUUID(),tokenDigest:this.base.digest(`session:${sessionToken}`),csrfToken});
     await this.repository.audit(c,id,'code' in outcome?"sso.oidc.signin.refused":"sso.oidc.signin.completed","identity:oidc",'code' in outcome?"OIDC_REFUSED":undefined);
     return outcome;
    });
    committed=true;
    // Verified no-group revocation has committed even when no session is issued.
    if('code' in result)throw new OidcError();
    return {sessionToken,csrfToken,tenantId:result.tenantId,sessionLimitSeconds:connection.sessionLimitSeconds};
   } catch {if(!committed)await this.repository.fail(id,state);throw new OidcError();}
  });
 }
 async refuseInput(id:string):Promise<never> {await this.repository.refusal(id,"OIDC_REFUSED");throw new OidcError();}
}
