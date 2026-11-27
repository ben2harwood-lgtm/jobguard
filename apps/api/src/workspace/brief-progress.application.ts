import { BriefProgressRepository, PracticeAccessError, withTenant, BriefProgressError } from "@jobguard/db";
import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { PracticeAccess } from "../practice-access.js";
import { uploadBriefProgressPhoto } from "./brief-progress-photo.application.js";
import { CrewBriefApplication } from "./crew-brief.application.js";

export { BriefProgressError, briefProgressCommandV1, briefProgressCommandV2, briefProgressPhotoCommandV1, type BriefProgress, type BriefProgressCommand, type BriefTaskStatus, type TaskProofStatus, taskProofStatus, isTaskComplete } from "@jobguard/db";

export class BriefProgressApplication {
  private readonly access: PracticeAccess;
  private readonly progress: BriefProgressRepository;
  private readonly briefs: CrewBriefApplication;
  constructor(private readonly pool: Pool, private readonly sessionId?: string) {
    this.access = new PracticeAccess(pool, sessionId);
    this.progress = new BriefProgressRepository(pool);
    this.briefs = new CrewBriefApplication(pool, sessionId);
  }
  async read(jobId: string) {
    const { context } = await this.authorize(jobId);
    return { version: "v2-brief-progress-view.v1" as const,
      briefs: await this.briefs.read(jobId, { version: "v2-crew-brief-query.v1" }),
      ...await this.progress.read(context, jobId) };
  }
  async record(jobId: string, raw: unknown) {
    const { context } = await this.authorize(jobId);
    if (!this.sessionId) throw new PracticeAccessError("UNAUTHENTICATED");
    return this.progress.record(context, jobId, this.sessionId, raw);
  }
  async uploadPhoto(jobId: string, raw: unknown) {
    const practice = await this.authorize(jobId);
    const editor = await withTenant(this.pool, practice.context, async db => (await db.$client.query<{ id: string | null }>(
      "SELECT app.v2_work_plan_editor($1) AS id", [createHash("sha256").update(this.sessionId!).digest("hex")])).rows[0]?.id);
    if (!editor) throw new BriefProgressError("BRIEF_PROGRESS_EDITOR_REQUIRED");
    return uploadBriefProgressPhoto(this.pool, practice.context, jobId, editor, raw);
  }
  private authorize(jobId: string) {
    if (process.env.JOBGUARD_LOCAL_V2 !== "1" || process.env.JOBGUARD_ENV !== "synthetic_demo") {
      throw new PracticeAccessError("SYNTHETIC_MODE_REQUIRED");
    }
    return this.access.job(jobId);
  }
}
