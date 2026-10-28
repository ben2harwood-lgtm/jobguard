import { MeterLifecyclePersistenceError, type MeterTodayRepository } from "@jobguard/db";
import { resolveVerifiedTenantContext } from "./auth/principal-bridge.js";
import { identityStatus } from "./auth/identity-http.js";
import type { IdentityApplication } from "./auth/identity.application.js";
import type { TenantRequestCredentials } from "./auth/principal-bridge.js";

export class MeterTodayApplication {
  constructor(private readonly identity: IdentityApplication, private readonly repository: Pick<MeterTodayRepository, "read">) {}
  async read(credentials: TenantRequestCredentials) {
    if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new MeterLifecyclePersistenceError("METER_FORBIDDEN");
    const context = await resolveVerifiedTenantContext(this.identity.provider, credentials, this.identity.allowedOrigin);
    return this.repository.read(context, this.identity.provider.digest(`session:${credentials.sessionToken}`));
  }
}
export function meterTodayFailure(error: unknown) {
  if (error instanceof MeterLifecyclePersistenceError) return {
    status: error.code === "METER_FORBIDDEN" ? 403 : error.code === "METER_PROJECTION_MISMATCH" ? 409 : 503,
    body: { version: "meter-today-error.v1", code: error.code },
  };
  const identity = identityStatus(error);
  return { status: identity.status, body: { version: "meter-today-error.v1", code: identity.code === "IDENTITY_UNAVAILABLE" ? "METER_UNAVAILABLE" : identity.code } };
}
