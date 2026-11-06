import { DunningError } from "@jobguard/core";
import type { DunningRepository } from "@jobguard/db";
import { resolveVerifiedTenantContext, type TenantRequestCredentials } from "./auth/principal-bridge.js";
import { identityStatus } from "./auth/identity-http.js";
import type { IdentityApplication } from "./auth/identity.application.js";

export class DunningApplication {
  constructor(private readonly identity: IdentityApplication, private readonly repository: Pick<DunningRepository, "read" | "command">) {}
  async read(credentials: TenantRequestCredentials, jobId: string) {
    if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new DunningError("DUNNING_DARK");
    const context = await resolveVerifiedTenantContext(this.identity.provider, credentials, this.identity.allowedOrigin);
    const digest = this.identity.provider.digest(`session:${credentials.sessionToken}`);
    return this.repository.read(context, digest, { jobId, nowTick: Date.now() });
  }
  async command(credentials: TenantRequestCredentials, jobId: string, operation: "request" | "approve", raw: unknown) {
    if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new DunningError("DUNNING_DARK");
    const context = await resolveVerifiedTenantContext(this.identity.provider, credentials, this.identity.allowedOrigin);
    const digest = this.identity.provider.digest(`session:${credentials.sessionToken}`);
    return this.repository.command(context, digest, jobId, operation, raw);
  }
}
export function dunningFailure(error: unknown) {
  if (error instanceof DunningError) return { status: error.code === "INVALID_DUNNING_INPUT" ? 400
    : error.code === "DUNNING_DARK" || ("status" in error && error.status === 403) ? 403 : error.code === "DUNNING_CONFLICT" ? 409 : 503,
    body: { version: "dunning-error.v1", code: error.code } };
  const auth = identityStatus(error);
  return { status: auth.status, body: { version: "dunning-error.v1",
    code: auth.code === "IDENTITY_UNAVAILABLE" ? "DUNNING_UNAVAILABLE" : auth.code } };
}
