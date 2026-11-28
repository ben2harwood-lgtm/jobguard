import type { Pool } from "pg";
import { PracticeAccessError, V2CloseOutRepository } from "@jobguard/db";
import { PracticeAccess } from "../practice-access.js";

/** V2-G6: "Before you close this job". Read only; the final account, lock, Final Check and invoices stay main's. */
export class CloseOutApplication {
  private readonly access: PracticeAccess;
  private readonly reviews: V2CloseOutRepository;
  constructor(pool: Pool, sessionId?: string) {
    this.access = new PracticeAccess(pool, sessionId);
    this.reviews = new V2CloseOutRepository(pool);
  }
  async review(jobId: string) {
    if (process.env.JOBGUARD_LOCAL_V2 !== "1" || process.env.JOBGUARD_ENV !== "synthetic_demo") {
      throw new PracticeAccessError("SYNTHETIC_MODE_REQUIRED");
    }
    // The usual job, firm and session gates: another firm's job is NOT_FOUND.
    const { context } = await this.access.job(jobId);
    return { version: "v2-close-out-review.v1" as const, environment: "synthetic_demo" as const,
      review: await this.reviews.review(context, jobId) };
  }
}
