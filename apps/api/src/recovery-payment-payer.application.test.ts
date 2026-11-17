// Application mocks prove dispatch and HTTP contracts; PostgreSQL proves persistence.
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterEach, expect, it, vi } from "vitest";
import { RecoveryPaymentPayerRepository, RecoveryCaseRepository, RecoveryEligibilityV3Repository } from "@jobguard/db";
import { PracticeAccess } from "./practice-access.js";
import { RecoveryCaseApplication, recoveryCommandFailure } from "./recovery-case.application.js";
const pool = {} as Pool;
const principal = { context: { tenantId: randomUUID() }, digest: "a".repeat(64), membershipId: randomUUID(), identityUserId: randomUUID() };
const body = () => ({ version: "recovery-payment-payer-command.v1", action: "mark_customer_own", commandId: randomUUID(), caseId: randomUUID(), sourceEventId: randomUUID(), expectedMarkRevision: 0, evidenceId: randomUUID() });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
it("[A7] authenticates before reading JSON and dispatches the mark with an additive reply", async () => {
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
 const calls: string[] = [], input = body(), job = randomUUID();
 vi.spyOn(PracticeAccess.prototype, "job").mockImplementation(async () => { calls.push("authenticated"); return principal as never; });
 const result = { id: randomUUID(), revision: 1, sourceEventId: input.sourceEventId, state: "customer_own", evidenceId: input.evidenceId } as const;
 const save = vi.spyOn(RecoveryPaymentPayerRepository.prototype, "command").mockResolvedValue(result);
 vi.spyOn(RecoveryCaseRepository.prototype, "listForMember").mockResolvedValue([]);
 const reply = await new RecoveryCaseApplication(pool, randomUUID()).eligibility(job, () => { calls.push("json"); return input; });
 expect(calls).toEqual(["authenticated", "json"]);
 expect(save).toHaveBeenCalledWith(principal.context, job, input, { membershipId: principal.membershipId, identityUserId: principal.identityUserId }, principal.digest);
 expect(reply).toEqual({ version: "recovery-case-workbench.v1", environment: "synthetic_demo", realExternalActions: 0, cases: [], affectedCaseId: input.caseId, paymentPayerMarkCommandResult: result });
});
it.each([["PAYER_MARK_FORBIDDEN",403],["PAYER_MARK_STALE_REVISION",409],["PAYER_MARK_STATE_CONFLICT",409],["PAYER_MARK_SOURCE_REQUIRED",400],["PAYER_MARK_NOT_CUSTOMER_PAYMENT",400],["PAYER_MARK_NOT_INSURER_JOB",400],["PAYER_MARK_EVIDENCE_REQUIRED",400]] as const)("[A7 DB12] maps %s to %i", (code, status) => {
 expect(recoveryCommandFailure(new Error(code))).toMatchObject({ status, body: { code } });
});
it("[A7 DB13] deferred audit failure remains an unknown outcome", () => {
 expect(recoveryCommandFailure(new Error("PAYER_MARK_AUDIT_REQUIRED"))).toMatchObject({ status: 503, body: { code: "RECOVERY_COMMAND_OUTCOME_UNKNOWN" } });
});
it("[A7 DB12] denies authorization before JSON and refuses invalid command fields", async () => {
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
 const json = vi.fn(), save = vi.spyOn(RecoveryPaymentPayerRepository.prototype, "command");
 const access = vi.spyOn(PracticeAccess.prototype, "job").mockRejectedValue(new Error("UNAUTHENTICATED"));
 await expect(new RecoveryCaseApplication(pool).eligibility(randomUUID(), json)).rejects.toThrow("UNAUTHENTICATED");
 expect(json).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled();
 access.mockResolvedValue(principal as never);
 const failure = await new RecoveryCaseApplication(pool).eligibility(randomUUID(), { ...body(), tenantId: randomUUID() }).catch(e => e);
 expect(recoveryCommandFailure(failure)).toMatchObject({ status: 400, body: { code: "INVALID_COMMAND" } });
 expect(save).not.toHaveBeenCalled();
});

it("[A6 A7 Round2] v3 refuses client payer facts before calling the repository",async()=>{
 vi.stubEnv("JOBGUARD_ENV","synthetic_demo");vi.spyOn(PracticeAccess.prototype,"job").mockResolvedValue(principal as never);
 const write=vi.spyOn(RecoveryEligibilityV3Repository.prototype,"review"),job=randomUUID();
 const input={version:"recovery-eligibility-command.v3",action:"review",commandId:randomUUID(),caseId:randomUUID(),expectedCaseRevision:2,expectedReviewRevision:0,fixture:"F18",payer:"insurer_customer_own"};
 const failure=await new RecoveryCaseApplication(pool,randomUUID()).eligibility(job,input).catch(error=>error);
 expect(recoveryCommandFailure(failure)).toMatchObject({status:400,body:{code:"INVALID_COMMAND"}});expect(write).not.toHaveBeenCalled();
});
