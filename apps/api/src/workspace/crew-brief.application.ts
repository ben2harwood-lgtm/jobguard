import { CrewBriefError, CrewBriefRepository, PracticeAccessError, crewBriefQueryV1,
  type CrewBriefCommand, type CrewBriefQuery } from "@jobguard/db";
import type { Pool } from "pg";
import { PracticeAccess } from "../practice-access.js";

export { CrewBriefError, crewBriefCommandV1, crewBriefQueryV1,
  type CrewBrief, type CrewBriefCommand, type CrewBriefContent, type CrewBriefQuery } from "@jobguard/db";

export class CrewBriefApplication {
  private readonly access: PracticeAccess;
  private readonly briefs: CrewBriefRepository;

  constructor(pool: Pool, private readonly sessionId?: string) {
    this.access = new PracticeAccess(pool, sessionId);
    this.briefs = new CrewBriefRepository(pool);
  }

  async read(jobId: string, query: CrewBriefQuery) {
    const { context } = await this.authorize(jobId);
    const parsed = crewBriefQueryV1.safeParse(query);
    if (!parsed.success) throw new CrewBriefError("CREW_BRIEF_INVALID_QUERY");
    return this.briefs.read(context, jobId, parsed.data);
  }

  async generate(jobId: string, command: CrewBriefCommand) {
    const { context } = await this.authorize(jobId);
    if (!this.sessionId) throw new PracticeAccessError("UNAUTHENTICATED");
    return this.briefs.generate(context, jobId, this.sessionId, command);
  }

  async exportInternal(jobId: string, trade: string) {
    const [brief] = await this.read(jobId, { version: "v2-crew-brief-query.v1", trade });
    if (!brief) throw new PracticeAccessError("NOT_FOUND");
    return JSON.stringify({ version: "v2-crew-brief-export.v1", environment: "synthetic_demo",
      notice: "Practice sandbox — synthetic data; nothing is sent or charged", brief: brief.content });
  }

  private authorize(jobId: string) {
    if (process.env.JOBGUARD_LOCAL_V2 !== "1") throw new PracticeAccessError("SYNTHETIC_MODE_REQUIRED");
    return this.access.job(jobId);
  }
}
