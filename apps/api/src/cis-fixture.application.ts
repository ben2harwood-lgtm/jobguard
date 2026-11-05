import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { cisFixtureBookV1, CisDeductionError, assertCisIssueAllowed, type CisFixtureBook } from "@jobguard/core";
import { CisFixturePersistenceError, type CisFixtureRepository } from "@jobguard/db";
import { resolveVerifiedTenantContext, type TenantRequestCredentials } from "./auth/principal-bridge.js";
import { AuthError } from "./auth/auth-provider.js";
import { identityStatus } from "./auth/identity-http.js";
import type { IdentityApplication } from "./auth/identity.application.js";
const commandV1 = z.object({ version: z.literal("cis.persist-fixture.v1"), commandId: z.guid(), jobId: z.guid(),
  fixture: cisFixtureBookV1.omit({ tenantId: true, jobId: true }).extend({
    statements: cisFixtureBookV1.shape.statements.length(1), verifications: z.array(cisFixtureBookV1.shape.verifications.element).max(1000),
  }), }).strict();
export type CisFixtureView = Awaited<ReturnType<CisFixtureApplication["read"]>>;
export function cisIssueReason() {
  try { assertCisIssueAllowed(); } catch (error) { if (error instanceof CisDeductionError) return error.message; throw error; }
}
export class CisFixtureApplication {
  constructor(private readonly identity: IdentityApplication,
    private readonly repository: Pick<CisFixtureRepository, "read" | "command">,
    private readonly startingBook: (tenantId: string, jobId: string) => CisFixtureBook) {}
  private dark() { if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new CisFixturePersistenceError("NOT_FOUND"); }
  async read(credentials: TenantRequestCredentials, jobId: string) {
    this.dark();
    const context = await resolveVerifiedTenantContext(this.identity.provider, credentials, this.identity.allowedOrigin);
    let stored: Awaited<ReturnType<CisFixtureRepository["read"]>> | null = null;
    try { stored = await this.repository.read(context, jobId); }
    catch (error) { if (!(error instanceof CisFixturePersistenceError) || error.code !== "NOT_FOUND") throw error; }
    // An empty book and an inaccessible/unknown job retain the identical repository refusal.
    return { stored, starter: stored?.book ?? this.startingBook(context.tenantId, jobId), issueReason: cisIssueReason(),
      code: stored ? null : "CIS_FIXTURE_NOT_FOUND" };
  }
  async command(credentials: TenantRequestCredentials, jobId: string, raw: unknown) {
    this.dark();
    const context = await resolveVerifiedTenantContext(this.identity.provider, credentials, this.identity.allowedOrigin);
    const principal = await this.identity.provider.authenticate(credentials.sessionToken!);
    if (!principal) throw new AuthError("UNAUTHENTICATED");
    const membership = await this.identity.provider.findMembership(principal, context.tenantId);
    if (!membership) throw new AuthError("TENANT_FORBIDDEN");
    const parsed = commandV1.safeParse(raw);
    if (!parsed.success || parsed.data.jobId !== jobId) throw new CisFixturePersistenceError("INVALID_INPUT");
    let previous: CisFixtureBook | null = null;
    try { previous = (await this.repository.read(context, jobId)).book; }
    catch (error) { if (!(error instanceof CisFixturePersistenceError) || error.code !== "NOT_FOUND") throw error; }
    const { tenantId: _t, jobId: _j, statements: _s, payments: _p, verifications: _v, ...fixed } = previous ?? this.startingBook(context.tenantId, jobId);
    const { statements: _ss, payments: _pp, verifications: _vv, ...supplied } = parsed.data.fixture;
    if (!isDeepStrictEqual(fixed, supplied)) throw new CisFixturePersistenceError("CONFLICT");
    return this.repository.command(context, { membershipId: membership.id, identityUserId: principal.identityUserId }, raw);
  }
}
export function cisFixtureFailure(error: unknown) {
  if (error instanceof CisFixturePersistenceError) return { status: { INVALID_INPUT: 400, NOT_FOUND: 404, CONFLICT: 409, UNAVAILABLE: 503 }[error.code],
    body: { code: `CIS_FIXTURE_${error.code}`, reason: { INVALID_INPUT: "Use the required fixture fields only. Status is never inferred.",
      NOT_FOUND: "Job or statement unavailable.", CONFLICT: "This command or starting book conflicts with a stored record.", UNAVAILABLE: "Stored statements are unavailable. Retry the same command." }[error.code] } };
  if (error instanceof CisDeductionError) return { status: error.code === "REPLAY_CONFLICT" ? 409 : 400,
    body: { code: error.code, reason: error.message } };
  const auth = identityStatus(error);
  return { status: auth.status, body: { code: auth.code, reason: "Session or company access unavailable. Sign in and try again." } };
}
