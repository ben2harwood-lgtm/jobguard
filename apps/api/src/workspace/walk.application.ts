import { PracticeAccessError, WalkError, WalkRepository, walkQueryV1,
  type WalkEntryCommand, type WalkQuery, type WalkSessionCommand } from "@jobguard/db";
import type { Pool } from "pg";
import { PracticeAccess } from "../practice-access.js";

export { WALK_CLOCK_TOLERANCE_SECONDS, WalkError, walkEntryCommandV1, walkQueryV1, walkSessionCommandV1,
  type WalkEntryCommand, type WalkEntryView, type WalkQuery, type WalkSession, type WalkSessionCommand } from "@jobguard/db";

/** V2 walk session record: commands and queries for the later walk screens. No audio, no paid calls. */
export class WalkApplication {
  private readonly access: PracticeAccess;
  private readonly walks: WalkRepository;

  constructor(pool: Pool, private readonly sessionId?: string) {
    this.access = new PracticeAccess(pool, sessionId);
    this.walks = new WalkRepository(pool);
  }

  async read(jobId: string, query: WalkQuery) {
    const { context } = await this.authorize(jobId);
    const parsed = walkQueryV1.safeParse(query);
    if (!parsed.success) throw new WalkError("WALK_INVALID_QUERY");
    const sessions = await this.walks.read(context, jobId, parsed.data.sessionId);
    if (parsed.data.sessionId && sessions.length === 0) throw new PracticeAccessError("NOT_FOUND");
    return sessions;
  }

  async start(jobId: string, command: WalkSessionCommand) {
    const { context } = await this.authorize(jobId);
    if (!this.sessionId) throw new PracticeAccessError("UNAUTHENTICATED");
    return this.walks.startSession(context, jobId, this.sessionId, command);
  }

  async record(jobId: string, command: WalkEntryCommand) {
    const { context } = await this.authorize(jobId);
    if (!this.sessionId) throw new PracticeAccessError("UNAUTHENTICATED");
    return this.walks.recordEntry(context, jobId, this.sessionId, command);
  }

  private authorize(jobId: string) {
    if (process.env.JOBGUARD_LOCAL_V2 !== "1") throw new PracticeAccessError("SYNTHETIC_MODE_REQUIRED");
    return this.access.job(jobId);
  }
}
