import type { ValueReceiptV3, ValueAmountV3 } from "./value-v3.js";

// Illustrative inputs ONLY. These supplied fee values are hypothetical SV-6 outputs,
// not computed fees, settlements, source completeness proofs or DEMO end-state seeds.
const amount = (pence: number, sourceRefs: string[], basis: "net_principal" | "gross" = "net_principal"): ValueAmountV3 => ({ state: "known", money: { pence, currency: "GBP" }, basis, sourceRefs });
const unknown = (): ValueAmountV3 => ({ state: "unknown", reason: "not_reported" });
type Source = ValueReceiptV3["sources"][number];
function source(id: string, category: Source["category"], qualification: Source["qualification"] = "hypothetical_qualified"): Source {
  return { id, eventId: `illustrative:${id}`, revision: 1, tenantId: "tenant", jobId: "job", sessionRef: "session", category,
    qualification, kind: "snapshot", corrects: null, occurredAt: "2026-10-20T12:00:00Z",
    policyVersion: "reference_fee_policy_v3", derivationVersion: "hypothetical-sv6-output.v1", netMovement: null, feeMovement: null };
}
function blank(): ValueReceiptV3 {
  const empty = <T extends "tracked" | "found" | "supplier" | "withheld">(category: T) => ({ category, recorded: unknown(), settled: unknown(), qualifying: unknown(), fee: unknown(), remainder: unknown() });
  return { version: "value-receipt.v3", environment: "synthetic_demo", evidence: "illustrative_unbound", disclosure: "prelock", scopeKind: "job", scope: { tenantId: "tenant", jobId: "job", sessionRef: "session" },
    asOf: { vector: [{ producer: "hypothetical-sv6", revision: "example-only-1" }], timeContract: "proposed_unbound", window: null, measure: "cumulative_balance" },
    categories: [{ category: "checked", count: 0, sourceRefs: [] }, empty("tracked"), empty("found"), empty("supplier"), empty("withheld")], sources: [], facts: [] };
}
function recovery(principal: number, fee: number): ValueReceiptV3 {
  const v = blank();
  v.sources.push(source("withheld", "withheld", principal === 0 ? "unpaid" : "hypothetical_qualified"));
  v.categories[4] = { category: "withheld", recorded: unknown(), settled: principal === 0 ? unknown() : amount(principal, ["withheld"]), qualifying: amount(principal, ["withheld"]), fee: amount(fee, ["withheld"]), remainder: amount(principal - fee, ["withheld"]) };
  return v;
}
const recovered = recovery(282000, 28200);
const reversed = recovery(32000, 3200);
reversed.sources.push({ ...source("withheld-reversal", "withheld"), kind: "reversal", corrects: "withheld", netMovement: { pence: -250000, currency: "GBP" }, feeMovement: { pence: -25000, currency: "GBP" }, occurredAt: "2026-11-01T00:00:00Z" });
reversed.sources[0]!.netMovement = { pence: 282000, currency: "GBP" };
reversed.sources[0]!.feeMovement = { pence: 28200, currency: "GBP" };
for (const key of ["settled", "qualifying", "fee", "remainder"] as const) {
  const a = reversed.categories[4][key];
  if (a.state === "known") a.sourceRefs.push("withheld-reversal");
}
const shadow = blank();
shadow.disclosure = "after_lock";
shadow.sources.push(source("capture", "tracked", "builder_capture"), source("final-check", "found"));
shadow.categories[1] = { category: "tracked", recorded: amount(360000, ["capture"]), settled: unknown(), qualifying: amount(0, ["capture"]), fee: amount(0, ["capture"]), remainder: amount(0, ["capture"]) };
shadow.categories[2] = { category: "found", recorded: unknown(), settled: amount(80000, ["final-check"]), qualifying: amount(80000, ["final-check"]), fee: amount(8000, ["final-check"]), remainder: amount(72000, ["final-check"]) };
const core = blank();
const coreFacts = [
  ["invoice-net", "invoice", 110000, "net_principal"], ["invoice-gross", "invoice", 132000, "gross"],
  ["extra", "approved_variation", 12500, "net_principal"], ["reduction", "approved_variation", -2500, "net_principal"],
  ["pending", "unapproved_variation", 5000, "net_principal"], ["payment-500", "recorded_payment", 50000, "gross"],
  ["payment-820", "recorded_payment", 82000, "gross"], ["payment-reversal", "payment_reversal", -82000, "gross"],
  ["invoice-correction", "invoice_correction", -10000, "net_principal"],
] as const;
for (const [id, kind, pence, basis] of coreFacts) {
  const s = source(id, "tracked", kind === "unapproved_variation" ? "unapproved" : "builder_capture");
  s.kind = "recorded";
  if (kind === "payment_reversal") { s.kind = "reversal"; s.corrects = "payment-820"; }
  if (kind === "invoice_correction") { s.kind = "correction"; s.corrects = "invoice-net"; }
  core.sources.push(s);
  core.facts.push({ id: `fact:${id}`, sourceRef: id, kind, amount: { pence, currency: "GBP" }, basis });
}
export const illustrativeValueCases = {
  recovery: recovered, reversed, shadow, fiveHundred: recovery(50000, 5000), zero: recovery(0, 0), core,
};
