import { z } from "zod";
import { memberAdministrationV1, memberAdministrationResultV1 } from "./member-administration.js";
import { IdentityRepository, type VerifiedTenantContext } from "@jobguard/db";
import { parseIdentityEnvironment } from "@jobguard/config";
import { Pool } from "pg";
import { AuthError, type AuthPrincipal } from "./auth-provider.js";
import { verifyCodeV1 } from "./auth-schemas.js";
import { PersistedAuthProvider } from "./persisted-auth-provider.js";
import { resolveVerifiedTenantContext, type TenantRequestCredentials } from "./principal-bridge.js";

export const identityRequestV1 = z.object({version:z.literal("identity-request.v1"),email:z.email({ error: "Invalid email" }).max(320),purpose:z.enum(["signup","signin","invitation"]),invitationId:z.guid({ error: "Invalid uuid" }).optional()}).strict();
export const identityVerifyV1 = verifyCodeV1.extend({version:z.literal("identity-verify.v1")}).strict();
export const identityInvitationV1 = z.object({version:z.literal("identity-invitation.v1"),requested_tenant_id:z.guid({ error: "Invalid uuid" }),email:z.email({ error: "Invalid email" }).max(320),role:z.enum(["admin","estimator","foreman","operative","finance","read_only"])}).strict();
export const identitySessionV1 = z.object({version:z.literal("identity-session.v1"),environment:z.literal("synthetic_demo"),principal:z.object({id:z.guid({ error: "Invalid uuid" }),sessionId:z.guid({ error: "Invalid uuid" })}),csrfToken:z.string().min(24),memberships:z.array(z.object({id:z.guid({ error: "Invalid uuid" }),tenantId:z.guid({ error: "Invalid uuid" }),role:z.enum(["owner","admin","estimator","foreman","operative","finance","read_only"]),name:z.string()}))}).strict();

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
  async administerMember(raw:unknown,credentials:TenantRequestCredentials) {
    const input=memberAdministrationV1.parse(raw);
    await this.context({...credentials,requestedTenantId:input.requested_tenant_id});
    const digest=this.provider.digest(`session:${credentials.sessionToken}`);
    // Identity credential only. SQL derives the current owner from the session again
    // under the tenant lock; stale application context never supplies an actor/role.
    const sql=input.action==="remove"
      ? "SELECT identity.member_remove($1,$2,$3) result"
      : "SELECT identity.member_change_role($1,$2,$3,$4) result";
    const values=input.action==="remove" ? [digest,input.requested_tenant_id,input.membershipId]
      : [digest,input.requested_tenant_id,input.membershipId,input.role];
    const result=await this.provider.repository.pool.query<{result:unknown}>(sql,values);
    return memberAdministrationResultV1.parse(result.rows[0]?.result);
  }
  async invite(raw:unknown,credentials:TenantRequestCredentials) {
    const input=identityInvitationV1.parse(raw);
    await this.context({...credentials,requestedTenantId:input.requested_tenant_id});
    // SQL checks current owner membership under a row lock, including expiry/revocation.
    const email=input.email.toLowerCase();
    this.provider.assertRecipient(email);
    const result=(await this.provider.repository.pool.query<{id:string|null;connection_id?:string|null}>("SELECT * FROM identity.sso_invite_member($1,$2,$3,$4)",[this.provider.digest(`session:${credentials.sessionToken}`),input.requested_tenant_id,email,input.role])).rows[0];
    const id=result?.id;
    if(typeof id!=="string" || !z.guid({ error: "Invalid uuid" }).safeParse(id).success) {
      const forbidden = new AuthError("TENANT_FORBIDDEN");
      try { await this.provider.recordInvitationRefusal(result?.connection_id); }
      catch (error) { Object.defineProperty(forbidden,"cause",{value:error}); }
      throw forbidden;
    }
    return {version:"identity-invitation-response.v1",id,environment:"synthetic_demo"};
  }
}
export function createIdentityApplication(raw:unknown):IdentityApplication {
  const env=parseIdentityEnvironment(raw);
  return new IdentityApplication(new PersistedAuthProvider(new IdentityRepository(new Pool({connectionString:env.IDENTITY_DATABASE_URL,max:4,application_name:"jobguard-identity"})),env.AUTH_CODE_SECRET,undefined,env.JOBGUARD_ENV),env.AUTH_ALLOWED_ORIGIN);
}
