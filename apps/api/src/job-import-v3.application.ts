import { resolveVerifiedTenantContext } from "./auth/principal-bridge.js";
import type { Pool } from "pg";
import { JobImportV3Repository, JobImportV3Error } from "@jobguard/db";
import { PracticeAccess } from "./practice-access.js";

/** Public inputs contain intent only; current session supplies tenant and actor. */
export class JobImportV3Application {
  constructor(private readonly pool: Pool, private readonly sessionId?: string) {}
  private async access(jobId: string) {
    return new PracticeAccess(this.pool, this.sessionId).job(jobId);
  }
  async source(jobId: string) {
    const auth = await this.access(jobId);
    return new JobImportV3Repository(this.pool).source(auth.context, auth.digest, jobId);
  }
  async assessCatch(jobId: string, raw: unknown) {
    const auth = await this.access(jobId);
    return new JobImportV3Repository(this.pool).assessCatch(auth.context, auth.digest, jobId, raw);
  }
  async preview(jobId: string, raw: unknown) {
    const auth = await this.access(jobId);
    return new JobImportV3Repository(this.pool).preview(auth.context, auth.digest, jobId, raw);
  }
  async adopt(jobId: string, raw: unknown) {
    const auth = await this.access(jobId);
    return new JobImportV3Repository(this.pool).adopt(auth.context, auth.digest, jobId, raw);
  }
  async read(jobId: string) {
    const auth = await this.access(jobId);
    return new JobImportV3Repository(this.pool).read(auth.context, auth.digest, jobId);
  }
}

/** Company imports reuse the meter's verified identity/CSRF bridge. */
export class CompanyJobImportV3Application {
  constructor(private readonly identity: import("./auth/identity.application.js").IdentityApplication, private readonly repository: JobImportV3Repository) {}
  async run(credentials: import("./auth/principal-bridge.js").TenantRequestCredentials, jobId: string,
    action: "source" | "read" | "preview" | "adopt" | "catch", raw?: unknown) {
    if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new JobImportV3Error("SYNTHETIC_MODE_REQUIRED");
    const context = await resolveVerifiedTenantContext(this.identity.provider, credentials, this.identity.allowedOrigin);
    const digest = this.identity.provider.digest(`session:${credentials.sessionToken}`);
    if (action === "source") return this.repository.source(context, digest, jobId);
    if (action === "read") return this.repository.read(context, digest, jobId);
    if (action === "preview") return this.repository.preview(context, digest, jobId, raw);
    if (action === "adopt") return this.repository.adopt(context, digest, jobId, raw);
    return this.repository.assessCatch(context, digest, jobId, raw);
  }
}
