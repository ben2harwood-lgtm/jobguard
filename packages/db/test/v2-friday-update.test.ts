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
  it("writes the customer's week in plain UK words independent of timezone", () => {
    const message = fridayMessage({ week: "2027-01-11", content: fridayContentFromPlan("2027-01-11", []) });
    expect(message).toContain("Your Friday update · week of Monday 11 January 2027");
    expect(message).not.toContain("2027-01-11");
  });
  it("keeps empty wording when no titles were dropped", () => {
    expect(fridayMessage({ week, content: fridayContentFromPlan(week, []) })).toContain("No photos this week.");
    expect(fridayMessage({ week, content: fridayContentFromPlan(week, []) })).toContain("No work scheduled this week.");
  });
  it.each(["Fit 2.40 m worktop", "Lay 12.50m² tiles", "Start 09.30am", "Start 09.30 pm", "Deliver 10:15"])("keeps measurements and times in plans and edits: %s", title => {
    expect(fridayContentFromPlan(week, [{ title, scheduledDate: week }]).thisWeek).toEqual([title]);
    expect(fridayContentV1.safeParse({ schema: "friday-content.v1", thisWeek: [title], nextWeek: [title], photos: [] }).success).toBe(true);
  });
  it.each(["mm", "cm", "m", "m2", "m²", "m3", "kg", "g", "l", "ltr", "litre", "litres", "metre", "metres", "sqm", "sq m", "lm"])("keeps the allowed measurement unit %s", unit => {
    for (const gap of ["", " "]) {
      const title = `Fit 2.40${gap}${unit} worktop`;
      expect(fridayContentFromPlan(week, [{ title, scheduledDate: week }]).thisWeek).toEqual([title]);
    }
  });
  it.each(["Worktop £120", "Extra 120.00", "2.40", "50p sundries", "GBP 30", "2.40 metres at 120.00", "2.40 materials", "2.40miles", "Start 19.30am", "Start 09.60pm", "Extra 120,00", "USD 30", "EUR 30"])("drops money or ambiguous decimals from plans and refuses edits: %s", title => {
    const content = fridayContentFromPlan(week, [{ title, scheduledDate: week }, { title, scheduledDate: "2026-11-30" }]);
    expect(content.thisWeek).not.toContain(title);
    expect(content.nextWeek).not.toContain(title);
    for (const section of ["thisWeek", "nextWeek"])
      expect(fridayContentV1.safeParse({ schema: "friday-content.v1", thisWeek: [], nextWeek: [], photos: [], [section]: [title] }).success).toBe(false);
  });
  it("warns for each affected week instead of claiming there is no scheduled work", () => {
    const content = fridayContentFromPlan(week, [
      { title: "£500", scheduledDate: week }, { title: "50p sundries", scheduledDate: "2026-11-30" },
    ]);
    expect(content.thisWeek).toEqual(["Some work this week has been left out of this update. Please check before sending."]);
    expect(content.nextWeek).toEqual(["Some work next week has been left out of this update. Please check before sending."]);
    expect(fridayContentV1.safeParse(content).success).toBe(true);
    const message = fridayMessage({ week, content });
    expect(message).not.toContain("No work scheduled this week.");
    expect(message).not.toContain("Nothing planned for next week yet.");
  });
  it("keeps safe titles alongside one warning and ignores dropped titles outside the week", () => {
    const content = fridayContentFromPlan(week, [
      { title: "Fit 2.40 m worktop", scheduledDate: week }, { title: "£500", scheduledDate: week },
      { title: "GBP 30", scheduledDate: week }, { title: "£500", scheduledDate: "2026-12-07" },
    ]);
    expect(content.thisWeek).toEqual(["Fit 2.40 m worktop", "Some work this week has been left out of this update. Please check before sending."]);
    expect(content.nextWeek).toEqual([]);
  });
  it("reserves room for the warning at the thirty-line limit", () => {
    const tasks = Array.from({ length: 30 }, (_, i) => ({ title: `Task ${i}`, scheduledDate: week }));
    const content = fridayContentFromPlan(week, [...tasks, { title: "£500", scheduledDate: week }]);
    expect(content.thisWeek).toHaveLength(30);
    expect(content.thisWeek.slice(0, 29)).toEqual(tasks.slice(0, 29).map(task => task.title));
    expect(content.thisWeek[29]).toBe("Some work this week has been left out of this update. Please check before sending.");
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
