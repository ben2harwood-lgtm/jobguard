import { describe, expect, it } from "vitest";
import { assertClaimAmendable, assertClaimCoversSettled, assertRecoverySources, describeRecoverySource, recoveryCaseStateFullV1, recoveryEventTypeV1, transitionRecoveryCase } from "./recovery-case.js";

describe("complete recovery state machine",()=>{
 const expected = {
  identified: { assemble_evidence: "evidence_assembled", prevent: "prevented", close_no_recovery: "closed_no_recovery" },
  evidence_assembled: { start_pursuit: "pursuing", start_negotiation: "negotiating", record_landing: "partially_landed", close_no_recovery: "closed_no_recovery", dispute: "negotiating" },
  pursuing: { start_negotiation: "negotiating", record_landing: "partially_landed", close_no_recovery: "closed_no_recovery", write_off: "closed_no_recovery", dispute: "negotiating", reverse_landing: "evidence_assembled" },
  negotiating: { resume_pursuit: "pursuing", record_landing: "partially_landed", close_no_recovery: "closed_no_recovery", write_off: "closed_no_recovery", dispute: "negotiating", reverse_landing: "evidence_assembled" },
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
     : ["partially_landed", "closed_no_recovery", "pursuing", "negotiating"].includes(state) ? 100000 : 0;
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
 describe("a payment can be reversed after a dispute (M4-1-S-R repair 3, Sol P2)", () => {
  const base = { claimedPence: 250000 } as const;
  it.each(["landed", "closed_recovered"] as const)("%s -> dispute -> reverse_landing keeps exact landed accounting", from => {
   const disputed = transitionRecoveryCase({ ...base, state: from, landedPence: 250000, event: "dispute" });
   expect(disputed).toEqual({ state: "negotiating", landedPence: 250000, writtenOffPence: 0 });
   expect(transitionRecoveryCase({ ...base, state: disputed.state, landedPence: disputed.landedPence, event: "reverse_landing", amountPence: 100000 }))
    .toEqual({ state: "partially_landed", landedPence: 150000, writtenOffPence: 0 });
   expect(transitionRecoveryCase({ ...base, state: disputed.state, landedPence: disputed.landedPence, event: "reverse_landing", amountPence: 250000 }))
    .toEqual({ state: "evidence_assembled", landedPence: 0, writtenOffPence: 0 });
  });
  it("still bounds a reversal by what has actually landed, in every chasing state", () => {
   for (const state of ["pursuing", "negotiating"] as const) {
    expect(() => transitionRecoveryCase({ ...base, state, landedPence: 100000, event: "reverse_landing", amountPence: 100001 })).toThrowError(/is not allowed/);
    expect(() => transitionRecoveryCase({ ...base, state, landedPence: 0, event: "reverse_landing", amountPence: 1 })).toThrowError(/is not allowed/);
    expect(() => transitionRecoveryCase({ ...base, state, landedPence: 100000, event: "reverse_landing" })).toThrow(); // an amount is mandatory
   }
  });
  it("lets a case that resumed pursuit after a dispute still reverse the landed part", () => {
   const resumed = transitionRecoveryCase({ ...base, state: "negotiating", landedPence: 100000, event: "resume_pursuit" });
   expect(resumed.state).toBe("pursuing");
   expect(transitionRecoveryCase({ ...base, state: resumed.state, landedPence: resumed.landedPence, event: "reverse_landing", amountPence: 40000 }))
    .toMatchObject({ state: "partially_landed", landedPence: 60000 });
  });
 });

 describe("recorded sources are admitted alongside the practice catalogue (M4-1-S-R repair 3, Opus P1)", () => {
  const recordedInvoice = "7f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f", recordedRate = "11111111-2222-4333-8444-555555555555";
  it("accepts well-formed recorded ids of the right case shape without naming a label", () => {
   expect(() => assertRecoverySources({ caseType: "withheld_customer_payment", book: "builder_customer", sourceType: "customer_invoice", sourceRefs: [recordedInvoice] })).not.toThrow();
   expect(() => assertRecoverySources({ caseType: "merchant_overcharge", book: "supplier_cost", sourceType: "supplier_documents", sourceRefs: [recordedRate, recordedInvoice, "Delivery note DN-320"] })).not.toThrow();
  });
  it("still refuses malformed ids, upper-case ids, duplicates and the supplier/customer split", () => {
   const customer = { caseType: "withheld_customer_payment", book: "builder_customer", sourceType: "customer_invoice" } as const;
   for (const sourceRefs of [["not-a-uuid"], [recordedInvoice.toUpperCase()], [recordedInvoice, recordedInvoice], ["Supplier invoice INV-320"], [`${recordedInvoice} `]])
    expect(() => assertRecoverySources({ ...customer, sourceRefs })).toThrowError("RECOVERY_SOURCE_NOT_RECOGNISED");
   expect(() => assertRecoverySources({ caseType: "merchant_overcharge", book: "builder_customer", sourceType: "supplier_documents", sourceRefs: [recordedRate] })).toThrowError("RECOVERY_SOURCE_NOT_RECOGNISED");
  });
 });
 describe("prevention can never relabel money that has been received (M4-1-S-R repair 6, Sol P2)", () => {
  it("refuses prevent while any landed principal remains, from any state", () => {
   expect(() => transitionRecoveryCase({ state: "identified", event: "prevent", claimedPence: 250000, landedPence: 100000 })).toThrowError(/is not allowed/);
   expect(() => transitionRecoveryCase({ state: "identified", event: "prevent", claimedPence: 250000, landedPence: 1 })).toThrowError(/is not allowed/);
  });
  it("still prevents a case with nothing received", () => {
   expect(transitionRecoveryCase({ state: "identified", event: "prevent", claimedPence: 250000, landedPence: 0 })).toEqual({ state: "prevented", landedPence: 0, writtenOffPence: 0 });
  });
 });
 describe("a recovered closure needs the full CURRENT claim, and an amendment cannot sneak outstanding principal into a closed case (M4-1-S-R repair 9, Sol P2)", () => {
  const base = { claimedPence: 300000 } as const;
  it("refuses close_recovered unless the whole current claim has been received", () => {
   expect(() => transitionRecoveryCase({ ...base, state: "landed", landedPence: 250000, event: "close_recovered" })).toThrowError(/is not allowed/);
   expect(() => transitionRecoveryCase({ ...base, state: "landed", landedPence: 299999, event: "close_recovered" })).toThrowError(/is not allowed/);
   expect(transitionRecoveryCase({ ...base, state: "landed", landedPence: 300000, event: "close_recovered" })).toEqual({ state: "closed_recovered", landedPence: 300000, writtenOffPence: 0 });
  });
  it.each(["landed", "closed_recovered", "closed_no_recovery"] as const)("rejects an upward amendment in %s (the explicit reopen is a dispute first)", state => {
   expect(() => assertClaimAmendable({ state, currentClaimedPence: 250000, claimedPence: 300000, landedPence: 250000, writtenOffPence: 0 })).toThrowError("RECOVERY_CLAIM_AMENDMENT_ON_CLOSED_CASE");
   expect(() => assertClaimAmendable({ state, currentClaimedPence: 250000, claimedPence: 250001, landedPence: 100000, writtenOffPence: 150000 })).toThrowError("RECOVERY_CLAIM_AMENDMENT_ON_CLOSED_CASE");
  });
  it.each(["identified", "evidence_assembled", "pursuing", "negotiating", "partially_landed"] as const)("still allows an upward amendment in %s, and the settled-floor rule still applies", state => {
   expect(() => assertClaimAmendable({ state, currentClaimedPence: 250000, claimedPence: 300000, landedPence: 100000, writtenOffPence: 0 })).not.toThrow();
   expect(() => assertClaimAmendable({ state, currentClaimedPence: 250000, claimedPence: 99999, landedPence: 100000, writtenOffPence: 0 })).toThrowError("RECOVERY_CLAIM_BELOW_SETTLED");
  });
  it("allows an equal or lower amendment on a closed case as long as it still covers the settled principal", () => {
   expect(() => assertClaimAmendable({ state: "closed_recovered", currentClaimedPence: 250000, claimedPence: 250000, landedPence: 250000, writtenOffPence: 0 })).not.toThrow();
   expect(() => assertClaimAmendable({ state: "closed_no_recovery", currentClaimedPence: 250000, claimedPence: 249999, landedPence: 100000, writtenOffPence: 150000 })).toThrowError("RECOVERY_CLAIM_BELOW_SETTLED");
  });
  it("the explicit reopen path works end to end: landed -> dispute -> amend up -> land the rest -> close recovered", () => {
   const disputed = transitionRecoveryCase({ claimedPence: 250000, state: "landed", landedPence: 250000, event: "dispute" });
   expect(disputed.state).toBe("negotiating");
   expect(() => assertClaimAmendable({ state: disputed.state, currentClaimedPence: 250000, claimedPence: 300000, landedPence: 250000, writtenOffPence: 0 })).not.toThrow();
   expect(() => transitionRecoveryCase({ claimedPence: 300000, state: "negotiating", landedPence: 250000, event: "close_recovered" })).toThrowError(/is not allowed/);
   const landedRest = transitionRecoveryCase({ claimedPence: 300000, state: "negotiating", landedPence: 250000, event: "record_landing", amountPence: 50000 });
   expect(landedRest).toEqual({ state: "landed", landedPence: 300000, writtenOffPence: 0 });
   expect(transitionRecoveryCase({ claimedPence: 300000, state: landedRest.state, landedPence: landedRest.landedPence, event: "close_recovered" }).state).toBe("closed_recovered");
  });
 });
});
