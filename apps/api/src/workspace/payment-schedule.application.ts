import type { Pool } from "pg";
import { PaymentScheduleRepository, PracticeAccessError } from "@jobguard/db";
import { PracticeAccess } from "../practice-access.js";

export class PaymentScheduleApplication {
  private readonly access: PracticeAccess;
  private readonly schedules: PaymentScheduleRepository;
  constructor(pool: Pool, private readonly sessionId?: string) {
    this.access = new PracticeAccess(pool, sessionId);
    this.schedules = new PaymentScheduleRepository(pool);
  }
  private async authorize(jobId: string) {
    if (process.env.JOBGUARD_LOCAL_V2 !== "1" || process.env.JOBGUARD_ENV !== "synthetic_demo") {
      throw new PracticeAccessError("SYNTHETIC_MODE_REQUIRED");
    }
    return this.access.job(jobId);
  }
  async read(jobId: string) {
    const { context } = await this.authorize(jobId);
    return this.schedules.read(context, jobId);
  }
  async set(jobId: string, raw: unknown) {
    const { context } = await this.authorize(jobId);
    if (!this.sessionId) throw new PracticeAccessError("UNAUTHENTICATED");
    if (raw && typeof raw === "object" && "version" in raw && raw.version === "payment-schedule-task-done.v1") {
      return this.schedules.recordTaskDone(context, jobId, this.sessionId, raw);
    }
    return this.schedules.set(context, jobId, this.sessionId, raw);
  }
}
