import { describe, expect, it } from "vitest";
import { commandOutcome, customerSourceRefs, lostAnswer, merchantSourceRefs, parseCustomerInvoices, parseSupplierSources, readList, refusalText, saveFailure, unreadableAnswer } from "./recovery-case-requests";

const CASE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", CASE_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const view = (id: string) => ({
  id, jobId: "11111111-1111-4111-8111-111111111111", caseType: "withheld_customer_payment", state: "identified", claimedNetPence: 32000, landedNetPence: 0, outstandingNetPence: 32000, writtenOffPence: 0, currency: "GBP",
  counterparty: "Fictional Customer", book: "builder_customer", sourceType: "customer_invoice", sourceRefs: ["x"], sources: [{ ref: "x", kind: "Customer invoice", label: "x", recorded: false }],
  feeJobLiabilityPence: 0, feeObligationsPostedPence: 0, feeCompensationsPostedPence: 0, approvedLandedNetPence: 0, revision: 1, reviewerRef: "membership:fictional", createdDate: "2026-10-05", eligibility: null,
});
const envelope = { version: "recovery-case-workbench.v1", environment: "synthetic_demo", realExternalActions: 0 };
const good = { ...envelope, cases: [view(CASE_A), view(CASE_B)], affectedCaseId: CASE_B };

describe("commandOutcome (M4-1-S-R repair 13, Sol P2-2 and P3-4): only a confirmed outcome ends an attempt", () => {
  it("a valid success that names a listed case is SAVED", () => {
    const outcome = commandOutcome({ status: 200, body: good });
    expect(outcome.kind).toBe("saved");
    if (outcome.kind === "saved") expect(outcome.response.affectedCaseId).toBe(CASE_B);
  });
  it("no answer at all is UNKNOWN (the request may have reached the server)", () => {
    expect(commandOutcome(undefined)).toEqual({ kind: "unknown", message: lostAnswer });
    expect(lostAnswer).toContain("may or may not have been saved");
  });
  it.each([
    ["not an object", null], ["an empty object", {}], ["a list", []], ["no affected case id", { ...good, affectedCaseId: undefined }],
    ["an affected case id that is not listed", { ...good, affectedCaseId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }], ["an affected case id that is not an id", { ...good, affectedCaseId: "nope" }],
    ["cases that are null", { ...good, cases: null }], ["the wrong version", { ...good, version: "recovery-case-workbench.v2" }], ["text", "ok"],
  ])("a 2xx whose body is %s is UNKNOWN, never a selection", (_name, body) => {
    expect(commandOutcome({ status: 200, body })).toEqual({ kind: "unknown", message: unreadableAnswer });
    expect(commandOutcome({ status: 201, body })).toEqual({ kind: "unknown", message: unreadableAnswer });
  });
  it.each([500, 502, 503, 504, 0, 302])("a %i is UNKNOWN, whatever its body says (a command can commit and then fail, or a gateway can answer for a server that did the work)", status => {
    expect(commandOutcome({ status, body: { code: "SOMETHING", message: "Internal server error" } })).toEqual({ kind: "unknown", message: unreadableAnswer });
    expect(commandOutcome({ status, body: undefined })).toEqual({ kind: "unknown", message: unreadableAnswer });
  });
  it("words a refusal from its message, else its code, else a plain sentence", () => {
    expect(refusalText({ message: "Receipt is not allowed", code: "X" })).toBe("Receipt is not allowed");
    expect(refusalText({ code: "X" })).toBe("X");
    expect(refusalText({ message: "", code: "" })).toBe(saveFailure);
    expect(refusalText(null)).toBe(saveFailure);
    expect(refusalText("text")).toBe(saveFailure);
  });
});

describe("repair 16: only a validated recovery error with its expected status settles a refusal", () => {
  const beforeReplay = [
    ["INVALID_COMMAND", 400], ["UNAUTHENTICATED", 401], ["MEMBERSHIP_FORBIDDEN", 403],
    ["RECOVERY_REVIEWER_FORBIDDEN", 403], ["ELIGIBILITY_REVIEWER_FORBIDDEN", 403], ["JOB_NOT_FOUND", 404],
  ] as const;
  const reversibleAfterReplay = [
    ["RECOVERY_JOB_NOT_FOUND", 404], ["RECOVERY_CASE_NOT_FOUND", 404], ["ELIGIBILITY_REVIEW_NOT_FOUND", 404],
    ["RECOVERY_STALE_REVISION", 409], ["ELIGIBILITY_STALE_REVISION", 409],
    ["RECOVERY_SOURCE_NOT_RECOGNISED", 400], ["RECOVERY_TRANSITION_FORBIDDEN", 400],
    ["RECOVERY_CLAIM_BELOW_SETTLED", 400],
  ] as const;
  const permanentAfterReplay = [
    ["RECOVERY_CLAIM_AMENDMENT_ON_CLOSED_CASE", 400], ["ELIGIBILITY_REVIEW_REQUIRED", 409], ["ELIGIBILITY_NOT_APPROVABLE", 400],
  ] as const;
  it.each(beforeReplay)("%s/%i settles the first attempt, but a retry cannot establish the earlier outcome", (code, status) => {
    expect(commandOutcome({ status, body: { code } })).toEqual({ kind: "refused", message: code });
    expect(commandOutcome({ status, body: { code, message: "Access refused" } })).toEqual({ kind: "refused", message: "Access refused" });
    const retry = commandOutcome({ status, body: { code } }, true);
    expect(retry.kind).toBe("unknown");
    if (retry.kind === "unknown") {
      expect(retry.message).toContain(code);
      expect(retry.message).toContain("may or may not have been saved");
    }
  });
  it.each(permanentAfterReplay)("%s/%i permanently prevents the identical command, for a first attempt and a retry", (code, status) => {
    for (const retry of [false, true]) {
      expect(commandOutcome({ status, body: { code } }, retry)).toEqual({ kind: "refused", message: code });
      expect(commandOutcome({ status, body: { code, message: "Command refused" } }, retry)).toEqual({ kind: "refused", message: "Command refused" });
    }
  });
  it.each(reversibleAfterReplay)("repair 17: %s/%i refuses a first attempt but cannot settle an unfinished original on retry", (code, status) => {
    for (const body of [{code}, {code,message:"Command refused"}]) {
      expect(commandOutcome({status,body})).toEqual({kind:"refused",message:refusalText(body)});
      const retry = commandOutcome({status,body}, true);
      expect(retry.kind).toBe("unknown");
      if(retry.kind!=="unknown")throw new Error("Retry must stay unknown");
      expect(retry.message).toContain("may or may not have been saved");
      expect(retry.message).toContain(refusalText(body));
    }
  });
  it("the known payload conflict settles both attempts for the current fixed synthetic membership", () => {
    for (const retry of [false, true]) expect(commandOutcome({ status: 409, body: { code: "IDEMPOTENCY_PAYLOAD_CONFLICT" } }, retry)).toEqual({ kind: "refused", message: "IDEMPOTENCY_PAYLOAD_CONFLICT" });
  });
  it.each([...beforeReplay, ...reversibleAfterReplay, ...permanentAfterReplay, ["IDEMPOTENCY_PAYLOAD_CONFLICT", 409] as const])("%s cannot settle under a different status than %i", (code, status) => {
    for (const otherStatus of [400, 401, 403, 404, 408, 409, 422, 429, 500, 503].filter(value => value !== status)) {
      for (const retry of [false, true]) expect(commandOutcome({ status: otherStatus, body: { code } }, retry), `${code}/${otherStatus}, retry=${retry}`).toEqual({ kind: "unknown", message: unreadableAnswer });
    }
  });
  it.each([400, 401, 403, 404, 408, 409, 422, 429, 499, 500, 502, 503, 504])("an unclassified or unreadable %i remains unknown on the first attempt and retry", status => {
    for (const body of [undefined, null, {}, [], "gateway page", { message: "Timed out" }, { code: "REQUEST_TIMEOUT" }, { code: 409 }, { code: "RECOVERY_STALE_REVISION", message: 42 }]) {
      for (const retry of [false, true]) expect(commandOutcome({ status, body }, retry)).toEqual({ kind: "unknown", message: unreadableAnswer });
    }
  });
});

describe("recorded-source lookups (M4-1-S-R repair 13, Sol P3-3): every row is checked", () => {
  const RATE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc", VERSION = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const material = { rateId: RATE, quantity: "40", eachPence: 2000 }, fact = { document_number: "INV-M320-001", version_id: VERSION };
  it("a null row, a missing field or a field of the wrong type fails the whole lookup", () => {
    const facts = { state: { facts: [fact] } }, materials = { materials: [material] };
    expect(parseSupplierSources(materials, facts)).toBeDefined();
    for (const rows of [[null], [{}], [material, null], [{ ...material, quantity: 40 }], [{ ...material, rateId: 7 }], [{ ...material, eachPence: "2000" }]]) expect(parseSupplierSources({ materials: rows }, facts), JSON.stringify(rows)).toBeUndefined();
    for (const rows of [[null], [{}], [fact, null], [{ document_number: "INV-M320-001" }], [{ ...fact, version_id: 7 }], [{ ...fact, document_number: undefined }]]) expect(parseSupplierSources(materials, { state: { facts: rows } }), JSON.stringify(rows)).toBeUndefined();
    expect(parseSupplierSources(null, facts)).toBeUndefined();
    expect(parseSupplierSources(materials, undefined)).toBeUndefined();
  });
  it("a material without an applicable rate (null rate id) and a supplier document without a number (null) are valid rows", () => {
    expect(parseSupplierSources({ materials: [{ quantity: "10", rateId: null }] }, { state: { facts: [{ document_number: null, version_id: VERSION }] } })).toBeDefined();
  });
  it("customer invoices need a recorded id on every row", () => {
    expect(parseCustomerInvoices({ invoices: [{ id: CASE_A }, { id: CASE_B, number: "B" }] })).toEqual([{ id: CASE_A }, { id: CASE_B }]);
    for (const invoices of [[null], [{}], [{ id: "" }], [{ id: 5 }], [{ id: "x" }], [{ id: CASE_A }, null]]) expect(parseCustomerInvoices({ invoices }), JSON.stringify(invoices)).toBeUndefined();
    expect(parseCustomerInvoices({})).toBeUndefined();
    expect(parseCustomerInvoices(null)).toBeUndefined();
  });
  it("the practice pickers keep their fixed fallbacks and choose the matching recorded sources otherwise", () => {
    const sources = (materials: object[], facts: object[]) => parseSupplierSources({ materials }, { state: { facts } })!;
    expect(merchantSourceRefs(sources([material], [fact]))).toEqual([RATE, VERSION]);
    expect(merchantSourceRefs(sources([], []))).toEqual(["Supplier agreement AG-320", "Delivery note DN-320", "Supplier invoice INV-320"]);
    expect(merchantSourceRefs(sources([material, { ...material, rateId: CASE_A }], [fact]))).toEqual(["Supplier agreement AG-320", "Delivery note DN-320", "Supplier invoice INV-320"]);
    expect(customerSourceRefs([{ id: CASE_A }, { id: CASE_B }])).toEqual([CASE_B]);
    expect(customerSourceRefs([])).toEqual(["Generated customer invoice INV-18800"]);
  });
});

it.each([-1, 1_000_000_000_001, 2 ** 53])("repair 15: invalid principal %s is unknown on a command and fails a list", value => {
 const body = {...good,cases:[{...view(CASE_B),approvedLandedNetPence:value}]};
 expect(commandOutcome({status:200,body})).toEqual({kind:"unknown",message:unreadableAnswer});
 expect(readList(body)).toBeUndefined();
});
