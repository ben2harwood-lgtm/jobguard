import { describe, expect, it } from "vitest";
import { watchdogActive, watchdogUnavailableCopy } from "./watchdog.js";
describe("watchdog lifecycle", () => {
  it.each(["draft", "quoting", "accepted", "live", "invoiced", "paid", "lost"])("uses only status %s", status => {
    for (const provenance of ["quoted", "imported", "work_order"]) {
      const job = { status, provenance };
      expect(watchdogActive(job)).toBe(status === "live");
    }
    expect(watchdogUnavailableCopy({ status })).toBe(status === "live" ? null : ["invoiced", "paid", "lost"].includes(status) ? "This job is no longer live." : "Switch this job live to use the watchdog — it's free until work starts on site.");
  });
});
