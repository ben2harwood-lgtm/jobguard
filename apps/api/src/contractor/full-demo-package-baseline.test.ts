// Practice sandbox — synthetic data; nothing is sent or charged
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { baselineHistoryV1, deriveBaseline, dashboardCanonical, moneyFromBigInt } from "@jobguard/core";
import { prepareFullDemoBaseline } from "./full-demo-package.application.js";
const fixture = JSON.parse(readFileSync(new URL("../../../../docs/fixtures/contractor-full-demo-package.v1.json", import.meta.url), "utf8"));
const input = (format = "json") => ({ version: "full-demo-baseline-example.v1", preparation: { version: "baseline-prepare.v1", format, content: format === "json" ? JSON.stringify(fixture.history) : fixture.csv, outputFormat: "json", methodVersion: fixture.methodVersion, cohorts: fixture.cohorts } });
beforeEach(() => vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"));
afterEach(() => vi.unstubAllEnvs());
it("A05 six-month JSON and CSV give identical reference results", () => {
  const json = prepareFullDemoBaseline(input()), csv = prepareFullDemoBaseline(input("csv"));
  expect(json.report).toEqual(csv.report);
  expect(json.export.content).toEqual(csv.export.content);
  expect(json.report).toEqual(deriveBaseline(fixture.history, fixture.cohorts));
  expect(new Set(fixture.history.jobs.map((j: { month: string }) => j.month))).toEqual(new Set(["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"]));
});
it("A06 hashes method and complete source drill-downs", () => {
  const result = prepareFullDemoBaseline(input()), report = result.report;
  const hash = (s: string) => createHash("sha256").update(s).digest("hex");
  expect(report.method.hash).toBe(hash(report.method.text));
  const history = baselineHistoryV1.parse(fixture.history);
  history.jobs.sort((a, b) => a.sourceJobId < b.sourceJobId ? -1 : 1);
  expect(report.sourceHash).toBe(hash(dashboardCanonical(history)));
  for (const cohort of [report.pilot, report.rest]) {
    expect(cohort.totals.knownNet).toEqual(moneyFromBigInt(cohort.jobs.reduce((sum: bigint, j: { knownNet: { pence: number } }) => sum + BigInt(j.knownNet.pence), 0n)));
    expect(cohort.jobs.flatMap((j: { extras: unknown[] }) => j.extras)).toHaveLength(cohort.totals.extras);
  }
  expect([...report.pilot.jobs, ...report.rest.jobs].map(j => j.sourceJobId).sort()).toEqual(history.jobs.map(j => j.sourceJobId));
  const csv = prepareFullDemoBaseline({ ...input(), preparation: { ...input().preparation, outputFormat: "csv" } });
  expect(csv.export.content).toContain(report.method.text);
  for (const j of history.jobs) expect(csv.export.content).toContain(j.sourceJobId);
  expect(result.export.label).toBe(fixture.label);
});
it("A07 unknown is not zero and baseline is not persisted", () => {
  const result = prepareFullDemoBaseline(input());
  expect(result).toMatchObject({ label: fixture.label, classification: "reference_example", persistence: "none", historicalAuthority: "not_granted" });
  expect(result.report.pilot.valuePerJob.status).toBe("incomplete");
  expect(result.report.pilot.totals.unknownValues).toBe(1);
  expect(result.report.pilot.jobs.flatMap(j => j.extras).some(e => e.reportedNet === null)).toBe(true);
  expect(prepareFullDemoBaseline(input())).toEqual(result);
});
it("A08 refuses real-history and unsupported-method inputs", () => {
  vi.stubEnv("JOBGUARD_ENV", "production");
  expect(() => prepareFullDemoBaseline(input())).toThrowError("BASELINE_REAL_HISTORY_HELD");
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  expect(() => prepareFullDemoBaseline({ ...input(), preparation: { ...input().preparation, methodVersion: "approved-v1" } })).toThrowError("BASELINE_METHOD_UNSUPPORTED");
  expect(() => prepareFullDemoBaseline({ ...input(), preparation: { ...input().preparation, content: JSON.stringify({ ...fixture.history, environment: "production" }) } })).toThrowError("BASELINE_INVALID");
  expect(() => prepareFullDemoBaseline({ ...input(), tenantId: "override" })).toThrowError("BASELINE_INVALID");
});
