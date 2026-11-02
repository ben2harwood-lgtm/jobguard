import { describe, expect, it } from "vitest";
import { dueAtLocalTime, evaluateReadiness, type ReadinessInput } from "./readiness.js";

describe("readiness local scheduling", () => {
  it("keeps unknown predecessor completion distinct from known incomplete work", () => {
    const input = { version: "readiness-input.v1" as const, taskId: "paint", taskRevision: 1, ruleRevision: "test.v1", material: { requiredUnits: 0, landedUnits: 0 }, access: true as const, crew: true as const, weather: null, evaluatedAt: "2026-08-31T09:00:00Z" };
    expect(evaluateReadiness({ ...input, predecessors: [{ taskId: "prep", complete: "unknown" }] }).reasons).toEqual(["Predecessor completion unknown"]);
    expect(evaluateReadiness({ ...input, predecessors: [{ taskId: "prep", complete: false }] }).reasons).toEqual(["A predecessor is not complete"]);
  });
  it.each([undefined, null, 0, 1, "true", "false", {}, []])("treats malformed predecessor completion %j as unknown", (complete) => {
    const input = { version: "readiness-input.v1", taskId: "paint", taskRevision: 1, ruleRevision: "test.v1", predecessors: [{ taskId: "prep", complete }], material: { requiredUnits: 0, landedUnits: 0 }, access: true, crew: true, weather: null, evaluatedAt: "2026-08-31T09:00:00Z" } as unknown as ReadinessInput;
    const result = evaluateReadiness(input);
    expect(result.ready).toBe(false);
    expect(result.reasons).toEqual(["Predecessor completion unknown"]);
  });
  it("is ready only when every predecessor is explicitly complete", () => {
    const input: ReadinessInput = { version: "readiness-input.v1", taskId: "paint", taskRevision: 1, ruleRevision: "test.v1", predecessors: [{ taskId: "prep", complete: true }], material: { requiredUnits: 0, landedUnits: 0 }, access: true, crew: true, weather: null, evaluatedAt: "2026-08-31T09:00:00Z" };
    expect(evaluateReadiness(input).ready).toBe(true);
    expect(evaluateReadiness({ ...input, predecessors: [...input.predecessors, { taskId: "dry", complete: "unknown" }] }).ready).toBe(false);
  });
  it("uses the offset at the actual time on both UK transition days", () => {
    expect(dueAtLocalTime("2026-03-29", "00:30", "Europe/London")).toBe("2026-03-29T00:30:00.000Z");
    expect(dueAtLocalTime("2026-03-29", "09:00", "Europe/London")).toBe("2026-03-29T08:00:00.000Z");
    expect(dueAtLocalTime("2026-10-25", "00:30", "Europe/London")).toBe("2026-10-24T23:30:00.000Z");
    expect(dueAtLocalTime("2026-10-25", "09:00", "Europe/London")).toBe("2026-10-25T09:00:00.000Z");
  });
  it("fails closed for skipped wall time and chooses the first repeated wall time", () => {
    expect(() => dueAtLocalTime("2026-03-29", "01:30", "Europe/London")).toThrow("NONEXISTENT_LOCAL_TIME");
    expect(dueAtLocalTime("2026-10-25", "01:30", "Europe/London")).toBe("2026-10-25T00:30:00.000Z");
  });
  it("respects the configured timezone rather than the server timezone", () => {
    expect(dueAtLocalTime("2026-08-31", "09:00", "UTC")).toBe("2026-08-31T09:00:00.000Z");
    expect(dueAtLocalTime("2026-08-31", "09:00", "Europe/London")).toBe("2026-08-31T08:00:00.000Z");
  });
  it.each([["2026-02-30", "09:00", "UTC"], ["2026-03-29", "24:00", "UTC"], ["2026-03-29", "09:00", "invalid"]])("rejects invalid dates, times and zones", (day, time, zone) => {
    expect(() => dueAtLocalTime(day!, time!, zone!)).toThrow();
  });
});
