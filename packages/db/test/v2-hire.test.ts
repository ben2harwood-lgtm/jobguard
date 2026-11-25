import { describe, expect, it } from "vitest";
import { approximateHireCost, hireCommandV1, hireNeededAfter, londonHireDate, type HireState } from "../src/v2-hire.js";
const id = "44444444-4444-4444-8444-444444444444";
const details = { kind: "scaffold" as const, supplier: "Fictional hire", bookedFrom: "2026-11-01",
  weeklyCost: "100.01", neededUntil: null };
const task = { quoteRevisionId: id, scopeItemId: id, templateTaskKey: "tiling" };
const item: HireState = { ...details, tasks: [task], status: "on_hire", offHireDate: null };
describe("V2-K8 exact dates and money", () => {
  it("fires only after all linked dates, never for missing or undated tasks", () => {
    expect(hireNeededAfter(item, ["2026-11-04"], "2026-11-05")).toBe("2026-11-04");
    for (const dates of [[], [null], ["2026-11-05"], ["2026-11-06"]]) {
      expect(hireNeededAfter(item, dates, "2026-11-05")).toBeNull();
    }
    const two = { ...item, tasks: [task, { ...task, templateTaskKey: "paint" }] };
    expect(hireNeededAfter(two, ["2026-11-03", "2026-11-04"], "2026-11-05")).toBe("2026-11-04");
    expect(hireNeededAfter(two, ["2026-11-03", null], "2026-11-05")).toBeNull();
  });
  it("allows an explicit needed-until date and clears reminders for either off-hire state", () => {
    expect(hireNeededAfter({ ...item, neededUntil: "2026-11-02" }, [null], "2026-11-05")).toBe("2026-11-02");
    for (const status of ["off_hire_requested", "off_hire"] as const) {
      expect(hireNeededAfter({ ...item, status, neededUntil: "2026-11-02" }, ["2026-11-03"], "2026-11-05")).toBeNull();
    }
    expect(hireNeededAfter({ ...item, tasks: [] }, [], "2026-11-05")).toBeNull();
  });
  it("prorates in exact integer pence, clamps future bookings, freezes when off hire", () => {
    expect(approximateHireCost(item, "2026-11-08")).toBe("100.01");
    expect(approximateHireCost(item, "2026-11-02")).toBe("14.29");
    expect(approximateHireCost(item, "2026-10-31")).toBe("0.00");
    expect(approximateHireCost({ ...item, offHireDate: "2026-11-08" }, "2027-01-01")).toBe("100.01");
    expect(approximateHireCost({ ...item, weeklyCost: "999999999.99" }, "2026-11-08")).toBe("999999999.99");
  });
  it("uses London days across daylight saving time", () => {
    expect(londonHireDate(new Date("2026-07-01T23:30:00Z"))).toBe("2026-07-02");
    expect(londonHireDate(new Date("2026-11-01T23:30:00Z"))).toBe("2026-11-01");
  });
});
describe("V2-K8 strict command boundary", () => {
  const command = { version: "hire-command.v1", commandId: id, hireId: id, expectedVersion: 0, action: "add", details };
  it("accepts exact decimal strings and rejects floating money, overflow, role and tenant forgery", () => {
    expect(hireCommandV1.safeParse(command).success).toBe(true);
    for (const weeklyCost of [100.01, "1.001", "1e2", "-1.00", "1000000000.00"]) {
      expect(hireCommandV1.safeParse({ ...command, details: { ...details, weeklyCost } }).success).toBe(false);
    }
    for (const field of ["tenantId", "actorMembershipId", "status", "recordedAt"]) {
      expect(hireCommandV1.safeParse({ ...command, [field]: id }).success).toBe(false);
    }
  });
  it("refuses mismatched action fields, negative revision, invalid dates and duplicate links", () => {
    for (const change of [{ action: "link" }, { expectedVersion: 1 }, { expectedVersion: -1 },
      { details: { ...details, bookedFrom: "2026-02-30" } }, { details: { ...details, neededUntil: "2026-10-01" } },
      { action: "link", details: undefined, tasks: [task, task] }]) {
      expect(hireCommandV1.safeParse({ ...command, ...change }).success).toBe(false);
    }
  });
});
