import { z } from "zod";
import { completionWorkLocatorV1 } from "./enterprise-live-prompt-contracts.js";
const id = z.guid({ error: "Invalid uuid" });
const text = z.string().trim().min(1).max(200);
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const decimal = z.string().regex(/^(?:0|[1-9]\d{0,17})(?:\.\d{1,6})?$/u);
const micros = z.string().regex(/^(?:0|[1-9]\d{0,23})$/u);
const common = { commandId: id, jobId: id };
const materialsIssueObjectV1 = z.object({ ...common, version: z.literal("materials-issue.v1"), sourceId: text, eventId: text, workIdentity: text, unit: text, quantity: decimal, occurredAtMicros: micros, kind: z.enum(["issue", "return", "correction"]) }).strict();
const positiveIssueQuantity = (value: { kind: string; quantity: string }) => decimal.safeParse(value.quantity).success && (value.kind !== "issue" || rational(value.quantity).n > 0n);
export const materialsIssueV1 = materialsIssueObjectV1.refine(positiveIssueQuantity, { path: ["quantity"], message: "Issue quantity must be positive" });
export const materialsIssueBodyV1 = materialsIssueObjectV1.omit({ jobId: true }).refine(positiveIssueQuantity, { path: ["quantity"], message: "Issue quantity must be positive" });
const completionObservationObjectV1 = z.object({ ...common, version: z.literal("completion-observation.v1"), evidenceId: id, sha256: hash, objectVersion: text, locator: completionWorkLocatorV1, sourceText: z.string().max(100000).optional(), workIdentity: text }).strict();
const observationContent = (value: { locator: { kind: string }; sourceText?: string | undefined }) => value.locator.kind === "text_span" ? value.sourceText !== undefined : value.sourceText === undefined;
export const completionObservationV1 = completionObservationObjectV1.refine(observationContent, { path: ["sourceText"], message: "Text spans require source text; photo tags use stored original bytes" });
export const completionObservationBodyV1 = completionObservationObjectV1.omit({ jobId: true }).refine(observationContent, { path: ["sourceText"], message: "Text spans require source text; photo tags use stored original bytes" });
export const evaluateLivePromptsV1 = z.object({ ...common, version: z.literal("evaluate-live-prompts.v1") }).strict();
export const confirmPromptV1 = z.object({ ...common, version: z.literal("confirm-prompt.v1"), promptId: id, promptHash: hash, confirmedWorkIdentity: text.optional(), excessScopeItemId: id.optional(), existingExtraId: id.optional() }).strict();
export const dismissPromptV1 = z.object({ ...common, version: z.literal("dismiss-prompt.v1"), promptId: id, promptHash: hash, reason: z.string().trim().min(1).max(2000) }).strict();
export const promptListV1 = z.object({ version: z.literal("live-prompt-list.v1"), jobId: id, limit: z.number().int().min(1).max(100).optional(), after: id.optional() }).strict();
export const promptDetailV1 = z.object({ version: z.literal("live-prompt-detail.v1"), jobId: id, promptId: id }).strict();
export const extraPromptRuleSettingsV1 = z.object({ version: z.literal("extra-prompt-rule-settings.v1"), tenantId: id, clientContractVersionId: id, recognition: z.array(z.object({ workId: text, terms: z.array(text).min(1).max(100).refine(terms => new Set(terms).size === terms.length) }).strict()).max(10000).refine(entries => new Set(entries.map(entry => entry.workId)).size === entries.length), numerator: micros.refine(v => micros.safeParse(v).success && BigInt(v) > 0n), denominator: micros.refine(v => micros.safeParse(v).success && BigInt(v) > 0n) }).strict();
export class EnterpriseLivePromptPersistenceError extends Error {
  constructor(readonly code: "INVALID_PROMPT_COMMAND" | "EXTRA_FORBIDDEN" | "JOB_NOT_LIVE" | "PROMPT_CONFLICT" | "PROMPT_ORIGIN_HELD" | "PROMPT_SOURCE_INVALID" | "PROMPT_AMBIGUOUS" | "PROMPT_END_CHECK_HELD" | "PROMPT_PRACTICE_ONLY") { super(code); this.name = "EnterpriseLivePromptPersistenceError"; }
}
type Ratio = { n: bigint; d: bigint };
function rational(value: string): Ratio { const [whole, fraction = ""] = value.split("."); return { n: BigInt(whole! + fraction), d: 10n ** BigInt(fraction.length) }; }
function add(a: Ratio, b: Ratio): Ratio { let x = a.d, y = b.d; while (y !== 0n) { const r = x % y; x = y; y = r; } const d = (a.d / x) * b.d; return { n: a.n * (d / a.d) + b.n * (d / b.d), d }; }
function sum(values: string[]): Ratio { return values.map(rational).reduce(add, { n: 0n, d: 1n }); }
export type PromptEvaluationStatus = "finding" | "silent" | "unevaluated" | "quarantined";
const materialLine = z.object({ workIdentity: text, unit: text, quantity: decimal }).strict();
const materialFact = materialLine.extend({ sourceId: text, eventId: text, occurredAtMicros: micros, kind: z.enum(["issue", "return", "correction"]) }).strict();
export const materialComparisonInputV1 = z.object({ lines: z.array(materialLine).max(10000), facts: z.array(materialFact).max(10000) }).strict();
/** Supplied facts only: the repository must establish provenance before invoking. No unit conversions. */
export function calculateMaterialsExcess(raw: unknown): { rule: "b"; ruleVersion: "materials-strict-excess.v1"; workIdentity: string; unit: string; status: PromptEvaluationStatus; sourceKeys: string[] }[] {
  const { lines, facts } = materialComparisonInputV1.parse(raw);
  const groups = new Map<string, typeof facts>();
  for (const fact of facts) { const key = JSON.stringify([fact.workIdentity, fact.unit]); const group = groups.get(key) ?? []; group.push(fact); groups.set(key, group); }
  const conflicting = new Set<string>(); const seen = new Map<string, string>();
  for (const fact of facts) { const key = JSON.stringify([fact.sourceId, fact.eventId]), value = JSON.stringify(fact); if (seen.has(key) && seen.get(key) !== value) conflicting.add(key); seen.set(key, value); }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, group]) => {
    const first = group[0]!; const relevant = lines.filter(line => line.workIdentity === first.workIdentity && line.unit === first.unit);
    const unique = new Map(group.map(fact => [JSON.stringify([fact.sourceId, fact.eventId]), fact]));
    let status: PromptEvaluationStatus = "unevaluated";
    const timed = new Map<string, Ratio>(); let contradictoryTime = false;
    for (const fact of group) { const key = JSON.stringify([fact.sourceId, fact.occurredAtMicros]), quantity = rational(fact.quantity), prior = timed.get(key); if (prior && prior.n * quantity.d !== quantity.n * prior.d) contradictoryTime = true; timed.set(key, quantity); }
    if ([...unique].some(([key, fact]) => conflicting.has(key) || fact.kind !== "issue" || rational(fact.quantity).n <= 0n) || contradictoryTime) status = "quarantined";
    else if (relevant.length) { const issued = sum([...unique.values()].map(fact => fact.quantity)), instructed = sum(relevant.map(line => line.quantity)); status = issued.n * instructed.d > instructed.n * issued.d ? "finding" : "silent"; }
    return { rule: "b", ruleVersion: "materials-strict-excess.v1", workIdentity: first.workIdentity, unit: first.unit, status, sourceKeys: [...unique.keys()].sort() };
  });
}
export const visitComparisonInputV1 = z.object({ visitId: text, startMicros: micros.nullable(), endMicros: micros.nullable(), lines: z.array(z.object({ quantity: decimal, standardMinutes: decimal.nullable() }).strict()).max(10000), factor: z.object({ numerator: micros, denominator: micros, contractVersionId: text }).strict().nullable() }).strict();
export function calculateVisitExcess(raw: unknown): { rule: "c"; ruleVersion: "visit-factor-excess.v1"; visitId: string; status: PromptEvaluationStatus } {
  const input = visitComparisonInputV1.parse(raw); let status: PromptEvaluationStatus = "unevaluated";
  if (input.startMicros !== null && input.endMicros !== null && BigInt(input.endMicros) > BigInt(input.startMicros) && input.factor && BigInt(input.factor.numerator) > 0n && BigInt(input.factor.denominator) > 0n && input.lines.length && input.lines.every(line => line.standardMinutes !== null && rational(line.standardMinutes).n > 0n && rational(line.quantity).n > 0n)) {
    const standard = input.lines.map(line => { const q = rational(line.quantity), m = rational(line.standardMinutes!); return { n: q.n * m.n, d: q.d * m.d }; }).reduce(add, { n: 0n, d: 1n });
    status = (BigInt(input.endMicros) - BigInt(input.startMicros)) * standard.d * BigInt(input.factor.denominator) > standard.n * BigInt(input.factor.numerator) * 60000000n ? "finding" : "silent";
  }
  return { rule: "c", ruleVersion: "visit-factor-excess.v1", visitId: input.visitId, status };
}
export const closeoutComparisonInputV1 = z.object({ visitId: text, answerId: text.nullable(), answer: z.enum(["yes", "no"]).nullable(), loggedExtraCount: z.number().int().safe().nonnegative() }).strict();
export function calculateCloseoutFinding(raw: unknown): { rule: "d"; ruleVersion: "closeout-job-wide.v1"; visitId: string; answerId: string | null; status: PromptEvaluationStatus } {
  const input = closeoutComparisonInputV1.parse(raw);
  return { rule: "d", ruleVersion: "closeout-job-wide.v1", visitId: input.visitId, answerId: input.answerId, status: input.answer === "yes" && input.answerId !== null && input.loggedExtraCount === 0 ? "finding" : "silent" };
}
/** A match is advisory identity only; it cannot alter origin, duplicate groups or fees. */
export function matchPromptIdentity(jobId: string, identity: string, candidates: readonly { jobId: string; identity: string; extraId: string }[]): { status: "unmatched" | "ambiguous" } | { status: "matched"; extraId: string } {
  const ids = [...new Set(candidates.filter(candidate => candidate.jobId === jobId && candidate.identity === identity).map(candidate => candidate.extraId))];
  return ids.length === 0 ? { status: "unmatched" } : ids.length === 1 ? { status: "matched", extraId: ids[0]! } : { status: "ambiguous" };
}
export function promptCoalescingKey(jobId: string, workIdentity: string, unit?: string): string { return JSON.stringify(["prompt-match.v1", jobId, workIdentity, unit ?? null]); }
