import {expect,it} from "vitest";
import {finalCheckDispositionV1,finalCheckTaskV1} from "./final-check.contracts.js";
it("SV5-30 HTTP and worker bodies reject client authority fields and unknown versions",()=>{
 const body={version:"final-check.disposition.v1",commandId:"18000000-0000-4000-8000-000000000001",lockId:"18000000-0000-4000-8000-000000000002",runId:"18000000-0000-4000-8000-000000000003",signalId:"18000000-0000-4000-8000-000000000004",expectedSignalRevision:1,answer:"not_chargeable",referenceId:null};
 expect(finalCheckDispositionV1.safeParse(body).success).toBe(true);
 for(const field of ["tenantId","actor","origin","cutoff","completion","entitlement","settlement"])expect(finalCheckDispositionV1.safeParse({...body,[field]:true}).success).toBe(false);
 expect(finalCheckTaskV1.safeParse({version:"final-check.task.v2"}).success).toBe(false);
});
