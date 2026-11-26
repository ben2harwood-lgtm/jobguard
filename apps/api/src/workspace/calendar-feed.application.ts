import { CalendarFeedError, CalendarFeedRepository, PracticeAccessError, calendarFeedAddress, calendarFeedCommandV1, calendarFeedSnapshot,
  renderCalendarFeed } from "@jobguard/db";
import type { Pool } from "pg";
import { JobPartiesApplication } from "../job-parties.application.js";
import { PracticeAccess } from "../practice-access.js";
import { WorkPlanApplication } from "./work-plan.application.js";
export type { CalendarFeed } from "@jobguard/db";

const practiceOnly = () => process.env.JOBGUARD_LOCAL_V2 === "1" && process.env.JOBGUARD_ENV === "synthetic_demo";

/** V2-K2A: the builder's private calendar link for one job. No send, ledger, detector or fee dependency. */
export class CalendarFeedApplication {
  private readonly access: PracticeAccess;
  private readonly feeds: CalendarFeedRepository;
  constructor(private readonly pool: Pool, private readonly sessionId?: string) {
    this.access = new PracticeAccess(pool, sessionId);
    this.feeds = new CalendarFeedRepository(pool);
  }
  private async authorize(jobId: string) {
    if (!practiceOnly()) throw new PracticeAccessError("SYNTHETIC_MODE_REQUIRED");
    if (!this.sessionId) throw new PracticeAccessError("UNAUTHENTICATED");
    return this.access.job(jobId);
  }
  /** Built from the builder's own signed-in plan read, the same read the Work tab uses. */
  private async snapshot(jobId: string) {
    const plan = await new WorkPlanApplication(this.pool, this.sessionId).read(jobId, { version: "work-plan-query.v1" });
    const site = (await new JobPartiesApplication(this.pool).view({ sessionId: this.sessionId! }, jobId)).current?.site;
    return calendarFeedSnapshot(plan, site ? calendarFeedAddress(site) : null);
  }
  async list(jobId: string) {
    const { context } = await this.authorize(jobId);
    const feeds = await this.feeds.list(context, jobId, this.sessionId!);
    const live = feeds.find(entry => !entry.feed.revoked);
    const current = live ? await this.snapshot(jobId) : null;
    return { environment: "synthetic_demo" as const, feeds: feeds.map(({ feed }) => feed),
      // The saved copy is out of date when the plan's dated tasks or the address have changed since.
      stale: !!live && JSON.stringify(live.snapshot) !== JSON.stringify(current) };
  }
  async command(jobId: string, raw: unknown) {
    const { context } = await this.authorize(jobId);
    const parsed = calendarFeedCommandV1.safeParse(raw);
    if (!parsed.success) throw new CalendarFeedError("CALENDAR_FEED_INVALID");
    const snapshot = parsed.data.action === "revoke" ? null : await this.snapshot(jobId);
    return this.feeds.command(context, jobId, this.sessionId!, parsed.data, snapshot);
  }
  /** Bearer read for calendar apps. Takes the token only, never a session. */
  async calendar(token: string): Promise<string | null> {
    if (!practiceOnly()) return null;
    const feed = await this.feeds.read(token);
    return feed && renderCalendarFeed(feed.snapshot, feed.updatedAt);
  }
}
