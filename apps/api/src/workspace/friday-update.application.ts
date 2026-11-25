import type { Pool } from "pg";
import { FridayUpdateRepository, fridayCommandV1, fridayQueryV1, type FridayCommand } from "@jobguard/db";
import { PracticeAccess } from "../practice-access.js";

export { fridayCommandV1, fridayQueryV1 };
export type { FridayCommand, FridayContent, FridaySnapshot } from "@jobguard/db";
export class FridayUpdateApplication {
  private readonly access: PracticeAccess;
  private readonly updates: FridayUpdateRepository;
  constructor(pool: Pool, private readonly sessionId?: string) {
    this.access = new PracticeAccess(pool, sessionId);
    this.updates = new FridayUpdateRepository(pool);
  }
  async read(jobId: string, query: unknown) {
    const { context } = await this.access.job(jobId);
    const { week } = fridayQueryV1.parse(query);
    return this.updates.read(context, jobId, week);
  }
  async command(jobId: string, input: FridayCommand) {
    const { context } = await this.access.job(jobId);
    return this.updates.command(context, jobId, this.sessionId!, input);
  }
}
