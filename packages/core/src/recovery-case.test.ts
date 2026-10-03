import { describe, expect, it } from "vitest";
import { assertClaimCoversSettled, assertRecoverySources, describeRecoverySource, recoveryCaseStateFullV1, recoveryEventTypeV1, transitionRecoveryCase } from "./recovery-case.js";

describe("complete recovery state machine",()=>{
 const expected = {
  identified: { assemble_evidence: "evidence_assembled", prevent: "prevented", close_no_recovery: "closed_no_recovery" },
  evidence_assembled: { start_pursuit: "pursuing", start_negotiation: "negotiating", record_landing: "partially_landed", close_no_recovery: "closed_no_recovery", dispute: "negotiating" },
  pursuing: { start_negotiation: "negotiating", record_landing: "partially_landed", close_no_recovery: "closed_no_recovery", write_off: "closed_no_recovery", dispute: "negotiating" },
  negotiating: { resume_pursuit: "pursuing", record_landing: "partially_landed", close_no_recovery: "closed_no_recovery", write_off: "closed_no_recovery", dispute: "negotiating" },
  partially_landed: { record_landing: "partially_landed", write_off: "closed_no_recovery", dispute: "negotiating", reverse_landing: "evidence_assembled" },
  landed: { close_recovered: "closed_recovered", dispute: "negotiating", reverse_landing: "partially_landed" },
  closed_recovered: { dispute: "negotiating", reverse_landing: "partially_landed" },
  closed_no_recovery: { dispute: "negotiating", reverse_landing: "evidence_assembled" },
  prevented: {},
 };
 for (const state of recoveryCaseStateFullV1.options) {
  for (const event of recoveryEventTypeV1.options) {
   it(`${state} / ${event} has an explicit allowed or forbidden result`, () => {
    const landedPence = ["landed", "closed_recovered"].includes(state) ? 250000
     : ["partially_landed", "closed_no_recovery"].includes(state) ? 100000 : 0;
    const run = () => transitionRecoveryCase({ state, event, claimedPence: 250000, landedPence, amountPence: 100000 });
    const next = (expected[state] as Record<string, string>)[event];
    if (!next) expect(run).toThrowError(/is not allowed/);
    else expect(run()).toEqual({ state: next,
     landedPence: landedPence + (event === "record_landing" ? 100000 : event === "reverse_landing" ? -100000 : 0),
     writtenOffPence: event === "write_off" ? 250000 - landedPence : 0 });
   });
  }
 }
 it.each(["partially_landed", "closed_no_recovery"] as const)("reopens %s after partial and total reversal", state => {
  expect(transitionRecoveryCase({state,event:"reverse_landing",claimedPence:250000,landedPence:100000,amountPence:40000})).toMatchObject({state:"partially_landed",landedPence:60000});
  expect(transitionRecoveryCase({state,event:"reverse_landing",claimedPence:250000,landedPence:100000,amountPence:100000})).toMatchObject({state:"evidence_assembled",landedPence:0});
 });
 it("allows a direct receipt only after evidence and closes only after disposition",()=>{expect(()=>transitionRecoveryCase({state:"identified",event:"record_landing",claimedPence:250000,landedPence:0,amountPence:100000})).toThrow();expect(transitionRecoveryCase({state:"evidence_assembled",event:"record_landing",claimedPence:250000,landedPence:0,amountPence:100000})).toEqual({state:"partially_landed",landedPence:100000,writtenOffPence:0});expect(transitionRecoveryCase({state:"partially_landed",event:"write_off",claimedPence:250000,landedPence:100000})).toEqual({state:"closed_no_recovery",landedPence:100000,writtenOffPence:150000});});
 it("reopens landed value on reversal and makes prevention terminal",()=>{expect(transitionRecoveryCase({state:"closed_recovered",event:"reverse_landing",claimedPence:250000,landedPence:250000,amountPence:100000}).state).toBe("partially_landed");for(const event of recoveryEventTypeV1.options)expect(()=>transitionRecoveryCase({state:"prevented",event,claimedPence:1,landedPence:0,amountPence:1})).toThrow();});
 describe("write-off accounting survives reversal and re-landing (M4-1-S HOLD finding 5)", () => {
  const base = { claimedPence: 250000 } as const;
  it("records only the not-yet-written-off remainder, so event amounts can be summed", () => {
   // 100k landed, 150k written off (closed), 40k later reversed -> 60k landed, 40k outstanding.
   expect(transitionRecoveryCase({ ...base, state: "partially_landed", landedPence: 60000, writtenOffPence: 150000, event: "write_off" }))
    .toEqual({ state: "closed_no_recovery", landedPence: 60000, writtenOffPence: 40000 });
  });
  it("refuses a write-off when nothing is outstanding", () => {
   expect(() => transitionRecoveryCase({ ...base, state: "partially_landed", landedPence: 100000, writtenOffPence: 150000, event: "write_off" })).toThrowError(/is not allowed/);
  });
  it("bounds a later landing by claimed minus written-off, not by claimed", () => {
   const common = { ...base, state: "evidence_assembled", landedPence: 0, writtenOffPence: 150000, event: "record_landing" } as const;
   expect(transitionRecoveryCase({ ...common, amountPence: 100000 })).toEqual({ state: "partially_landed", landedPence: 100000, writtenOffPence: 0 });
   expect(() => transitionRecoveryCase({ ...common, amountPence: 100001 })).toThrowError(/is not allowed/);
   expect(() => transitionRecoveryCase({ ...common, landedPence: 100000, amountPence: 1, state: "partially_landed" })).toThrowError(/is not allowed/);
  });
  it("rejects an impossible history instead of clamping it", () => {
   expect(() => transitionRecoveryCase({ ...base, state: "partially_landed", landedPence: 200000, writtenOffPence: 100000, event: "dispute" })).toThrowError(/is not allowed/);
  });
  it("never lets an amended claim fall below landed plus written-off", () => {
   expect(() => assertClaimCoversSettled({ claimedPence: 250000, landedPence: 100000, writtenOffPence: 150000 })).not.toThrow();
   expect(() => assertClaimCoversSettled({ claimedPence: 249999, landedPence: 100000, writtenOffPence: 150000 })).toThrowError("RECOVERY_CLAIM_BELOW_SETTLED");
  });
 });
 describe("case sources come from a closed server catalogue (M4-1-S HOLD finding 6)", () => {
  const supplier = { caseType: "merchant_overcharge", book: "supplier_cost", sourceType: "supplier_documents" } as const;
  const customer = { caseType: "withheld_customer_payment", book: "builder_customer", sourceType: "customer_invoice" } as const;
  it("accepts only catalogued sources that match the case's book and source type", () => {
   expect(() => assertRecoverySources({ ...supplier, sourceRefs: ["Supplier agreement AG-320", "Delivery note DN-320", "Supplier invoice INV-320"] })).not.toThrow();
   expect(() => assertRecoverySources({ ...customer, sourceRefs: ["Generated customer invoice INV-18800"] })).not.toThrow();
   expect(() => assertRecoverySources({ caseType: "prevention", book: "builder_customer", sourceType: "customer_invoice", sourceRefs: ["Generated customer invoice INV-18800"] })).not.toThrow();
  });
  it("rejects invented labels, duplicates, and a supplier case citing customer debt (or the reverse)", () => {
   for (const bad of [
    { ...supplier, sourceRefs: ["Totally real supplier contract"] },
    { ...supplier, sourceRefs: ["Supplier invoice INV-320", "Supplier invoice INV-320"] },
    { ...supplier, sourceRefs: ["Generated customer invoice INV-18800"] },
    { ...customer, sourceRefs: ["Supplier invoice INV-320"] },
    { ...customer, book: "supplier_cost", sourceRefs: ["Generated customer invoice INV-18800"] },
    { ...supplier, caseType: "withheld_customer_payment", sourceRefs: ["Supplier invoice INV-320"] },
   ] as const) expect(() => assertRecoverySources(bad)).toThrowError("RECOVERY_SOURCE_NOT_RECOGNISED");
  });
  it("names the kind of every catalogued source and nothing else", () => {
   expect(describeRecoverySource("Delivery note DN-320")).toEqual({ ref: "Delivery note DN-320", kind: "Delivery note", sourceType: "supplier_documents" });
   expect(describeRecoverySource("Anything else")).toBeUndefined();
  });
 });
});
