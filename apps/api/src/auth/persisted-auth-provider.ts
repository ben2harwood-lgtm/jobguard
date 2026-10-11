import { createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { IdentityRepository } from "@jobguard/db";
import { AuthError, roles, type ActiveMembership, type AuthPrincipal, type AuthProvider, type ChallengeRequest, type Role, type VerificationResult } from "./auth-provider.js";
import { challengeRequestV1, verifyCodeV1 } from "./auth-schemas.js";
import { FixtureIdentityEmail } from "./identity-email.js";

export class PersistedAuthProvider implements AuthProvider {
  constructor(
    readonly repository: IdentityRepository,
    private readonly secret: string,
    private readonly emailAdapter = new FixtureIdentityEmail(),
    private readonly environment = "synthetic_demo",
    private readonly now: () => number = Date.now,
    private readonly makeCode: () => string = () => randomInt(100_000_000).toString().padStart(8, "0"),
  ) { if (secret.length < 32) throw new Error("Identity code key is missing"); }
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
    const result = await this.repository.transaction(async client => {
      await this.repository.lock(client, email);
      const c = await this.repository.latest(client, email, purpose);
      if (!c || c.consumed_at || c.expires_at.getTime() <= this.now() || c.attempts >= 5) return undefined;
      await client.query("UPDATE identity.challenge SET attempts=attempts+1 WHERE id=$1", [c.id]);
      const valid = timingSafeEqual(Buffer.from(c.digest, "hex"), Buffer.from(this.digest(`${c.id}:${code}`), "hex"));
      if (!valid || (c.invitation_id ?? undefined) !== invitationId) return undefined;
      await client.query("UPDATE identity.challenge SET consumed_at=$2,verified=true WHERE id=$1", [c.id,new Date(this.now())]);
      const userId = (await client.query<{ user_id: string | null }>("SELECT identity.provision_verified_challenge($1) user_id", [c.id])).rows[0]!.user_id;
      if (!userId) return undefined;
      const sessionToken = randomBytes(32).toString("base64url"), csrfToken = randomBytes(24).toString("base64url"), sessionId=randomUUID();
      await client.query("INSERT INTO identity.session(id,user_id,token_digest,csrf_token,expires_at,environment) VALUES($1,$2,$3,$4,$5,$6)", [sessionId,userId,this.digest(`session:${sessionToken}`),csrfToken,new Date(this.now()+86_400_000),this.environment]);
      await client.query("INSERT INTO identity.security_event(id,event_type,subject_id) VALUES($1,'session.issued',$2)", [randomUUID(),sessionId]);
      return { sessionToken, csrfToken };
    });
    if (!result) throw new AuthError("INVALID_CODE");
    return result;
  }
  async authenticate(sessionToken: string): Promise<AuthPrincipal | undefined> {
    const row = (await this.repository.pool.query<{id:string;user_id:string;csrf_token:string}>("SELECT id,user_id,csrf_token FROM identity.session WHERE token_digest=$1 AND revoked_at IS NULL AND expires_at>$2 AND environment=$3", [this.digest(`session:${sessionToken}`),new Date(this.now()),this.environment])).rows[0];
    return row ? {sessionId:row.id,identityUserId:row.user_id,csrfToken:row.csrf_token} : undefined;
  }
  async memberships(principal: AuthPrincipal): Promise<(ActiveMembership & { name: string })[]> {
    return (await this.repository.memberships(principal.identityUserId)).filter(row => roles.includes(row.role as Role)).map(row => ({id:row.id,identityUserId:row.identity_user_id,tenantId:row.tenant_id,role:row.role as Role,email:row.email,name:row.name}));
  }
  async findMembership(principal: AuthPrincipal, tenantId: string): Promise<ActiveMembership | undefined> {
    return (await this.memberships(principal)).find(row => row.tenantId===tenantId);
  }
}
