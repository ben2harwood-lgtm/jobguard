import { z } from "zod";

// V2-F8 "On site today". Pure helpers for the Records card; the card only renders them.
const record = z.object({
  day: z.string(), personKind: z.enum(["crew", "builder"]), personRef: z.string(), crewId: z.string().nullable(),
  revision: z.number().int().min(1), onSite: z.boolean(), note: z.string().nullable(),
  tappedByMembershipId: z.string(), recordedAt: z.string(),
});
export const siteAttendanceScreenV1 = z.object({
  version: z.literal("v2-site-attendance.v1"), today: z.string(), days: z.array(z.string()).length(7),
  me: z.string(), records: z.array(record),
  crew: z.array(z.object({ crewId: z.string(), displayName: z.string(), trade: z.string() })),
});
export type SiteAttendanceScreen = z.infer<typeof siteAttendanceScreenV1>;
export type AttendanceRecord = z.infer<typeof record>;
export type AttendancePerson = { key: string; label: string; detail: string; person: { kind: "crew"; crewId: string } | { kind: "builder" } };
export type AttendanceCommand = {
  version: "v2-site-attendance-command.v1"; commandId: string; day: string;
  person: AttendancePerson["person"]; expectedVersion: number; onSite: boolean; note: string | null;
};

/** Card copy (Astra plan check, 26 Nov). The record also holds who tapped, when, and an optional note. */
export const ATTENDANCE_COPY = "Mark who was on site today. Attendance does not use GPS or device location.";

const personKey = (kind: "crew" | "builder", ref: string) => `${kind}:${ref}`;

/** "Me" first, then the firm's crew records in their saved order. */
export function attendancePeople(screen: SiteAttendanceScreen): AttendancePerson[] {
  return [
    { key: personKey("builder", screen.me), label: "Me", detail: "Builder", person: { kind: "builder" } },
    ...screen.crew.map(crew => ({ key: personKey("crew", crew.crewId), label: crew.displayName, detail: crew.trade,
      person: { kind: "crew" as const, crewId: crew.crewId } })),
  ];
}

/** The current tap for one person on one day, if any. */
export function currentTap(screen: SiteAttendanceScreen, day: string, person: AttendancePerson): AttendanceRecord | undefined {
  return screen.records.find(entry => entry.day === day && personKey(entry.personKind, entry.personRef) === person.key);
}

/** The next command for a tap: on site, or "not on site after all", over the current revision. Without a new note, the saved note is kept. */
export function tapCommand(screen: SiteAttendanceScreen, day: string, person: AttendancePerson, onSite: boolean,
  commandId: string, note?: string | null): AttendanceCommand {
  const current = currentTap(screen, day, person);
  return { version: "v2-site-attendance-command.v1", commandId, day, person: person.person,
    expectedVersion: current?.revision ?? 0, onSite,
    note: note === undefined ? current?.note ?? null : note?.trim() || null };
}

/** The seven-day list, newest first: who was on site each day, by name. People no longer on the crew list are "Removed crew record". */
export function weekSummary(screen: SiteAttendanceScreen): { day: string; label: string; names: string[] }[] {
  const people = new Map(attendancePeople(screen).map(person => [person.key, person.label]));
  return screen.days.map(day => ({
    day, label: dayLabel(day, screen.today),
    names: screen.records.filter(entry => entry.day === day && entry.onSite)
      .map(entry => people.get(personKey(entry.personKind, entry.personRef)) ?? "Removed crew record")
      .sort((a, b) => (a === "Me" ? -1 : b === "Me" ? 1 : a.localeCompare(b))),
  }));
}

/** "Today", "Yesterday", or a short UK date such as "Mon 23 Nov". Days are plain dates, so no time zone shifts them. */
export function dayLabel(day: string, today: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  const diff = Math.round((Date.parse(today + "T00:00:00Z") - date.getTime()) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return date.toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
}

/** Plain-words refusal for the card. */
export function attendanceRefusal(status: number, code: string | undefined): string {
  if (code === "SITE_ATTENDANCE_VERSION_CONFLICT" || code === "SITE_ATTENDANCE_COMMAND_CONFLICT") {
    return "Someone else changed this day first. The list has been reloaded, so check it and tap again.";
  }
  if (code === "CREW_CONTACT_UNAVAILABLE") return "That crew record isn't in your firm's list any more. The list has been reloaded.";
  if (code === "SITE_ATTENDANCE_DAY_OUT_OF_RANGE") return "You can only record today and the six days before it.";
  if (status === 401) return "Your session has ended. Sign in again to record who was on site.";
  if (status === 403 || status === 404) return "This job isn't available to you.";
  return "That tap may not have saved. Use \"Retry the same tap\" so it only counts once.";
}
