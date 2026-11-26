import { describe, expect, it } from "vitest";
import { ATTENDANCE_COPY, attendancePeople, attendanceRefusal, currentTap, dayLabel, siteAttendanceScreenV1, tapCommand, weekSummary,
  type SiteAttendanceScreen } from "./v2-site-attendance-model";

const me = "11111111-1111-4111-8111-111111111111";
const sam = "22222222-2222-4222-8222-222222222222", alex = "33333333-3333-4333-8333-333333333333";
const days = ["2026-11-25", "2026-11-24", "2026-11-23", "2026-11-22", "2026-11-21", "2026-11-20", "2026-11-19"];
const tap = (day: string, personKind: "crew" | "builder", personRef: string, revision: number, onSite: boolean, note: string | null = null) => ({
  day, personKind, personRef, crewId: personKind === "crew" ? personRef : null, revision, onSite, note,
  tappedByMembershipId: me, recordedAt: "2026-11-25T08:00:00.000Z" });
const screen = (records: SiteAttendanceScreen["records"] = []): SiteAttendanceScreen => siteAttendanceScreenV1.parse({
  version: "v2-site-attendance.v1", today: days[0], days, me, records,
  crew: [{ crewId: sam, displayName: "Sam Fictional", trade: "tiler" }, { crewId: alex, displayName: "Alex Fictional", trade: "decorator" }],
});

describe("V2-F8 on-site card helpers", () => {
  it("lists Me first, then each crew record, with one tap each", () => {
    const people = attendancePeople(screen());
    expect(people.map(person => person.label)).toEqual(["Me", "Sam Fictional", "Alex Fictional"]);
    expect(people[0]!.person).toEqual({ kind: "builder" });
    expect(people[1]!.person).toEqual({ kind: "crew", crewId: sam });
    expect(new Set(people.map(person => person.key)).size).toBe(3);
  });

  it("builds a first tap at version 0 and an edit over the current revision, keeping the saved note", () => {
    const empty = screen();
    const [mine, samPerson] = attendancePeople(empty);
    expect(tapCommand(empty, days[0]!, samPerson!, true, "c1")).toEqual({ version: "v2-site-attendance-command.v1",
      commandId: "c1", day: days[0], person: { kind: "crew", crewId: sam }, expectedVersion: 0, onSite: true, note: null });
    const tapped = screen([tap(days[0]!, "crew", sam, 2, true, "Left at noon"), tap(days[0]!, "builder", me, 1, true)]);
    expect(currentTap(tapped, days[0]!, samPerson!)?.revision).toBe(2);
    expect(tapCommand(tapped, days[0]!, samPerson!, false, "c2")).toMatchObject({ expectedVersion: 2, onSite: false, note: "Left at noon" });
    expect(tapCommand(tapped, days[0]!, samPerson!, true, "c3", "  ")).toMatchObject({ note: null });
    expect(tapCommand(tapped, days[0]!, mine!, false, "c4")).toMatchObject({ person: { kind: "builder" }, expectedVersion: 1 });
  });

  it("carries no location, device or address field in a command", () => {
    const empty = screen();
    const command = tapCommand(empty, days[0]!, attendancePeople(empty)[1]!, true, "c1");
    expect(Object.keys(command).sort()).toEqual(["commandId", "day", "expectedVersion", "note", "onSite", "person", "version"]);
    expect(JSON.stringify(command)).not.toMatch(/lat|lon|geo|location|device|ip|agent/iu);
  });

  it("summarises seven days, newest first, counting only people still on site", () => {
    const week = weekSummary(screen([
      tap(days[0]!, "crew", sam, 1, true), tap(days[0]!, "builder", me, 1, true),
      tap(days[1]!, "crew", alex, 2, false), tap(days[2]!, "crew", "44444444-4444-4444-8444-444444444444", 1, true),
    ]));
    expect(week.map(day => day.day)).toEqual(days);
    expect(week[0]).toEqual({ day: days[0], label: "Today", names: ["Me", "Sam Fictional"] });
    expect(week[1]).toEqual({ day: days[1], label: "Yesterday", names: [] });
    expect(week[2]!.names).toEqual(["Removed crew record"]);
    expect(week[2]!.label).toBe("Mon 23 Nov");
  });

  it("says plainly that no GPS or device location is used, without claiming only the day is kept", () => {
    expect(ATTENDANCE_COPY).toBe("Mark who was on site today. Attendance does not use GPS or device location.");
    expect(ATTENDANCE_COPY).not.toMatch(/only the day/iu);
  });

  it("labels plain days without a time-zone shift", () => {
    expect(dayLabel("2026-03-29", "2026-03-30")).toBe("Yesterday");
    expect(dayLabel("2026-10-25", "2026-10-27")).toBe("Sun 25 Oct");
  });

  it("refuses a screen that is not the V2 attendance read", () => {
    expect(siteAttendanceScreenV1.safeParse({ ...screen(), version: "other" }).success).toBe(false);
    expect(siteAttendanceScreenV1.safeParse({ ...screen(), days: days.slice(1) }).success).toBe(false);
  });

  it("explains refusals in plain words", () => {
    expect(attendanceRefusal(409, "SITE_ATTENDANCE_VERSION_CONFLICT")).toMatch(/reloaded/u);
    expect(attendanceRefusal(422, "CREW_CONTACT_UNAVAILABLE")).toMatch(/crew record/u);
    expect(attendanceRefusal(401, "UNAUTHENTICATED")).toMatch(/Sign in/u);
    expect(attendanceRefusal(404, "NOT_FOUND")).toMatch(/isn't available/u);
    expect(attendanceRefusal(0, undefined)).toMatch(/Retry the same tap/u);
  });
});
