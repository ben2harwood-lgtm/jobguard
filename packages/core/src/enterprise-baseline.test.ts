import { describe, expect, it } from "vitest";
import {
  baselineHistoryV1, parseBaselineHistory, importBaselineBatch, deriveBaseline,
  exportBaseline, BASELINE_METHOD_V1, BaselineError,
} from "./enterprise-baseline.js";

// All identities and amounts are fictional. There are no contacts or recipients.
function history() {
  return {
    version: "baseline-history.v1", environment: "synthetic_demo", sourceNamespace: "fictional.invalid",
    sourceBatchId: "batch-1", sourceRevision: "revision-1",
    startMonth: "2026-01", endMonthExclusive: "2026-07", teamIds: ["pilot", "rest", "empty"],
    jobs: [
      { sourceJobId: "job-1", teamId: "pilot", month: "2026-01", extras: [
        { sourceExtraId: "extra-1", sourceWorkId: "work-1", reportedNet: { pence: 100, currency: "GBP" } },
        { sourceExtraId: "extra-2", sourceWorkId: "work-2", reportedNet: null },
      ] },
      { sourceJobId: "job-2", teamId: "pilot", month: "2026-06", extras: [] },
      { sourceJobId: "job-3", teamId: "rest", month: "2026-02", extras: [
        { sourceExtraId: "extra-3", sourceWorkId: "work-3", reportedNet: { pence: 5, currency: "GBP" } },
      ] },
    ],
  };
}
const cohorts = () => ({ version: "baseline-cohorts.v1", pilotTeamIds: ["pilot"], restTeamIds: ["rest"] });
const json = (value: unknown) => JSON.stringify(value);
const parse = (value: unknown) => parseBaselineHistory("json", json(value));
const csvHeader = "version,environment,sourceNamespace,sourceBatchId,sourceRevision,startMonth,endMonthExclusive,rowType,teamId,sourceJobId,month,sourceExtraId,sourceWorkId,reportedNetPence,currency";
const csvRow = (...fields: string[]) => ["baseline-history.v1", "synthetic_demo", "fictional.invalid", "batch-1", "revision-1", "2026-01", "2026-07", ...fields].join(",");
const csv = () => [csvHeader,
  csvRow("team", "pilot", "", "", "", "", "", ""),
  csvRow("team", "rest", "", "", "", "", "", ""),
  csvRow("team", "empty", "", "", "", "", "", ""),
  csvRow("job", "pilot", "job-1", "2026-01", "", "", "", ""),
  csvRow("job", "pilot", "job-2", "2026-06", "", "", "", ""),
  csvRow("job", "rest", "job-3", "2026-02", "", "", "", ""),
  csvRow("extra", "", "job-1", "", "extra-1", "work-1", "100", "GBP"),
  csvRow("extra", "", "job-1", "", "extra-2", "work-2", "", ""),
  csvRow("extra", "", "job-3", "", "extra-3", "work-3", "5", "GBP"),
].join("\r\n");

describe("ENT-9A synthetic historical baseline", () => {
  it.each(["2026-07", "2026-10", "2027-01"])("E9-16 accepts declared 6–12 calendar months ending %s", endMonthExclusive => {
    expect(parse({ ...history(), endMonthExclusive }).version).toBe("baseline-history.v1");
  });
  it.each(["2026-06", "2027-02", "2026-13", "2026-1"])("E9-16 rejects invalid coverage %s", endMonthExclusive => {
    expect(() => parse({ ...history(), endMonthExclusive })).toThrow(BaselineError);
  });
  it("E9-16 refuses unknown fields, coercion, invalid money and unsupported versions", () => {
    const source = history();
    for (const invalid of [
      { ...source, actorId: "caller" }, { ...source, version: "baseline-history.v2" },
      { ...source, environment: "production_billing" },
      { ...source, jobs: [{ ...source.jobs[0], unexpected: true }] },
      { ...source, jobs: [{ ...source.jobs[0], extras: [{ sourceExtraId: "extra-1", sourceWorkId: "work-1", reportedNet: { pence: 100, currency: "EUR" } }] }] },
      { ...source, jobs: [{ ...source.jobs[0], extras: [{ sourceExtraId: "extra-1", sourceWorkId: "work-1", reportedNet: { pence: 100, currency: "GBP", approved: true } }] }] },
      ...["100", 0.1, -1, Number.MAX_SAFE_INTEGER, 1_000_000_000_001, NaN].map(pence => ({ ...source,
        jobs: [{ ...source.jobs[0], extras: [{ sourceExtraId: "extra-1", sourceWorkId: "work-1", reportedNet: { pence, currency: "GBP" } }] }],
      })),
    ]) expect(() => parse(invalid)).toThrow(BaselineError);
    expect(baselineHistoryV1.safeParse({ ...source, tenantId: "caller" }).success).toBe(false);
    expect(() => parseBaselineHistory("json", "{" )).toThrow(BaselineError);
  });
  it("E9-16 rejects conflicting source identities, unknown teams and dates outside coverage", () => {
    const source = history();
    for (const jobs of [
      [source.jobs[0], source.jobs[0]],
      [{ ...source.jobs[0], teamId: "missing" }],
      [{ ...source.jobs[0], month: "2026-07" }],
      [{ ...source.jobs[0], extras: [source.jobs[0]!.extras[0], source.jobs[0]!.extras[0]] }],
      [{ ...source.jobs[0], extras: [source.jobs[0]!.extras[0], { ...source.jobs[0]!.extras[1], sourceWorkId: "work-1" }] }],
      [source.jobs[0], { ...source.jobs[2], extras: [source.jobs[0]!.extras[0]] }],
    ]) expect(() => parse({ ...source, jobs })).toThrow(BaselineError);
    expect(() => parse({ ...source, teamIds: ["pilot", "pilot"] })).toThrow(BaselineError);
  });
  it("E9-16 CSV and JSON decode to identical strict input including zero-extra jobs and unknown values", () => {
    expect(parseBaselineHistory("csv", csv())).toEqual(parse(history()));
    expect(parseBaselineHistory("csv", csv().replaceAll("batch-1", '"batch-1"') + "\r\n")).toEqual(parse(history()));
    const [header, ...rows] = csv().split("\r\n");
    expect(parseBaselineHistory("csv", [header, ...rows.reverse()].join("\n"))).toEqual(parse(history()));
  });
  it("E9-16 fictional JSON and CSV fixture files yield identical histories", async () => {
    const fileModule = "node:fs";
    const { readFileSync } = await import(fileModule) as { readFileSync(path: URL, encoding: "utf8"): string };
    const fixture = (extension: string) => readFileSync(new URL(`../../../docs/fixtures/enterprise-baseline-synthetic.v1.${extension}`, import.meta.url), "utf8");
    expect(parseBaselineHistory("json", fixture("json"))).toEqual(parseBaselineHistory("csv", fixture("csv")));
  });
  it("E9-16 CSV refuses extra/duplicate headers, malformed rows, mixed batches and permissive numeric conversion", () => {
    for (const source of [
      csv().replace(csvHeader, csvHeader + ",actorId"), csv().replace("rowType", "teamId"),
      csv().replace(",100,GBP", ",1e2,GBP"), csv().replace(",100,GBP", ",100.0,GBP"),
      csv().replace(",100,GBP", ", 100,GBP"), csv().replace(",100,GBP", ",100,EUR"),
      csv() + "\n" + csvRow("team", "different", "", "", "", "", "", "").replace("batch-1", "batch-2"),
      csv() + "\n\n", csv().replace("batch-1", '"batch-1'), csv().replace("batch-1", '"batch-1"x'),
      csv().replace(csvRow("job", "pilot", "job-1", "2026-01", "", "", "", ""), "short,row"),
    ]) {
      expect(() => parseBaselineHistory("csv", source)).toThrow(BaselineError);
    }
  });
  it("E9-18 pure import replays the first batch, conflicts on changed content, and detaches immutable inputs", () => {
    const source = history();
    const first = importBaselineBatch([], "json", json(source));
    const replay = importBaselineBatch(first.batches, "csv", csv());
    expect(replay.replayed).toBe(true);
    expect(replay.batch).toBe(first.batch);
    expect(replay.batches).toBe(first.batches);
    expect(() => importBaselineBatch(first.batches, "json", json({ ...source, sourceRevision: "changed" }))).toThrowError("BASELINE_CONFLICT");
    source.jobs[0]!.teamId = "changed";
    expect(first.batch.history.jobs[0]!.teamId).toBe("pilot");
    expect(Object.isFrozen(first.batch.history.jobs[0]!.extras)).toBe(true);
    expect(first.batches).toHaveLength(1);
  });
  it("E9-18 invalid input leaves the supplied batch list unchanged", () => {
    const first = importBaselineBatch([], "json", json(history()));
    const before = json(first.batches);
    expect(() => importBaselineBatch(first.batches, "csv", csv().replace(",100,GBP", ",unknown,GBP"))).toThrow(BaselineError);
    expect(json(first.batches)).toBe(before);
  });
  it("E9-17 E9-01 includes zero-extra jobs; every total equals job and extra drill-down contributions", () => {
    const report = deriveBaseline(parse(history()), cohorts());
    for (const group of [report.pilot, report.rest]) {
      expect(group.totals.jobs).toBe(group.jobs.length);
      expect(group.totals.extras).toBe(group.jobs.reduce((n, job) => n + job.extras.length, 0));
      expect(group.totals.knownNet.pence).toBe(group.jobs.reduce((n, job) => n + job.knownNet.pence, 0));
      expect(group.totals.unknownValues).toBe(group.jobs.reduce((n, job) => n + job.unknownValues, 0));
    }
    expect(report.pilot.totals.jobs).toBe(2);
    expect(report.pilot.extrasPer100Jobs).toEqual({ status: "complete", exact: { numerator: "100", denominator: "1" } });
    expect(report.pilot.valuePerJob).toEqual({ status: "incomplete", unit: "pence_per_job", knownExact: { numerator: "50", denominator: "1" }, unknownValues: 1 });
    expect(report.rest.valuePerJob.knownExact).toEqual({ numerator: "5", denominator: "1" });
  });
  it("E9-19 reorders input rows/properties without changing canonical input hash or export bytes", () => {
    const source = history();
    const reordered = { ...source, teamIds: [...source.teamIds].reverse(), jobs: [...source.jobs].reverse().map(job => ({
      extras: [...job.extras].reverse(), month: job.month, teamId: job.teamId, sourceJobId: job.sourceJobId,
    })) };
    const first = deriveBaseline(parse(source), cohorts());
    const second = deriveBaseline(parse(reordered), cohorts());
    expect(first).toEqual(second);
    expect(exportBaseline(parse(source), cohorts(), "json")).toBe(exportBaseline(parse(reordered), cohorts(), "json"));
    expect(exportBaseline(parse(source), cohorts(), "csv")).toBe(exportBaseline(parse(reordered), cohorts(), "csv"));
    expect(deriveBaseline(parse({ ...source, sourceRevision: "revision-2" }), cohorts()).inputHash).not.toBe(first.inputHash);
    expect(deriveBaseline(parse(source), { ...cohorts(), restTeamIds: ["empty"] }).inputHash).not.toBe(first.inputHash);
    expect(deriveBaseline(parse({ ...source, endMonthExclusive: "2026-08" }), cohorts()).inputHash).not.toBe(first.inputHash);
    expect(deriveBaseline(parse({ ...source, sourceBatchId: "batch-2" }), cohorts()).inputHash).not.toBe(first.inputHash);
  });
  it("E9-20 carries immutable method text/version/hash on every output and both exports", () => {
    const report = deriveBaseline(parse(history()), cohorts());
    expect(report.method).toEqual(BASELINE_METHOD_V1);
    expect(Object.isFrozen(BASELINE_METHOD_V1)).toBe(true);
    for (const format of ["json", "csv"] as const) {
      const output = exportBaseline(parse(history()), cohorts(), format);
      expect(output).toContain(BASELINE_METHOD_V1.version);
      expect(output).toContain(BASELINE_METHOD_V1.text);
      expect(output).toContain(BASELINE_METHOD_V1.hash);
      expect(output).toContain(report.inputHash);
      expect(output).toContain("synthetic_demo");
    }
  });
  it("E9-20 reports empty denominators, exact thirds and known zero separately from unknown", () => {
    const source = history();
    source.jobs.push({ sourceJobId: "job-4", teamId: "rest", month: "2026-01", extras: [] },
      { sourceJobId: "job-5", teamId: "rest", month: "2026-02", extras: [] });
    const report = deriveBaseline(parse(source), { ...cohorts(), pilotTeamIds: ["empty"] });
    expect(report.pilot.extrasPer100Jobs).toEqual({ status: "not_computable", exact: null });
    expect(report.pilot.valuePerJob.status).toBe("not_computable");
    expect(report.rest.extrasPer100Jobs.exact).toEqual({ numerator: "100", denominator: "3" });
    expect(report.rest.valuePerJob.knownExact).toEqual({ numerator: "5", denominator: "3" });
    source.jobs[2]!.extras[0]!.reportedNet!.pence = 0;
    expect(deriveBaseline(parse(source), cohorts()).rest.valuePerJob.status).toBe("complete");
  });
  it("E9-20 refuses aggregate money overflow and unsupported method versions", () => {
    const source = history();
    source.jobs[0]!.extras = [1, 2].map(n => ({ sourceExtraId: `extra-${n}`, sourceWorkId: `work-${n}`, reportedNet: { pence: 1_000_000_000_000, currency: "GBP" } }));
    expect(() => deriveBaseline(parse(source), cohorts())).toThrowError("BASELINE_OVERFLOW");
    expect(() => deriveBaseline(parse(history()), cohorts(), "unknown-method")).toThrowError("BASELINE_METHOD_UNSUPPORTED");
  });
  it("E9-21 detached reference reports and exports survive subsequent source changes", () => {
    const source = history();
    const first = deriveBaseline(source, cohorts());
    const bytes = exportBaseline(source, cohorts(), "json");
    source.jobs[2]!.extras[0]!.reportedNet!.pence = 50;
    source.sourceRevision = "revision-2";
    const later = deriveBaseline(source, cohorts());
    expect(later.inputHash).not.toBe(first.inputHash);
    expect(first.rest.totals.knownNet.pence).toBe(5);
    expect(bytes).toBe(exportBaseline(history(), cohorts(), "json"));
    expect(Object.isFrozen(first.rest.jobs[0]!.extras[0]!.reportedNet)).toBe(true);
  });
  it("E9-22 refuses overlapping, repeated and unknown comparison teams and caller authority fields", () => {
    for (const selection of [
      { ...cohorts(), restTeamIds: ["pilot"] }, { ...cohorts(), pilotTeamIds: ["pilot", "pilot"] },
      { ...cohorts(), restTeamIds: ["foreign"] }, { ...cohorts(), tenantId: "caller" },
    ]) expect(() => deriveBaseline(parse(history()), selection)).toThrow(BaselineError);
  });
});
