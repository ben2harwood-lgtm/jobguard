import { OpenFactRepository, PracticeAccessError, type OpenFactCommand, type OpenFactQuery } from "@jobguard/db";
import type { Pool } from "pg";
import { PracticeAccess } from "../practice-access.js";

export { OpenFactError, openFactCommandV1, openFactQueryV1, type OpenFact, type OpenFactCommand,
  type OpenFactQuery, type OpenFactReceipt } from "@jobguard/db";

// Logged by hand only: no replies from outside, reminders or sending.
export class OpenFactApplication {
  private readonly access: PracticeAccess;
  private readonly facts: OpenFactRepository;

  constructor(pool: Pool, private readonly sessionId?: string) {
    this.access = new PracticeAccess(pool, sessionId);
    this.facts = new OpenFactRepository(pool);
  }

  async read(jobId: string, query: OpenFactQuery) {
    const { context } = await this.authorize(jobId);
    const facts = await this.facts.read(context, jobId, query);
    if (query?.factId !== undefined && facts.length === 0) throw new PracticeAccessError("NOT_FOUND");
    return facts;
  }

  async command(jobId: string, command: OpenFactCommand) {
    const { context } = await this.authorize(jobId);
    if (!this.sessionId) throw new PracticeAccessError("UNAUTHENTICATED");
    return this.facts.command(context, jobId, this.sessionId, command);
  }

  private authorize(jobId: string) {
    if (process.env.JOBGUARD_LOCAL_V2 !== "1") throw new PracticeAccessError("SYNTHETIC_MODE_REQUIRED");
    return this.access.job(jobId);
  }
}
