import { createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { EnterpriseIdentityRepository, IdentityRepository } from "@jobguard/db";
import { AuthError, roles, type ActiveMembership, type AuthPrincipal, type AuthProvider, type ChallengeRequest, type Role, type VerificationResult } from "./auth-provider.js";
import { challengeRequestV1, verifyCodeV1 } from "./auth-schemas.js";
import { FixtureIdentityEmail } from "./identity-email.js";

export class PersistedAuthProvider implements AuthProvider {
  // Nest and Next both compose this provider. Binding belongs here so every consumer,
  // including the ordinary identity principal bridge, sees the same session authority.
  private readonly enterpriseIdentity: EnterpriseIdentityRepository;
  constructor(
    readonly repository: IdentityRepository,
    private readonly secret: string,
    private readonly emailAdapter = new FixtureIdentityEmail(),
    private readonly environment = "synthetic_demo",
    private readonly now: () => number = Date.now,
    private readonly makeCode: () => string = () => randomInt(100_000_000).toString().padStart(8, "0"),
  ) {
    if (secret.length < 32) throw new Error("Identity code key is missing");
    this.enterpriseIdentity = new EnterpriseIdentityRepository(repository.pool);
  }
  assertRecipient(email:string):void { this.emailAdapter.assertRecipient(email,this.environment); }
  digest(value: string): string { return createHmac("sha256", this.secret).update(value).digest("hex"); }
  async requestCode(raw: ChallengeRequest): Promise<{ accepted: true; fixtureCode?: string }> {
    const input = challengeRequestV1.parse(raw), email = input.email.trim().toLowerCase();
    this.assertRecipient(email);
    const time = this.now(), id = randomUUID(), code = this.makeCode();
    await this.repository.transaction(async client => {
      const ipDigest = this.digest(`ip:${input.ip}`);
      await this.repository.lock(client, email, ipDigest);
      const latest = await this.repository.latest(client, email, input.purpose);
      const count = (await client.query<{ count: number }>("SELECT count(*)::int count FROM identity.request_window WHERE ip_digest=$1 AND requested_at>$2", [ipDigest, new Date(time - 600_000)])).rows[0]!.count;
      if ((latest && time - latest.requested_at.getTime() < 60_000) || count >= 10) throw new AuthError("RATE_LIMITED");
      await client.query("INSERT INTO identity.request_window VALUES($1,$2)", [ipDigest, new Date(time)]);
      await client.query(`INSERT INTO identity.challenge(id,email,purpose,invitation_id,digest,requested_at,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,$7)`, [id,email,input.purpose,input.invitationId ?? null,this.digest(`${id}:${code}`),new Date(time),new Date(time+600_000)]);
      await client.query("INSERT INTO identity.security_event(id,event_type,subject_id) VALUES($1,'challenge.requested',$2)", [randomUUID(), id]);
    });
    // Delivery happens only after commit; pending/unknown never implies successful delivery.
    try {
      await this.emailAdapter.deliver({version:"identity-email.v1",category:"identity_challenge",challengeId:id,email,code,environment:this.environment});
      await this.repository.pool.query("UPDATE identity.challenge SET delivery_state='fixture_delivered' WHERE id=$1", [id]);
    } catch {
      await this.repository.pool.query("UPDATE identity.challenge SET delivery_state='outcome_unknown' WHERE id=$1", [id]);
      throw new AuthError("DELIVERY_UNAVAILABLE");
    }
    return { accepted: true, ...(this.environment === "synthetic_demo" ? { fixtureCode: code } : {}) };
  }
  async verifyCode(emailInput: string, purpose: ChallengeRequest["purpose"], code: string, invitationId?: string): Promise<VerificationResult> {
    const input = verifyCodeV1.parse({ email: emailInput, purpose, code, ...(invitationId ? { invitationId } : {}) });
    const email = input.email.trim().toLowerCase();
    this.assertRecipient(email);
    // Failure counters must commit: return a typed failure from the transaction, throw afterwards.
    const refusals: { connectionId: string; code: string }[] = [];
    const result = await this.repository.transaction(async client => {
      await this.repository.lock(client, email);
      const c = await this.repository.latest(client, email, purpose);
      if (!c || c.consumed_at || c.expires_at.getTime() <= this.now() || c.attempts >= 5) return undefined;
      await client.query("UPDATE identity.challenge SET attempts=attempts+1 WHERE id=$1", [c.id]);
      const valid = timingSafeEqual(Buffer.from(c.digest, "hex"), Buffer.from(this.digest(`${c.id}:${code}`), "hex"));
      if (!valid || (c.invitation_id ?? undefined) !== invitationId) return undefined;
      if (purpose === "invitation") {
        const gate = (await client.query<{ allowed: boolean; connection_id: string | null }>("SELECT * FROM identity.sso_invitation_accept_allowed($1)", [invitationId])).rows[0];
        if (gate?.allowed !== true || (gate.connection_id !== null && !this.isConnectionId(gate.connection_id))) {
          await client.query("UPDATE identity.challenge SET consumed_at=$2 WHERE id=$1", [c.id,new Date(this.now())]);
          refusals.push({connectionId:this.isConnectionId(gate?.connection_id)?gate.connection_id:"identity",code:"SSO_REQUIRED_INVITE_CLOSED"});
          return undefined;
        }
      }
      await client.query("UPDATE identity.challenge SET consumed_at=$2,verified=true WHERE id=$1", [c.id,new Date(this.now())]);
      const userId = (await client.query<{ user_id: string | null }>("SELECT identity.provision_verified_challenge($1) user_id", [c.id])).rows[0]!.user_id;
      if (!userId) return undefined;
      const gate = (await client.query<{ allowed: boolean; connections: string[] }>("SELECT * FROM identity.sso_code_signin_allowed($1)", [userId])).rows[0];
      if (gate?.allowed !== true || !Array.isArray(gate.connections) || !gate.connections.every(connectionId=>this.isConnectionId(connectionId))) {
        const targets = Array.isArray(gate?.connections)?gate.connections.filter(connectionId=>this.isConnectionId(connectionId)):[];
        for (const connectionId of targets.length?targets:["identity"]) refusals.push({connectionId,code:"SSO_REQUIRED_CODE_SIGNIN"});
        return undefined;
      }
      const sessionToken = randomBytes(32).toString("base64url"), csrfToken = randomBytes(24).toString("base64url"), sessionId=randomUUID();
      await client.query("INSERT INTO identity.session(id,user_id,token_digest,csrf_token,expires_at,environment) VALUES($1,$2,$3,$4,$5,$6)", [sessionId,userId,this.digest(`session:${sessionToken}`),csrfToken,new Date(this.now()+86_400_000),this.environment]);
      await client.query("INSERT INTO identity.security_event(id,event_type,subject_id) VALUES($1,'session.issued',$2)", [randomUUID(),sessionId]);
      return { sessionToken, csrfToken };
    });
    const invalidCode = new AuthError("INVALID_CODE");
    for (const refusal of refusals) {
      try { await this.enterpriseIdentity.refusal(refusal.connectionId,refusal.code); }
      catch (error) {
        // Preserve the server error without allowing refusal auditing to disclose the tenant's gate.
        Object.defineProperty(invalidCode,"cause",{value:error,configurable:true});
      }
    }
    if (!result) throw invalidCode;
    return result;
  }
  async authenticate(sessionToken: string): Promise<AuthPrincipal | undefined> {
    const row = (await this.repository.pool.query<{id:string;user_id:string;csrf_token:string}>("SELECT id,user_id,csrf_token FROM identity.session WHERE token_digest=$1 AND revoked_at IS NULL AND expires_at>$2 AND environment=$3", [this.digest(`session:${sessionToken}`),new Date(this.now()),this.environment])).rows[0];
    if (!row || (await this.enterpriseIdentity.sessionScope(row.id))?.revoked) return undefined;
    return {sessionId:row.id,identityUserId:row.user_id,csrfToken:row.csrf_token};
  }
  async memberships(principal: AuthPrincipal): Promise<(ActiveMembership & { name: string })[]> {
    const scope = await this.enterpriseIdentity.sessionScope(principal.sessionId);
    if (scope?.revoked) return [];
    return (await this.repository.memberships(principal.identityUserId, principal.sessionId)).filter(row => roles.includes(row.role as Role)
      && (!scope || (row.tenant_id === scope.tenantId && row.id === scope.membershipId)))
      .map(row => ({id:row.id,identityUserId:row.identity_user_id,tenantId:row.tenant_id,role:row.role as Role,email:row.email,name:row.name}));
  }
  async findMembership(principal: AuthPrincipal, tenantId: string): Promise<ActiveMembership | undefined> {
    const membership = (await this.memberships(principal)).find(row => row.tenantId===tenantId);
    if (!membership) {
      const scope = await this.enterpriseIdentity.sessionScope(principal.sessionId);
      if (scope) await this.enterpriseIdentity.refusal(scope.connectionId ?? "identity", "TENANT_FORBIDDEN");
      else {
        const connectionId = (await this.repository.pool.query<{connection_id:string|null}>("SELECT identity.sso_required_refusal_target($1,$2) connection_id",[principal.identityUserId,tenantId])).rows[0]?.connection_id;
        if (this.isConnectionId(connectionId)) await this.enterpriseIdentity.refusal(connectionId,"SSO_REQUIRED");
      }
    }
    return membership;
  }
  private isConnectionId(value:unknown):value is string {
    return typeof value==="string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value);
  }
  async recordInvitationRefusal(connectionId:unknown):Promise<void> {
    await this.enterpriseIdentity.refusal(this.isConnectionId(connectionId)?connectionId:"identity","SSO_REQUIRED_INVITE_CLOSED");
  }
  /** Mailbox proof only: the latest signin challenge is consumed; no verified latch, provisioning or session. */
  async proveEmergencyMailbox(emailInput:string,code:string):Promise<string|undefined> {
    const input=verifyCodeV1.parse({email:emailInput,purpose:"signin",code}),email=input.email.trim().toLowerCase();
    this.assertRecipient(email);
    return this.repository.transaction(async client=>{
      await this.repository.lock(client,email);
      const c=await this.repository.latest(client,email,"signin");
      if(!c || c.consumed_at || c.expires_at.getTime()<=this.now() || c.attempts>=5)return undefined;
      await client.query("UPDATE identity.challenge SET attempts=attempts+1 WHERE id=$1",[c.id]);
      if(!timingSafeEqual(Buffer.from(c.digest,"hex"),Buffer.from(this.digest(`${c.id}:${code}`),"hex")))return undefined;
      await client.query("UPDATE identity.challenge SET consumed_at=$2 WHERE id=$1",[c.id,new Date(this.now())]);
      return (await client.query<{user_id:string}>("SELECT user_id FROM identity.user_email WHERE email=$1",[email])).rows[0]?.user_id;
    });
  }
}
