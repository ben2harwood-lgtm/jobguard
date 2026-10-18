import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterEach, expect, it, vi } from "vitest";
import { RecoveryCaseRepository, RecoveryEligibilityV3Repository } from "@jobguard/db";
import { evaluateRecoveryEligibilityV3 } from "@jobguard/core";
import { PracticeAccess } from "./practice-access.js";
import { RecoveryCaseApplication, recoveryCommandFailure } from "./recovery-case.application.js";
const { testTenantContext } = await import(new URL("../../../packages/db/test/tenant-context-test-utils.ts", import.meta.url).href);
const pool = {} as Pool, session = randomUUID(), job = randomUUID(), caseId = randomUUID();
const principal = { digest: "a".repeat(64), context: testTenantContext(randomUUID()), membershipId: randomUUID(), identityUserId: randomUUID() };
const command = () => ({ version: "recovery-eligibility-command.v3", action: "review", commandId: randomUUID(), caseId, fixture: "F16-partial", expectedCaseRevision: 2, expectedReviewRevision: 0 });
const access = () => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); vi.spyOn(PracticeAccess.prototype, "job").mockResolvedValue(principal as never); };
const candidate = (fixture: "F16-partial" | "F16-full") => ({ id: randomUUID(), revision: fixture === "F16-partial" ? 1 : 2, caseRevision: 2, sourceEventId: randomUUID(), result: evaluateRecoveryEligibilityV3({ version: "recovery-eligibility-facts.v3", environment: "synthetic_demo", tenantId: principal.context.tenantId, jobId: job, caseId, fixture, payer: "not_insurer", settlement: "settled", paymentTiming: "after_opening", sourceRef: randomUUID() }) });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
it("PF1B-A07 A07_WorkbenchAndCommandResult", async () => {
  access(); const partial = candidate("F16-partial"), full = candidate("F16-full");
  const write = vi.spyOn(RecoveryEligibilityV3Repository.prototype, "review").mockResolvedValue(partial);
  vi.spyOn(RecoveryCaseRepository.prototype, "listForMember").mockResolvedValue([{ id: caseId, eligibilityV3: full }] as never);
  const raw = command(), view = await new RecoveryCaseApplication(pool, session).eligibility(job, raw);
  expect("eligibilityV3CommandResult" in view).toBe(true);
  if (!("eligibilityV3CommandResult" in view)) throw new Error("Expected immutable v3 command result");
  expect(view.eligibilityV3CommandResult).toEqual(partial); expect(view.cases[0]?.eligibilityV3).toEqual(full);
  expect(write).toHaveBeenCalledWith(principal.context, job, raw, { membershipId: principal.membershipId, identityUserId: principal.identityUserId }, principal.digest);
});
it("PF1B-A16 A16_NoClientAuthorityFields", async () => {
  access(); const write = vi.spyOn(RecoveryEligibilityV3Repository.prototype, "review");
  for (const field of ["amount", "settlement", "documentId", "actor", "tenantId", "policyVersion"]) {
    await expect(new RecoveryCaseApplication(pool, session).eligibility(job, { ...command(), [field]: randomUUID() })).rejects.toThrow();
  }
  expect(write).not.toHaveBeenCalled();
});
it("PF1B-A17 A17_SyntheticOnly", async () => {
  const write = vi.spyOn(RecoveryEligibilityV3Repository.prototype, "review");
  for (const mode of ["production", "pilot_no_charge", "unconfigured"]) {
    vi.stubEnv("JOBGUARD_ENV", mode);
    await expect(new RecoveryCaseApplication(pool, session).eligibility(job, command())).rejects.toThrow("ELIGIBILITY_REVIEWER_FORBIDDEN");
  }
  expect(write).not.toHaveBeenCalled();
});
it("PF1B-A23 A23_PostCommitFailureRemainsUnknown", async () => {
  access(); const write = vi.spyOn(RecoveryEligibilityV3Repository.prototype, "review").mockResolvedValue(candidate("F16-partial"));
  vi.spyOn(RecoveryCaseRepository.prototype, "listForMember").mockRejectedValue(new Error("ELIGIBILITY_STALE_REVISION"));
  const application = new RecoveryCaseApplication(pool, session);
  for (const failsAfterCommit of [true, false]) {
    if (!failsAfterCommit) write.mockRejectedValue(new Error("unexpected database failure"));
    const error = await application.eligibility(job, command()).catch((e: unknown) => e);
    expect(recoveryCommandFailure(error)).toMatchObject({ status: 503, body: { code: "RECOVERY_COMMAND_OUTCOME_UNKNOWN", outcome: "unknown" } });
  }
});

it("PF1B-A23 A23_CheckedWriterReplyAndFailures", async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  const { reviewPracticeSupplierCredit } = await import(new URL("../../../packages/db/src/practice-supplier-credit-repository.ts", import.meta.url).href);
  const saved = candidate("F16-partial"), body = command();
  let databaseReply: unknown = { ...saved, payloadHash: "b".repeat(64), resultHash: "c".repeat(64), actorMembershipId: principal.membershipId, commandId: body.commandId, replayed: true };
  let databaseError: Error | undefined;
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("pf1b_review_supplier_credit")) {
      if (databaseError) throw databaseError;
      return { rows: [{ reply: databaseReply }] };
    }
    return { rows: [] };
  });
  const connect = vi.fn(async () => ({ query, release: vi.fn() }));
  const mockPool = { connect } as unknown as Pool;
  expect(await reviewPracticeSupplierCredit(mockPool, principal.context, job, body, principal.digest)).toEqual(saved);
  expect(query.mock.calls.find(([sql]) => sql.includes("pf1b_review_supplier_credit"))?.[0]).toContain("$1,$2,$3::jsonb");
  databaseReply = { ...saved, unexpectedAuthority: true };
  await expect(reviewPracticeSupplierCredit(mockPool, principal.context, job, body, principal.digest)).rejects.toThrow("PF1B_WRITER_RESULT_INVALID");
  for (const code of ["ELIGIBILITY_SUPPLIER_PAYMENT_UNAVAILABLE", "ELIGIBILITY_FIXTURE_MISMATCH", "ELIGIBILITY_STALE_REVISION"]) {
    databaseError = Object.assign(new Error(code), { code: "23514" });
    const error = await reviewPracticeSupplierCredit(mockPool, principal.context, job, body, principal.digest).catch((e: unknown) => e);
    expect(recoveryCommandFailure(error)).toMatchObject({ body: { code } });
  }
  databaseError = Object.assign(new Error("unexpected database failure"), { code: "08006" });
  const error = await reviewPracticeSupplierCredit(mockPool, principal.context, job, body, principal.digest).catch((e: unknown) => e);
  expect(recoveryCommandFailure(error)).toMatchObject({ status: 503, body: { code: "RECOVERY_COMMAND_OUTCOME_UNKNOWN" } });
});
