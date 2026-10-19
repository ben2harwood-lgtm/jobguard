import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterEach, expect, it, vi } from "vitest";
import { RecoveryCaseRepository, RecoveryEligibilityV3Repository } from "@jobguard/db";
import { PracticeAccess } from "./practice-access.js";
import { RecoveryCaseApplication, recoveryCommandFailure } from "./recovery-case.application.js";
import { evaluateRecoveryEligibilityV3 } from "@jobguard/core";
// Load the existing stamped test helper at test runtime. A static cross-package source import
// would pull DB source outside the API compiler root and emit beside those source files.
const { testTenantContext } = await import(new URL("../../../packages/db/test/tenant-context-test-utils.ts", import.meta.url).href);
const pool={} as Pool,session=randomUUID(),job=randomUUID(),caseId=randomUUID();
const principal={digest:"a".repeat(64),context:testTenantContext(randomUUID()),membershipId:randomUUID(),identityUserId:randomUUID()};
const command=()=>({version:"recovery-eligibility-command.v3",action:"review",commandId:randomUUID(),caseId,fixture:"F18",expectedCaseRevision:2,expectedReviewRevision:0});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});
it("routes v3 through the shared service with server-selected membership and session digest",async()=>{
 vi.stubEnv("JOBGUARD_ENV","synthetic_demo");vi.spyOn(PracticeAccess.prototype,"job").mockResolvedValue(principal as never);
 const write=vi.spyOn(RecoveryEligibilityV3Repository.prototype,"review").mockResolvedValue({id:randomUUID()} as never);
 vi.spyOn(RecoveryCaseRepository.prototype,"listForMember").mockResolvedValue([{id:caseId}] as never);
 const raw=command(),read=vi.fn().mockResolvedValue(raw);const result=await new RecoveryCaseApplication(pool,session).eligibility(job,read);
 expect(write).toHaveBeenCalledWith(principal.context,job,raw,{membershipId:principal.membershipId,identityUserId:principal.identityUserId},principal.digest);
 expect(read).toHaveBeenCalledTimes(1);expect(result.affectedCaseId).toBe(caseId);
});
it("authorizes before reading JSON and rejects missing or foreign sessions before effects",async()=>{
 vi.stubEnv("JOBGUARD_ENV","synthetic_demo");vi.spyOn(PracticeAccess.prototype,"job").mockRejectedValue(new Error("UNAUTHENTICATED"));
 const read=vi.fn(),write=vi.spyOn(RecoveryEligibilityV3Repository.prototype,"review");
 await expect(new RecoveryCaseApplication(pool,session).eligibility(job,read)).rejects.toThrow("UNAUTHENTICATED");expect(read).not.toHaveBeenCalled();expect(write).not.toHaveBeenCalled();
});
it.each(["production","pilot_no_charge"])("refuses v3 in %s",async mode=>{
 vi.stubEnv("JOBGUARD_ENV",mode);const write=vi.spyOn(RecoveryEligibilityV3Repository.prototype,"review");
 await expect(new RecoveryCaseApplication(pool,session).eligibility(job,command())).rejects.toThrow("ELIGIBILITY_REVIEWER_FORBIDDEN");expect(write).not.toHaveBeenCalled();
});
it.each([{Q:262000},{category:"withheld_customer_payment"},{debtorType:"business"},{settlement:"settled"},{termsStatus:"approved"}])("rejects client authority %j",async field=>{
 vi.stubEnv("JOBGUARD_ENV","synthetic_demo");vi.spyOn(PracticeAccess.prototype,"job").mockResolvedValue(principal as never);const write=vi.spyOn(RecoveryEligibilityV3Repository.prototype,"review");
 await expect(new RecoveryCaseApplication(pool,session).eligibility(job,{...command(),...field})).rejects.toThrow();expect(write).not.toHaveBeenCalled();
});
it("a saved v3 write whose read fails stays outcome-unknown",async()=>{
 vi.stubEnv("JOBGUARD_ENV","synthetic_demo");vi.spyOn(PracticeAccess.prototype,"job").mockResolvedValue(principal as never);
 vi.spyOn(RecoveryEligibilityV3Repository.prototype,"review").mockResolvedValue({id:randomUUID()} as never);vi.spyOn(RecoveryCaseRepository.prototype,"listForMember").mockRejectedValue(new Error("ELIGIBILITY_STALE_REVISION"));
 await expect(new RecoveryCaseApplication(pool,session).eligibility(job,command())).rejects.toMatchObject({code:"RECOVERY_COMMAND_OUTCOME_UNKNOWN"});
});
it("replays the immutable v3 command result when the workbench has a newer candidate",async()=>{
 vi.stubEnv("JOBGUARD_ENV","synthetic_demo");vi.spyOn(PracticeAccess.prototype,"job").mockResolvedValue(principal as never);
 const original={id:randomUUID(),revision:1,caseRevision:2,sourceEventId:randomUUID(),result:evaluateRecoveryEligibilityV3({version:"recovery-eligibility-facts.v3",environment:"synthetic_demo",tenantId:principal.context.tenantId,jobId:job,caseId,fixture:"F18",payer:"not_insurer",termsTiming:"before_settlement",settlement:"settled",paymentTiming:"after_opening",sourceRef:randomUUID()})};
 vi.spyOn(RecoveryEligibilityV3Repository.prototype,"review").mockResolvedValue(original);
 vi.spyOn(RecoveryCaseRepository.prototype,"listForMember").mockResolvedValue([{id:caseId,eligibilityV3:{...original,id:randomUUID(),revision:2}}] as never);
 const service=new RecoveryCaseApplication(pool,session),raw=command();
 const first=await service.eligibility(job,raw),replay=await service.eligibility(job,raw);
 expect(first).toMatchObject({eligibilityV3CommandResult:original});expect(replay).toMatchObject({eligibilityV3CommandResult:original});
 expect(replay.cases[0]?.eligibilityV3?.revision).toBe(2);
});
it.each(["ELIGIBILITY_SOURCE_REQUIRED","ELIGIBILITY_FIXTURE_MISMATCH","ELIGIBILITY_SUPPLIER_PAYMENT_UNAVAILABLE"])("%s is a typed pre-effect refusal",code=>{
 expect(recoveryCommandFailure(Object.assign(new Error(code),{code}))).toMatchObject({status:400,body:{code}});
});
it("the v1 repository's plain ELIGIBILITY_FIXTURE_MISMATCH for a duplicate-payment case is the same typed pre-effect refusal",()=>{
 expect(recoveryCommandFailure(new Error("ELIGIBILITY_FIXTURE_MISMATCH"))).toMatchObject({status:400,body:{code:"ELIGIBILITY_FIXTURE_MISMATCH"}});
});
