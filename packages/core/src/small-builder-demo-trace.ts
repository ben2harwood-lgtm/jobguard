import { z } from "zod";
import { MAX_MONEY_PENCE } from "./money.js";
import { demoCatalogue } from "./small-builder-demo-scenarios.js";

const identity = z.string().min(1).max(200);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const demoTraceScopeV1 = z.object({
  tenantId: identity, jobId: identity, sessionId: identity, runId: identity,
  environment: z.literal("synthetic_demo"),
}).strict();
export const demoTraceValueV1 = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("amount"), pence: z.number().int().min(-MAX_MONEY_PENCE).max(MAX_MONEY_PENCE), currency: z.literal("GBP") }).strict(),
  z.object({ kind: z.literal("count"), count: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) }).strict(),
  z.object({ kind: z.literal("status"), status: z.enum(["pending", "unknown", "refused", "recorded", "approved", "settled", "reversed", "outcome_unknown"]) }).strict(),
]);
/** A claimed immutable source identity, not a source-authenticity certificate. */
export const demoTraceSourceV1 = z.object({
  id: identity, scope: demoTraceScopeV1, kind: z.enum(["domain", "final_check", "adapter", "sentinel"]),
  subjectId: identity, revision: identity, sha256: digest,
  values: z.array(z.object({ key: identity, value: demoTraceValueV1 }).strict()).min(1).max(1000),
}).strict();
const metric = z.object({
  id: identity, value: demoTraceValueV1,
  evidence: z.array(z.object({ sourceId: identity, key: identity }).strict()).min(1).max(1000),
}).strict();
const rowFields = { stepId: identity, metrics: z.array(metric).max(1000) };
const row = z.discriminatedUnion("state", [
  z.object({ ...rowFields, metrics: z.array(metric).min(1).max(1000), state: z.literal("observed") }).strict(),
  z.object({ ...rowFields, state: z.literal("not_run"), reason: z.string().min(1).max(1000) }).strict(),
  z.object({ ...rowFields, state: z.literal("blocked"), reason: z.string().min(1).max(1000) }).strict(),
]);
/** Public data carries source claims only. Approval/CI/human-verdict keys are forbidden. */
export const demoProductReportV1 = z.object({
  version: z.literal("small-builder-demo-product-report.v1"), catalogueVersion: z.literal(demoCatalogue.version),
  scope: demoTraceScopeV1, family: z.enum(["core-1000", "recovery-18800", "shadow-30000", "meter", "trial"]),
  project: z.enum(["mobile-360", "desktop"]), phase: z.enum(["prelock", "postlock"]),
  executableMap: z.literal("blocked"), rows: z.array(row).max(1000),
  sources: z.array(demoTraceSourceV1).max(10000),
  commands: z.array(z.object({
    id: identity, scope: demoTraceScopeV1, inputSha256: digest, resultSourceIds: z.array(identity).min(1).max(1000),
  }).strict()).max(10000),
}).strict();

/** Separate, unverified artifact index. No uploaded PASS or observation is accepted. */
export const acceptanceTraceV1 = z.object({
  version: z.literal("small-builder-demo-acceptance-trace.v1"), scope: demoTraceScopeV1, reportSha256: digest,
  artifacts: z.array(z.object({
    kind: z.enum(["claude", "ci", "browser", "human_observation"]),
    locator: z.string().url().max(2000), sha256: digest, commit: z.string().regex(/^[a-f0-9]{40}$/),
    provenance: z.literal("unverified"),
  }).strict()).max(1000),
}).strict();
export type DemoProductReportV1 = z.infer<typeof demoProductReportV1>;
export type AcceptanceTraceV1 = z.infer<typeof acceptanceTraceV1>;
export type DemoTraceIssue = Readonly<{
  code: "invalid_schema" | "catalogue_coverage" | "held_binding" | "duplicate_identity" | "command_conflict" |
    "scope_mismatch" | "source_reference" | "source_value" | "prelock_source" | "external_actions_evidence";
  path: string;
}>;
export type DemoTraceValidation = Readonly<{
  structurallyComplete: boolean;
  evidenceTrust: "unverified";
  executableMap: "blocked";
  journey: "not_established";
  issues: readonly DemoTraceIssue[];
}>;
const sameScope = (a: z.infer<typeof demoTraceScopeV1>, b: z.infer<typeof demoTraceScopeV1>): boolean =>
  a.tenantId === b.tenantId && a.jobId === b.jobId && a.sessionId === b.sessionId && a.runId === b.runId && a.environment === b.environment;
function sameValue(a: z.infer<typeof demoTraceValueV1>, b: z.infer<typeof demoTraceValueV1>): boolean {
  if (a.kind === "amount" && b.kind === "amount") return a.pence === b.pence && a.currency === b.currency;
  if (a.kind === "count" && b.kind === "count") return a.count === b.count;
  return a.kind === "status" && b.kind === "status" && a.status === b.status;
}

/** Pure structural consistency only: no reads, hashes, source queries, authority or acceptance. */
export function validateDemoProductReport(input: unknown): DemoTraceValidation {
  const issues: DemoTraceIssue[] = [];
  const add = (code: DemoTraceIssue["code"], path: string): void => { issues.push({ code, path }); };
  const result = (): DemoTraceValidation => ({ structurallyComplete: issues.length === 0,
    evidenceTrust: "unverified", executableMap: "blocked", journey: "not_established", issues });
  const parsed = demoProductReportV1.safeParse(input);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) add("invalid_schema", issue.path.join("."));
    return result();
  }
  const report = parsed.data;
  const required = demoCatalogue.steps.filter(step => step.family === report.family);
  const seenRows = new Set<string>();
  const sources = new Map<string, z.infer<typeof demoTraceSourceV1>>();
  for (const [i, source] of report.sources.entries()) {
    const path = `sources.${i}`;
    if (sources.has(source.id)) add("duplicate_identity", path);
    sources.set(source.id, source);
    if (!sameScope(source.scope, report.scope)) add("scope_mismatch", path);
    if (report.phase === "prelock" && source.kind === "final_check") add("prelock_source", path);
    const keys = new Set<string>();
    for (const value of source.values) {
      if (keys.has(value.key)) add("duplicate_identity", `${path}.values`);
      keys.add(value.key);
    }
  }
  const commands = new Map<string, (typeof report.commands)[number]>();
  for (const [i, command] of report.commands.entries()) {
    const path = `commands.${i}`;
    if (!sameScope(command.scope, report.scope)) add("scope_mismatch", path);
    const previous = commands.get(command.id);
    if (previous && (previous.inputSha256 !== command.inputSha256 ||
      JSON.stringify(previous.scope) !== JSON.stringify(command.scope) ||
      JSON.stringify(previous.resultSourceIds) !== JSON.stringify(command.resultSourceIds))) add("command_conflict", path);
    commands.set(command.id, command);
    for (const id of command.resultSourceIds) if (!sources.has(id)) add("source_reference", path);
  }
  for (const [i, r] of report.rows.entries()) {
    const path = `rows.${i}`;
    const step = required.find(s => s.id === r.stepId);
    if (!step || seenRows.has(r.stepId)) add("catalogue_coverage", path);
    seenRows.add(r.stepId);
    if (r.state === "observed" && step?.bindingIds.some(id =>
      demoCatalogue.bindings.find(binding => binding.id === id)?.status === "HELD" ||
      !demoCatalogue.bindings.some(binding => binding.id === id))) add("held_binding", path);
    const metricIds = new Set<string>();
    for (const [j, m] of r.metrics.entries()) {
      const metricPath = `${path}.metrics.${j}`;
      if (metricIds.has(m.id)) add("duplicate_identity", metricPath);
      metricIds.add(m.id);
      const kinds = new Set<string>();
      for (const evidence of m.evidence) {
        const source = sources.get(evidence.sourceId);
        const value = source?.values.find(v => v.key === evidence.key)?.value;
        if (!value) add("source_reference", metricPath);
        else if (!sameValue(value, m.value)) add("source_value", metricPath);
        if (source && value && sameValue(value, m.value)) kinds.add(source.kind);
      }
      if (m.id === "external-actions" && (m.value.kind !== "count" ||
        !kinds.has("adapter") || !kinds.has("sentinel"))) add("external_actions_evidence", metricPath);
    }
  }
  if (required.some(s => !seenRows.has(s.id))) add("catalogue_coverage", "rows");
  return result();
}
