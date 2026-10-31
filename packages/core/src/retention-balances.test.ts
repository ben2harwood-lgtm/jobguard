import { describe, expect, it } from "vitest";
import { MAX_MONEY_PENCE } from "./money.js";
import {
  appendRetentionRecord, reconcileRetentionBook, assertRetentionIssueAllowed, RETENTION_BALANCES_ENABLED,
  RETENTION_REVIEW_OWNER, RetentionError, type RetentionBook, type RetentionRecord,
} from "./retention-balances.js";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const tenantId = id(1), jobId = id(2);
const base = (n: number) => ({ id: id(n), tenantId, jobId });
const amount = (netPence: number, taxPence = 0) => ({ netPence, taxPence });
const humanSource = { actorId: id(3), inputId: id(4) };
const source = { kind: "contract_profile" as const, profileVersion: "fictional-contract-v1", clause: "fictional-retention" };
const profile = () => ({
  ...base(10), version: "retention.profile.v1" as const, revision: 1, previousProfileId: null,
  contractProfileVersion: "fictional-contract-v1", fixtureApprovalId: id(5), taxTreatmentVersion: "fictional-tax-v1",
  retained: amount(10000, 2000), alreadyBilled: amount(1000, 200),
  conditions: [
    { id: id(6), milestone: "completion" as const, description: "Fictional completion confirmed", source,
      dueDate: "2026-11-01", dateSource: source, cumulativeLimit: amount(5000, 1000) },
    { id: id(7), milestone: "defects" as const, description: "Fictional defects resolved", source,
      dueDate: "2027-11-01", dateSource: source, cumulativeLimit: amount(10000, 2000) },
  ],
});
function empty(): RetentionBook {
  return { version: "retention.book.v1", environment: "synthetic", tenantId, jobId, records: [] };
}
const append = (book: RetentionBook, ...records: RetentionRecord[]) => records.reduce(appendRetentionRecord, book);
const review = (n = 20, profileId = 10, conditionId = 6) => ({
  ...base(n), version: "retention.review.v1" as const, profileId: id(profileId), conditionId: id(conditionId),
  owner: RETENTION_REVIEW_OWNER, trigger: "timer" as const, raisedOn: "2027-11-01",
});
const resolution = (n = 30, reviewId = 20, net = 2000, tax = 400) => ({
  ...base(n), version: "retention.resolution.v1" as const, reviewId: id(reviewId), outcome: "approved" as const,
  conditionSatisfied: true, humanSource, amount: amount(net, tax),
});
const release = (n = 40, resolutionId = 30) => ({ ...base(n), version: "retention.release.v1" as const, resolutionId: id(resolutionId) });
const receipt = (n = 50, grossPence = 2400) => ({ ...base(n), version: "retention.receipt.v1" as const, releaseId: id(40), grossPence });
const reversal = (n = 60, grossPence = 1000) => ({ ...base(n), version: "retention.reversal.v1" as const, receiptId: id(50), grossPence });
function revised(n = 11, previous = 10, revision = 2) {
  return { ...profile(), ...base(n), revision, previousProfileId: id(previous) };
}
const released = () => append(empty(), profile(), review(), resolution(), release());
function expectCode(run: () => unknown, code: string) {
  try { run(); throw new Error("Expected rejection"); }
  catch (error) { expect(error).toBeInstanceOf(RetentionError); expect(error).toMatchObject({ code }); }
}

describe("M4-20 dark retention balances", () => {
  it("reconciles part releases and final retention separately from already billed amounts", () => {
    let book = released();
    expect(reconcileRetentionBook(book)).toMatchObject({
      retained: amount(10000, 2000), alreadyBilled: amount(1000, 200), released: amount(2000, 400), remaining: amount(7000, 1400),
    });
    // A fresh sourced profile revision permits review of the remaining part of the completion tranche.
    book = append(book, revised(), review(21, 11), resolution(31, 21), release(41, 31),
      review(22, 11, 7), resolution(32, 22, 5000, 1000), release(42, 32));
    expect(reconcileRetentionBook(book)).toMatchObject({ released: amount(9000, 1800), remaining: amount(0), feeEligibleRecovery: { pence: 0 } });
    expectCode(() => append(book, revised(12, 11, 3), review(23, 12, 7), resolution(33, 23, 1, 0), release(43, 33)), "VALUE_LIMIT");
    expect(book.records.filter(record => record.version.includes("invoice"))).toEqual([]);
  });
  it("a due timer only raises one unresolved review and never satisfies a condition", () => {
    const book = append(empty(), profile(), review());
    expect(reconcileRetentionBook(book)).toMatchObject({ released: amount(0), pendingReviewIds: [id(20)] });
    expectCode(() => append(book, release()), "MISSING_SOURCE");
    expectCode(() => append(book, { ...resolution(), conditionSatisfied: false }), "CONDITION_UNMET");
    expectCode(() => append(book, review(21)), "REPLAY_CONFLICT");
    expect(append(book, review()).records).toHaveLength(2);
    expectCode(() => append(empty(), profile(), { ...review(), raisedOn: "2026-10-31" }), "CONDITION_UNMET");
  });
  it.each([0, 1])("changed milestone date %s invalidates reviews and unconsumed approvals", index => {
    const initial = append(empty(), profile(), review(20, 10, index === 0 ? 6 : 7), resolution());
    const next = revised();
    next.conditions[index]!.dueDate = "2028-01-10";
    next.conditions[index]!.dateSource = source;
    const book = append(initial, next);
    expectCode(() => append(book, release()), "STALE_PROFILE");
    expectCode(() => append(book, { ...resolution(31), reviewId: id(20) }), "STALE_PROFILE");
    expect(reconcileRetentionBook(book).pendingReviewIds).toEqual([]);
    expectCode(() => append(book, review(21, 11, index === 0 ? 6 : 7)), "CONDITION_UNMET");
    const refreshed = append(book, { ...review(21, 11, index === 0 ? 6 : 7), raisedOn: "2028-01-10" }, resolution(31, 21), release(41, 31));
    expect(reconcileRetentionBook(refreshed).released).toEqual(amount(2000, 400));
  });
  it("preserves consumed releases across date changes and never makes them releaseable again", () => {
    const next = revised(); next.conditions[0]!.dueDate = "2028-01-10";
    const book = append(released(), next);
    expect(reconcileRetentionBook(book).released).toEqual(amount(2000, 400));
    expectCode(() => append(book, { ...review(21, 11), raisedOn: "2028-01-10" }, resolution(31, 21, 2001, 400), release(41, 31)), "VALUE_LIMIT");
  });
  it("reverses cash append-only without reopening released or billed retention", () => {
    const first = released(), before = JSON.stringify(first);
    let book = append(first, receipt(), reversal());
    expect(reconcileRetentionBook(book)).toMatchObject({
      grossReceived: { pence: 1400 }, grossReleasedOutstanding: { pence: 1000 },
      released: amount(2000, 400), remaining: amount(7000, 1400), feeEligibleRecovery: { pence: 0 },
    });
    book = append(book, reversal(61, 1400), receipt(51));
    expect(reconcileRetentionBook(book).grossReleasedOutstanding.pence).toBe(0);
    expectCode(() => append(book, reversal(62, 1)), "VALUE_LIMIT");
    expectCode(() => append(book, release(41)), "REPLAY_CONFLICT");
    expect(JSON.stringify(first)).toBe(before);
    expect(book.records.slice(0, first.records.length)).toEqual(first.records);
  });
  it("bounds tax and principal independently and includes opening billed retention", () => {
    expectCode(() => append(empty(), profile(), review(), resolution(30, 20, 4001, 0), release()), "VALUE_LIMIT");
    expectCode(() => append(empty(), profile(), review(), resolution(30, 20, 1, 801), release()), "VALUE_LIMIT");
    expectCode(() => append(empty(), { ...profile(), alreadyBilled: amount(10001) }), "VALUE_LIMIT");
    expectCode(() => append(released(), receipt(50, 2401)), "VALUE_LIMIT");
    expectCode(() => append(released(), reversal()), "MISSING_SOURCE");
    expectCode(() => append(released(), { ...receipt(), releaseId: id(99) }), "MISSING_SOURCE");
  });
  it.each(["rejected", "deferred"] as const)("%s reviews cannot release value", outcome => {
    const book = append(empty(), profile(), review(), { ...resolution(), outcome, conditionSatisfied: false, amount: amount(0) });
    expectCode(() => append(book, release()), "CONDITION_UNMET");
    expectCode(() => append(book, resolution(31)), "REPLAY_CONFLICT");
    expectCode(() => append(empty(), profile(), review(), { ...resolution(), outcome }), "VALUE_LIMIT");
  });
  it("rejects zero approvals and double release under fresh identities", () => {
    expectCode(() => append(empty(), profile(), review(), resolution(30, 20, 0, 0)), "CONDITION_UNMET");
    expectCode(() => append(released(), release(41)), "REPLAY_CONFLICT");
    expectCode(() => append(empty(), profile(), { ...review(), profileId: id(99) }), "STALE_PROFILE");
    expectCode(() => append(empty(), profile(), { ...review(), conditionId: id(99) }), "MISSING_SOURCE");
  });
  it("requires sourced contract conditions and dates without guessing terms", () => {
    const humanProfile = profile();
    const human = { kind: "human_input" as const, ...humanSource };
    const book = appendRetentionRecord(empty(), { ...humanProfile, conditions: humanProfile.conditions.map(c => ({ ...c, source: human, dateSource: human })) });
    expect(book.records).toHaveLength(1);
    for (const field of ["source", "dateSource"] as const) {
      expectCode(() => appendRetentionRecord(empty(), { ...profile(), conditions: [{ ...profile().conditions[1], [field]: undefined }] }), "INVALID_INPUT");
      expectCode(() => appendRetentionRecord(empty(), { ...profile(), conditions: [{ ...profile().conditions[1], [field]: { ...source, profileVersion: "unknown" } }] }), "MISSING_SOURCE");
    }
    expectCode(() => appendRetentionRecord(empty(), { ...profile(), taxTreatmentVersion: "" }), "INVALID_INPUT");
    expectCode(() => appendRetentionRecord(empty(), { ...profile(), conditions: [{ ...profile().conditions[0], dueDate: "2026-02-30" }] }), "INVALID_INPUT");
  });
  it("validates cumulative limits and rejects rewritten opening balances or terms", () => {
    const first = profile();
    expectCode(() => append(empty(), { ...first, conditions: first.conditions.slice(0, 1) }), "VALUE_LIMIT");
    expectCode(() => append(empty(), { ...first, conditions: [...first.conditions].reverse() }), "VALUE_LIMIT");
    expectCode(() => append(empty(), { ...first, conditions: [first.conditions[1]!, first.conditions[1]!] }), "INVALID_INPUT");
    expectCode(() => append(released(), { ...revised(), retained: amount(11000, 2000) }), "VALUE_LIMIT");
    expectCode(() => append(released(), { ...revised(), alreadyBilled: amount(0) }), "STALE_PROFILE");
    expectCode(() => append(released(), { ...revised(), taxTreatmentVersion: "other" }), "STALE_PROFILE");
    expectCode(() => append(empty(), { ...first, revision: 2 }), "STALE_PROFILE");
  });
  it.each(["tenantId", "jobId"] as const)("rejects cross-context %s on append, replay and import", field => {
    expectCode(() => append(released(), { ...release(), [field]: id(99) }), "REPLAY_CONFLICT");
    expectCode(() => append(empty(), { ...profile(), [field]: id(99) }), "CONTEXT_MISMATCH");
    expectCode(() => reconcileRetentionBook({ ...released(), [field]: id(99) }), "CONTEXT_MISMATCH");
  });
  it("rejects conflicting identities and duplicate imported histories", () => {
    expect(append(released(), release())).toEqual(released());
    expectCode(() => append(released(), { ...release(), resolutionId: id(99) }), "REPLAY_CONFLICT");
    expectCode(() => reconcileRetentionBook({ ...empty(), records: [profile(), profile()] }), "REPLAY_CONFLICT");
    expectCode(() => reconcileRetentionBook({ ...empty(), records: [review()] }), "MISSING_SOURCE");
  });
  it("copies and freezes imported fixtures and roundtrips the entire review history", () => {
    const first = profile(), book = append(empty(), first, review(), resolution(), release());
    first.conditions[0]!.dueDate = "2030-01-01";
    expect(book.records[0]).toMatchObject({ conditions: [{ dueDate: "2026-11-01" }, { dueDate: "2027-11-01" }] });
    expect(Object.isFrozen(book.records)).toBe(true);
    expect(reconcileRetentionBook(JSON.parse(JSON.stringify(book)))).toEqual(reconcileRetentionBook(book));
  });
  it("fails closed for production, extra authority fields, unsupported versions and unsafe money", () => {
    expectCode(() => reconcileRetentionBook({ ...empty(), environment: "production" }), "INVALID_INPUT");
    expectCode(() => appendRetentionRecord(empty(), { ...profile(), version: "retention.profile.v2" }), "INVALID_INPUT");
    expectCode(() => appendRetentionRecord(released(), { ...receipt(), feeEligible: true }), "INVALID_INPUT");
    expectCode(() => appendRetentionRecord(empty(), { ...review(), owner: "other-timer" }), "INVALID_INPUT");
    for (const value of [-1, 0.1, MAX_MONEY_PENCE + 1, Number.NaN]) {
      expectCode(() => append(empty(), { ...profile(), retained: amount(value) }), "INVALID_INPUT");
    }
    expect(() => append(empty(), { ...profile(), retained: amount(MAX_MONEY_PENCE, 1), alreadyBilled: amount(MAX_MONEY_PENCE, 1) })).toThrow("Money result exceeds");
    expect(RETENTION_BALANCES_ENABLED).toBe(false);
    expectCode(assertRetentionIssueAllowed, "ISSUE_DISABLED");
    expect(reconcileRetentionBook(released()).issueBlockers).toContain("DURABLE_ADAPTER_REQUIRED");
  });
});
