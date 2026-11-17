import { describe, expect, it } from "vitest";
import {
  BaselineError, deriveBaseline, exportBaseline, importBaselineBatch, parseBaselineHistory,
  type BaselineHistory,
} from "./enterprise-baseline.js";

// Synthetic, bounded generation only. Seeds are case names so failures are reproducible.
const seeds = [1, 7, 42, 137, 2026, 65537, 0x12345678, 0xdeadbeef];
function random(seed: number) {
  let state = seed >>> 0;
  return (limit: number) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state % limit;
  };
}
function shuffle<T>(values: readonly T[], next: (limit: number) => number): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = next(i + 1);
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}
function generated(seed: number): BaselineHistory {
  const next = random(seed);
  const teamIds = Array.from({ length: 2 + next(4) }, (_, i) => `team-${i}`);
  return {
    version: "baseline-history.v1", environment: "synthetic_demo", sourceNamespace: "generated.invalid",
    sourceBatchId: `batch-${seed}`, sourceRevision: "revision-1", startMonth: "2026-01", endMonthExclusive: "2026-07",
    teamIds,
    jobs: Array.from({ length: 4 + next(9) }, (_, j) => ({
      sourceJobId: `job-${j}`, teamId: teamIds[next(teamIds.length)]!, month: `2026-0${1 + next(6)}`,
      extras: Array.from({ length: j === 0 ? 0 : 1 + next(4) }, (_, e) => ({
        sourceExtraId: `extra-${j}-${e}`, sourceWorkId: `work-${j}-${e}`,
        reportedNet: e === 0 ? null : { pence: e === 1 ? 0 : next(100_001), currency: "GBP" as const },
      })),
    })),
  };
}
function minimal(): BaselineHistory {
  return { ...generated(1), teamIds: ["team-0", "team-1"], jobs: [] };
}
const cohorts = () => ({ version: "baseline-cohorts.v1", pilotTeamIds: ["team-0"], restTeamIds: ["team-1"] });
const header = ["version", "environment", "sourceNamespace", "sourceBatchId", "sourceRevision", "startMonth", "endMonthExclusive",
  "rowType", "teamId", "sourceJobId", "month", "sourceExtraId", "sourceWorkId", "reportedNetPence", "currency"];
// Independent input encoder: never uses the production report exporter to encode history.
function rows(history: BaselineHistory): string[][] {
  const common = [history.version, history.environment, history.sourceNamespace, history.sourceBatchId, history.sourceRevision,
    history.startMonth, history.endMonthExclusive];
  return [
    ...history.teamIds.map(team => [...common, "team", team, "", "", "", "", "", ""]),
    ...history.jobs.flatMap(job => [
      [...common, "job", job.teamId, job.sourceJobId, job.month, "", "", "", ""],
      ...job.extras.map(extra => [...common, "extra", "", job.sourceJobId, "", extra.sourceExtraId, extra.sourceWorkId,
        extra.reportedNet === null ? "" : String(extra.reportedNet.pence), extra.reportedNet === null ? "" : "GBP"]),
    ]),
  ];
}
function csv(records: string[][], newline = "\n", final = false, quoted = false): string {
  const cell = (value: string) => quoted ? `"${value.replaceAll('"', '""')}"` : value;
  return [header, ...records].map(row => row.map(cell).join(",")).join(newline) + (final ? newline : "");
}
function invalid(action: () => unknown) {
  expect(action).toThrowError(BaselineError);
  expect(action).toThrowError("BASELINE_INVALID");
}
function permute(value: unknown, next: (limit: number) => number): unknown {
  if (Array.isArray(value)) return shuffle(value, next).map(child => permute(child, next));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(shuffle(Object.entries(value), next).map(([key, child]) => [key, permute(child, next)]));
  }
  return value;
}
const formats = ["json", "csv"] as const;
function encoded(history: BaselineHistory, format: typeof formats[number]): string {
  return format === "json" ? JSON.stringify(history) : csv(rows(history));
}
function job(index: number, extraCount = 0): BaselineHistory["jobs"][number] {
  return { sourceJobId: `job-${index}`, teamId: "team-0", month: "2026-01",
    extras: Array.from({ length: extraCount }, (_, e) => ({ sourceExtraId: `extra-${index}-${e}`,
      sourceWorkId: `work-${e}`, reportedNet: null })) };
}

describe("TESTS-BASELINE-PARSER-1 deterministic properties", () => {
  it.each(seeds)("BP1 seed %i: independently encoded JSON and CSV decode identically", seed => {
    const source = generated(seed);
    const jsonHistory = parseBaselineHistory("json", JSON.stringify(source));
    const csvHistory = parseBaselineHistory("csv", csv(rows(source)));
    expect(csvHistory).toEqual(jsonHistory);
    expect(jsonHistory.teamIds).toEqual([...source.teamIds].sort());
    expect(jsonHistory.jobs.map(j => j.sourceJobId)).toEqual(source.jobs.map(j => j.sourceJobId).sort());
    expect(jsonHistory.jobs.flatMap(j => j.extras)).toHaveLength(source.jobs.reduce((n, j) => n + j.extras.length, 0));
  });

  it.each(seeds)("BP2 seed %i: row/property permutations preserve history, hashes, replay and export bytes", seed => {
    const source = generated(seed), next = random(seed);
    const first = importBaselineBatch([], "json", JSON.stringify(source));
    const normalized = first.batch.history;
    const report = deriveBaseline(normalized, cohorts());
    const exports = formats.map(format => exportBaseline(normalized, cohorts(), format));
    for (let round = 0; round < 3; round++) {
      const candidates = [
        parseBaselineHistory("json", JSON.stringify(permute(source, next))),
        parseBaselineHistory("csv", csv(shuffle(rows(source), next))),
      ];
      for (const candidate of candidates) {
        expect(candidate).toEqual(normalized);
        const replay = importBaselineBatch(first.batches, "json", JSON.stringify(candidate));
        expect(replay.batch).toBe(first.batch);
        expect(replay.batches).toBe(first.batches);
        expect(replay.replayed).toBe(true);
        expect(replay.batch.sourceHash).toBe(first.batch.sourceHash);
        expect(deriveBaseline(candidate, cohorts())).toEqual(report);
        expect(formats.map(format => exportBaseline(candidate, cohorts(), format))).toEqual(exports);
      }
    }
  });

  it.each(seeds)("BP3 seed %i: whole quoted cells, LF/CRLF and optional final newline preserve input", seed => {
    const source = generated(seed), expected = parseBaselineHistory("json", JSON.stringify(source));
    for (const newline of ["\n", "\r\n"]) for (const final of [false, true]) for (const quoted of [false, true]) {
      expect(parseBaselineHistory("csv", csv(rows(source), newline, final, quoted))).toEqual(expected);
    }
  });

  const malformed = {
    "unmatched quotes": (source: string) => source + '"',
    "trailing characters": (source: string) => source.replace("batch-1", '"batch-"1'),
    "short columns": (source: string) => source.slice(0, -1),
    "extra columns": (source: string) => source + ",",
    "mixed metadata": (source: string) => source.replace("batch-1", "batch-2"),
    "bare CR": (source: string) => source.replace("\n", "\r"),
  };
  it.each(Object.entries(malformed))("BP3 refuses %s with BASELINE_INVALID", (_name, corrupt) => {
    // Minimal team rows end in empty cells: malformed quoting cannot be hidden by schema rejection.
    invalid(() => parseBaselineHistory("csv", corrupt(csv(rows(minimal())))));
  });
  it.each(seeds)("BP3 seed %i: any of seven batch metadata cells mixed across rows refuses", seed => {
    const replacements = ["baseline-history.v2", "other", "other.invalid", "other-batch", "revision-2", "2025-12", "2026-08"];
    for (let column = 0; column < 7; column++) {
      const records = rows(generated(seed));
      records[records.length - 1]![column] = replacements[column]!;
      invalid(() => parseBaselineHistory("csv", csv(records)));
    }
  });

  it("BP4 character limit json: accepts 8000000 and refuses 8000001", () => {
    const source = JSON.stringify(minimal());
    const boundary = source + " ".repeat(8_000_000 - source.length);
    expect(boundary).toHaveLength(8_000_000);
    expect(parseBaselineHistory("json", boundary)).toEqual(parseBaselineHistory("json", source));
    invalid(() => parseBaselineHistory("json", boundary + " "));
  });
  it("BP4 character limit csv: accepts 8000000 and refuses 8000001", () => {
    const source = { ...minimal(), sourceNamespace: "n".repeat(100), sourceBatchId: "b".repeat(100),
      sourceRevision: "r".repeat(100), jobs: [job(0, 15_000)] };
    let remaining = 8_000_000 - csv(rows(source)).length;
    expect(remaining).toBeGreaterThan(0);
    for (const extra of source.jobs[0]!.extras) {
      for (const key of ["sourceExtraId", "sourceWorkId"] as const) {
        const padding = Math.min(100 - extra[key].length, remaining);
        extra[key] += "x".repeat(padding);
        remaining -= padding;
      }
    }
    expect(remaining).toBe(0);
    const boundary = csv(rows(source));
    expect(boundary).toHaveLength(8_000_000);
    expect(parseBaselineHistory("csv", boundary)).toEqual(parseBaselineHistory("json", JSON.stringify(source)));
    invalid(() => parseBaselineHistory("csv", boundary + "\n"));
  });

  it.each(formats)("BP4 team limit %s: accepts 1000 and refuses 1001", format => {
    const source = { ...minimal(), teamIds: Array.from({ length: 1_000 }, (_, i) => `team-${i}`) };
    expect(parseBaselineHistory(format, encoded(source, format)).teamIds).toHaveLength(1_000);
    invalid(() => parseBaselineHistory(format, encoded({ ...source, teamIds: [...source.teamIds, "team-1000"] }, format)));
  });
  it.each(formats)("BP4 job limit %s: accepts 10000 and refuses 10001", format => {
    const source = { ...minimal(), jobs: Array.from({ length: 10_000 }, (_, i) => job(i)) };
    expect(parseBaselineHistory(format, encoded(source, format)).jobs).toHaveLength(10_000);
    invalid(() => parseBaselineHistory(format, encoded({ ...source, jobs: [...source.jobs, job(10_000)] }, format)));
  });
  it.each(formats)("BP4 per-job extra limit %s: accepts 20000 and refuses 20001", format => {
    const source = { ...minimal(), jobs: [job(0, 20_000)] };
    expect(parseBaselineHistory(format, encoded(source, format)).jobs[0]!.extras).toHaveLength(20_000);
    invalid(() => parseBaselineHistory(format, encoded({ ...source, jobs: [job(0, 20_001)] }, format)));
  });
  it.each(formats)("BP4 batch extra limit %s: accepts 20000 and refuses 20001 across jobs", format => {
    const source = { ...minimal(), jobs: [job(0, 10_000), job(1, 10_000)] };
    expect(parseBaselineHistory(format, encoded(source, format)).jobs.map(j => j.extras.length)).toEqual([10_000, 10_000]);
    invalid(() => parseBaselineHistory(format, encoded({ ...source, jobs: [job(0, 10_000), job(1, 10_001)] }, format)));
  });

  it.each(seeds)("BP5 seed %i: rejected imports preserve caller batch state and prior exports", seed => {
    const first = importBaselineBatch([], "json", JSON.stringify(generated(seed)));
    // Mutable caller collection makes this assertion stronger than relying on a frozen array.
    const batches = [...first.batches], batch = batches[0]!;
    const snapshot = JSON.stringify(batches);
    const exports = formats.map(format => exportBaseline(batch.history, cohorts(), format));
    const bad = generated(seed + 1);
    const cases = [
      { format: "json" as const, text: "{" },
      { format: "json" as const, text: JSON.stringify({ ...bad, teamIds: [] }) },
      { format: "json" as const, text: JSON.stringify({ ...bad, jobs: [job(0), job(0)] }) },
      { format: "csv" as const, text: csv(rows(bad)) + "," },
      { format: "csv" as const, text: csv(rows(bad)).replace(bad.sourceBatchId, "mixed-batch") },
    ];
    for (const input of cases) {
      invalid(() => importBaselineBatch(batches, input.format, input.text));
      expect(batches).toHaveLength(1);
      expect(batches[0]).toBe(batch);
      expect(JSON.stringify(batches)).toBe(snapshot);
      expect(formats.map(format => exportBaseline(batch.history, cohorts(), format))).toEqual(exports);
    }
  });

  it.each(seeds)("BP6 seed %i: zero-extra jobs, absent jobs, unknown money and known zero stay distinct", seed => {
    const count = 1 + random(seed)(9);
    const zeroJobs = { ...minimal(), jobs: Array.from({ length: count }, (_, i) => job(i)) };
    const unknown = { ...zeroJobs, jobs: [job(0, 1), ...zeroJobs.jobs.slice(1)] };
    const knownZero: BaselineHistory = { ...unknown, jobs: unknown.jobs.map(j => ({ ...j,
      extras: j.extras.map(e => ({ ...e, reportedNet: { pence: 0, currency: "GBP" } })) })) };
    for (const format of formats) {
      const reports = [minimal(), zeroJobs, unknown, knownZero].map(source =>
        deriveBaseline(parseBaselineHistory(format, encoded(source, format)), cohorts()));
      const [absent, zero, missingValue, known] = reports;
      expect(absent!.pilot.totals.jobs).toBe(0);
      expect(absent!.pilot.extrasPer100Jobs).toEqual({ status: "not_computable", exact: null });
      expect(absent!.pilot.valuePerJob).toMatchObject({ status: "not_computable", knownExact: null });
      expect(zero!.pilot.totals).toMatchObject({ jobs: count, extras: 0, unknownValues: 0 });
      expect(zero!.pilot.extrasPer100Jobs).toEqual({ status: "complete", exact: { numerator: "0", denominator: "1" } });
      expect(zero!.pilot.valuePerJob).toMatchObject({ status: "complete", knownExact: { numerator: "0", denominator: "1" } });
      expect(missingValue!.pilot.totals).toMatchObject({ jobs: count, extras: 1, unknownValues: 1 });
      expect(missingValue!.pilot.valuePerJob).toMatchObject({ status: "incomplete", unknownValues: 1 });
      expect(known!.pilot.totals).toMatchObject({ jobs: count, extras: 1, unknownValues: 0 });
      expect(known!.pilot.valuePerJob).toMatchObject({ status: "complete", unknownValues: 0 });
      expect(missingValue!.pilot.totals.knownNet).toEqual(known!.pilot.totals.knownNet);
      expect(new Set(reports.map(report => report.sourceHash)).size).toBe(4);
      expect(parseBaselineHistory(format, encoded(unknown, format)).jobs[0]!.extras[0]!.reportedNet).toBeNull();
      expect(parseBaselineHistory(format, encoded(knownZero, format)).jobs[0]!.extras[0]!.reportedNet).toEqual({ pence: 0, currency: "GBP" });
    }
  });
});
