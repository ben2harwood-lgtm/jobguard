import type { Pool } from "pg";
import { z } from "zod";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";

import {
 smallBuilderDemoCreateV1, smallBuilderDemoResetV1, smallBuilderDemoReportSnapshotV1,
 smallBuilderDemoRunV1, smallBuilderDemoReportV1, previewDemoMeter,
} from "@jobguard/core";
export {
 smallBuilderDemoCreateV1, smallBuilderDemoResetV1, smallBuilderDemoReportSnapshotV1,
 smallBuilderDemoReadRunV1, smallBuilderDemoReadReportV1,
} from "@jobguard/core";
const uuid = z.string().uuid();
export class SmallBuilderDemoError extends Error {
 constructor(readonly code: "INVALID_DEMO_INPUT"|"DEMO_FORBIDDEN"|"DEMO_NOT_FOUND"|"DEMO_COMMAND_CONFLICT"|"DEMO_STALE_REVISION"|"DEMO_ARCHIVED"|"DEMO_SYNTHETIC_ONLY"|"DEMO_UNAVAILABLE") { super(code); }
}
export class SmallBuilderDemoRepository {
 constructor(private readonly pool:Pool) {}
 async execute(context:VerifiedTenantContext,digest:string,operation:"create"|"read"|"reset"|"snapshot"|"report",runId:string|null,raw:unknown) {
  const schema = operation==="create" ? smallBuilderDemoCreateV1 : operation==="reset" ? smallBuilderDemoResetV1 : operation==="snapshot" ? smallBuilderDemoReportSnapshotV1 : operation==="report" ? z.object({snapshotId:uuid.optional()}).strict() : z.object({}).strict();
  const parsed=schema.safeParse(raw);
  if(!parsed.success || !/^[a-f0-9]{64}$/u.test(digest) || (operation==="create" ? runId!==null : !uuid.safeParse(runId).success)) throw new SmallBuilderDemoError("INVALID_DEMO_INPUT");
  try {
   return await withTenant(this.pool,context,async db=>{
    const result=(await db.$client.query("SELECT app.small_builder_demo($1,$2,$3,$4,$5::jsonb) result",[context.tenantId,digest,operation,runId,JSON.stringify(parsed.data)])).rows[0]?.result;
    // Authenticate and load the owned persisted run before deriving fictional inputs.
    // Stored snapshots stay lifecycle-only: reference projections are never passed off as saved money facts.
    if(operation!=="snapshot" && operation!=="report") {
     const run=smallBuilderDemoRunV1.parse(result);
     if(run.scenario==="meter") return {...run,meterPreview:previewDemoMeter({tenantId:context.tenantId,runId:run.runId})};
     return run;
    }
    return (operation==="snapshot"||operation==="report" ? smallBuilderDemoReportV1 : smallBuilderDemoRunV1).parse(result);
   });
  } catch(error) {
   const message=error instanceof Error ? error.message : "";
   if(message==="METER_FORBIDDEN") throw new SmallBuilderDemoError("DEMO_FORBIDDEN");
   const codes=["DEMO_NOT_FOUND","DEMO_COMMAND_CONFLICT","DEMO_STALE_REVISION","DEMO_ARCHIVED","DEMO_SYNTHETIC_ONLY","INVALID_DEMO_INPUT"] as const;
   for(const code of codes) if(message===code) throw new SmallBuilderDemoError(code);
   throw new SmallBuilderDemoError("DEMO_UNAVAILABLE");
  }
 }
}
