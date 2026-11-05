import { assertVatTreatmentIssueAllowed, VatTreatmentError } from "@jobguard/core";
import { VatFixtureRepositoryError, type VatFixtureRepository } from "@jobguard/db";
import { AuthError } from "./auth/auth-provider.js";
import { identityStatus } from "./auth/identity-http.js";
import type { IdentityApplication } from "./auth/identity.application.js";
import { resolveVerifiedTenantContext, type TenantRequestCredentials } from "./auth/principal-bridge.js";

export function vatFixtureIssueRefusal(): string {
  try { assertVatTreatmentIssueAllowed(); } catch (error) {
    if (!(error instanceof VatTreatmentError)) throw error;
    return error.message;
  }
}
function fixtureView(value: Awaited<ReturnType<VatFixtureRepository["read"]>>) {
  return { ...value, issueRefusal: vatFixtureIssueRefusal(), creditMethod: "Candidate cumulative credit method; legal method remains pending." };
}
/** Synthetic documents only; no commercial command, invoice or tax authority. */
export class VatFixtureApplication {
  constructor(private readonly identity: IdentityApplication,
    private readonly repository: Pick<VatFixtureRepository, "read" | "command">) {}
  async read(credentials: TenantRequestCredentials, jobId: string) {
    if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new VatFixtureRepositoryError("DISABLED");
    const context = await resolveVerifiedTenantContext(this.identity.provider, credentials, this.identity.allowedOrigin);
    return fixtureView(await this.repository.read(context, jobId));
  }
  async command(credentials: TenantRequestCredentials, jobId: string, raw: unknown) {
    if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new VatFixtureRepositoryError("DISABLED");
    if (credentials.origin !== this.identity.allowedOrigin) throw new AuthError("ORIGIN_FORBIDDEN");
    const context = await resolveVerifiedTenantContext(this.identity.provider, credentials, this.identity.allowedOrigin);
    const principal = await this.identity.principal(credentials.sessionToken);
    const member = await this.identity.provider.findMembership(principal, context.tenantId);
    if (!member) throw new AuthError("TENANT_FORBIDDEN");
    // The repository checks current owner permission under its database lock.
    if (!raw || typeof raw !== "object" || !("jobId" in raw) || raw.jobId !== jobId)
      throw new VatFixtureRepositoryError("INVALID_INPUT");
    return fixtureView(await this.repository.command(context, member.id, raw));
  }
}
export type VatFixtureView = Awaited<ReturnType<VatFixtureApplication["read"]>>;
export function vatFixtureFailure(error: unknown) {
  if (error instanceof VatFixtureRepositoryError) {
    const messages = { INVALID_INPUT: "Missing or unsupported fixture fields, eligibility or owner permission. Nothing was stored; no default treatment is used.",
      NOT_FOUND: "No stored VAT fixtures are available for this job.",
      CONFLICT: "The command was already used with different content, or the book's fixed fields changed. Keep the original fixed fields and use a new command for a new document.",
      UNAVAILABLE: "VAT fixtures are unavailable. Retry the same command to resolve an uncertain result.", DISABLED: "Not found." };
    return { status: error.code === "DISABLED" || error.code === "NOT_FOUND" ? 404 : error.code === "INVALID_INPUT" ? 400 : error.code === "CONFLICT" ? 409 : 503,
      body: { version: "vat.fixture-error.v1", code: error.code, message: messages[error.code] } };
  }
  if (error instanceof VatTreatmentError) return { status: 400,
    body: { version: "vat.fixture-error.v1", code: error.code, message: error.message } };
  const failure = identityStatus(error);
  return { status: failure.status, body: { version: "vat.fixture-error.v1", code: failure.code,
    message: failure.status === 503 ? "VAT fixtures are unavailable. Retry the same command." : "Sign in with a current company session and permission, then try again." } };
}
