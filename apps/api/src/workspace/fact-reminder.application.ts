import { FactReminderRepository, PracticeAccessError, type FactReminderCommand } from "@jobguard/db";
import type { Pool } from "pg";
import { PracticeAccess } from "../practice-access.js";

export { FactReminderError, factReminderCommandV1, type FactReminderCommand, type FactReminderReceipt,
  type FactReminderView } from "@jobguard/db";

// V2 practice only. The builder's press runs the reminders for one job; reading
// needs the practice job, and running needs the signed-in practice session.
export class FactReminderApplication {
  private readonly access: PracticeAccess;
  private readonly reminders: FactReminderRepository;

  constructor(pool: Pool, private readonly sessionId?: string) {
    this.access = new PracticeAccess(pool, sessionId);
    this.reminders = new FactReminderRepository(pool);
  }

  async read(jobId: string) {
    const { context } = await this.authorize(jobId);
    return this.reminders.read(context, jobId);
  }

  async run(jobId: string, command: FactReminderCommand) {
    const { context } = await this.authorize(jobId);
    if (!this.sessionId) throw new PracticeAccessError("UNAUTHENTICATED");
    return this.reminders.run(context, jobId, this.sessionId, command);
  }

  private authorize(jobId: string) {
    if (process.env.JOBGUARD_LOCAL_V2 !== "1" || process.env.JOBGUARD_ENV !== "synthetic_demo") {
      throw new PracticeAccessError("SYNTHETIC_MODE_REQUIRED");
    }
    return this.access.job(jobId);
  }
}
