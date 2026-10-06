import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterEach, expect, it, vi } from "vitest";
import { DEMO_IDENTITY_USER_ID, DEMO_MEMBERSHIP_ID, RecoveryCaseRepository } from "@jobguard/db";
import { RecoveryCaseApplication, recoveryReadFailure } from "./recovery-case.application.js";

afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});
const command=()=>({version:"recovery-eligibility-command.v1",action:"review",commandId:randomUUID(),caseId:randomUUID(),expectedCaseRevision:2,evidenceRevision:1,policyVersion:"reference-d03.v1",policyRevision:1,scenario:"evidence_backed_withheld_payment"});
it("passes the server-selected synthetic membership for database verification, never a reviewer literal",async()=>{
 vi.stubEnv("JOBGUARD_ENV","synthetic_demo");
 const persist=vi.spyOn(RecoveryCaseRepository.prototype,"eligibilityCommand").mockResolvedValue({id:randomUUID()} as never);
 vi.spyOn(RecoveryCaseRepository.prototype,"listForMember").mockResolvedValue([]);
 const body=command(),job=randomUUID();
 await new RecoveryCaseApplication({} as Pool).eligibility(job,body,randomUUID());
 expect(persist).toHaveBeenCalledWith(expect.anything(),job,body,{membershipId:DEMO_MEMBERSHIP_ID,identityUserId:DEMO_IDENTITY_USER_ID});
});
it.each([undefined,"not-a-session"])("rejects absent or malformed session %s before a write",async session=>{
 vi.stubEnv("JOBGUARD_ENV","synthetic_demo");
 const persist=vi.spyOn(RecoveryCaseRepository.prototype,"eligibilityCommand").mockResolvedValue(undefined as never);
 await expect(new RecoveryCaseApplication({} as Pool).eligibility(randomUUID(),command(),session)).rejects.toThrow("UNAUTHENTICATED");
 expect(persist).not.toHaveBeenCalled();
});
it.each(["production","pilot_no_charge"])("refuses synthetic reviewer authority in %s",async mode=>{
 vi.stubEnv("JOBGUARD_ENV",mode);
 const persist=vi.spyOn(RecoveryCaseRepository.prototype,"eligibilityCommand").mockResolvedValue(undefined as never);
 await expect(new RecoveryCaseApplication({} as Pool).eligibility(randomUUID(),command(),randomUUID())).rejects.toThrow("ELIGIBILITY_REVIEWER_FORBIDDEN");
 expect(persist).not.toHaveBeenCalled();
});
// M4-1-S-R repair 10 (Sol P2): the real readSyntheticDemoJob boundary guards the read, not only the writes (no mock of it here).
it.each(["production", "pilot_no_charge"])("refuses to list cases in %s before it reads anything", async mode => {
 vi.stubEnv("JOBGUARD_ENV",mode);
 const list=vi.spyOn(RecoveryCaseRepository.prototype,"listForMember").mockResolvedValue([]);
 await expect(new RecoveryCaseApplication({} as Pool).list(randomUUID())).rejects.toThrow("MEMBERSHIP_FORBIDDEN");
 expect(list).not.toHaveBeenCalled();
});
it("lists nothing when the membership and job lookup itself cannot be completed", async () => {
 vi.stubEnv("JOBGUARD_ENV","synthetic_demo");
 const list=vi.spyOn(RecoveryCaseRepository.prototype,"listForMember").mockResolvedValue([]);
 await expect(new RecoveryCaseApplication({} as Pool).list(randomUUID())).rejects.toThrow("DATABASE_UNAVAILABLE");
 expect(list).not.toHaveBeenCalled();
});
// M4-1-S-R repair 11 (Sol P2-5): an eligibility command also names the case it affected.
it("returns the id of the case an eligibility command affected, as the repository returned it",async()=>{
 vi.stubEnv("JOBGUARD_ENV","synthetic_demo");
 const affected=randomUUID(),later=randomUUID();
 vi.spyOn(RecoveryCaseRepository.prototype,"eligibilityCommand").mockResolvedValue({id:affected} as never);
 vi.spyOn(RecoveryCaseRepository.prototype,"listForMember").mockResolvedValue([{id:affected},{id:later}] as never);
 const response=await new RecoveryCaseApplication({} as Pool).eligibility(randomUUID(),command(),randomUUID());
 expect(response.affectedCaseId).toBe(affected);
});

it("an eligibility command that committed cannot turn its answer-read failure into a refusal", async () => {
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
 const persist = vi.spyOn(RecoveryCaseRepository.prototype, "eligibilityCommand").mockResolvedValue({ id: randomUUID() } as never);
 vi.spyOn(RecoveryCaseRepository.prototype, "listForMember").mockRejectedValue(new Error("ELIGIBILITY_STALE_REVISION"));
 await expect(new RecoveryCaseApplication({} as Pool).eligibility(randomUUID(), command(), randomUUID())).rejects.toMatchObject({ code: "RECOVERY_COMMAND_OUTCOME_UNKNOWN" });
 expect(persist).toHaveBeenCalledTimes(1);
});
it.each([["UNAUTHENTICATED",401],["MEMBERSHIP_FORBIDDEN",403],["JOB_NOT_FOUND",404],["DATABASE_UNAVAILABLE",503],["SOMETHING_ELSE",400]] as const)("maps a read failure %s to %i and never to an unknown command outcome",(code,status)=>{
 expect(recoveryReadFailure(Object.assign(new Error(code),{code}))).toEqual({status,body:{code}});
});
