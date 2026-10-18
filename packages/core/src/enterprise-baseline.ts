import { z } from "zod";
import { MAX_MONEY_PENCE, moneyFromBigInt } from "./money.js";
import { exactPence, serializeExactPence } from "./cumulative-fee.js";
import { sha256 } from "./evidence-pack.js";

// Historical source observations only. No live job, approval, billing or settlement fact is created.
const id = z.string().min(1).max(100).regex(/^[a-z0-9][a-z0-9_.-]*$/u);
const month = z.string().regex(/^(?:20\d{2}|21\d{2})-(?:0[1-9]|1[0-2])$/u);
const reportedNet = z.object({ pence: z.number().int().nonnegative().max(MAX_MONEY_PENCE), currency: z.literal("GBP") }).strict();
const extraV1 = z.object({ sourceExtraId: id, sourceWorkId: id, reportedNet: reportedNet.nullable() }).strict();
const jobV1 = z.object({ sourceJobId: id, teamId: id, month, extras: z.array(extraV1).max(20_000) }).strict();
const distinct = (values: readonly string[]) => new Set(values).size === values.length;
const monthIndex = (value: string) => {
  const [year, part] = value.split("-");
  return BigInt(year!) * 12n + BigInt(part!);
};
export const baselineHistoryV1 = z.object({
  version: z.literal("baseline-history.v1"), environment: z.literal("synthetic_demo"),
  sourceNamespace: id, sourceBatchId: id, sourceRevision: id,
  startMonth: month, endMonthExclusive: month, teamIds: z.array(id).min(1).max(1_000),
  jobs: z.array(jobV1).max(10_000),
}).strict().superRefine((value, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: "custom", message });
  if (month.safeParse(value.startMonth).success && month.safeParse(value.endMonthExclusive).success) {
    const months = monthIndex(value.endMonthExclusive) - monthIndex(value.startMonth);
    if (months < 6n || months > 12n) issue("Coverage must be 6–12 calendar months");
  }
  if (!distinct(value.teamIds) || !distinct(value.jobs.map(job => job.sourceJobId))) issue("Conflicting source identity");
  const teams = new Set(value.teamIds);
  const extraIds = new Set<string>();
  let extraCount = 0;
  for (const job of value.jobs) {
    if (!teams.has(job.teamId) || job.month < value.startMonth || job.month >= value.endMonthExclusive) issue("Invalid job binding");
    if (!distinct(job.extras.map(extra => extra.sourceWorkId))) issue("Unresolved repeated underlying work");
    for (const extra of job.extras) {
      extraCount++;
      if (extraIds.has(extra.sourceExtraId)) issue("Conflicting extra identity");
      extraIds.add(extra.sourceExtraId);
    }
  }
  if (extraCount > 20_000) issue("History has too many extras");
});
export type BaselineHistory = z.infer<typeof baselineHistoryV1>;
export const baselineCohortsV1 = z.object({ version: z.literal("baseline-cohorts.v1"),
  pilotTeamIds: z.array(id).min(1).max(1_000), restTeamIds: z.array(id).min(1).max(1_000),
}).strict().refine(value => distinct([...value.pilotTeamIds, ...value.restTeamIds]), "Cohorts must be distinct and disjoint");
export const baselineErrorV1 = z.object({ version: z.literal("baseline-error.v1"), code: z.enum([
  "BASELINE_INVALID", "BASELINE_CONFLICT", "BASELINE_OVERFLOW", "BASELINE_METHOD_UNSUPPORTED",
]) }).strict();
export class BaselineError extends Error {
  constructor(readonly code: z.infer<typeof baselineErrorV1>["code"]) { super(code); this.name = "BaselineError"; }
  toJSON(): z.infer<typeof baselineErrorV1> { return { version: "baseline-error.v1", code: this.code }; }
}
function checked<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new BaselineError("BASELINE_INVALID");
  return result.data;
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
// Code-point sorting and ASCII identities keep ordering independent of process locale.
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => compare(a, b))
    .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(",")}}`;
  return JSON.stringify(value);
}
function normalize(raw: unknown): BaselineHistory {
  const value = checked(baselineHistoryV1, raw);
  value.teamIds.sort(compare);
  value.jobs.sort((a, b) => compare(a.sourceJobId, b.sourceJobId));
  for (const job of value.jobs) job.extras.sort((a, b) => compare(a.sourceExtraId, b.sourceExtraId));
  return freeze(value);
}

const MAX_INPUT_CHARACTERS = 8_000_000;
const CSV_COLUMNS = ["version", "environment", "sourceNamespace", "sourceBatchId", "sourceRevision", "startMonth", "endMonthExclusive",
  "rowType", "teamId", "sourceJobId", "month", "sourceExtraId", "sourceWorkId", "reportedNetPence", "currency"] as const;

/** Strict RFC-style records: quotes must enclose the entire field; a single final line ending is optional. */
function csvRecords(text: string): string[][] {
  const records: string[][] = [];
  let fields: string[] = [], field = "", state: "plain" | "quoted" | "closed" = "plain";
  const invalid = () => { throw new BaselineError("BASELINE_INVALID"); };
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (state === "quoted") {
      if (c !== '"') field += c;
      else if (text[i + 1] === '"') { field += '"'; i++; }
      else state = "closed";
      continue;
    }
    if (c === ',' || c === '\n' || c === '\r') {
      fields.push(field); field = ""; state = "plain";
      if (c !== ',') {
        if (c === '\r') { if (text[i + 1] !== '\n') invalid(); i++; }
        records.push(fields); fields = [];
        if (records.length > 31_001) invalid();
      }
    } else if (c === '"' && state === "plain" && field === "") state = "quoted";
    else { if (state === "closed" || c === '"') invalid(); field += c; }
  }
  if (state === "quoted") invalid();
  if (field !== "" || fields.length || state === "closed") { fields.push(field); records.push(fields); }
  return records;
}
function decodeCsv(text: string): unknown {
  const [header, ...rows] = csvRecords(text);
  if (!header || canonical(header) !== canonical(CSV_COLUMNS) || !rows.length) throw new BaselineError("BASELINE_INVALID");
  let common: string[] | undefined;
  const teamIds: string[] = [], jobs: BaselineHistory["jobs"] = [];
  const extras: { jobId: string; value: z.infer<typeof extraV1> }[] = [];
  for (const fields of rows) {
    if (fields.length !== CSV_COLUMNS.length) throw new BaselineError("BASELINE_INVALID");
    const metadata = fields.slice(0, 7);
    if (common && canonical(common) !== canonical(metadata)) throw new BaselineError("BASELINE_INVALID");
    common = metadata;
    const [, , , , , , , kind, teamId, sourceJobId, jobMonth, sourceExtraId, sourceWorkId, pence, currency] = fields;
    if (kind === "team" && sourceJobId === "" && jobMonth === "" && sourceExtraId === "" && sourceWorkId === "" && pence === "" && currency === "") teamIds.push(teamId!);
    else if (kind === "job" && sourceExtraId === "" && sourceWorkId === "" && pence === "" && currency === "") {
      jobs.push({ sourceJobId: sourceJobId!, teamId: teamId!, month: jobMonth!, extras: [] });
    } else if (kind === "extra" && teamId === "" && jobMonth === "") {
      let amount: z.infer<typeof reportedNet> | null = null;
      if (pence !== "" || currency !== "") {
        // CSV has text cells: decode only the canonical integer grammar, never permissive number coercion.
        if (!/^(?:0|[1-9]\d{0,12})$/u.test(pence!) || currency !== "GBP" || BigInt(pence!) > BigInt(MAX_MONEY_PENCE)) throw new BaselineError("BASELINE_INVALID");
        amount = { pence: Number(BigInt(pence!)), currency: "GBP" };
      }
      extras.push({ jobId: sourceJobId!, value: { sourceExtraId: sourceExtraId!, sourceWorkId: sourceWorkId!, reportedNet: amount } });
    } else throw new BaselineError("BASELINE_INVALID");
  }
  const byId = new Map(jobs.map(job => [job.sourceJobId, job]));
  for (const extra of extras) {
    const job = byId.get(extra.jobId);
    if (!job) throw new BaselineError("BASELINE_INVALID");
    job.extras.push(extra.value);
  }
  const [version, environment, sourceNamespace, sourceBatchId, sourceRevision, startMonth, endMonthExclusive] = common!;
  return { version, environment, sourceNamespace, sourceBatchId, sourceRevision, startMonth, endMonthExclusive, teamIds, jobs };
}
export function parseBaselineHistory(format: "json" | "csv", text: string): BaselineHistory {
  if (typeof text !== "string" || text.length > MAX_INPUT_CHARACTERS) throw new BaselineError("BASELINE_INVALID");
  let raw: unknown;
  try {
    if (format === "json") raw = JSON.parse(text);
    else if (format === "csv") raw = decodeCsv(text);
    else throw new BaselineError("BASELINE_INVALID");
  } catch { throw new BaselineError("BASELINE_INVALID"); }
  return normalize(raw);
}

export type BaselineBatch = Readonly<{ version: "baseline-batch.v1"; sourceHash: string; history: BaselineHistory }>;
/** Pure transition over caller-owned batches, not a durable store or an authorization boundary. */
export function importBaselineBatch(batches: readonly BaselineBatch[], format: "json" | "csv", text: string) {
  const history = parseBaselineHistory(format, text), sourceHash = sha256(canonical(history));
  const existing = batches.find(batch => batch.history.sourceNamespace === history.sourceNamespace && batch.history.sourceBatchId === history.sourceBatchId);
  if (existing) {
    if (existing.sourceHash !== sourceHash || canonical(existing.history) !== canonical(history)) throw new BaselineError("BASELINE_CONFLICT");
    return Object.freeze({ batch: existing, batches, replayed: true });
  }
  const batch: BaselineBatch = freeze({ version: "baseline-batch.v1", sourceHash, history });
  return Object.freeze({ batch, batches: Object.freeze([...batches, batch]), replayed: false });
}

const methodText = "Synthetic reference only; no pilot approval. Use all declared historical jobs, including zero-extra jobs, in each explicit disjoint team cohort. Assign jobs and their extras to the supplied job month in the half-open declared Europe/London calendar-month interval; source month labels are supplied without timestamp conversion. Count each unique source work identity once per job; refuse unresolved repeated work. Extras per 100 jobs = 100 times extra count divided by job count. Value per job = source-reported nonnegative net GBP snapshot divided by job count; no inference of approval, billing, payment, credits, tax or fee entitlement. Unknown net stays unknown: show known subtotal and exact known value per job with an incomplete status. Zero jobs is not_computable. Exact reduced fractions are exported without rounding. Pilot and rest are descriptive side-by-side cohorts, with no causal claim or implicit comparison population.";
export const BASELINE_METHOD_V1 = Object.freeze({ version: "baseline-method.reference.v1", text: methodText, hash: sha256(methodText) });
function boundedMoney(pence: bigint) {
  try { return moneyFromBigInt(pence); } catch { throw new BaselineError("BASELINE_OVERFLOW"); }
}
function project(history: BaselineHistory, teamIds: readonly string[]) {
  const teams = new Set(teamIds);
  const jobs = history.jobs.filter(job => teams.has(job.teamId)).map(job => ({ ...job,
    knownNet: boundedMoney(job.extras.reduce((n, extra) => n + BigInt(extra.reportedNet?.pence ?? 0), 0n)),
    unknownValues: job.extras.filter(extra => extra.reportedNet === null).length,
  }));
  const totals = { jobs: jobs.length, extras: jobs.reduce((n, job) => n + job.extras.length, 0),
    knownNet: boundedMoney(jobs.reduce((n, job) => n + BigInt(job.knownNet.pence), 0n)),
    unknownValues: jobs.reduce((n, job) => n + job.unknownValues, 0),
  };
  const denominator = BigInt(totals.jobs);
  const extrasPer100Jobs = totals.jobs === 0 ? { status: "not_computable" as const, exact: null }
    : { status: "complete" as const, exact: serializeExactPence(exactPence(100n * BigInt(totals.extras), denominator)) };
  const valuePerJob = { status: totals.jobs === 0 ? "not_computable" as const : totals.unknownValues ? "incomplete" as const : "complete" as const,
    unit: "pence_per_job" as const, knownExact: totals.jobs === 0 ? null : serializeExactPence(exactPence(BigInt(totals.knownNet.pence), denominator)), unknownValues: totals.unknownValues };
  return { teamIds, jobs, totals, extrasPer100Jobs, valuePerJob };
}
export function deriveBaseline(rawHistory: unknown, rawCohorts: unknown, methodVersion: string = BASELINE_METHOD_V1.version) {
  if (methodVersion !== BASELINE_METHOD_V1.version) throw new BaselineError("BASELINE_METHOD_UNSUPPORTED");
  const history = normalize(rawHistory), cohorts = checked(baselineCohortsV1, rawCohorts);
  const teams = new Set(history.teamIds);
  if ([...cohorts.pilotTeamIds, ...cohorts.restTeamIds].some(team => !teams.has(team))) throw new BaselineError("BASELINE_INVALID");
  cohorts.pilotTeamIds.sort(compare); cohorts.restTeamIds.sort(compare);
  const sourceHash = sha256(canonical(history));
  const inputHash = sha256(canonical({ history, cohorts, method: BASELINE_METHOD_V1 }));
  const output = { version: "baseline-report.v1", environment: "synthetic_demo", method: BASELINE_METHOD_V1, inputHash, sourceHash,
    source: { namespace: history.sourceNamespace, batchId: history.sourceBatchId, revision: history.sourceRevision,
      startMonth: history.startMonth, endMonthExclusive: history.endMonthExclusive },
    pilot: project(history, cohorts.pilotTeamIds), rest: project(history, cohorts.restTeamIds),
  };
  return freeze({ ...output, outputHash: sha256(canonical(output)) });
}

/** Local serialization only; no download route, recipient, external delivery or stored-run claim. */
export function exportBaseline(history: unknown, cohorts: unknown, format: "json" | "csv"): string {
  const report = deriveBaseline(history, cohorts);
  if (format === "json") return canonical(report) + "\n";
  if (format !== "csv") throw new BaselineError("BASELINE_INVALID");
  // Each record carries the complete method and binding; structured cells preserve exact ratios and drill-downs.
  const quote = (value: unknown) => '"' + String(value).replaceAll('"', '""') + '"';
  const rows: unknown[][] = [["version", "environment", "methodVersion", "methodText", "methodHash", "inputHash", "sourceHash", "outputHash", "source", "cohort", "contributions"]];
  for (const cohort of ["pilot", "rest"] as const) rows.push([report.version, report.environment, report.method.version,
    report.method.text, report.method.hash, report.inputHash, report.sourceHash, report.outputHash, canonical(report.source), cohort, canonical(report[cohort])]);
  return rows.map(row => row.map(quote).join(",")).join("\r\n") + "\r\n";
}
