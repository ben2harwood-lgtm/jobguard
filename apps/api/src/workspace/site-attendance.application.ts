import { CrewContactRepository, PracticeAccessError, SiteAttendanceError, SiteAttendanceRepository, siteAttendanceCommandV1,
  siteAttendanceQueryV1, type SiteAttendanceCommand, type SiteAttendanceRecord, type SiteAttendanceView } from "@jobguard/db";
import type { Pool } from "pg";
import { PracticeAccess } from "../practice-access.js";

export { siteAttendanceCommandV1, siteAttendanceQueryV1, type SiteAttendanceCommand, type SiteAttendanceRecord,
  type SiteAttendanceView };
/** The card's read: the taps, plus each of the firm's crew records by name and trade only. */
export type SiteAttendanceScreen = SiteAttendanceView & { crew: { crewId: string; displayName: string; trade: string }[] };

/** V2-F8: the builder records who was on site on one of the firm's jobs. V2 only. */
export class SiteAttendanceApplication {
  private readonly access: PracticeAccess;
  private readonly attendance: SiteAttendanceRepository;
  private readonly crew: CrewContactRepository;

  constructor(pool: Pool, private readonly sessionId?: string) {
    this.access = new PracticeAccess(pool, sessionId);
    this.attendance = new SiteAttendanceRepository(pool);
    this.crew = new CrewContactRepository(pool);
  }

  async list(jobId: string, query: unknown): Promise<SiteAttendanceScreen> {
    const { context } = await this.authorize(jobId);
    if (!siteAttendanceQueryV1.safeParse(query).success) throw new SiteAttendanceError("SITE_ATTENDANCE_INVALID");
    if (!this.sessionId) throw new PracticeAccessError("UNAUTHENTICATED");
    const [view, contacts] = await Promise.all([this.attendance.list(context, jobId, this.sessionId),
      this.crew.list(context)]);
    // Phone numbers and emails stay off this screen.
    return { ...view, crew: contacts.map(({ crewId, displayName, trade }) => ({ crewId, displayName, trade })) };
  }

  async record(jobId: string, input: unknown): Promise<SiteAttendanceRecord> {
    const { context } = await this.authorize(jobId);
    const parsed = siteAttendanceCommandV1.safeParse(input);
    if (!parsed.success) throw new SiteAttendanceError("SITE_ATTENDANCE_INVALID");
    if (!this.sessionId) throw new PracticeAccessError("UNAUTHENTICATED");
    return this.attendance.record(context, jobId, this.sessionId, parsed.data);
  }

  private authorize(jobId: string) {
    if (process.env.JOBGUARD_LOCAL_V2 !== "1") throw new PracticeAccessError("SYNTHETIC_MODE_REQUIRED");
    return this.access.job(jobId);
  }
}
