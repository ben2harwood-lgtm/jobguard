import { z } from "zod";
import { instantV1 } from "./receipt-allocation.js";
import { compareServerInstants } from "./enterprise-domain/contracts.js";
import { sha256 } from "./evidence-pack.js";
import { dashboardParse, dashboardCanonical, dashboardFreeze, dashboardCompareText, EnterpriseDashboardError } from "./enterprise-dashboard.js";
const uuid = z.guid({ error: "Invalid uuid" }).transform(v => v.toLowerCase());
const quantity = z.string().regex(/^(0|[1-9]\d{0,11})(\.\d{1,6})?$/u);
const scaled = (s: string) => { const [whole, fraction = ""] = s.split("."); return BigInt(whole!) * 1000000n + BigInt(fraction.padEnd(6, "0")); };
export const enterpriseSignalFactsV1 = z.object({ version: z.literal("enterprise-signal-facts.v1"),
  extras: z.array(z.object({ jobId: uuid, extraId: uuid, sourceId: uuid, sorVersionId: uuid.nullable(), sorCode: z.string().max(80).nullable(), linked: z.boolean(),
    withdrawal: z.object({ sourceId: uuid, at: instantV1, reason: z.string().max(40), scopeItemId: uuid.nullable() }).strict().nullable() }).strict()).max(100000),
  orderLines: z.array(z.object({ jobId: uuid, sourceId: uuid, scopeItemId: uuid, sorVersionId: uuid, sorCode: z.string().min(1).max(80),
    at: instantV1, quantity, previousQuantity: quantity.nullable(), unit: z.string().min(1).max(80), previousUnit: z.string().min(1).max(80).nullable() }).strict()).max(100000),
  billedVariations: z.array(z.object({ jobId: uuid, sourceId: uuid, kind: z.enum(["variation", "original_order", "other"]), extraId: uuid.nullable() }).strict()).max(100000),
  closeouts: z.array(z.object({ jobId: uuid, sourceId: uuid, operativeId: uuid, at: instantV1, answer: z.enum(["yes", "no"]).nullable() }).strict()).max(100000),
  outlierPolicy: z.object({ version: z.literal("synthetic-closeout-rule.v1"), from: instantV1, until: instantV1, minimumAnswered: z.number().int().min(1).max(100000),
    maximumNoRate: z.object({ numerator: z.number().int().min(0).max(100000), denominator: z.number().int().min(1).max(100000) }).strict(),
    populationSourceIds: z.array(uuid).min(1).max(100000), text: z.string().min(1).max(2000) }).strict()
    .refine(v => v.maximumNoRate.numerator <= v.maximumNoRate.denominator && compareServerInstants(v.from, v.until) < 0).nullable(),
}).strict();
type Observation = { id: string; kind: "billed_variation_without_extra" | "order_matches_unlinked_extra" | "withdrawn_then_quantity_increased" | "no_closeout_observation"; jobId: string; extraIds: string[]; sourceIds: string[] };
const method = { version: "enterprise-signal-method.v1", text: "Synthetic cited observations only: explicit unmatched billed variations; exact same-job SoR-version/code candidates for unlinked extras; already_on_order withdrawals before a same-scope, same-unit quantity increase. A no-answer comparison requires an explicit supplied synthetic window, sample and exact ratio with comparison-source identities. No observation approves, links, counts, prices, changes state, posts or sends anything. Unconfigured runtime billing and outlier sources remain held." };
/** Supplied scoped facts only. Returned observations carry no authoritative value, command, approval or execution capability. */
export function enterpriseSignals(raw: unknown) {
  const facts = dashboardParse(enterpriseSignalFactsV1, raw);
  for (const ids of [facts.extras.map(e => e.extraId), facts.orderLines.map(l => l.sourceId), facts.billedVariations.map(b => b.sourceId), facts.closeouts.map(c => c.sourceId)]) {
    if (new Set(ids).size !== ids.length) throw new EnterpriseDashboardError("DASHBOARD_INVALID");
  }
  if (facts.outlierPolicy) {
    if (new Set(facts.outlierPolicy.populationSourceIds).size !== facts.outlierPolicy.populationSourceIds.length) throw new EnterpriseDashboardError("DASHBOARD_INVALID");
    facts.outlierPolicy.populationSourceIds.sort(dashboardCompareText);
  }
  facts.extras.sort((a, b) => dashboardCompareText(a.extraId, b.extraId));
  facts.orderLines.sort((a, b) => dashboardCompareText(a.sourceId, b.sourceId));
  facts.billedVariations.sort((a, b) => dashboardCompareText(a.sourceId, b.sourceId));
  facts.closeouts.sort((a, b) => dashboardCompareText(a.sourceId, b.sourceId));
  const observations = new Map<string, Observation>();
  const add = (kind: Observation["kind"], jobId: string, extraIds: string[], sourceIds: string[]) => {
    const content = { kind, jobId, extraIds: [...new Set(extraIds)].sort(dashboardCompareText), sourceIds: [...new Set(sourceIds)].sort(dashboardCompareText) };
    const id = sha256(dashboardCanonical({ method: "enterprise-signal-method.v1", policy: kind === "no_closeout_observation" ? facts.outlierPolicy : null, ...content }));
    observations.set(id, { id, ...content });
  };
  for (const b of facts.billedVariations) if (b.kind === "variation" && b.extraId === null) add("billed_variation_without_extra", b.jobId, [], [b.sourceId]);
  type Line = z.infer<typeof enterpriseSignalFactsV1>["orderLines"][number];
  const bySor = new Map<string, Line[]>(), byScope = new Map<string, Line[]>();
  for (const l of facts.orderLines) for (const [map, key] of [[bySor, `${l.jobId}/${l.sorVersionId}/${l.sorCode}`], [byScope, `${l.jobId}/${l.scopeItemId}`]] as const) {
    const rows = map.get(key) ?? []; rows.push(l); map.set(key, rows);
  }
  for (const e of facts.extras) for (const l of new Set([...(e.linked ? [] : bySor.get(`${e.jobId}/${e.sorVersionId}/${e.sorCode}`) ?? []),
    ...(e.withdrawal?.scopeItemId ? byScope.get(`${e.jobId}/${e.withdrawal.scopeItemId}`) ?? [] : [])])) {
    if (e.jobId !== l.jobId) continue;
    if (!e.linked && e.sorVersionId !== null && e.sorVersionId === l.sorVersionId && e.sorCode === l.sorCode)
      add("order_matches_unlinked_extra", e.jobId, [e.extraId], [e.sourceId, l.sourceId]);
    const w = e.withdrawal;
    if (w?.reason === "already_on_order" && w.scopeItemId === l.scopeItemId && compareServerInstants(l.at, w.at) > 0 &&
        l.previousQuantity !== null && l.unit === l.previousUnit && scaled(l.quantity) > scaled(l.previousQuantity))
      add("withdrawn_then_quantity_increased", e.jobId, [e.extraId], [e.sourceId, w.sourceId, l.sourceId]);
  }
  const policy = facts.outlierPolicy;
  if (policy) for (const operative of new Set(facts.closeouts.map(c => c.operativeId))) {
    const answers = facts.closeouts.filter(c => c.operativeId === operative && c.answer !== null && compareServerInstants(c.at, policy.from) >= 0 && compareServerInstants(c.at, policy.until) < 0);
    const no = answers.filter(c => c.answer === "no").length;
    if (answers.length >= policy.minimumAnswered && BigInt(no) * BigInt(policy.maximumNoRate.denominator) > BigInt(answers.length) * BigInt(policy.maximumNoRate.numerator)) {
      for (const jobId of new Set(answers.map(c => c.jobId))) add("no_closeout_observation", jobId, [], [...answers.map(c => c.sourceId), ...policy.populationSourceIds]);
    }
  }
  const result = { version: "enterprise-signals.v1", method: { ...method, hash: sha256(dashboardCanonical(method)) },
    inputHash: sha256(dashboardCanonical({ facts, method })), observations: [...observations.values()].sort((a, b) => dashboardCompareText(a.id, b.id)),
    billing: { status: "held", prerequisite: "ENT-6B persisted billed-variation source" }, outliers: policy ? { status: "supplied_synthetic_policy", policy } : { status: "held", prerequisite: "versioned outlier policy" } };
  return dashboardFreeze({ ...result, outputHash: sha256(dashboardCanonical(result)) });
}
