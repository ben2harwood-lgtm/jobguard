import type { Pool } from "pg";
import { PracticeAccessError, V2JobProfitRepository } from "@jobguard/db";
import { PracticeAccess } from "../practice-access.js";

export class V2JobProfitApplication {
  constructor(private readonly pool: Pool, private readonly sessionId?: string) {}
  async read(jobId: string) {
    if (process.env.JOBGUARD_LOCAL_V2 !== "1" || process.env.JOBGUARD_ENV !== "synthetic_demo") {
      throw new PracticeAccessError("SYNTHETIC_MODE_REQUIRED");
    }
    const actor = await new PracticeAccess(this.pool, this.sessionId).job(jobId);
    return new V2JobProfitRepository(this.pool).read(actor.context, jobId, actor);
  }
}
