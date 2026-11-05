import { RetentionError } from "@jobguard/core";
import { RetentionRecordRepositoryError, type RetentionRecordRepository } from "@jobguard/db";
import { AuthError } from "./auth/auth-provider.js";
import { identityStatus } from "./auth/identity-http.js";
import type { IdentityApplication } from "./auth/identity.application.js";
import { resolveVerifiedTenantContext, type TenantRequestCredentials } from "./auth/principal-bridge.js";

export class RetentionRecordApplication {
  constructor(private readonly identity: IdentityApplication,
    private readonly repository: Pick<RetentionRecordRepository, "read" | "command">) {}
  private async credentials(request: TenantRequestCredentials) {
    if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new RetentionRecordRepositoryError("RETENTION_DARK");
    const session = await this.identity.session(request.sessionToken);
    const tenantId = session.memberships[0]?.tenantId;
    if (!tenantId) throw new AuthError("TENANT_FORBIDDEN");
    // This screen uses the session's first company, as the dunning screen does.
    // Headers and bodies cannot select a different tenant.
    return { sessionToken: request.sessionToken, origin: request.origin, csrfToken: request.csrfToken, tenantHeader: tenantId };
  }
  async read(request: TenantRequestCredentials, jobId: string) {
    const credentials = await this.credentials(request);
    const context = await resolveVerifiedTenantContext(this.identity.provider, credentials, this.identity.allowedOrigin);
    return this.repository.read(context, jobId);
  }
  async command(request: TenantRequestCredentials, jobId: string, raw: unknown) {
    const credentials = await this.credentials(request);
    const context = await resolveVerifiedTenantContext(this.identity.provider, credentials, this.identity.allowedOrigin);
    if (!raw || typeof raw !== "object" || !("jobId" in raw) || raw.jobId !== jobId) {
      throw new RetentionRecordRepositoryError("INVALID_RETENTION_INPUT");
    }
    return this.repository.command(context, { sessionDigest: this.identity.provider.digest(`session:${credentials.sessionToken}`) }, raw);
  }
}
export function retentionRecordFailure(error: unknown) {
  if (error instanceof RetentionRecordRepositoryError || error instanceof RetentionError) {
    const code = error.code;
    const status = code === "RETENTION_DARK" || code === "RETENTION_NOT_FOUND" ? 404
      : code === "INVALID_INPUT" || code === "INVALID_RETENTION_INPUT" ? 400 : code === "RETENTION_UNAVAILABLE" ? 503 : 409;
    const message = status === 404 ? "Retention records not found." : status === 400 ? "Invalid retention command."
      : status === 503 ? "Retention records unavailable."
      : code === "STALE_PROFILE" ? "The profile changed. Refresh and review the current conditions."
      : code === "REPLAY_CONFLICT" || code === "RETENTION_CONFLICT" ? "This command or approval was already used with different content. Refresh before trying a new action."
      : "The condition or amount does not permit this release. Refresh and review it.";
    return { status, body: { version: "retention-record-error.v1", code, message } };
  }
  const auth = identityStatus(error);
  return { status: auth.status, body: { version: "retention-record-error.v1", code: auth.code === "IDENTITY_UNAVAILABLE" ? "RETENTION_UNAVAILABLE" : auth.code,
    message: auth.status === 503 ? "Retention records unavailable." : "Sign in with an authorised company session." } };
}
