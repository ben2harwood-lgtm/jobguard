import type { Pool } from "pg";
import { z } from "zod";
import { mappedValueReceiptV1, valueWindowV1, type ValueWindowV1, mapValueReceipt } from "@jobguard/core";
import { PracticeAccess } from "../practice-access.js";

// Preserve the pre-lock refusal envelope alongside the source-mapped receipt.
const heldValueJobResponseV3 = z.object({
 version: z.literal("job-value.v3"), environment: z.literal("synthetic_demo"),
 jobId: z.string().uuid(), status: z.literal("incomplete"),
 reason: z.literal("producer_bindings_held"),
 producers: z.object({ sources: z.literal("HELD"), derivation: z.literal("HELD"),
  subscription: z.literal("HELD"), postedMoney: z.literal("HELD") }).strict(),
 asOf: z.null(), receipt: z.null(),
}).strict();
export const valueJobResponseV3 = z.union([heldValueJobResponseV3, z.object({
 version: z.literal("job-value.v3"), environment: z.literal("synthetic_demo"), jobId: z.string().uuid(),
 status: z.literal("mapped"), receipt: mappedValueReceiptV1,
}).strict()]).superRefine((v,ctx)=>{
 if(v.status==="mapped" && v.receipt.sources.jobId!==v.jobId)ctx.addIssue({code:"custom",message:"Receipt job mismatch"});
});
export type JobValueResponseV3 = z.infer<typeof valueJobResponseV3>;
export function heldJobValueV3(jobId: string): JobValueResponseV3 {
 return valueJobResponseV3.parse({ version: "job-value.v3", environment: "synthetic_demo", jobId,
  status: "incomplete", reason: "producer_bindings_held", producers: {
   sources: "HELD", derivation: "HELD", subscription: "HELD", postedMoney: "HELD",
  }, asOf: null, receipt: null });
}
/** Request-scoped read port; mapped figures are reproduced from its strict source list. */
export interface ValueV3JobReader { readJob(jobId: string,window?:ValueWindowV1|null): Promise<unknown> }
export class ValueV3ReadError extends Error {
 readonly status = "incomplete";
 constructor(readonly code: "VALUE_V3_QUERY_UNBOUND" | "VALUE_V3_SOURCE_REJECTED" | "VALUE_V3_UNAVAILABLE") { super(code); }
}
export class ValueV3Application {
 private readonly access: PracticeAccess;
 constructor(pool: Pool, sessionId?: string, private readonly reader?: ValueV3JobReader) {
  this.access = new PracticeAccess(pool, sessionId);
 }
 async readJob(jobId: string, query: unknown = {}): Promise<JobValueResponseV3> {
  // Authority precedes query errors, held state and any informative source read.
  const auth=await this.access.job(jobId);
  const selected=z.union([z.object({}).strict(),valueWindowV1]).safeParse(query);
  if (!selected.success) throw new ValueV3ReadError("VALUE_V3_QUERY_UNBOUND");
  const window=valueWindowV1.safeParse(selected.data);
  if (!this.reader) return heldJobValueV3(jobId);
  let raw: unknown;
  try { raw = window.success ? await this.reader.readJob(jobId,window.data) : await this.reader.readJob(jobId); }
  catch { throw new ValueV3ReadError("VALUE_V3_UNAVAILABLE"); }
  const result = valueJobResponseV3.safeParse(raw);
  if (!result.success || result.data.jobId !== jobId) throw new ValueV3ReadError("VALUE_V3_SOURCE_REJECTED");
  if(result.data.status==="mapped"){
   if(result.data.receipt.sources.tenantId!==auth.context.tenantId)throw new ValueV3ReadError("VALUE_V3_SOURCE_REJECTED");
   const expected=mapValueReceipt(result.data.receipt.sources,window.success?window.data:null);
   if(JSON.stringify(expected)!==JSON.stringify(result.data.receipt))throw new ValueV3ReadError("VALUE_V3_SOURCE_REJECTED");
  }
  return result.data;
 }
}

/** Shared sanitized failure contract for both HTTP adapters. */
export function valueV3Failure(error: unknown) {
 const code = error instanceof Error && "code" in error &&
  ["NOT_FOUND", "UNAUTHENTICATED", "SYNTHETIC_MODE_REQUIRED", "VALUE_V3_QUERY_UNBOUND", "VALUE_V3_SOURCE_REJECTED"].includes(String(error.code))
  ? String(error.code) : "VALUE_V3_UNAVAILABLE";
 const status = code === "UNAUTHENTICATED" ? 401 : code === "NOT_FOUND" ? 404 : code === "SYNTHETIC_MODE_REQUIRED" ? 403 : code === "VALUE_V3_QUERY_UNBOUND" ? 400 : 503;
 return { status, body: { version: "job-value-error.v3", status: "incomplete", code } };
}
