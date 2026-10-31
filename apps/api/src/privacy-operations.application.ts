import { ZodError } from "zod";
import { PrivacyOperationsError } from "@jobguard/core";
import type { PrivacyOperationsRepository } from "@jobguard/db";
import { resolveVerifiedTenantContext, type TenantRequestCredentials } from "./auth/principal-bridge.js";
import { AuthError } from "./auth/auth-provider.js";
import type { IdentityApplication } from "./auth/identity.application.js";

export class PrivacyOperationsApplication {
  constructor(private readonly identity: IdentityApplication, private readonly repository: Pick<PrivacyOperationsRepository, "read" | "command">,
    private readonly configuration: () => { environment: string | undefined; enabled: string | undefined } = () => ({ environment: process.env.JOBGUARD_ENV, enabled: process.env.JOBGUARD_PRIVACY_REHEARSAL_ENABLED })) {}
  async invoke(credentials: TenantRequestCredentials, mode: "read" | "command", raw: unknown) {
    const config = this.configuration();
    if (config.environment !== "synthetic_demo" || config.enabled !== "true") throw new PrivacyOperationsError("PRIVACY_DISABLED");
    try {
      const context = await resolveVerifiedTenantContext(this.identity.provider, credentials, this.identity.allowedOrigin);
      const digest = this.identity.provider.digest(`session:${credentials.sessionToken}`);
      return await this.repository[mode](context, digest, raw);
    } catch (error) {
      if (error instanceof PrivacyOperationsError) throw error;
      if (error instanceof AuthError || error instanceof ZodError) throw new PrivacyOperationsError("PRIVACY_FORBIDDEN");
      throw new PrivacyOperationsError("PRIVACY_UNAVAILABLE");
    }
  }
}
