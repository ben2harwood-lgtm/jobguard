import { assertInterimDocumentIssueAllowed, InterimApplicationError } from "@jobguard/core";
import { InterimDraftRepositoryError, type InterimDraftRepository } from "@jobguard/db";
import { resolveVerifiedTenantContext, type TenantRequestCredentials } from "./auth/principal-bridge.js";
import type { IdentityApplication } from "./auth/identity.application.js";
import { identityStatus } from "./auth/identity-http.js";

/** Synthetic persistence only. No issue authorization or commercial side effects. */
export class InterimDraftApplication {
  constructor(private readonly identity: IdentityApplication,
    private readonly repository: Pick<InterimDraftRepository, "read" | "command">) {}
  private assertSynthetic() {
    if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new InterimDraftRepositoryError("DARK");
  }
  private view(result: Awaited<ReturnType<InterimDraftRepository["read"]>>, message: string) {
    try { assertInterimDocumentIssueAllowed(); }
    catch (error) {
      if (!(error instanceof InterimApplicationError)) throw error;
      const reasons = {
        FEATURE_DISABLED: "Interim issue is disabled. Nothing can be issued, sent or posted.",
        D06_TEMPLATE_REQUIRED: "An approved D06 document template is required before issue.",
        D02_TAX_RULES_REQUIRED: "Approved D02 tax rules are required before issue.",
        UNSUPPORTED_ARRANGEMENT: "This contract arrangement or jurisdiction is unsupported. Records remain drafts.",
      };
      return { ...result, message, issueRefusal: error.message,
        issueBlockerMessages: result.reconciliation.issueBlockers.map(code => reasons[code]) };
    }
  }
  async read(credentials: TenantRequestCredentials, jobId: string) {
    this.assertSynthetic();
    const session = await this.identity.session(credentials.sessionToken);
    const context = await resolveVerifiedTenantContext(this.identity.provider, {
      sessionToken: credentials.sessionToken, requestedTenantId: session.memberships[0]?.tenantId,
      csrfToken: session.csrfToken, origin: credentials.origin ?? this.identity.allowedOrigin,
    }, this.identity.allowedOrigin);
    return this.view(await this.repository.read(context, jobId), "Stored draft book loaded.");
  }
  async command(credentials: TenantRequestCredentials, jobId: string, raw: unknown) {
    this.assertSynthetic();
    const session = await this.identity.session(credentials.sessionToken);
    const context = await resolveVerifiedTenantContext(this.identity.provider, {
      sessionToken: credentials.sessionToken, requestedTenantId: session.memberships[0]?.tenantId,
      csrfToken: credentials.csrfToken, origin: credentials.origin,
    }, this.identity.allowedOrigin);
    if (typeof raw !== "object" || raw === null || !("jobId" in raw) || raw.jobId !== jobId) {
      throw new InterimDraftRepositoryError("INVALID_INPUT");
    }
    const actor = this.identity.provider.digest(`session:${credentials.sessionToken}`);
    return this.view(await this.repository.command(context, actor, raw), "Record stored. Nothing issued, sent or posted.");
  }
}
export function interimDraftFailure(error: unknown) {
  let status: number, code: string, message: string;
  if (error instanceof InterimDraftRepositoryError) {
    code = `INTERIM_DRAFT_${error.code}`;
    status = { INVALID_INPUT: 400, NOT_FOUND: 404, CONFLICT: 409, UNAVAILABLE: 503, DARK: 404 }[error.code];
    message = { INVALID_INPUT: "Check the draft record and job. Tenant, actor and enable flags are not accepted.",
      NOT_FOUND: "Draft book not found.", CONFLICT: "This command or record was already used with different content. Nothing was added.",
      UNAVAILABLE: "Drafts are unavailable. Retry the same command to check its outcome.", DARK: "Not found." }[error.code];
  } else if (error instanceof InterimApplicationError) {
    code = error.code; status = error.code === "INVALID_INPUT" ? 400 : 409; message = error.message;
  } else {
    const auth = identityStatus(error); status = auth.status; code = auth.code;
    message = status === 503 ? "Drafts are unavailable. Retry the same command to check its outcome." : "Sign in with an active company session and try again.";
  }
  return { status, body: { version: "interim.draft-error.v1", code, message } };
}
