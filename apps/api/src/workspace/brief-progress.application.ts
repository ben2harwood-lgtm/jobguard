import { BriefProgressRepository, PracticeAccessError } from "@jobguard/db";
import type { Pool } from "pg";
import { PracticeAccess } from "../practice-access.js";
import { CrewBriefApplication } from "./crew-brief.application.js";

export { BriefProgressError, briefProgressCommandV1, type BriefProgress, type BriefProgressCommand } from "@jobguard/db";

export class BriefProgressApplication {
  private readonly access: PracticeAccess;
  private readonly progress: BriefProgressRepository;
  private readonly briefs: CrewBriefApplication;
  constructor(pool: Pool, private readonly sessionId?: string) {
    this.access = new PracticeAccess(pool, sessionId);
    this.progress = new BriefProgressRepository(pool);
    this.briefs = new CrewBriefApplication(pool, sessionId);
  }
  async read(jobId: string) {
    const { context } = await this.authorize(jobId);
    return { version: "v2-brief-progress-view.v1" as const,
      briefs: await this.briefs.read(jobId, { version: "v2-crew-brief-query.v1" }),
      progress: await this.progress.read(context, jobId) };
  }
  async record(jobId: string, raw: unknown) {
    const { context } = await this.authorize(jobId);
    if (!this.sessionId) throw new PracticeAccessError("UNAUTHENTICATED");
    return this.progress.record(context, jobId, this.sessionId, raw);
  }
  private authorize(jobId: string) {
    if (process.env.JOBGUARD_LOCAL_V2 !== "1" || process.env.JOBGUARD_ENV !== "synthetic_demo") {
      throw new PracticeAccessError("SYNTHETIC_MODE_REQUIRED");
    }
    return this.access.job(jobId);
  }
}
