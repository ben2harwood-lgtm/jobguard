import { PilotG1DeniedError, requireG1ForPilot } from "@jobguard/config";
import type { Pool } from "pg";
import { JobSourceError, SiteDaySummaryError, buildSiteDaySummaryV1, siteDayDateV1, siteDayOfV1, siteDayWindowV1, type SiteDaySummary } from "@jobguard/core";
import { JobSourceRepository, SiteDaySummaryRepository } from "@jobguard/db";
import { z } from "zod";
import { PracticeAccess } from "./practice-access.js";

export const siteDaySummaryQueryV1 = z.object({ date: siteDayDateV1.optional() }).strict();
/** QW-2: the builder's daily site summary, closed at 18:00 UK time. Practice mode only, like the job diary it reads. */
export class SiteDaySummaryApplication {
  private readonly access: PracticeAccess;
  constructor(private readonly pool: Pool, sessionId?: string, private readonly clock: () => Date = () => new Date()) {
    this.assertMode(); this.access = new PracticeAccess(pool, sessionId);
  }
  private assertMode() {
    try { requireG1ForPilot(process.env.JOBGUARD_ENV, process.env); }
    catch (error) { if (!(error instanceof PilotG1DeniedError)) throw error; throw new JobSourceError("SYNTHETIC_MODE_REQUIRED"); }
    if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new JobSourceError("SYNTHETIC_MODE_REQUIRED");
  }
  async read(jobId: string, query: unknown = {}): Promise<SiteDaySummary> {
    this.assertMode();
    const parsed = siteDaySummaryQueryV1.safeParse(query);
    if (!parsed.success) throw new JobSourceError("INVALID_JOB_SOURCE_INPUT");
    const auth = await this.access.job(jobId), now = this.clock(), date = parsed.data.date ?? siteDayOfV1(now);
    const window = siteDayWindowV1(date);
    if (now.toISOString() < window.startsAt) throw new SiteDaySummaryError("SITE_DAY_NOT_STARTED");
    const [sources, diary] = await Promise.all([
      new SiteDaySummaryRepository(this.pool).sources(auth.context, jobId, window),
      new JobSourceRepository(this.pool).read(auth.context, jobId, auth.digest, "diary"),
    ]);
    const notes = diary.entries.map(entry => ({ entryId: entry.id, text: entry.text, onSite: entry.onSite, at: new Date(entry.evidence.serverReceivedAt).toISOString() }));
    return buildSiteDaySummaryV1(jobId, date, now, { ...sources, notes });
  }
}
export function siteDaySummaryFailure(error: unknown): { status: number; body: Record<string, unknown> } | null {
  if (error instanceof SiteDaySummaryError) return { status: error.code === "INVALID_SITE_DAY" ? 400 : 404, body: { version: "job-source-error.v1", code: error.code, environment: "synthetic_demo", realExternalActions: 0 } };
  return null;
}
