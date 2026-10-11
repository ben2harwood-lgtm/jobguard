import { z } from "zod";
import { IdentityRepository, type VerifiedTenantContext } from "@jobguard/db";
import { parseIdentityEnvironment } from "@jobguard/config";
import { Pool } from "pg";
import { AuthError, type AuthPrincipal } from "./auth-provider.js";
import { verifyCodeV1 } from "./auth-schemas.js";
import { PersistedAuthProvider } from "./persisted-auth-provider.js";
import { resolveVerifiedTenantContext, type TenantRequestCredentials } from "./principal-bridge.js";

export const identityRequestV1 = z.object({version:z.literal("identity-request.v1"),email:z.string().email().max(320),purpose:z.enum(["signup","signin","invitation"]),invitationId:z.string().uuid().optional()}).strict();
export const identityVerifyV1 = verifyCodeV1.extend({version:z.literal("identity-verify.v1")}).strict();
export const identityInvitationV1 = z.object({version:z.literal("identity-invitation.v1"),requested_tenant_id:z.string().uuid(),email:z.string().email().max(320),role:z.enum(["admin","estimator","foreman","operative","finance","read_only"])}).strict();
export const identitySessionV1 = z.object({version:z.literal("identity-session.v1"),environment:z.literal("synthetic_demo"),principal:z.object({id:z.string().uuid(),sessionId:z.string().uuid()}),csrfToken:z.string().min(24),memberships:z.array(z.object({id:z.string().uuid(),tenantId:z.string().uuid(),role:z.enum(["owner","admin","estimator","foreman","operative","finance","read_only"]),name:z.string()}))}).strict();

/** Same application service for Nest and the server-only Next adapter. */
export class IdentityApplication {
  constructor(readonly provider: PersistedAuthProvider, readonly allowedOrigin: string) {}
  requireOrigin(origin: string | undefined): void { if(origin!==this.allowedOrigin)throw new AuthError("ORIGIN_FORBIDDEN"); }
  async request(raw:unknown,ip:string,origin:string|undefined) {
    this.requireOrigin(origin);
    const {version: _version,...input}=identityRequestV1.parse(raw);
    return {version:"identity-request-response.v1" as const,environment:"synthetic_demo" as const,...await this.provider.requestCode({...input,ip})};
  }
  async verify(raw:unknown,origin:string|undefined) {
    this.requireOrigin(origin);
    const input=identityVerifyV1.parse(raw);
    return this.provider.verifyCode(input.email,input.purpose,input.code,input.invitationId);
  }
  async principal(token:string|undefined):Promise<AuthPrincipal> {
    const principal=token?await this.provider.authenticate(token):undefined;
    if(!principal)throw new AuthError("UNAUTHENTICATED");return principal;
  }
  async session(token:string|undefined) {
    const principal=await this.principal(token);
    return identitySessionV1.parse({version:"identity-session.v1",environment:"synthetic_demo",principal:{id:principal.identityUserId,sessionId:principal.sessionId},csrfToken:principal.csrfToken,memberships:(await this.provider.memberships(principal)).map(m=>({id:m.id,tenantId:m.tenantId,role:m.role,name:m.name}))});
  }
  context(request:TenantRequestCredentials):Promise<VerifiedTenantContext> {
    return resolveVerifiedTenantContext(this.provider,request,this.allowedOrigin);
  }
  async invite(raw:unknown,credentials:TenantRequestCredentials) {
    const input=identityInvitationV1.parse(raw);
    await this.context({...credentials,requestedTenantId:input.requested_tenant_id});
    // SQL checks current owner membership under a row lock, including expiry/revocation.
    const email=input.email.toLowerCase();
    this.provider.assertRecipient(email);
    const id=(await this.provider.repository.pool.query<{id:string}>("SELECT identity.invite_member($1,$2,$3,$4) id",[this.provider.digest(`session:${credentials.sessionToken}`),input.requested_tenant_id,email,input.role])).rows[0]!.id;
    return {version:"identity-invitation-response.v1",id,environment:"synthetic_demo"};
  }
}
export function createIdentityApplication(raw:unknown):IdentityApplication {
  const env=parseIdentityEnvironment(raw);
  return new IdentityApplication(new PersistedAuthProvider(new IdentityRepository(new Pool({connectionString:env.IDENTITY_DATABASE_URL,max:4,application_name:"jobguard-identity"})),env.AUTH_CODE_SECRET,undefined,env.JOBGUARD_ENV),env.AUTH_ALLOWED_ORIGIN);
}
