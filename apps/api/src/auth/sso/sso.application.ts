import { createPublicKey, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { EnterpriseIdentityRepository, ssoRepositoryError, type VerifiedTenantContext } from "@jobguard/db";
import type { DeploymentMode } from "@jobguard/config";
import { AuthError, type AuthProvider, type AuthPrincipal, type ActiveMembership, type ChallengeRequest } from "../auth-provider.js";
import { PersistedAuthProvider } from "../persisted-auth-provider.js";
import { resolveVerifiedTenantContext, type TenantRequestCredentials } from "../principal-bridge.js";
import { SamlAdapter, SamlValidationError } from "./saml.js";
import { SsoError, requireSyntheticSso, ssoAdminV1, ssoCallbackV1, ssoConnectionIdV1, ssoMetadataV1, ssoStartV1, ssoWorkerActionV1, syntheticSsoMetadata, ssoErrorCodes, type SsoMetadata } from "./sso.contracts.js";

/** Provider-neutral wrapper delegates entered-code auth; SAML session scope stays persisted. */
export class SsoAuthProvider implements AuthProvider {
  constructor(readonly base:PersistedAuthProvider,readonly repository:EnterpriseIdentityRepository) {}
  requestCode(input:ChallengeRequest) {return this.base.requestCode(input);}
  verifyCode(...input:Parameters<PersistedAuthProvider['verifyCode']>) {return this.base.verifyCode(...input);}
  async authenticate(token:string):Promise<AuthPrincipal|undefined> {
    const principal=await this.base.authenticate(token);if(!principal)return undefined;
    const scope=await this.repository.sessionScope(principal.sessionId);
    return scope?.revoked?undefined:principal;
  }
  async findMembership(principal:AuthPrincipal,tenantId:string):Promise<ActiveMembership|undefined> {
    const scope=await this.repository.sessionScope(principal.sessionId);
    if(scope && (scope.revoked || scope.tenantId!==tenantId))return undefined;
    const m=await this.base.findMembership(principal,tenantId);
    return m && (!scope || scope.membershipId===m.id)?m:undefined;
  }
}
function typed(error:unknown):SsoError {
  if(error instanceof SsoError)return error;
  if(error instanceof SamlValidationError)return new SsoError("SAML_REFUSED");
  if(error instanceof z.ZodError || error instanceof SyntaxError)return new SsoError("INVALID_SSO_INPUT");
  if(error instanceof AuthError)return new SsoError("SSO_FORBIDDEN");
  const translated=ssoRepositoryError(error);
  const code=ssoErrorCodes.includes(translated.code as SsoError['code'])?translated.code as SsoError['code']:"SSO_UNAVAILABLE";
  return new SsoError(code,code==="SSO_UNAVAILABLE"?{cause:Object.hasOwn(translated,"cause")?translated.cause:error}:undefined);
}
export class SsoApplication {
  readonly provider:SsoAuthProvider;
  constructor(readonly base:PersistedAuthProvider,readonly repository:EnterpriseIdentityRepository,readonly allowedOrigin:string,readonly mode:DeploymentMode="synthetic_demo") {
    this.provider=new SsoAuthProvider(base,repository);
  }
  private async guarded<T>(route:string,work:()=>Promise<T>):Promise<T> {
    try {return await work();}catch(error){const failure=typed(error);await this.repository.refusal(route,failure.code);throw failure;}
  }
  private gate() { requireSyntheticSso(this.mode,"in-process-test-idp"); }
  private metadata(raw:unknown):SsoMetadata {
    const metadata=ssoMetadataV1.parse(raw);requireSyntheticSso(this.mode,metadata.provider);
    // The test label cannot select a remote endpoint or another connection's tenant/entity/callback.
    const fixed=syntheticSsoMetadata(metadata.id,metadata.tenantId,metadata.idpCert,this.allowedOrigin);
    for(const key of ['idpEntityId','spEntityId','callbackUrl','entryPoint'] as const)if(metadata[key]!==fixed[key])throw new SsoError("SSO_ROUTE_BLOCKED");
    return metadata;
  }
  async view(tenantId:string,credentials:TenantRequestCredentials) {
    return this.guarded("admin",async()=>{
      this.gate();const selected=ssoConnectionIdV1.parse(tenantId);
      const context=await resolveVerifiedTenantContext(this.provider,{...credentials,requestedTenantId:selected},this.allowedOrigin);
      return this.repository.view(context,this.base.digest(`session:${credentials.sessionToken}`));
    });
  }
  async admin(raw:unknown,credentials:TenantRequestCredentials) {
    const route=typeof raw==='object'&&raw!==null&&'connectionId' in raw&&typeof raw.connectionId==='string'?raw.connectionId:'admin';
    return this.guarded(route,async()=>{
      this.gate();const input=ssoAdminV1.parse(raw);
      const context=await resolveVerifiedTenantContext(this.provider,{...credentials,requestedTenantId:input.requested_tenant_id},this.allowedOrigin);
      let metadata:SsoMetadata|undefined;
      if(input.action==='connection.create') {
        try {const key=createPublicKey(input.idpCert);if(key.asymmetricKeyType!=="rsa" || (key.asymmetricKeyDetails?.modulusLength??0)<2048)throw new SsoError("INVALID_SSO_INPUT");}
        catch {throw new SsoError("INVALID_SSO_INPUT");}
        metadata=syntheticSsoMetadata(input.id,input.requested_tenant_id,input.idpCert,this.allowedOrigin);
      }
      await this.repository.admin(context,this.base.digest(`session:${credentials.sessionToken}`),{...input,...(metadata?{metadata}:{})});
      return this.repository.view(context,this.base.digest(`session:${credentials.sessionToken}`));
    });
  }
  async start(connectionId:string,raw:unknown,credentials:TenantRequestCredentials) {
    return this.guarded(connectionId,async()=>{
      this.gate();ssoConnectionIdV1.parse(connectionId);const input=ssoStartV1.parse(raw);
      if(credentials.origin!==this.allowedOrigin)throw new SsoError("SSO_FORBIDDEN");
      const relayState=randomBytes(32).toString("base64url");
      let linking:{tenantId:string;principal:AuthPrincipal}|undefined;
      if(input.linkExisting) {
        // Release the lookup client before provider authentication acquires pool clients of its own.
        const connection=await this.repository.transaction(async client=>this.metadata(await this.repository.connection(client,connectionId)));
        const context=await resolveVerifiedTenantContext(this.provider,{...credentials,requestedTenantId:connection.tenantId},this.allowedOrigin);
        if(context.tenantId!==connection.tenantId)throw new SsoError("LINK_FORBIDDEN");
        const principal=await this.provider.authenticate(credentials.sessionToken!);
        if(!principal)throw new SsoError("LINK_FORBIDDEN");
        linking={tenantId:context.tenantId,principal};
      }
      return this.repository.transaction(async client=>{
        let connection=this.metadata(await this.repository.connection(client,connectionId));
        let linkSessionId:string|null=null;
        if(linking) {
          await client.query("SELECT pg_advisory_xact_lock_shared(hashtextextended($1,54))",[linking.tenantId]);
          connection=this.metadata(await this.repository.connection(client,connectionId));
          if(connection.tenantId!==linking.tenantId)throw new SsoError("LINK_FORBIDDEN");
          await this.repository.requireLinkSession(client,linking.tenantId,linking.principal.sessionId,linking.principal.identityUserId,this.base.digest(`session:${credentials.sessionToken}`),credentials.csrfToken!);
          linkSessionId=linking.principal.sessionId;
        }
        const cache=this.repository.cache(client,connectionId,this.base.digest(`sso-state:${relayState}`),linkSessionId);
        let requestId:string|undefined;
        const trackingCache={...cache,saveAsync:async(key:string,value:string)=>{requestId=key;return cache.saveAsync(key,value);}};
        const authnRequestUrl=await new SamlAdapter(connection,trackingCache).start();
        if(!requestId)throw new SsoError("REQUEST_REFUSED");
        await this.repository.audit(client,connectionId,"sso.request.issued");
        return {version:"sso-started.v1" as const,connectionId,requestId,relayState,authnRequestUrl};
      });
    });
  }
  async callback(connectionId:string,raw:unknown,browserState:string|undefined) {
    // Parse/route/state refusals still persist a bootstrap audit record.
    return this.guarded(connectionId,async()=>{
      this.gate();ssoConnectionIdV1.parse(connectionId);const input=ssoCallbackV1.parse(raw);
      if(!browserState || browserState.length!==input.relayState.length || !timingSafeEqual(Buffer.from(browserState),Buffer.from(input.relayState)))throw new SsoError("REQUEST_REFUSED");
      const result=await this.repository.transaction(async client=>{
        const connection=this.metadata(await this.repository.connection(client,connectionId));
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,54))",[connection.tenantId]);
        await client.query("SAVEPOINT saml_signin");
        try {
          const claims=await new SamlAdapter(connection,this.repository.cache(client,connectionId)).validate(input.SAMLResponse);
          claims.email=claims.email.toLowerCase();
          const sessionToken=randomBytes(32).toString("base64url"),csrfToken=randomBytes(24).toString("base64url"),id=randomUUID();
          const expiresAt=(await client.query<{expires_at:Date}>("SELECT date_trunc('milliseconds',clock_timestamp()) + $1::integer * interval '1 second' expires_at",[connection.sessionLimitSeconds])).rows[0]!.expires_at;
          const outcome=await this.repository.complete(client,connectionId,claims,{id,tokenDigest:this.base.digest(`session:${sessionToken}`),csrfToken,expiresAt},this.base.digest(`sso-state:${input.relayState}`));
          if('code' in outcome) {
            const failure=typed(new SsoError(outcome.code as SsoError['code']));
            // Revocation is deliberately committed on a verified no-group sign-in.
            await this.repository.audit(client,connectionId,"sso.signin.refused","identity:saml",failure.code);
            return {failure};
          }
          await this.repository.audit(client,connectionId,"sso.signin.completed",`membership:${outcome.membershipId}`);
          return {sessionToken,csrfToken,tenantId:outcome.tenantId,sessionLimitSeconds:connection.sessionLimitSeconds};
        } catch(error) {
          // Refused assertions cannot create a membership/session; audit the refusal after rolling back their work.
          await client.query("ROLLBACK TO SAVEPOINT saml_signin");
          const failure=typed(error);await this.repository.audit(client,connectionId,"sso.signin.refused","identity:saml",failure.code);
          return {failure};
        }
      });
      if('failure' in result)throw result.failure;
      return result;
    });
  }
  /** Called at execution with a stamped queued-job context; never creates an approval or business effect. */
  async checkWorkerAction(context:VerifiedTenantContext,raw:unknown):Promise<void> {
    const route=typeof raw==="object"&&raw!==null&&"connectionId" in raw&&typeof raw.connectionId==="string"?raw.connectionId:"worker";
    return this.guarded(route,async()=>{
      this.gate();const input=ssoWorkerActionV1.parse(raw);
      if(!await this.repository.allowed(context,input.connectionId,input.sessionId,input.membershipId,input.permission,input.scopeId))throw new SsoError("SSO_FORBIDDEN");
    });
  }
  /** Transport parse failures (e.g. invalid JSON) use the same durable refusal path. */
  async refuseInput(connectionId:string):Promise<never> {await this.repository.refusal(connectionId,"INVALID_SSO_INPUT");throw new SsoError("INVALID_SSO_INPUT");}
}
