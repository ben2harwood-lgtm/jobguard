import type { Pool } from "pg";
import { DiaryShareRepository, FridayUpdateRepository, diaryRefusal, diaryShareCommandV1, fridayCommandV1, fridayQueryV1, fridayWeekDates,
  londonDay, type FridayCommand } from "@jobguard/db";
import { PracticeAccess } from "../practice-access.js";

export { diaryShareCommandV1, fridayCommandV1, fridayQueryV1 };
export type { DiaryShareCommand, FridayCommand, FridayContent, FridaySnapshot } from "@jobguard/db";
export type FridayDiaryEntry = { id: string; text: string; receivedAt: string; shared: boolean;
  refused: "amount" | "too_long" | "empty" | null };
export class FridayUpdateApplication {
  private readonly access: PracticeAccess;
  private readonly updates: FridayUpdateRepository;
  private readonly shares: DiaryShareRepository;
  constructor(pool: Pool, private readonly sessionId?: string) {
    this.access = new PracticeAccess(pool, sessionId);
    this.updates = new FridayUpdateRepository(pool);
    this.shares = new DiaryShareRepository(pool);
  }
  async read(jobId: string, query: unknown) {
    const { context } = await this.access.job(jobId);
    const { week } = fridayQueryV1.parse(query);
    return this.updates.read(context, jobId, week);
  }
  async command(jobId: string, input: FridayCommand) {
    const { context, digest } = await this.access.job(jobId);
    return this.updates.command(context, jobId, this.sessionId!, input, digest);
  }
  /** The week's diary notes, oldest first, with the builder's mark and why a note cannot be offered. */
  async diary(jobId: string, query: unknown): Promise<FridayDiaryEntry[]> {
    const { context, digest } = await this.access.job(jobId);
    const { week } = fridayQueryV1.parse(query);
    const [start, next] = fridayWeekDates(week) as [string, string, string];
    const { entries, shares } = await this.updates.diaryLines(context, jobId, week, digest);
    const marks = new Map(shares.map(share => [share.diaryEntryId, share.shared]));
    return entries.filter(entry => { const day = londonDay(entry.evidence.serverReceivedAt); return day >= start && day < next; })
      .map(entry => ({ id: entry.id, text: entry.text, receivedAt: entry.evidence.serverReceivedAt,
        shared: marks.get(entry.id) ?? false, refused: diaryRefusal(entry.text) }))
      .sort((a, b) => Date.parse(a.receivedAt) - Date.parse(b.receivedAt) || a.id.localeCompare(b.id));
  }
  async share(jobId: string, body: unknown) {
    const { context } = await this.access.job(jobId);
    return this.shares.set(context, jobId, this.sessionId!, diaryShareCommandV1.parse(body));
  }
}
