import type { Pool } from "pg";
import { z } from "zod";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";

const uuid = z.string().uuid();
const revision = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const smallBuilderDemoCreateV1 = z.object({
 contractVersion: z.literal("small-builder-demo.create.v1"), commandId: uuid,
 scenario: z.enum(["core-1000", "recovery-18800", "shadow-30000", "meter", "trial"]),
}).strict();
export const smallBuilderDemoResetV1 = z.object({contractVersion:z.literal("small-builder-demo.reset.v1"),commandId:uuid,expectedRunRevision:revision}).strict();
export const smallBuilderDemoReportSnapshotV1 = z.object({contractVersion:z.literal("small-builder-demo.report-snapshot.v1"),commandId:uuid,expectedRunRevision:revision}).strict();
export const smallBuilderDemoReadRunV1 = z.object({runId:uuid}).strict();
export const smallBuilderDemoReadReportV1 = z.object({runId:uuid,snapshotId:uuid.optional()}).strict();
const runV1 = z.object({
 version:z.literal("small-builder-demo-run.v1"),environment:z.literal("synthetic_demo"),runId:uuid,
 scenario:smallBuilderDemoCreateV1.shape.scenario,revision:z.number().int().min(1).max(2),
 status:z.enum(["blocked","archived"]),reason:z.string().min(1),createdAt:z.string(),archivedAt:z.string().nullable(),
 predecessorId:uuid.nullable(),successorId:uuid.nullable(),
}).strict();
const reportV1 = z.object({version:z.literal("small-builder-demo-report.v1"),snapshotId:uuid,facts:runV1}).strict();
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
    return (operation==="snapshot"||operation==="report" ? reportV1 : runV1).parse(result);
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
