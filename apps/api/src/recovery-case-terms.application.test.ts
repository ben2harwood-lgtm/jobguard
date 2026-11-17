// Written first; application mocks prove routing and mode checks, not database guarantees.
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterEach, expect, it, vi } from "vitest";
import { RecoveryCaseTermsRepository, RecoveryCaseTermsError } from "@jobguard/db";
import { recoveryCaseTermsHash } from "@jobguard/core";
import { requireApprovedDecision, proposedDecisionRecords } from "@jobguard/config";
import { PracticeAccess } from "./practice-access.js";
import { RecoveryCaseApplication, recoveryCommandFailure } from "./recovery-case.application.js";
import { recoveryMessageFailure } from "./recovery-message.errors.js";
const pool=()=>({query:vi.fn().mockRejectedValue(new Error("DATABASE_UNAVAILABLE"))}) as unknown as Pool;
const body=()=>{const caseId=randomUUID();return {version:"recovery-case-terms-command.v1",action:"approve",commandId:randomUUID(),caseId,termsVersion:"synthetic_recovery_fee_terms.v1",feePolicyVersion:"reference_fee_policy_v3",eligibilityPolicyVersion:"reference_recovery_eligibility_policy_v3",termsHash:recoveryCaseTermsHash(caseId)};};
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});
it("[T1] uses the authenticated practice principal and returns the repository approval",async()=>{
 vi.stubEnv("JOBGUARD_ENV","synthetic_demo");const principal={context:{tenantId:randomUUID()},digest:"a".repeat(64),membershipId:randomUUID(),identityUserId:randomUUID()};
 vi.spyOn(PracticeAccess.prototype,"job").mockResolvedValue(principal as never);
 const approved={id:randomUUID()};const save=vi.spyOn(RecoveryCaseTermsRepository.prototype,"approve").mockResolvedValue(approved as never);
 const raw=body(),job=randomUUID();expect(await new RecoveryCaseApplication(pool(),randomUUID()).terms(job,()=>Promise.resolve(raw))).toEqual(approved);
 expect(save).toHaveBeenCalledWith(principal.context,job,raw,{membershipId:principal.membershipId,identityUserId:principal.identityUserId});
});
it.each([undefined,"production_billing","pilot_no_charge","provider_sandbox"])("[T9] refuses %s before reading JSON, membership or storage",async mode=>{
 if(mode===undefined)vi.stubEnv("JOBGUARD_ENV","");else vi.stubEnv("JOBGUARD_ENV",mode);
 const access=vi.spyOn(PracticeAccess.prototype,"job"),save=vi.spyOn(RecoveryCaseTermsRepository.prototype,"approve"),raw=vi.fn();
 await expect(new RecoveryCaseApplication(pool(),randomUUID()).terms(randomUUID(),raw)).rejects.toThrow("ELIGIBILITY_REVIEWER_FORBIDDEN");
 expect(access).not.toHaveBeenCalled();expect(save).not.toHaveBeenCalled();expect(raw).not.toHaveBeenCalled();
});
it.each([undefined,"not-a-session"])("[T2] refuses missing or malformed practice session %s",async session=>{
 vi.stubEnv("JOBGUARD_ENV","synthetic_demo");const save=vi.spyOn(RecoveryCaseTermsRepository.prototype,"approve");
 await expect(new RecoveryCaseApplication(pool(),session).terms(randomUUID(),body())).rejects.toThrow("UNAUTHENTICATED");expect(save).not.toHaveBeenCalled();
});
it("[T9] proposed D01 remains locked before and after a case agreement",async()=>{
 const locked=()=>expect(()=>requireApprovedDecision("production_billing","D01",proposedDecisionRecords.D01)).toThrow(expect.objectContaining({code:"POLICY_GATE_DENIED"}));
 locked();vi.stubEnv("JOBGUARD_ENV","synthetic_demo");vi.spyOn(PracticeAccess.prototype,"job").mockResolvedValue({context:{tenantId:randomUUID()},digest:"a".repeat(64),membershipId:randomUUID(),identityUserId:randomUUID()} as never);
 vi.spyOn(RecoveryCaseTermsRepository.prototype,"approve").mockResolvedValue({id:randomUUID()} as never);
 await new RecoveryCaseApplication(pool(),randomUUID()).terms(randomUUID(),body());locked();
});
it.each([["RECOVERY_TERMS_FORBIDDEN",403],["RECOVERY_TERMS_CASE_NOT_FOUND",404],["RECOVERY_TERMS_COMMAND_CONFLICT",409],["RECOVERY_TERMS_NOT_APPLICABLE",409],["RECOVERY_TERMS_POLICY_MISMATCH",409],["RECOVERY_TERMS_ALREADY_APPROVED",409],["RECOVERY_TERMS_AUTHORIZATION_INVALID",409]] as const)("[T3] maps %s to %i",(code,status)=>{expect(recoveryCommandFailure(new RecoveryCaseTermsError(code))).toMatchObject({status,body:{code}});});
it("[T5] exposes the pursuit refusal as 409",()=>{expect(recoveryMessageFailure(new Error("RECOVERY_TERMS_NOT_APPROVED"))).toEqual({status:409,code:"RECOVERY_TERMS_NOT_APPROVED"});});
it("[T3] strict parsing precedes the repository after authorized JSON loading",async()=>{
 vi.stubEnv("JOBGUARD_ENV","synthetic_demo");vi.spyOn(PracticeAccess.prototype,"job").mockResolvedValue({context:{tenantId:randomUUID()},digest:"a".repeat(64),membershipId:randomUUID(),identityUserId:randomUUID()} as never);const save=vi.spyOn(RecoveryCaseTermsRepository.prototype,"approve");
 for(const raw of [{...body(),tenantId:randomUUID()},()=>Promise.reject(new SyntaxError("bad JSON"))]){const failure=await new RecoveryCaseApplication(pool(),randomUUID()).terms(randomUUID(),raw).catch(e=>e);expect(recoveryCommandFailure(failure)).toMatchObject({status:400,body:{code:"INVALID_COMMAND"}});}expect(save).not.toHaveBeenCalled();
});
it("[T12] new contract and appended migration record state the lock and Q1 limit",async()=>{
 const {readFile}=await import("node:fs/promises");const notes=await Promise.all(["../../../docs/contracts/recovery-case-terms-v1.md","../../../packages/db/MIGRATIONS.md"].map(path=>readFile(new URL(path,import.meta.url),"utf8")));
 for(const note of notes)for(const sentence of ["A builder's agreement to the proposed fee terms for a case is not approval of the fee policy and authorises no charge.","Chasing a withheld payment on a job that is not bound to the v3 fee policy is NOT guarded by this order."])expect(note).toContain(sentence);
});
