import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterEach, expect, it, vi } from "vitest";
import { DEMO_IDENTITY_USER_ID, DEMO_MEMBERSHIP_ID, RecoveryCaseRepository } from "@jobguard/db";
import { RecoveryCaseApplication } from "./recovery-case.application.js";

afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});
const command=()=>({version:"recovery-eligibility-command.v1",action:"review",commandId:randomUUID(),caseId:randomUUID(),expectedCaseRevision:2,evidenceRevision:1,policyVersion:"reference-d03.v1",policyRevision:1,scenario:"evidence_backed_withheld_payment"});
it("passes the server-selected synthetic membership for database verification, never a reviewer literal",async()=>{
 vi.stubEnv("JOBGUARD_ENV","synthetic_demo");
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
// M4-1-S-R repair 10 (Sol P2): the real readSyntheticDemoJob boundary guards the read, not only the writes (no mock of it here).
it.each(["production", "pilot_no_charge"])("refuses to list cases in %s before it reads anything", async mode => {
 vi.stubEnv("JOBGUARD_ENV",mode);
 const list=vi.spyOn(RecoveryCaseRepository.prototype,"list").mockResolvedValue([]);
 await expect(new RecoveryCaseApplication({} as Pool).list(randomUUID())).rejects.toThrow("MEMBERSHIP_FORBIDDEN");
 expect(list).not.toHaveBeenCalled();
});
it("lists nothing when the membership and job lookup itself cannot be completed", async () => {
 vi.stubEnv("JOBGUARD_ENV","synthetic_demo");
 const list=vi.spyOn(RecoveryCaseRepository.prototype,"list").mockResolvedValue([]);
 await expect(new RecoveryCaseApplication({} as Pool).list(randomUUID())).rejects.toThrow("DATABASE_UNAVAILABLE");
 expect(list).not.toHaveBeenCalled();
});
