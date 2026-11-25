import { describe, expect, it } from "vitest";
import { fridayCommandV1, fridayContentFromPlan, fridayContentV1, fridayMessage, fridayWeekDates } from "../src/v2-friday-update.js";
import { FridayUpdateRepository } from "../src/v2-friday-update-repository.js";
import type { Pool } from "pg";

const week = "2026-11-23";
const base = { schema: "friday-command.v1", week, commandId: "11111111-1111-4111-8111-111111111111",
  expectedVersion: 0, clientCreatedAt: "2026-11-25T00:00:00Z" };
describe("V2-K3 safe customer content", () => {
  it("uses scheduled dates, including Monday boundaries, without claiming completion", () => {
    const content = fridayContentFromPlan(week, [
      { title: "Before", scheduledDate: "2026-11-22" }, { title: "Tiling", scheduledDate: week },
      { title: "Grout", scheduledDate: "2026-11-29" }, { title: "Paint", scheduledDate: "2026-11-30" },
      { title: "Later", scheduledDate: "2026-12-07" }, { title: "Not scheduled" },
    ]);
    expect(content).toEqual({ schema: "friday-content.v1", thisWeek: ["Tiling", "Grout"], nextWeek: ["Paint"], photos: [] });
    expect(fridayWeekDates(week)).toEqual([week, "2026-11-30", "2026-12-07"]);
    expect(() => fridayWeekDates("2026-11-27")).toThrow("FRIDAY_WEEK_MUST_START_MONDAY");
  });
  it("ignores private notes, photos, findings and all other fields in plan input", () => {
    const safe = [{ title: "Tile the splashback", scheduledDate: week }];
    const privatePair = safe.map(task => ({ ...task, diary: "private diary marker", finding: "hidden marker", photos: ["other-job-photo"], amount: "999.99" }));
    expect(fridayContentFromPlan(week, privatePair)).toEqual(fridayContentFromPlan(week, safe));
    expect(fridayMessage({ week, content: fridayContentFromPlan(week, privatePair) })).not.toMatch(/private|hidden|other-job|999/);
  });
  it("has identical empty wording regardless of excluded private data", () => {
    expect(fridayMessage({ week, content: fridayContentFromPlan(week, []) })).toContain("No photos this week.");
    expect(fridayContentFromPlan(week, [{ title: "£500", scheduledDate: week }])).toEqual(fridayContentFromPlan(week, []));
  });
  it.each(["£10", "GBP 10", "10.00", "100 pence", "20 pounds", "$10", "€2"])("refuses amounts in edited text: %s", value => {
    expect(fridayContentV1.safeParse({ schema: "friday-content.v1", thisWeek: [value], nextWeek: [], photos: [] }).success).toBe(false);
  });
  it("refuses smuggled fields and photo references before saving or sending", () => {
    const content = fridayContentFromPlan(week, []);
    for (const extra of [{ prices: [] }, { privateNotes: [] }, { photos: ["withdrawn-photo"] }, { decisions: [] }])
      expect(fridayContentV1.safeParse({ ...content, ...extra }).success).toBe(false);
    expect(fridayCommandV1.safeParse({ ...base, action: "prepare", actor: "forged" }).success).toBe(false);
    expect(fridayCommandV1.safeParse({ ...base, action: "send" }).success).toBe(false);
  });
  it("refuses non-V2 before database access", async () => {
    const previous = process.env.JOBGUARD_LOCAL_V2;
    process.env.JOBGUARD_LOCAL_V2 = "0";
    try { await expect(new FridayUpdateRepository({} as Pool).read({} as never, base.commandId, week)).rejects.toMatchObject({ code: "SYNTHETIC_MODE_REQUIRED" }); }
    finally { if (previous === undefined) delete process.env.JOBGUARD_LOCAL_V2; else process.env.JOBGUARD_LOCAL_V2 = previous; }
  });
});
