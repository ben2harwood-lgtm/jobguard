import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterEach,beforeEach,expect,it,vi } from "vitest";
import { RecoveryAttributionApplication } from "./recovery-attribution.application.js";
const {job,history}=vi.hoisted(()=>({job:vi.fn(),history:vi.fn()}));
vi.mock("./practice-access.js",()=>({PracticeAccess:class{job=job;}}));
vi.mock("@jobguard/db",async original=>({...await original<Record<string,unknown>>(),RecoveryAttributionRepository:class{history=history;}}));
const id=randomUUID(),context={tenantId:randomUUID()},digest="a".repeat(64);
const command=()=>({version:"recovery-attribution-command.v1",action:"assess",commandId:randomUUID(),caseId:randomUUID(),workId:randomUUID(),lineId:randomUUID(),lockId:randomUUID(),expectedCaseRevision:1,expectedAttributionRevision:0});
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv("JOBGUARD_ENV","synthetic_demo");job.mockResolvedValue({context,digest});history.mockResolvedValue([]);});
afterEach(()=>vi.unstubAllEnvs());
it("SV6-18 rejects client authority and non synthetic execution",async()=>{
 for(const mode of ["production","pilot_no_charge",""]){vi.stubEnv("JOBGUARD_ENV",mode);const app=new RecoveryAttributionApplication({} as Pool);await expect(app.get(id)).rejects.toThrow("SYNTHETIC_MODE_REQUIRED");await expect(app.command(id,command())).rejects.toThrow("SYNTHETIC_MODE_REQUIRED");}
 expect(job).not.toHaveBeenCalled();vi.stubEnv("JOBGUARD_ENV","synthetic_demo");
 for(const field of ["tenantId","actor","actorMembershipId","mode","rate","productionEnabled","realExternalActions","settlement","fee","facts","remainingPrincipal","illustration","priorTarget","change"]){
  const app=new RecoveryAttributionApplication({} as Pool);
  await expect(app.get(id,{[field]:true})).rejects.toThrow("Invalid recovery attribution command");
  await expect(app.command(id,command(),{[field]:true})).rejects.toThrow("Invalid recovery attribution command");
  await expect(app.command(id,{...command(),[field]:true})).rejects.toThrow("Invalid recovery attribution command");
 }
 expect(history).not.toHaveBeenCalled();
});
it("SV6-19 current session and actor authority are checked before disclosure and replay",async()=>{
 const app=new RecoveryAttributionApplication({} as Pool),raw=command();
 for(const message of ["UNAUTHENTICATED","NOT_FOUND"]){job.mockRejectedValue(new Error(message));await expect(app.get(id)).rejects.toThrow(message);await expect(app.command(id,raw)).rejects.toThrow(message);await expect(app.command(id,raw)).rejects.toThrow(message);}
 expect(history).not.toHaveBeenCalled();
});
it("SV6-22 pre lock attribution reveals no shadow existence (scripted repository boundary)",async()=>{
 const first=await new RecoveryAttributionApplication({} as Pool).get(id),second=await new RecoveryAttributionApplication({} as Pool).get(id);
 expect(first).toEqual(second);expect(history).toHaveBeenCalledWith(context,id,digest);
 expect(first).toEqual({version:"recovery-attribution-history.v1",jobId:id,environment:"synthetic_demo",proposed:true,principalOnly:true,productionEnabled:false,realExternalActions:0,qualification:"dependency_bound",revisions:[]});
});
it("SV6-29 SV6-BEN-Q5 held illustration outputs cannot be submitted or obtained",async()=>{
 const app=new RecoveryAttributionApplication({} as Pool);
 await expect(app.command(id,command())).rejects.toThrow("RECOVERY_ATTRIBUTION_DEPENDENCY_BOUND");
 await expect(app.get(id,{illustration:true})).rejects.toThrow("Invalid recovery attribution command");
 expect(history).not.toHaveBeenCalled();
});

it("SV6-29 projection identity cannot be stripped or changed",async()=>{
 const {recoveryAttributionHistoryV1}=await import("./recovery-attribution.contracts.js");
 const view=await new RecoveryAttributionApplication({} as Pool).get(id);
 for(const [field,value] of Object.entries({environment:"production",proposed:false,principalOnly:false,productionEnabled:true,realExternalActions:1,qualification:"qualified"})){
  expect(recoveryAttributionHistoryV1.safeParse({...view,[field]:value}).success).toBe(false);
  const missing={...view} as Record<string,unknown>;delete missing[field];expect(recoveryAttributionHistoryV1.safeParse(missing).success).toBe(false);
 }
});

it("persisted history must pass the versioned output schema",async()=>{
 history.mockResolvedValue([{}]);
 await expect(new RecoveryAttributionApplication({} as Pool).get(id)).rejects.toThrow();
});
