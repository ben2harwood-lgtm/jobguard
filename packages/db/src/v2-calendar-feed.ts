import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

const uuid = z.uuid().transform(value => value.toLowerCase());
export const calendarFeedCommandV1 = z.strictObject({
  version: z.literal("calendar-feed-command.v1"), commandId: uuid, feedId: uuid,
  expectedVersion: z.number().int().min(0).max(2_147_483_646),
  action: z.enum(["create", "refresh", "revoke"]),
}).refine(value => (value.action === "create") === (value.expectedVersion === 0));
export const calendarFeedTaskV1 = z.strictObject({
  quoteRevisionId: uuid, scopeItemId: uuid, templateTaskKey: z.string().min(1).max(100),
  title: z.string().min(1).max(2000), trade: z.string().min(1).max(100), date: z.iso.date(),
  durationMinutes: z.number().int().min(1).max(2_147_483_647), assignee: z.string().max(100).nullable(),
});
export const calendarFeedSnapshotV1 = z.strictObject({
  version: z.literal("calendar-feed-snapshot.v1"), address: z.string().max(1000).nullable(),
  tasks: z.array(calendarFeedTaskV1).max(2000),
});
export type CalendarFeedCommand = z.infer<typeof calendarFeedCommandV1>;
export type CalendarFeedSnapshot = z.infer<typeof calendarFeedSnapshotV1>;
export type CalendarFeedTask = z.infer<typeof calendarFeedTaskV1>;
export type CalendarFeed = { feedId: string; feedVersion: number; createdAt: string; updatedAt: string;
  revoked: boolean; taskCount: number };
export class CalendarFeedError extends Error {
  constructor(readonly code: "CALENDAR_FEED_INVALID" | "CALENDAR_FEED_VERSION_CONFLICT" | "CALENDAR_FEED_COMMAND_CONFLICT" |
    "CALENDAR_FEED_EXISTS" | "CALENDAR_FEED_EDITOR_REQUIRED" | "CALENDAR_FEED_NOT_FOUND") { super(code); }
}

/** 256 random bits, URL-safe. Only its SHA-256 is stored. */
export const newCalendarFeedToken = () => randomBytes(32).toString("base64url");
export const calendarFeedTokenPattern = /^[A-Za-z0-9_-]{43}$/u;
export const calendarFeedTokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

/** Plan tasks with a date only. Text is copied as written; prices, notes and photos are never read. */
export function calendarFeedSnapshot(plan: { quoteRevisionId: string; tasks: readonly {
  key: string; scopeItemId: string; title: string; trade: string; durationMinutes: number;
  scheduledDate?: string | null; assignee?: string | null; }[] }, address: string | null): CalendarFeedSnapshot {
  return calendarFeedSnapshotV1.parse({ version: "calendar-feed-snapshot.v1", address,
    tasks: plan.tasks.filter(task => task.scheduledDate).map(task => ({ quoteRevisionId: plan.quoteRevisionId,
      scopeItemId: task.scopeItemId, templateTaskKey: task.key, title: task.title, trade: task.trade,
      date: task.scheduledDate, durationMinutes: task.durationMinutes, assignee: task.assignee ?? null })) });
}

// RFC 5545 3.3.11: backslash, semicolon, comma and line breaks are escaped. Other control characters are dropped.
export const icsText = (value: string) => value.replace(/\r\n|\r|\n/gu, "\n")
  // eslint-disable-next-line no-control-regex
  .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/gu, "")
  .replace(/[\\;,\n]/gu, match => match === "\n" ? "\\n" : `\\${match}`);

// RFC 5545 3.1: lines longer than 75 octets fold with CRLF and one space, never inside a UTF-8 character.
export function icsFold(line: string): string {
  const parts: string[] = [];
  let current = "", size = 0;
  for (const character of line) {
    const bytes = Buffer.byteLength(character);
    if (size + bytes > (parts.length ? 74 : 75)) { parts.push(current); current = ""; size = 0; }
    current += character; size += bytes;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

const nextDay = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
const hours = (minutes: number) => minutes % 60 === 0 ? `${minutes / 60} h` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;

export function renderCalendarFeed(snapshot: CalendarFeedSnapshot, updatedAt: string): string {
  const stamp = /^\d{8}T\d{6}Z$/u.test(updatedAt) ? updatedAt : "19700101T000000Z";
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//JobGuard V2 practice//Builder calendar//EN",
    "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:JobGuard practice work plan"];
  for (const task of snapshot.tasks) {
    const details = [`Trade: ${task.trade}`, `Assignee: ${task.assignee ?? "Not set"}`, `Planned time: ${hours(task.durationMinutes)}`,
      "Practice sandbox — synthetic data; nothing is sent or charged."].join("\n");
    lines.push("BEGIN:VEVENT",
      `UID:${icsText(`${task.quoteRevisionId}.${task.scopeItemId}.${task.templateTaskKey}@calendar.jobguard-v2.invalid`)}`,
      `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${task.date.replaceAll("-", "")}`,
      `DTEND;VALUE=DATE:${nextDay(task.date).replaceAll("-", "")}`,
      `SUMMARY:${icsText(`${task.title} (${task.trade})`)}`,
      ...(snapshot.address ? [`LOCATION:${icsText(snapshot.address)}`] : []),
      `DESCRIPTION:${icsText(details)}`, "TRANSP:TRANSPARENT", "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(icsFold).join("\r\n")}\r\n`;
}
