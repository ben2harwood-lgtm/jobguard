import type { Pool } from "pg";
import { z } from "zod";
import { PracticeAccess } from "../practice-access.js";

// This is a transport availability envelope, NOT the illustrative CH9-S receipt
// schema and NOT an accepted producer handoff. No successful-money arm exists.
export const valueJobResponseV3 = z.object({
 version: z.literal("job-value.v3"), environment: z.literal("synthetic_demo"),
 jobId: z.string().uuid(), status: z.literal("incomplete"),
 reason: z.literal("producer_bindings_held"),
 producers: z.object({ sources: z.literal("HELD"), derivation: z.literal("HELD"),
  subscription: z.literal("HELD"), postedMoney: z.literal("HELD") }).strict(),
 asOf: z.null(), receipt: z.null(),
}).strict();
export type JobValueResponseV3 = z.infer<typeof valueJobResponseV3>;
export function heldJobValueV3(jobId: string): JobValueResponseV3 {
 return valueJobResponseV3.parse({ version: "job-value.v3", environment: "synthetic_demo", jobId,
  status: "incomplete", reason: "producer_bindings_held", producers: {
   sources: "HELD", derivation: "HELD", subscription: "HELD", postedMoney: "HELD",
  }, asOf: null, receipt: null });
}
/** Request-scoped composition only. Unknown bytes must pass the envelope schema.
 * Installing a reader cannot enable money: that requires a separately accepted
 * source contract and an explicit schema/composition change with its tests. */
export interface ValueV3JobReader { readJob(jobId: string): Promise<unknown> }
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
  await this.access.job(jobId);
  if (!z.object({}).strict().safeParse(query).success) throw new ValueV3ReadError("VALUE_V3_QUERY_UNBOUND");
  if (!this.reader) return heldJobValueV3(jobId);
  let raw: unknown;
  try { raw = await this.reader.readJob(jobId); }
  catch { throw new ValueV3ReadError("VALUE_V3_UNAVAILABLE"); }
  const result = valueJobResponseV3.safeParse(raw);
  if (!result.success || result.data.jobId !== jobId) throw new ValueV3ReadError("VALUE_V3_SOURCE_REJECTED");
  return result.data;
 }
}
