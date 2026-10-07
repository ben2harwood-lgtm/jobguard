import { PracticeAccess } from "./practice-access.js";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterEach, expect, it, vi } from "vitest";
import { DEMO_IDENTITY_USER_ID, DEMO_MEMBERSHIP_ID, RecoveryCaseRepository } from "@jobguard/db";
import { RecoveryCaseApplication } from "./recovery-case.application.js";

afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});
const command=()=>({version:"recovery-eligibility-command.v1",action:"review",commandId:randomUUID(),caseId:randomUUID(),expectedCaseRevision:2,evidenceRevision:1,policyVersion:"reference-d03.v1",policyRevision:1,scenario:"evidence_backed_withheld_payment"});
it("passes the server-selected synthetic membership for database verification, never a reviewer literal",async()=>{
 vi.stubEnv("JOBGUARD_ENV","synthetic_demo");
 vi.spyOn(PracticeAccess.prototype,"job").mockResolvedValue({context:{tenantId:"11111111-1111-4111-8111-111111111111"},membershipId:DEMO_MEMBERSHIP_ID,identityUserId:DEMO_IDENTITY_USER_ID} as never);
 const persist=vi.spyOn(RecoveryCaseRepository.prototype,"eligibilityCommand").mockResolvedValue(undefined as never);
 vi.spyOn(RecoveryCaseRepository.prototype,"list").mockResolvedValue([]);
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
