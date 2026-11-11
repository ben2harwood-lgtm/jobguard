import { describe, expect, it } from "vitest";
import { derivePracticeNextStep } from "./practice-next-step";

type Facts = Parameters<typeof derivePracticeNextStep>[0];
const invoice = (changes = {}) => ({ id: "invoice-1", totalPence: 108000, balancePence: 108000,
  customerCreditPence: 0, paidPence: 0, creditedPence: 0, ...changes });
const saved = (changes: Partial<Facts> = {}): Facts => ({
  job: { id: "job-1", status: "live", scopeIdentityIds: ["scope-1"] },
  quote: { jobId: "job-1", draft: { currentRevisionId: "quote-1" } },
  delivery: { status: "simulated_delivery" },
  proof: { jobId: "job-1", completion: { id: "proof-1", reviewRequired: false } },
  variations: { jobId: "job-1", variations: [] },
  account: { jobId: "job-1", account: null },
  lock: { jobId: "job-1", lock: null },
  check: { state: "unlocked" },
  invoices: { jobId: "job-1", invoices: [] }, ...changes,
});
const locked = (changes: Partial<Facts> = {}): Facts => saved({
  account: { jobId: "job-1", account: { id: "account-1", issueBlocked: false } },
  lock: { jobId: "job-1", lock: { id: "lock-1" } },
  check: { state: "completed", lockId: "lock-1" }, ...changes,
});
const variation = (state: string, currentRevisionId: string | null, revisions = [
  { id: "old", approved: true, rejected: false },
  { id: "current", approved: false, rejected: false },
]) => ({ state, currentRevisionId, revisions });
const next = (facts: Facts) => derivePracticeNextStep(facts).nextStep;

describe("saved practice next step", () => {
  it("distinguishes missing scope, quote preparation, acceptance and activation", () => {
    expect(next(saved({ job: { id: "job-1", status: "draft", scopeIdentityIds: [] } }))).toBe("confirm_scope");
    const job = { id: "job-1", status: "quoting" as const, scopeIdentityIds: ["scope-1"] };
    expect(next(saved({ job, quote: { jobId: "job-1", draft: null } }))).toBe("prepare_quote");
    expect(next(saved({ job, delivery: null }))).toBe("prepare_quote");
    expect(next(saved({ job }))).toBe("record_acceptance");
    expect(next(saved({ job: { ...job, status: "accepted" } }))).toBe("activate_job");
    expect(next(saved({ job: { ...job, status: "lost" } }))).toBe("review_quote");
  });
  it("distinguishes unavailable reads from successful empty reads", () => {
    for (const key of ["job", "proof", "variations", "account", "lock", "invoices"] as const) {
      expect(derivePracticeNextStep(saved({ [key]: undefined }))).toMatchObject({ nextStep: "unavailable", completion: "unavailable" });
    }
    expect(next(saved())).toBe("review_account");
  });
  it.each([null, { id: "proof-1", reviewRequired: true }])("keeps incomplete or invalidated proof on the proof step: %j", completion => {
    expect(next(saved({ proof: { jobId: "job-1", completion } }))).toBe("complete_proof");
  });
  it.each([
    variation("draft", null), variation("priced", "current"), variation("approved", "current"),
  ])("does not reuse historical approval for an unresolved extra: %j", extra => {
    expect(next(saved({ variations: { jobId: "job-1", variations: [extra] } }))).toBe("resolve_extras");
  });
  it.each([
    variation("approved", "current", [{ id: "current", approved: true, rejected: false }]),
    variation("rejected", "current", [{ id: "current", approved: false, rejected: true }]),
    variation("withdrawn", null),
  ])("allows current approval, rejection or withdrawal without inventing extras: %j", extra => {
    expect(next(saved({ variations: { jobId: "job-1", variations: [extra] } }))).toBe("review_account");
  });
  it("evaluates every extra, including an unapproved changed revision", () => {
    expect(next(saved({ variations: { jobId: "job-1", variations: [
      variation("approved", "old"), variation("priced", "current"),
    ] } }))).toBe("resolve_extras");
  });
  it("holds unknown states and missing current revisions unavailable", () => {
    for (const extra of [variation("unknown", null), variation("approved", "missing"),
      variation("approved", "old", [{ id: "old", approved: true, rejected: true }]),
      variation("rejected", "current")]) {
      expect(next(saved({ variations: { jobId: "job-1", variations: [extra] } }))).toBe("unavailable");
    }
  });
  it("requires account review and the real completed check before issuance", () => {
    expect(next(saved({ account: { jobId: "job-1", account: { id: "account-1", issueBlocked: true } } }))).toBe("review_account");
    for (const state of ["pending", "failed"] as const) {
      expect(derivePracticeNextStep(locked({ check: { state, lockId: "lock-1" } }))).toMatchObject({ nextStep: "final_check", completion: "incomplete" });
      expect(next(locked({ check: { state, lockId: "lock-1" }, invoices: { jobId: "job-1", invoices: [invoice({ balancePence: 0, paidPence: 108000 })] } }))).toBe("final_check");
    }
    expect(next(locked({ check: undefined }))).toBe("unavailable");
    expect(next(locked({ check: { state: "completed", lockId: "other-lock" } }))).toBe("unavailable");
    expect(next(locked())).toBe("issue_invoice");
  });
  it.each([
    [invoice(), "record_payment", "incomplete", "unpaid"],
    [invoice({ balancePence: 54000, paidPence: 54000 }), "record_payment", "incomplete", "part_paid"],
    [invoice({ balancePence: 0, paidPence: 108000 }), "complete", "paid", "paid"],
    [invoice({ balancePence: 0, paidPence: 54000, creditedPence: 54000 }), "complete", "credit_assisted", "paid"],
    [invoice({ balancePence: 0, creditedPence: 108000 }), "complete", "credit_only", "credited"],
    [invoice({ totalPence: 0, balancePence: 0 }), "complete", "zero_value", "zero_balance"],
  ])("preserves payment provenance: %j", (fact, nextStep, completion, paymentState) => {
    expect(derivePracticeNextStep(locked({ invoices: { jobId: "job-1", invoices: [fact] } })))
      .toMatchObject({ nextStep, completion, payment: { state: paymentState } });
  });
  it("finishes multiple settled invoices with their cash and credit provenance", () => {
    const paid = invoice({ balancePence: 0, paidPence: 108000 });
    const credited = invoice({ id: "invoice-2", balancePence: 0, creditedPence: 108000 });
    expect(derivePracticeNextStep(locked({ invoices: { jobId: "job-1", invoices: [paid, credited] } })))
      .toMatchObject({ nextStep: "complete", completion: "credit_assisted" });
    expect(derivePracticeNextStep(locked({ invoices: { jobId: "job-1", invoices: [paid, { ...paid, id: "invoice-2" }] } })))
      .toMatchObject({ nextStep: "complete", completion: "paid" });
  });
  it("considers every invoice and reopens payment after reversal, regardless of job status", () => {
    const paid = invoice({ balancePence: 0, paidPence: 108000 });
    expect(next(locked({ invoices: { jobId: "job-1", invoices: [invoice(), { ...paid, id: "invoice-2" }] } }))).toBe("record_payment");
    const job = { id: "job-1", status: "paid" as const, scopeIdentityIds: ["scope-1"] };
    expect(next(locked({ job, invoices: { jobId: "job-1", invoices: [paid] } }))).toBe("complete");
    expect(next(locked({ job, invoices: { jobId: "job-1", invoices: [invoice()] } }))).toBe("record_payment");
  });
  it.each([
    invoice({ balancePence: 0 }), invoice({ balancePence: 0, paidPence: undefined }),
    invoice({ creditedPence: undefined }), invoice({ totalPence: -1 }), invoice({ paidPence: 1.1 }),
  ])("refuses inconsistent or unknown financial facts: %j", fact => {
    expect(next(locked({ invoices: { jobId: "job-1", invoices: [fact] } }))).toBe("unavailable");
  });
  it("refuses duplicate invoices and wrong-job saved facts", () => {
    expect(next(locked({ invoices: { jobId: "job-1", invoices: [invoice(), invoice()] } }))).toBe("unavailable");
    for (const key of ["quote", "proof", "variations", "account", "lock", "invoices"] as const) {
      const facts = locked();
      expect(next({ ...facts, [key]: { ...facts[key], jobId: "other-job" } })).toBe("unavailable");
    }
  });
  it("walk 2 saved facts select the no-extra account and paid end states", () => {
    expect(next(saved())).toBe("review_account");
    expect(derivePracticeNextStep(locked({ invoices: { jobId: "job-1", invoices: [invoice({ balancePence: 0, paidPence: 108000 })] } })))
      .toMatchObject({ nextStep: "complete", completion: "paid" });
    // There is deliberately no feePrepared or fee-illustration input.
  });
});
