import { z } from "zod";
import { MAX_MONEY_PENCE } from "./money.js";

// Candidate DTO contract only: no producer binding, eligibility or fee calculation.
// Known pence must be exact upstream integers. Never round at this boundary;
// non-integral upstream amounts are incomplete until a producer policy is bound.
const ref = z.string().min(1).max(200);
const moneySchema = z.object({ pence: z.number().int().safe().min(-MAX_MONEY_PENCE).max(MAX_MONEY_PENCE), currency: z.literal("GBP") }).strict();
export const valueAmountV3 = z.discriminatedUnion("state", [
  z.object({ state: z.literal("known"), money: moneySchema, basis: z.enum(["net_principal", "gross"]), sourceRefs: z.array(ref).min(1) }).strict(),
  z.object({ state: z.literal("unknown"), reason: z.enum(["source_unavailable", "binding_held", "not_reported"]) }).strict(),
  z.object({ state: z.literal("incomplete"), reason: z.enum(["source_unavailable", "binding_held", "not_reported", "fractional_pence_requires_upstream_policy"]) }).strict(),
]);
export type ValueAmountV3 = z.infer<typeof valueAmountV3>;
const categoryName = z.enum(["tracked", "found", "supplier", "withheld"]);
const qualification = z.enum(["hypothetical_qualified", "pending", "unapproved", "unpaid", "disputed", "disclosed_before_lock", "after_lock", "builder_capture"]);
export const valueSourceV3 = z.object({
  id: ref, eventId: ref, revision: z.number().int().positive(), tenantId: ref, jobId: ref, sessionRef: ref,
  category: categoryName, kind: z.enum(["snapshot", "recovery", "reversal", "correction", "recorded"]),
  qualification, corrects: ref.nullable(), occurredAt: z.string().datetime(),
  policyVersion: z.literal("reference_fee_policy_v3"), derivationVersion: ref,
  netMovement: moneySchema.nullable(), feeMovement: moneySchema.nullable(),
}).strict();
const category = <T extends z.infer<typeof categoryName>>(name: T) => z.object({
  category: z.literal(name), recorded: valueAmountV3, settled: valueAmountV3,
  qualifying: valueAmountV3, fee: valueAmountV3, remainder: valueAmountV3,
}).strict();
const checked = z.object({ category: z.literal("checked"), count: z.number().int().safe().nonnegative(), sourceRefs: z.array(ref) }).strict();
const shape = {
  version: z.literal("value-receipt.v3"), environment: z.literal("synthetic_demo"),
  evidence: z.literal("illustrative_unbound"),
  disclosure: z.enum(["prelock", "after_lock"]),
  asOf: z.object({ vector: z.array(z.object({ producer: ref, revision: ref }).strict()).min(1),
    timeContract: z.literal("proposed_unbound"),
    window: z.object({ from: z.string().datetime(), toExclusive: z.string().datetime() }).strict().nullable(),
    measure: z.enum(["cumulative_balance", "window_movement"]),
  }).strict(),
  categories: z.tuple([checked, category("tracked"), category("found"), category("supplier"), category("withheld")]),
  sources: z.array(valueSourceV3),
  facts: z.array(z.object({ id: ref, sourceRef: ref, kind: z.enum(["invoice", "approved_variation", "unapproved_variation", "recorded_payment", "payment_reversal", "invoice_correction"]), amount: moneySchema, basis: z.enum(["net_principal", "gross"]) }).strict()),
};
const scope = { tenantId: ref, sessionRef: ref };
const candidate = z.discriminatedUnion("scopeKind", [
  z.object({ ...shape, scopeKind: z.literal("job"), scope: z.object({ ...scope, jobId: ref }).strict() }).strict(),
  z.object({ ...shape, scopeKind: z.literal("business"), scope: z.object(scope).strict(), subscription: z.object({ periodId: ref, policyVersion: ref, derivationVersion: ref, sourceRefs: z.array(ref).min(1), cost: valueAmountV3 }).strict() }).strict(),
]);
export const valueReceiptV3 = candidate.superRefine((v, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  const sources = new Map(v.sources.map(s => [s.id, s]));
  if (sources.size !== v.sources.length || new Set(v.sources.map(s => s.eventId)).size !== v.sources.length) fail("Duplicate illustrative source/event identity");
  for (const s of v.sources) {
    if (v.disclosure === "prelock" && s.category === "found") fail("No found-source identifiers before lock");
    if (s.tenantId !== v.scope.tenantId || s.sessionRef !== v.scope.sessionRef || (v.scopeKind === "job" && s.jobId !== v.scope.jobId)) fail("Source scope mismatch");
    const original = s.corrects === null ? undefined : sources.get(s.corrects);
    if (s.corrects !== null && (!original || original.id === s.id || original.corrects !== null || original.category !== s.category || original.jobId !== s.jobId)) fail("Invalid direct original/correction link");
    if ((s.kind === "reversal" || s.kind === "correction") !== (s.corrects !== null)) fail("Correction requires explicit original");
    if (s.qualification !== "hypothetical_qualified" && s.feeMovement?.pence && s.feeMovement.pence > 0) fail("Nonqualifying source has positive fee movement");
  }
  for (const id of v.categories[0].sourceRefs) if (!sources.has(id)) fail("Missing checked reference");
  for (const c of [v.categories[1], v.categories[2], v.categories[3], v.categories[4]]) {
    for (const key of ["recorded", "settled", "qualifying", "fee", "remainder"] as const) {
      const amount = c[key];
      if (amount.state !== "known") continue;
      if (v.asOf.measure === "cumulative_balance" && amount.money.pence < 0) fail("Cumulative balance cannot be negative");
      if (new Set(amount.sourceRefs).size !== amount.sourceRefs.length) fail("Repeated amount reference");
      const refs = amount.sourceRefs.map(id => sources.get(id));
      if (refs.some(s => !s || s.category !== c.category)) fail("Missing or wrong-category reference");
      if (["qualifying", "fee", "remainder"].includes(key)) {
        if (amount.basis !== "net_principal") fail("Recovery illustration must be principal only");
        if (amount.money.pence > 0 && refs.some(s => s?.qualification !== "hypothetical_qualified")) fail("Nonqualifying source cannot support positive recovery/fee");
      }
    }
    if (c.qualifying.state !== "known" && (c.fee.state === "known" || c.remainder.state === "known")) fail("Unavailable qualification requires unavailable dependent values");
    if (c.fee.state === "known" && c.fee.money.pence > 0 && (c.qualifying.state !== "known" || c.qualifying.money.pence < c.fee.money.pence)) fail("Positive fee requires sufficient known qualifying principal");
    if (c.fee.state !== "known" && c.remainder.state === "known") fail("Unavailable fee requires unavailable remainder");
    if (c.category === "tracked" && c.fee.state === "known" && c.fee.money.pence !== 0) fail("Builder capture is fee free");
    if (c.qualifying.state === "known" && c.fee.state === "known" && c.remainder.state === "known" && [c.qualifying.money.pence, c.fee.money.pence, c.remainder.money.pence].every(Number.isSafeInteger) && BigInt(c.qualifying.money.pence) - BigInt(c.fee.money.pence) !== BigInt(c.remainder.money.pence)) fail("Supplied remainder mismatch");
  }
  if (new Set(v.facts.map(f => f.id)).size !== v.facts.length) fail("Duplicate fact identity");
  for (const f of v.facts) if (!sources.has(f.sourceRef)) fail("Missing factual source");
  if (v.scopeKind === "business") {
    const periodRefs = new Set(v.subscription.sourceRefs);
    if (periodRefs.size !== v.subscription.sourceRefs.length || v.subscription.sourceRefs.some(id => sources.has(id))) fail("Period sources must be unique and separate from job sources");
    if (v.subscription.cost.state === "known" && (v.subscription.cost.sourceRefs.some(id => !periodRefs.has(id)) || v.subscription.cost.money.pence < 0)) fail("Invalid supplied subscription cost references");
  }
});
export type ValueReceiptV3 = z.infer<typeof valueReceiptV3>;

/** Proposed ports only. No implementation or claim of installed producer semantics. */
export interface ProposedValueSourcesPortV3 {
  readonly binding: "held_H-VALUE-SOURCES";
  readAuthorisedSnapshot(): Promise<unknown>;
}
export interface ProposedValueDerivationPortV3 {
  readonly binding: "held_H-VALUE-SOURCES";
  readImmutableDerivation(): Promise<unknown>;
}
export function formatValueMoney(value: ValueAmountV3): string {
  const parsed = valueAmountV3.parse(value);
  if (parsed.state !== "known") return `Unavailable (${parsed.state})`;
  const pence = BigInt(parsed.money.pence), absolute = pence < 0n ? -pence : pence;
  return `${pence < 0n ? "−" : ""}£${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
}

export const VALUE_V3_LABELS = Object.freeze({
  illustration: "Illustration — proposed policy; principal only",
  remainder: "yours before VAT and tax",
  tax: "VAT not calculated in this simulation",
  net_principal: "Net principal (excluding VAT)",
  gross: "Gross (including any invoice VAT)",
  recorded: "Builder-recorded payment; bank verification not asserted",
  settled: "Supplied settled amount; source binding held",
});
