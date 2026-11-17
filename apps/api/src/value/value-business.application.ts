import type { Pool } from "pg";
import type { ValueBusinessReader } from "@jobguard/db";
import { z } from "zod";
import { valueWindowV1, mapValueReceipt, mappedBusinessSummaryV1, mapBusinessValueSummary, type ValueWindowV1 } from "@jobguard/core";
import { valueJobResponseV3, heldJobValueV3, ValueV3ReadError } from "./value-v3.application.js";
import { resolveVerifiedTenantContext } from "../auth/principal-bridge.js";
import { PracticeAccess } from "../practice-access.js";

/** Half-open assessment-recorded window; subscription remains selected by its own period ID. */
const selectionV1 = z.object({
 from: z.string().datetime().optional(),
 toExclusive: z.string().datetime().optional(),
 periodId: z.string().min(1).max(200).optional(),
}).strict().refine(v => (v.from === undefined) === (v.toExclusive === undefined));
const unavailableBusinessValueResultV1 = z.object({
 version: z.literal("business-value-result.v1"), state: z.literal("unavailable"),
 code: z.enum(["BUSINESS_VALUE_BINDING_HELD", "BUSINESS_VALUE_SELECTION_HELD", "INVALID_BUSINESS_VALUE_SELECTION", "UNAUTHENTICATED", "SYNTHETIC_MODE_REQUIRED", "BUSINESS_VALUE_UNAVAILABLE"]),
}).strict();
export const businessValueResultV1=z.union([unavailableBusinessValueResultV1,z.object({
 version:z.literal("business-value-result.v1"),state:z.literal("mapped"),tenantId:z.string().uuid(),label:z.literal("mapped, inspectable"),environment:z.literal("synthetic_demo"),
 jobs:z.array(valueJobResponseV3),summary:mappedBusinessSummaryV1.optional(),subscription:z.array(z.object({periodId:z.string().uuid(),from:z.string(),toExclusive:z.string(),sourceId:z.string().uuid(),statementId:z.string().uuid(),policyVersion:z.literal("subscription_pricing_policy_v4"),derivationVersion:z.literal("MON-1/MON-2A"),amount:z.object({pence:z.number().int().min(0).max(16900),currency:z.literal("GBP")}).strict(),lines:z.array(z.record(z.string(),z.unknown()))}).strict()),
}).strict()]);
type Code = z.infer<typeof unavailableBusinessValueResultV1>["code"];
const unavailable = (code: Code) => businessValueResultV1.parse({ version: "business-value-result.v1", state: "unavailable", code });

/**
 * Shared business refusal boundary for Nest and Next.
 * Authentication proves session membership only. It does not establish company,
 * billing-period or producer authority. No read port can be supplied to bypass a hold.
 * Positive aggregates require authorized job and billing-period producer contracts.
 */
export class BusinessValueApplication {
 private readonly access: PracticeAccess;
 constructor(pool: Pool, sessionId?: string) { this.access = new PracticeAccess(pool, sessionId); }
 async readBusiness(raw: unknown) {
  await this.access.session();
  const selection = selectionV1.safeParse(raw);
  if (!selection.success) return unavailable("INVALID_BUSINESS_VALUE_SELECTION");
  if (Object.keys(selection.data).length) return unavailable("BUSINESS_VALUE_SELECTION_HELD");
  // Do not enumerate shared-tenant jobs, inspect shadow state, or read supplied
  // meter fixtures. Even a legitimate empty business cannot be asserted here.
  return unavailable("BUSINESS_VALUE_BINDING_HELD");
 }
}
export function businessValueFailure(error: unknown) {
 const code = error instanceof Error && "code" in error ? error.code : undefined;
 return unavailable(code === "UNAUTHENTICATED" || code === "SYNTHETIC_MODE_REQUIRED" ? code : "BUSINESS_VALUE_UNAVAILABLE");
}
export function businessValueStatus(result: z.infer<typeof businessValueResultV1>) {
 if(result.state==="mapped")return 200;
 switch (result.code) {
  case "UNAUTHENTICATED": return 401;
  case "SYNTHETIC_MODE_REQUIRED": return 403;
  case "INVALID_BUSINESS_VALUE_SELECTION": return 400;
  default: return 503;
 }
}

/** The MON-1/MON-2A authority bridge is deliberately distinct from practice
 * cookies. Its resolved principal and persisted digest authorize company reads. */
export class CompanyValueApplication {
 constructor(private readonly authority: import("../subscription.application.js").SubscriptionAuthorityPort,
  private readonly reader: Pick<ValueBusinessReader,"readBusiness"|"readJob">){}
 async readJob(handle:unknown,jobId:string,raw:unknown){
  if(this.authority.environment()!=="synthetic_demo")throw Object.assign(new Error(),{code:"SYNTHETIC_MODE_REQUIRED"});
  const current=await this.authority.resolve(handle);
  const context=await resolveVerifiedTenantContext(this.authority.provider,current.credentials,this.authority.allowedOrigin);
  if(!z.string().uuid().safeParse(jobId).success)throw Object.assign(new Error(),{code:"NOT_FOUND"});
  const selected=z.union([z.object({}).strict(),valueWindowV1]).safeParse(raw);
  if(!selected.success)throw new ValueV3ReadError("VALUE_V3_QUERY_UNBOUND");
  const window=valueWindowV1.safeParse(selected.data);
  const receipt=await this.reader.readJob(context,current.digest,jobId,window.success?window.data:null);
  if(receipt===null)return heldJobValueV3(jobId);
  const result=valueJobResponseV3.parse({version:"job-value.v3",environment:"synthetic_demo",jobId,status:"mapped",receipt});
  if(result.status!=="mapped"||result.receipt.sources.tenantId!==context.tenantId)throw new ValueV3ReadError("VALUE_V3_SOURCE_REJECTED");
  const expected=mapValueReceipt(result.receipt.sources,window.success?window.data:null);
  if(JSON.stringify(expected)!==JSON.stringify(result.receipt))throw new ValueV3ReadError("VALUE_V3_SOURCE_REJECTED");
  return result;
 }
 async readBusiness(handle:unknown,raw:unknown){
  if(this.authority.environment()!=="synthetic_demo")return unavailable("SYNTHETIC_MODE_REQUIRED");
  const current=await this.authority.resolve(handle);
  const context=await resolveVerifiedTenantContext(this.authority.provider,current.credentials,this.authority.allowedOrigin);
  const selection=selectionV1.safeParse(raw);
  if(!selection.success)return unavailable("INVALID_BUSINESS_VALUE_SELECTION");
  const window=selection.data.from&&selection.data.toExclusive?valueWindowV1.safeParse({from:selection.data.from,toExclusive:selection.data.toExclusive}):null;
  if(window&&!window.success)return unavailable("INVALID_BUSINESS_VALUE_SELECTION");
  const result=businessValueResultV1.parse(await this.reader.readBusiness(context,current.digest,selection.data.periodId,window?.success?window.data:null));
  if(result.state!=="mapped" || result.tenantId!==context.tenantId || result.jobs.some(j=>j.status==="mapped"&&j.receipt.sources.tenantId!==context.tenantId)
   ||new Set(result.jobs.map(j=>j.jobId)).size!==result.jobs.length||new Set(result.subscription.map(p=>p.periodId)).size!==result.subscription.length)throw new Error("VALUE_SCOPE_MISMATCH");
  for(const job of result.jobs){
   if(job.status!=="mapped")continue;
   const expected=mapValueReceipt(job.receipt.sources,window?.success?window.data:null);
   if(JSON.stringify(expected)!==JSON.stringify(job.receipt))throw new Error("VALUE_RECEIPT_SOURCE_MISMATCH");
  }
  if(result.summary){
   const expected=mapBusinessValueSummary(result.jobs.flatMap(j=>j.status==="mapped"?[j.receipt]:[]));
   if(JSON.stringify(expected)!==JSON.stringify(result.summary))throw new Error("VALUE_SUMMARY_SOURCE_MISMATCH");
  }
  return result;
 }
}
