import type { Pool } from "pg";
import { JobImportV3Repository } from "@jobguard/db";
import { PracticeAccess } from "./practice-access.js";

/** Public inputs contain intent only; current session supplies tenant and actor. */
export class JobImportV3Application {
  constructor(private readonly pool: Pool, private readonly sessionId?: string) {}
  async preview(jobId: string, raw: unknown) {
    const auth = await new PracticeAccess(this.pool, this.sessionId).job(jobId);
    return new JobImportV3Repository(this.pool).preview(auth.context, auth.digest, jobId, raw);
  }
  async adopt(jobId: string, raw: unknown) {
    const auth = await new PracticeAccess(this.pool, this.sessionId).job(jobId);
    return new JobImportV3Repository(this.pool).adopt(auth.context, auth.digest, jobId, raw);
  }
  async read(jobId: string) {
    const auth = await new PracticeAccess(this.pool, this.sessionId).job(jobId);
    return new JobImportV3Repository(this.pool).read(auth.context, auth.digest, jobId);
  }
}
