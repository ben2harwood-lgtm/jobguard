import { PlanClashRepository, PracticeAccessError, type PlanClashes } from "@jobguard/db";
import type { Pool } from "pg";
import { PracticeAccess } from "../practice-access.js";

export type { PlanClashes };

/** V2-E5A: same-firm double-booking check for one job's plan. Read-only, V2 only. */
export class PlanClashApplication {
  private readonly access: PracticeAccess;
  private readonly clashes: PlanClashRepository;

  constructor(pool: Pool, sessionId?: string) {
    this.access = new PracticeAccess(pool, sessionId);
    this.clashes = new PlanClashRepository(pool);
  }

  async read(jobId: string): Promise<PlanClashes> {
    if (process.env.JOBGUARD_LOCAL_V2 !== "1") throw new PracticeAccessError("SYNTHETIC_MODE_REQUIRED");
    const { context } = await this.access.job(jobId);
    return this.clashes.sameFirmClashes(context, jobId);
  }
}
