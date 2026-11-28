import { CrewBriefTranslationError, CrewBriefTranslationRepository, PracticeAccessError,
  crewBriefTranslationQueryV1, type CrewBriefTranslationCommand, type CrewBriefTranslationQuery } from "@jobguard/db";
import type { Pool } from "pg";
import { PracticeAccess } from "../practice-access.js";

export class CrewBriefTranslationApplication {
  private readonly access: PracticeAccess;
  private readonly translations: CrewBriefTranslationRepository;
  constructor(pool: Pool, private readonly sessionId?: string) {
    this.access = new PracticeAccess(pool, sessionId);
    this.translations = new CrewBriefTranslationRepository(pool);
  }
  async read(jobId: string, query: CrewBriefTranslationQuery) {
    const { context } = await this.authorize(jobId);
    const parsed = crewBriefTranslationQueryV1.safeParse(query);
    if (!parsed.success) throw new CrewBriefTranslationError("CREW_BRIEF_TRANSLATION_INVALID_QUERY");
    return this.translations.read(context, jobId, this.sessionId!, parsed.data);
  }
  async translate(jobId: string, command: CrewBriefTranslationCommand) {
    const { context } = await this.authorize(jobId);
    return this.translations.translate(context, jobId, this.sessionId!, command);
  }
  private authorize(jobId: string) {
    if (process.env.JOBGUARD_LOCAL_V2 !== "1" || process.env.JOBGUARD_ENV !== "synthetic_demo") {
      throw new PracticeAccessError("SYNTHETIC_MODE_REQUIRED");
    }
    if (!this.sessionId) throw new PracticeAccessError("UNAUTHENTICATED");
    return this.access.job(jobId);
  }
}
