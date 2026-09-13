import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { AuthenticatedMembership } from "@jobguard/db";
import { challengeRequestV1, verifyCodeV1 } from "./auth-schemas.js";

export const roles = ["owner", "admin", "estimator", "foreman", "operative", "finance", "read_only"] as const;
export type Role = (typeof roles)[number];
export type Permission =
  | "tenant:administer" | "quote:edit" | "commercial:approve" | "job:update"
  | "finance:view" | "finance:approve" | "job:view";

const permissions: Record<Role, readonly Permission[]> = {
  owner: ["tenant:administer", "quote:edit", "commercial:approve", "job:update", "finance:view", "finance:approve", "job:view"],
  admin: ["tenant:administer", "quote:edit", "commercial:approve", "job:update", "finance:view", "job:view"],
  estimator: ["quote:edit", "job:view"],
  foreman: ["job:update", "job:view"],
  operative: ["job:update", "job:view"],
  finance: ["finance:view", "finance:approve", "job:view"],
  read_only: ["job:view"],
};

export const rolePermits = (role: Role, permission: Permission): boolean => permissions[role].includes(permission);

export interface AuthPrincipal {
  readonly identityUserId: string;
  readonly sessionId: string;
  readonly csrfToken: string;
}

export interface ActiveMembership {
  readonly id: string;
  readonly identityUserId: string;
  readonly tenantId: string;
  readonly role: Role;
  readonly email: string;
  readonly revokedAt?: number;
}

export interface ChallengeRequest { readonly email: string; readonly purpose: "signup" | "signin" | "invitation"; readonly ip: string }
export interface ChallengeResponse { readonly accepted: true }
export interface VerificationResult { readonly sessionToken: string; readonly csrfToken: string }
export interface AuthProvider {
  requestCode(input: ChallengeRequest): Promise<ChallengeResponse>;
  verifyCode(email: string, purpose: ChallengeRequest["purpose"], code: string): Promise<VerificationResult>;
  authenticate(sessionToken: string): Promise<AuthPrincipal | undefined>;
  findMembership(principal: AuthPrincipal, tenantId: string): Promise<ActiveMembership | undefined>;
}

export class AuthError extends Error {
  constructor(readonly code: "INVALID_CODE" | "RATE_LIMITED" | "UNAUTHENTICATED" | "TENANT_FORBIDDEN" | "ORIGIN_FORBIDDEN") {
    super(code);
    this.name = "AuthError";
  }
}

interface Challenge { email: string; purpose: ChallengeRequest["purpose"]; digest: Buffer; expiresAt: number; attempts: number; consumed: boolean; requestedAt: number }
interface Session { id: string; identityUserId: string; tokenDigest: Buffer; csrfToken: string; expiresAt: number }
interface Invitation { email: string; tenantId: string; role: Role; expiresAt: number; accepted: boolean }

/** Deterministic, provider-free store for the scaffold and fixture tests. */
export class MemoryAuthProvider implements AuthProvider {
  private readonly challenges = new Map<string, Challenge>();
  private readonly sessions: Session[] = [];
  private readonly users = new Map<string, string>();
  private readonly memberships: ActiveMembership[] = [];
  private readonly invitations: Invitation[] = [];
  private readonly ipRequests = new Map<string, number[]>();

  constructor(
    private readonly secret: string,
    private readonly deliverCode: (email: string, code: string) => void,
    private readonly now: () => number = Date.now,
    private readonly makeCode: () => string = () => randomBytes(4).readUInt32BE(0).toString().padStart(10, "0").slice(-8),
  ) {}

  async requestCode(input: ChallengeRequest): Promise<ChallengeResponse> {
    input = challengeRequestV1.parse(input);
    const email = normalizeEmail(input.email);
    const time = this.now();
    const key = `${email}:${input.purpose}`;
    const current = this.challenges.get(key);
    const recent = (this.ipRequests.get(input.ip) ?? []).filter((stamp) => time - stamp < 600_000);
    if ((current && time - current.requestedAt < 60_000) || recent.length >= 10) throw new AuthError("RATE_LIMITED");
    const code = this.makeCode();
    this.challenges.set(key, { email, purpose: input.purpose, digest: this.digest(code), expiresAt: time + 600_000, attempts: 0, consumed: false, requestedAt: time });
    this.ipRequests.set(input.ip, [...recent, time]);
    this.deliverCode(email, code);
    return { accepted: true };
  }

  async verifyCode(emailInput: string, purpose: ChallengeRequest["purpose"], code: string): Promise<VerificationResult> {
    const verifiedInput = verifyCodeV1.parse({ email: emailInput, purpose, code });
    const email = normalizeEmail(verifiedInput.email);
    const challenge = this.challenges.get(`${email}:${purpose}`);
    if (!challenge || challenge.consumed || challenge.expiresAt <= this.now() || challenge.attempts >= 5) throw new AuthError("INVALID_CODE");
    challenge.attempts += 1;
    const supplied = this.digest(code);
    if (!timingSafeEqual(challenge.digest, supplied)) throw new AuthError("INVALID_CODE");
    // No await occurs between checking and consuming: a challenge is single-use.
    challenge.consumed = true;
    let userId = this.users.get(email);
    if (!userId) {
      if (purpose === "signin") throw new AuthError("INVALID_CODE");
      if (purpose === "invitation" && !this.findInvitation(email)) throw new AuthError("INVALID_CODE");
      userId = randomUUID();
      this.users.set(email, userId);
      if (purpose === "signup") this.createOwnedTenant(userId, email);
    }
    if (purpose === "invitation") this.acceptInvitation(userId, email);
    return this.issueSession(userId);
  }

  async authenticate(token: string): Promise<AuthPrincipal | undefined> {
    const digest = this.digest(token);
    const session = this.sessions.find((candidate) => timingSafeEqual(candidate.tokenDigest, digest));
    return session && session.expiresAt > this.now()
      ? { identityUserId: session.identityUserId, sessionId: session.id, csrfToken: session.csrfToken }
      : undefined;
  }

  async findMembership(principal: AuthPrincipal, tenantId: string): Promise<ActiveMembership | undefined> {
    return this.memberships.find((item) => item.identityUserId === principal.identityUserId && item.tenantId === tenantId && item.revokedAt === undefined);
  }

  invite(email: string, tenantId: string, role: Role, expiresAt = this.now() + 86_400_000): void {
    this.invitations.push({ email: normalizeEmail(email), tenantId, role, expiresAt, accepted: false });
  }
  revoke(membershipId: string): void {
    const item = this.memberships.find((candidate) => candidate.id === membershipId);
    if (item) Object.assign(item, { revokedAt: this.now() });
  }
  fixtureMemberships(): readonly ActiveMembership[] { return this.memberships; }

  private digest(value: string): Buffer { return createHmac("sha256", this.secret).update(value).digest(); }
  private issueSession(identityUserId: string): VerificationResult {
    const token = randomBytes(32).toString("base64url");
    const csrfToken = randomBytes(24).toString("base64url");
    this.sessions.push({ id: randomUUID(), identityUserId, tokenDigest: this.digest(token), csrfToken, expiresAt: this.now() + 86_400_000 });
    return { sessionToken: token, csrfToken };
  }
  private createOwnedTenant(identityUserId: string, email: string): void {
    const tenantId = randomUUID();
    this.memberships.push({ id: randomUUID(), identityUserId, tenantId, role: "owner", email });
  }
  private acceptInvitation(identityUserId: string, email: string): void {
    const invitation = this.findInvitation(email);
    if (!invitation) throw new AuthError("INVALID_CODE");
    invitation.accepted = true;
    this.memberships.push({ id: randomUUID(), identityUserId, tenantId: invitation.tenantId, role: invitation.role, email });
  }
  private findInvitation(email: string): Invitation | undefined {
    return this.invitations.find((item) => item.email === email && !item.accepted && item.expiresAt > this.now());
  }
}

export function asAuthenticatedMembership(membership: ActiveMembership): AuthenticatedMembership {
  return {
    identityUserId: membership.identityUserId,
    tenantId: membership.tenantId,
    membershipId: membership.id,
  } as AuthenticatedMembership;
}

function normalizeEmail(email: string): string { return email.trim().toLowerCase(); }
