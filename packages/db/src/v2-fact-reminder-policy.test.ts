import { describe, expect, it } from "vitest";
import { daysBefore, londonEight, reminderPlan, type ReminderInput } from "./v2-fact-reminder-policy.js";

const at = (iso: string) => Date.parse(iso);
// A delivery needed Thursday 3 Dec 2026, asked for on Monday 30 Nov at 10:00 London (GMT).
const thursday: ReminderInput = { neededBy: "2026-12-03", requestedAt: at("2026-11-30T10:00:00Z"),
  expiresAt: at("2026-12-14T10:00:00Z"), replied: false, cancelled: false, current: true, factOpen: true,
  has: { reminder: false, unconfirmed: false } };
const tuesdayEight = at("2026-12-01T08:00:00Z");
const wednesdayEight = at("2026-12-02T08:00:00Z");

describe("V2-E7 reminder timing", () => {
  it("finds 08:00 London in winter and in British Summer Time", () => {
    expect(londonEight("2026-12-01")).toBe(tuesdayEight);
    expect(londonEight("2026-03-29")).toBe(at("2026-03-29T07:00:00Z"));
    expect(londonEight("2026-03-28")).toBe(at("2026-03-28T08:00:00Z"));
    expect(londonEight("2026-10-25")).toBe(at("2026-10-25T08:00:00Z"));
    expect(londonEight("2026-10-24")).toBe(at("2026-10-24T07:00:00Z"));
    expect(daysBefore("2026-03-01", 2)).toBe("2026-02-27");
    expect(() => londonEight("2026-02-30")).toThrow("REMINDER_DATE_INVALID");
  });

  it("reminds once from Tuesday 08:00 and flags from Wednesday 08:00 for a Thursday delivery", () => {
    // Not before 08:00 London two days before, and not before a day after the request (Tue 10:00).
    expect(reminderPlan(thursday, at("2026-12-01T07:59:59Z"))).toEqual({ remind: false, unconfirmed: null });
    expect(reminderPlan(thursday, tuesdayEight)).toEqual({ remind: false, unconfirmed: null });
    expect(reminderPlan(thursday, at("2026-12-01T10:00:00Z"))).toEqual({ remind: { dueAt: at("2026-12-01T10:00:00Z") }, unconfirmed: null });
    expect(reminderPlan(thursday, at("2026-12-01T12:00:00Z")).remind).toEqual({ dueAt: at("2026-12-01T10:00:00Z") });
    const sunday = { ...thursday, requestedAt: at("2026-11-29T10:00:00Z") };
    expect(reminderPlan(sunday, tuesdayEight).remind).toEqual({ dueAt: tuesdayEight });
    expect(reminderPlan({ ...thursday, has: { reminder: true, unconfirmed: false } }, at("2026-12-01T13:00:00Z")))
      .toEqual({ remind: false, unconfirmed: null });
    expect(reminderPlan({ ...thursday, has: { reminder: true, unconfirmed: false } }, wednesdayEight))
      .toEqual({ remind: false, unconfirmed: { reason: "no_reply", dueAt: wednesdayEight } });
    expect(reminderPlan({ ...thursday, has: { reminder: true, unconfirmed: true } }, at("2026-12-03T09:00:00Z")))
      .toEqual({ remind: false, unconfirmed: null });
  });

  it("sends no reminder once the window has passed: the flag takes over", () => {
    expect(reminderPlan(thursday, wednesdayEight)).toEqual({ remind: false,
      unconfirmed: { reason: "no_reply", dueAt: wednesdayEight } });
  });

  it("waits a day after the request, and a request made on Wednesday morning only gets the flag", () => {
    const monday = { ...thursday, requestedAt: at("2026-11-30T20:00:00Z") };
    expect(reminderPlan(monday, at("2026-12-01T12:00:00Z")).remind).toBe(false);
    expect(reminderPlan(monday, at("2026-12-01T20:00:00Z")).remind).toEqual({ dueAt: at("2026-12-01T20:00:00Z") });
    const wednesday = { ...thursday, requestedAt: at("2026-12-02T07:30:00Z") };
    for (const now of [at("2026-12-02T07:45:00Z"), wednesdayEight, at("2026-12-02T12:00:00Z")]) {
      expect(reminderPlan(wednesday, now).remind).toBe(false);
    }
    expect(reminderPlan(wednesday, wednesdayEight).unconfirmed).toEqual({ reason: "no_reply", dueAt: wednesdayEight });
  });

  it("uses London time in British Summer Time: needed by 31 Mar 2026, reminder due 29 Mar 07:00 UTC", () => {
    const spring = { ...thursday, neededBy: "2026-03-31", requestedAt: at("2026-03-26T10:00:00Z"),
      expiresAt: at("2026-04-09T10:00:00Z") };
    expect(reminderPlan(spring, at("2026-03-29T06:59:00Z")).remind).toBe(false);
    expect(reminderPlan(spring, at("2026-03-29T07:00:00Z")).remind).toEqual({ dueAt: at("2026-03-29T07:00:00Z") });
    expect(reminderPlan(spring, at("2026-03-30T06:59:00Z")).unconfirmed).toBeNull();
    expect(reminderPlan(spring, at("2026-03-30T07:00:00Z")).unconfirmed).toEqual({ reason: "no_reply",
      dueAt: at("2026-03-30T07:00:00Z") });
  });

  it("stops on a reply, a cancel, a request that is not current, or a fact that is no longer open", () => {
    for (const stop of [{ replied: true }, { cancelled: true }, { current: false }, { factOpen: false }]) {
      for (const now of [at("2026-12-01T12:00:00Z"), wednesdayEight, at("2026-12-05T12:00:00Z")]) {
        expect(reminderPlan({ ...thursday, ...stop }, now)).toEqual({ remind: false, unconfirmed: null });
      }
    }
  });

  it("an expired link gets no reminder, and its flag says the link expired", () => {
    const short = { ...thursday, expiresAt: at("2026-12-01T11:00:00Z") };
    expect(reminderPlan(short, at("2026-12-01T10:30:00Z")).remind).toEqual({ dueAt: at("2026-12-01T10:00:00Z") });
    expect(reminderPlan(short, at("2026-12-01T11:00:00Z"))).toEqual({ remind: false, unconfirmed: null });
    expect(reminderPlan(short, wednesdayEight)).toEqual({ remind: false,
      unconfirmed: { reason: "link_expired", dueAt: wednesdayEight } });
  });
});
