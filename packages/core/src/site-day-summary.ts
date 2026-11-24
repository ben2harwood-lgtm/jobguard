import { z } from "zod";
import { sha256 } from "./evidence-pack.js";

/**
 * QW-2: one job's site day, closed at 18:00 UK time. Day D covers activity recorded from 18:00 on D-1 (inclusive)
 * to 18:00 on D (exclusive), so a closed day never changes. Lists recorded facts only, each citing its source row.
 */
export const SITE_DAY_CUTOFF_HOUR = 18;
export class SiteDaySummaryError extends Error {
  constructor(readonly code: "INVALID_SITE_DAY" | "SITE_DAY_NOT_STARTED") { super(code); this.name = "SiteDaySummaryError"; }
}
export const siteDayDateV1 = z.string().regex(/^(?!0000)\d{4}-\d{2}-\d{2}$/u).refine(value => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
});
const iso = z.iso.datetime({ precision: 3 });
const uuid = z.guid();

const london = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
function londonWall(at: number) {
  const parts = london.formatToParts(new Date(at));
  const part = (name: string) => Number(parts.find(value => value.type === name)!.value);
  return Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second"));
}
/** The UTC instant of a UK wall-clock time. 18:00 is never inside a clock change, so it is always unambiguous. */
function londonInstant(date: string, hour: number) {
  const wall = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), hour);
  let guess = wall;
  for (let step = 0; step < 3; step++) guess = wall - (londonWall(guess) - guess);
  return guess;
}
function previousDate(date: string) { return new Date(Date.parse(`${date}T00:00:00.000Z`) - 86_400_000).toISOString().slice(0, 10); }

export type SiteDayWindow = { date: string; startsAt: string; closesAt: string };
export function siteDayWindowV1(date: string): SiteDayWindow {
  if (!siteDayDateV1.safeParse(date).success) throw new SiteDaySummaryError("INVALID_SITE_DAY");
  return { date, startsAt: new Date(londonInstant(previousDate(date), SITE_DAY_CUTOFF_HOUR)).toISOString(),
    closesAt: new Date(londonInstant(date, SITE_DAY_CUTOFF_HOUR)).toISOString() };
}
/** The site day an instant belongs to: from 18:00 UK time it is the next calendar day's. */
export function siteDayOfV1(at: Date): string {
  const wall = londonWall(at.getTime()), date = new Date(wall).toISOString().slice(0, 10);
  return new Date(wall).getUTCHours() >= SITE_DAY_CUTOFF_HOUR
    ? new Date(Date.parse(`${date}T00:00:00.000Z`) + 86_400_000).toISOString().slice(0, 10) : date;
}

export const siteDayWorkItemV1 = z.object({ scopeItemId: uuid, description: z.string(), stage: z.enum(["in_progress", "complete"]), at: iso }).strict();
export const siteDayIssueV1 = z.object({ variationId: uuid, description: z.string(), at: iso }).strict();
export const siteDayDeliveryV1 = z.object({ kind: z.enum(["delivery_document", "goods_receipt"]), sourceId: uuid, label: z.string(), at: iso }).strict();
export const siteDayPhotoV1 = z.object({ evidenceId: uuid, evidenceType: z.string(), scopeItemId: uuid.nullable(), at: iso }).strict();
export const siteDayNoteV1 = z.object({ entryId: uuid, text: z.string(), onSite: z.boolean(), at: iso }).strict();
export const siteDaySourcesV1 = z.object({
  workDone: z.array(siteDayWorkItemV1), issues: z.array(siteDayIssueV1), deliveries: z.array(siteDayDeliveryV1),
  photos: z.array(siteDayPhotoV1), notes: z.array(siteDayNoteV1),
}).strict();
export type SiteDaySources = z.infer<typeof siteDaySourcesV1>;
export const siteDaySummaryV1 = siteDaySourcesV1.extend({
  version: z.literal("site-day-summary.v1"), jobId: uuid, date: siteDayDateV1, startsAt: iso, closesAt: iso,
  state: z.enum(["so_far", "day_closed"]), contentHash: z.string().regex(/^[a-f0-9]{64}$/u).nullable(),
}).strict().readonly();
export type SiteDaySummary = z.infer<typeof siteDaySummaryV1>;

const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(",")}]`
  : value && typeof value === "object"
    ? `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(",")}}`
    : JSON.stringify(value);
const byTime = <T extends { at: string }>(key: (item: T) => string) => (a: T, b: T) => a.at < b.at ? -1 : a.at > b.at ? 1 : key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0;

/** Orders the sources, drops anything outside the window, and hashes a closed day. `now` is supplied by the caller. */
export function buildSiteDaySummaryV1(jobId: string, date: string, now: Date, raw: SiteDaySources): SiteDaySummary {
  const window = siteDayWindowV1(date), sources = siteDaySourcesV1.parse(raw);
  if (now.toISOString() < window.startsAt) throw new SiteDaySummaryError("SITE_DAY_NOT_STARTED");
  const inside = <T extends { at: string }>(items: T[]) => items.filter(item => item.at >= window.startsAt && item.at < window.closesAt);
  const body: SiteDaySources = {
    workDone: inside(sources.workDone).sort(byTime(item => item.scopeItemId)),
    issues: inside(sources.issues).sort(byTime(item => item.variationId)),
    deliveries: inside(sources.deliveries).sort(byTime(item => item.sourceId)),
    photos: inside(sources.photos).sort(byTime(item => item.evidenceId)),
    notes: inside(sources.notes).sort(byTime(item => item.entryId)),
  };
  const closed = now.toISOString() >= window.closesAt;
  return siteDaySummaryV1.parse({ version: "site-day-summary.v1", jobId, ...window, state: closed ? "day_closed" : "so_far",
    contentHash: closed ? sha256(canonical({ jobId, date, ...body })) : null, ...body });
}
