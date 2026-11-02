import {expect,it} from "vitest";
import {simulationFeeCollectionCommandV1} from "./simulation-fee-collection.js";
import {jobMutationRegistry} from "./watchdog.js";
it("classifies both collection transports as post-live billing without granting command authority",()=>{
 expect(jobMutationRegistry["/api/jobs/[id]/success-fees/collection"]).toBe("post_live_billing");
 expect(jobMutationRegistry["nest:/jobs/:id/success-fees/collection"]).toBe("post_live_billing");
});
const command={version:"simulation-fee-collection-command.v1",commandId:"10000000-0000-4000-8000-000000000001",action:"collect",statementId:"10000000-0000-4000-8000-000000000002",statementHash:"a".repeat(64),amountPence:28200};
it("requires the exact statement and displayed GBP principal; rejects client authority, malformed money and missing fields",()=>{
 expect(simulationFeeCollectionCommandV1.parse(command)).toEqual(command);
 for(const amountPence of [0,-1,1.5,Number.MAX_SAFE_INTEGER,"28200"])expect(simulationFeeCollectionCommandV1.safeParse({...command,amountPence}).success).toBe(false);
 for(const key of ["tenantId","provider","settled","authorizationId"])expect(simulationFeeCollectionCommandV1.safeParse({...command,[key]:true}).success).toBe(false);
 for(const key of ["statementId","statementHash","amountPence"]){const raw:Record<string,unknown>={...command};delete raw[key];expect(simulationFeeCollectionCommandV1.safeParse(raw).success).toBe(false);}
});
it("fake reconciliation requires an attempt identity and accepts no client amount or settlement flag",()=>{
 const raw={version:command.version,commandId:command.commandId,action:"redirect",attemptId:command.statementId};
 expect(simulationFeeCollectionCommandV1.parse(raw)).toEqual(raw);
 expect(simulationFeeCollectionCommandV1.safeParse({...raw,amountPence:28200}).success).toBe(false);
 expect(simulationFeeCollectionCommandV1.safeParse({...raw,settled:true}).success).toBe(false);
});
