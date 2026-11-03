import { afterEach, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import * as db from "@jobguard/db";
import { ContractorApplication } from "./contractor.application.js";
const id="11111111-1111-4111-8111-111111111111";
const principal={version:"contractor-principal.v1",sessionId:id};
const query={version:"contractor-query.v1",tenantId:id,resource:"contracts"};
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});
function setup() {
 vi.stubEnv("JOBGUARD_ENV","synthetic_demo");
 // Keep the pre-implementation red phase an assertion failure, not a missing import.
 const ctor=(db as unknown as Record<string,{prototype:object}>).ContractorRetainedReadRepository;
 expect(ctor,"persisted retained reader must be exported").toBeDefined();
 vi.spyOn(db.ContractorRepository.prototype,"resolveSession").mockResolvedValue({tenantId:id,membershipId:id,identityUserId:id} as db.AuthenticatedMembership);
 vi.spyOn(db.ContractorRepository.prototype,"query").mockResolvedValue({membershipId:"legacy"} as db.ContractorView);
 const retained=ctor!.prototype as {query:()=>Promise<unknown>;resume:()=>Promise<unknown>};
 return {read:vi.spyOn(retained,"query").mockResolvedValue({membershipId:"effective"}),resume:vi.spyOn(retained,"resume").mockResolvedValue({membershipId:"effective"}),app:new ContractorApplication({} as Pool)};
}
it("read uses the persisted session retained reader",async()=>{
 const f=setup();await expect(f.app.read(principal,query)).resolves.toEqual({membershipId:"effective"});expect(f.read).toHaveBeenCalledWith(id,query);
});
it("resume uses the effective session member",async()=>{
 const f=setup();await expect(f.app.resume(principal)).resolves.toEqual({membershipId:"effective"});expect(f.resume).toHaveBeenCalledWith(id);expect(f.read).not.toHaveBeenCalled();
});
it("forged authority fields and non-synthetic mode fail before reading",async()=>{
 const f=setup();await expect(f.app.read({...principal,tenantId:id},query)).rejects.toMatchObject({code:"UNAUTHENTICATED"});
 await expect(f.app.read(principal,{...query,agreementActive:true})).rejects.toMatchObject({code:"INVALID_COMMAND"});
 vi.stubEnv("JOBGUARD_ENV","production");await expect(f.app.resume(principal)).rejects.toMatchObject({code:"MODE_FORBIDDEN"});expect(f.read).not.toHaveBeenCalled();expect(f.resume).not.toHaveBeenCalled();
});
it("commands do not use retained-read authority",async()=>{
 const f=setup();const member={tenantId:id,membershipId:id,identityUserId:id} as db.AuthenticatedMembership;
 vi.spyOn(db.ContractorRepository.prototype,"resolveSession").mockResolvedValue(member);
 const command=vi.spyOn(db.ContractorRepository.prototype,"command").mockRejectedValue(new Error("command boundary"));
 const raw={version:"contractor-command.v1",environment:"synthetic_demo",commandId:id,id,expectedRevision:0,kind:"grant.revoke",grantId:id};
 await expect(f.app.command(principal,raw)).rejects.toThrow("command boundary");expect(command).toHaveBeenCalledWith(member,raw);expect(f.read).not.toHaveBeenCalled();expect(f.resume).not.toHaveBeenCalled();
});
