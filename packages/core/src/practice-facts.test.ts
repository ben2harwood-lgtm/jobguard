import { describe, expect, it } from "vitest";
import { assessAttestedReceipt, generatedPracticeFeedEvents, practiceFeedCommandV1, practiceFeedStepV1, practiceMovementCatalogueV1, projectPracticeFeedMovements } from "./practice-feed.js";
import { assessPracticeFactsReceipt, generatedPracticeFactsEvents, practiceFactsAdapterEventV1, practiceFactsCatalogueV1, practiceFactsCommandV1, projectPracticeFactsMovements, practiceFactsLaterInvoice } from "./practice-facts.js";
const base = { version: "practice-facts-command.v1", commandId: "11111111-1111-4111-8111-111111111111", expectedRevision: 1, action: "advance", movement: "receipt-12000", step: "settled" };
const hashed = (steps: Parameters<typeof generatedPracticeFactsEvents>[1][], key: Parameters<typeof generatedPracticeFactsEvents>[0] = "receipt-12000") => steps.flatMap(step => generatedPracticeFactsEvents(key, step)).map(e => ({ ...e, sourceHash: "a".repeat(64) }));
describe("practice facts v1 additive synthetic catalogue", () => {
  it("pins all six additional facts and keeps the seven merged facts unchanged", () => {
    expect(practiceFactsCatalogueV1.map(e => [e.movement, e.grossPence, e.kind, e.fixture])).toEqual([
      ["receipt-12000",1200000,"customer_receipt","test-m"], ["receipt-14640",1464000,"customer_receipt","test-m"],
      ["supplier-payment-600",60000,"supplier_invoice_payment","later-supplier-invoice"], ["supplier-payment-840",84000,"supplier_invoice_payment","later-supplier-invoice"],
      ["receipt-interest-120",12000,"customer_receipt","F18-outside-vat"], ["receipt-compensation-70",7000,"customer_receipt","F18-outside-vat"],
    ]);
    expect(practiceMovementCatalogueV1).toHaveLength(7);
    expect(Object.isFrozen(practiceFactsCatalogueV1)).toBe(true);
    expect(practiceFactsCatalogueV1.every(Object.isFrozen)).toBe(true);
  });
  it.each(["amount","grossPence","state","settled","paid","kind","eventId","accountId","tenantId","environment","cashDuePence"])("rejects client authority %s", key => {
    expect(practiceFactsCommandV1.safeParse({ ...base, [key]: 1 }).success).toBe(false);
  });
  it("keeps command versions disjoint and supplier payments unmatchable", () => {
    expect(practiceFactsCommandV1.parse(base)).toEqual(base);
    expect(practiceFeedCommandV1.safeParse({ ...base, version: "practice-feed-command.v1" }).success).toBe(false);
    expect(practiceFactsCommandV1.safeParse({ ...base, movement: "receipt-384" }).success).toBe(false);
    expect(practiceFactsCommandV1.safeParse({ ...base, action: "match_receipt", step: undefined, movement: "supplier-payment-600", paymentId: base.commandId }).success).toBe(false);
  });
  it.each(practiceFeedStepV1.options)("reuses merged event semantics for %s", step => {
    for (const entry of practiceFactsCatalogueV1) {
      const actual = generatedPracticeFactsEvents(entry.movement,step), merged = generatedPracticeFeedEvents("receipt-384",step);
      expect(actual.map(({eventKind,state,identity,representationId}) => ({eventKind,state,identity,representationId}))).toEqual(merged.map(({eventKind,state,identity,representationId}) => ({eventKind,state,identity,representationId})));
      for (const e of actual) { expect(practiceFactsAdapterEventV1.parse(e)).toEqual(e); expect(e.grossPence).toBe(entry.grossPence); expect(e.eventId).toBe(`${e.eventKind}-${entry.movement}`); expect(practiceFactsAdapterEventV1.safeParse({...e,grossPence:e.grossPence+1}).success).toBe(false); }
    }
  });
  it("holds duplicates, deduplicates pages and representations, and never allocates", () => {
    const events = hashed(["pending","settled","replay","page_overlap","alternate_representation","unknown_duplicate"]);
    const held = projectPracticeFactsMovements("account",events,[]);
    expect(held).toHaveLength(2); expect(held.every(e=>!e.eligibleForAllocation)).toBe(true);
    const clear = projectPracticeFactsMovements("account",events,["receipt-12000"]);
    expect(clear).toHaveLength(1); expect(clear[0]).toMatchObject({id:"account:receipt-12000",underlyingMovementId:"receipt-12000",eligibleForAllocation:true,allocatedEligibleNetPence:0,state:"settled",grossPence:1200000});
    expect(new Set(clear[0]!.eventIds).size).toBe(4);
  });
  it("returns every merged receipt assessment status and reason for equivalent states", () => {
    const receipt = {paymentId:"pay",amountPence:1200000,currency:"GBP" as const,reversed:false};
    const scenarios = [[],["pending"],["settled"],["settled","unknown_duplicate"]] as const;
    for (const steps of scenarios) for (const reversed of [false,true]) for (const holder of [null,"pay","other"] as const) for (const paymentReversed of [false,true]) {
      const ours = assessPracticeFactsReceipt({...receipt,reversed},projectPracticeFactsMovements("a",hashed([...steps]),[]),holder?[{paymentId:holder,movementKey:"receipt-12000",paymentReversed}]:[]);
      const merged = assessAttestedReceipt({...receipt,amountPence:38400,reversed},projectPracticeFeedMovements("a",steps.flatMap(s=>generatedPracticeFeedEvents("receipt-384",s)).map(e=>({...e,sourceHash:"a".repeat(64)})),[]),holder?[{paymentId:holder,movementKey:"receipt-384",paymentReversed}]:[]);
      expect({status:ours.status,reason:ours.reason,canMatch:ours.canMatch}).toEqual({status:merged.status,reason:merged.reason,canMatch:merged.canMatch});
    }
    expect(assessPracticeFactsReceipt({...receipt,amountPence:60000},[],[]).reason).toBe("no_generated_amount");
  });
  it("derives £1,440 due from only the two unheld supplier payments through exact pence", () => {
    const a=hashed(["settled"],"supplier-payment-600"), b=hashed(["settled"],"supplier-payment-840");
    expect(practiceFactsLaterInvoice([])).toEqual({fixture:"later-supplier-invoice",cashDuePence:144000,settledPence:0,state:"unpaid"});
    expect(practiceFactsLaterInvoice(projectPracticeFactsMovements("a",a,[]))).toMatchObject({settledPence:60000,state:"part_paid"});
    expect(practiceFactsLaterInvoice(projectPracticeFactsMovements("a",b,[]))).toMatchObject({settledPence:84000,state:"part_paid"});
    expect(practiceFactsLaterInvoice(projectPracticeFactsMovements("a",[...a,...b],[]))).toMatchObject({settledPence:144000,state:"paid_in_full"});
    expect(practiceFactsLaterInvoice(projectPracticeFactsMovements("a",[...a,...b,...hashed(["unknown_duplicate"],"supplier-payment-840")],[]))).toMatchObject({settledPence:60000,state:"part_paid"});
  });
});
