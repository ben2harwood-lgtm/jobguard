import { PracticeAccess } from "./practice-access.js";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterEach, expect, it, vi } from "vitest";
import { DEMO_IDENTITY_USER_ID, DEMO_MEMBERSHIP_ID, PracticeAccessError, RecoveryCaseRepository } from "@jobguard/db";
import { RecoveryCaseApplication, recoveryCommandFailure, recoveryReadFailure } from "./recovery-case.application.js";
import { recoveryCaseCommandV1 } from "./recovery-case.contracts.js";

afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});
const session = randomUUID();
const principal = {context:{tenantId:randomUUID()},membershipId:DEMO_MEMBERSHIP_ID,identityUserId:DEMO_IDENTITY_USER_ID};
const testPool = () => ({query:vi.fn().mockRejectedValue(new Error("DATABASE_UNAVAILABLE"))}) as unknown as Pool;
const authorize = () => vi.spyOn(PracticeAccess.prototype,"job").mockResolvedValue(principal as never);
const command=()=>({version:"recovery-eligibility-command.v1",action:"review",commandId:randomUUID(),caseId:randomUUID(),expectedCaseRevision:2,evidenceRevision:1,policyVersion:"reference-d03.v1",policyRevision:1,scenario:"evidence_backed_withheld_payment"});
it("passes the server-selected synthetic membership for database verification, never a reviewer literal",async()=>{
 vi.stubEnv("JOBGUARD_ENV","synthetic_demo");
 authorize();
 const persist=vi.spyOn(RecoveryCaseRepository.prototype,"eligibilityCommand").mockResolvedValue({id:randomUUID()} as never);
 vi.spyOn(RecoveryCaseRepository.prototype,"listForMember").mockResolvedValue([]);
 const body=command(),job=randomUUID();
 await new RecoveryCaseApplication(testPool(), session).eligibility(job,body,randomUUID());
 expect(persist).toHaveBeenCalledWith(expect.anything(),job,body,{membershipId:DEMO_MEMBERSHIP_ID,identityUserId:DEMO_IDENTITY_USER_ID});
});
it.each([undefined,"not-a-session"])("rejects absent or malformed session %s before a write",async session=>{
 vi.stubEnv("JOBGUARD_ENV","synthetic_demo");
 const persist=vi.spyOn(RecoveryCaseRepository.prototype,"eligibilityCommand").mockResolvedValue(undefined as never);
 await expect(new RecoveryCaseApplication(testPool(), session).eligibility(randomUUID(),command(),session)).rejects.toThrow("UNAUTHENTICATED");
 expect(persist).not.toHaveBeenCalled();
});
it.each(["production","pilot_no_charge"])("refuses synthetic reviewer authority in %s",async mode=>{
 vi.stubEnv("JOBGUARD_ENV",mode);
 const persist=vi.spyOn(RecoveryCaseRepository.prototype,"eligibilityCommand").mockResolvedValue(undefined as never);
 await expect(new RecoveryCaseApplication(testPool(), session).eligibility(randomUUID(),command(),randomUUID())).rejects.toThrow("ELIGIBILITY_REVIEWER_FORBIDDEN");
 expect(persist).not.toHaveBeenCalled();
});
// M4-1-S-R repair 10 (Sol P2): the real PracticeAccess boundary guards the read, not only the writes (no mock of it here).
it.each(["production", "pilot_no_charge"])("refuses to list cases in %s before it reads anything", async mode => {
 vi.stubEnv("JOBGUARD_ENV",mode);
 const list=vi.spyOn(RecoveryCaseRepository.prototype,"listForMember").mockResolvedValue([]);
 await expect(new RecoveryCaseApplication(testPool(), session).list(randomUUID())).rejects.toThrow("MEMBERSHIP_FORBIDDEN");
 expect(list).not.toHaveBeenCalled();
});
it("lists nothing when the membership and job lookup itself cannot be completed", async () => {
 vi.stubEnv("JOBGUARD_ENV","synthetic_demo");
 const list=vi.spyOn(RecoveryCaseRepository.prototype,"listForMember").mockResolvedValue([]);
 await expect(new RecoveryCaseApplication(testPool(), session).list(randomUUID())).rejects.toThrow("DATABASE_UNAVAILABLE");
 expect(list).not.toHaveBeenCalled();
});
// M4-1-S-R repair 11 (Sol P2-5): an eligibility command also names the case it affected.
it("returns the id of the case an eligibility command affected, as the repository returned it",async()=>{
 vi.stubEnv("JOBGUARD_ENV","synthetic_demo");
 authorize();
 const affected=randomUUID(),later=randomUUID();
 vi.spyOn(RecoveryCaseRepository.prototype,"eligibilityCommand").mockResolvedValue({id:affected} as never);
 vi.spyOn(RecoveryCaseRepository.prototype,"listForMember").mockResolvedValue([{id:affected},{id:later}] as never);
 const response=await new RecoveryCaseApplication(testPool(), session).eligibility(randomUUID(),command(),randomUUID());
 expect(response.affectedCaseId).toBe(affected);
});

it("an eligibility command that committed cannot turn its answer-read failure into a refusal", async () => {
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
 authorize();
 const persist = vi.spyOn(RecoveryCaseRepository.prototype, "eligibilityCommand").mockResolvedValue({ id: randomUUID() } as never);
 vi.spyOn(RecoveryCaseRepository.prototype, "listForMember").mockRejectedValue(new Error("ELIGIBILITY_STALE_REVISION"));
 await expect(new RecoveryCaseApplication(testPool(), session).eligibility(randomUUID(), command(), randomUUID())).rejects.toMatchObject({ code: "RECOVERY_COMMAND_OUTCOME_UNKNOWN" });
 expect(persist).toHaveBeenCalledTimes(1);
});
it.each([["UNAUTHENTICATED",401],["MEMBERSHIP_FORBIDDEN",403],["JOB_NOT_FOUND",404],["DATABASE_UNAVAILABLE",503]] as const)("maps a read failure %s to %i and never to an unknown command outcome",(code,status)=>{
 expect(recoveryReadFailure(Object.assign(new Error(code),{code}))).toEqual({status,body:{code}});
});
it.each(["ECONNRESET","57P01","SOMETHING_ELSE"])("answers an unclassified read failure %s with 503, not a 4xx refusal",code=>{
 expect(recoveryReadFailure(Object.assign(new Error("connection lost"),{code}))).toEqual({status:503,body:{code:"DATABASE_UNAVAILABLE"}});
 expect(recoveryReadFailure("not an error")).toEqual({status:503,body:{code:"DATABASE_UNAVAILABLE"}});
});
it("a forbidden transition answers 400 with the domain sentence, not the bare code",()=>{
 const error=Object.assign(new Error("record_landing is not allowed from closed_recovered"),{code:"RECOVERY_TRANSITION_FORBIDDEN"});
 expect(recoveryCommandFailure(error)).toEqual({status:400,body:{code:"RECOVERY_TRANSITION_FORBIDDEN",message:"record_landing is not allowed from closed_recovered"}});
});

// Repair 16: pin the server's recognised code/status pairs alongside the browser classifier's adversarial tests.
it.each([
 ["UNAUTHENTICATED",401], ["MEMBERSHIP_FORBIDDEN",403], ["RECOVERY_REVIEWER_FORBIDDEN",403], ["ELIGIBILITY_REVIEWER_FORBIDDEN",403],
 ["JOB_NOT_FOUND",404], ["RECOVERY_JOB_NOT_FOUND",404], ["RECOVERY_CASE_NOT_FOUND",404], ["ELIGIBILITY_REVIEW_NOT_FOUND",404],
 ["RECOVERY_STALE_REVISION",409], ["ELIGIBILITY_STALE_REVISION",409], ["ELIGIBILITY_REVIEW_REQUIRED",409], ["IDEMPOTENCY_PAYLOAD_CONFLICT",409],
 ["RECOVERY_SOURCE_NOT_RECOGNISED",400], ["RECOVERY_TRANSITION_FORBIDDEN",400], ["RECOVERY_CLAIM_BELOW_SETTLED",400],
 ["RECOVERY_CLAIM_AMENDMENT_ON_CLOSED_CASE",400], ["ELIGIBILITY_NOT_APPROVABLE",400],
] as const)("repair 16: command failure %s has the expected application status %i", (code,status) => {
 const failure=recoveryCommandFailure(Object.assign(new Error(code),{code}));
 expect(failure.status).toBe(status);
 expect(failure.body.code).toBe(code);
 expect(failure.body.message).toEqual(expect.any(String));
});
it("repair 16: invalid command parsing is an application 400, while unclassified failures stay unknown", () => {
 const invalid=recoveryCaseCommandV1.safeParse({});
 expect(invalid.success).toBe(false);
 if(!invalid.success)expect(recoveryCommandFailure(invalid.error)).toEqual({status:400,body:{code:"INVALID_COMMAND"}});
 for(const code of ["REQUEST_TIMEOUT","ECONNRESET","57P01"]){
  expect(recoveryCommandFailure(new Error(code))).toMatchObject({status:503,body:{code:"RECOVERY_COMMAND_OUTCOME_UNKNOWN",outcome:"unknown"}});
 }
});

// Repair 17: inherited properties are not application statuses, for either error representation.
it.each(["constructor", "toString", "__proto__"])("repair 17: inherited read status %s defaults to DATABASE_UNAVAILABLE", code => {
 expect(recoveryReadFailure(new Error(code))).toEqual({status:503,body:{code:"DATABASE_UNAVAILABLE"}});
 expect(recoveryReadFailure(Object.assign(new Error("driver failure"),{code}))).toEqual({status:503,body:{code:"DATABASE_UNAVAILABLE"}});
});

it.each(["command","eligibility"] as const)("%s uses the verified session's principal for writes and membership-checked reply reads",async method=>{
 vi.stubEnv("JOBGUARD_ENV","synthetic_demo");
 const owner={context:{tenantId:randomUUID()},membershipId:randomUUID(),identityUserId:randomUUID()},affected=randomUUID();
 const access=vi.spyOn(PracticeAccess.prototype,"job").mockResolvedValue(owner as never);
 const persist=vi.spyOn(RecoveryCaseRepository.prototype,method==="command"?"command":"eligibilityCommand").mockResolvedValue({id:affected} as never);
 const list=vi.spyOn(RecoveryCaseRepository.prototype,"listForMember").mockResolvedValue([{id:affected}] as never);
 const body=method==="eligibility"?command():{version:"recovery-case-command.v1",action:"transition",commandId:randomUUID(),caseId:affected,eventType:"assemble_evidence",expectedRevision:1};
 const job=randomUUID(),reviewer={membershipId:owner.membershipId,identityUserId:owner.identityUserId};
 const reply=await new RecoveryCaseApplication(testPool(),session)[method](job,body);
 expect(persist).toHaveBeenCalledWith(owner.context,job,body,reviewer);
 expect(list).toHaveBeenCalledWith(owner.context,job,reviewer);
 expect(access.mock.invocationCallOrder[0]).toBeLessThan(persist.mock.invocationCallOrder[0]!);
 expect(reply.affectedCaseId).toBe(affected);
});
it("a practice refusal during a committed reply remains an unknown outcome",async()=>{
 vi.stubEnv("JOBGUARD_ENV","synthetic_demo");authorize();
 const persist=vi.spyOn(RecoveryCaseRepository.prototype,"eligibilityCommand").mockResolvedValue({id:randomUUID()} as never);
 vi.spyOn(RecoveryCaseRepository.prototype,"listForMember").mockRejectedValue(new PracticeAccessError("NOT_FOUND"));
 let error:unknown;try{await new RecoveryCaseApplication(testPool(),session).eligibility(randomUUID(),command())}catch(cause){error=cause}
 expect(recoveryCommandFailure(error)).toMatchObject({status:503,body:{code:"RECOVERY_COMMAND_OUTCOME_UNKNOWN",outcome:"unknown"}});
 expect(persist).toHaveBeenCalledTimes(1);
});
