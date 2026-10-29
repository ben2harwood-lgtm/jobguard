import type { Pool } from "pg";
import { z } from "zod";
import { PracticeAccess } from "../practice-access.js";

/** Provisional selection syntax only; no event clock or period authority is installed. */
const selectionV1 = z.object({
 from: z.string().datetime().optional(),
 toExclusive: z.string().datetime().optional(),
 periodId: z.string().min(1).max(200).optional(),
}).strict().refine(v => (v.from === undefined) === (v.toExclusive === undefined));
export const businessValueResultV1 = z.object({
 version: z.literal("business-value-result.v1"), state: z.literal("unavailable"),
 code: z.enum(["BUSINESS_VALUE_BINDING_HELD", "BUSINESS_VALUE_SELECTION_HELD", "INVALID_BUSINESS_VALUE_SELECTION", "UNAUTHENTICATED", "SYNTHETIC_MODE_REQUIRED", "BUSINESS_VALUE_UNAVAILABLE"]),
}).strict();
type Code = z.infer<typeof businessValueResultV1>["code"];
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
 switch (result.code) {
  case "UNAUTHENTICATED": return 401;
  case "SYNTHETIC_MODE_REQUIRED": return 403;
  case "INVALID_BUSINESS_VALUE_SELECTION": return 400;
  default: return 503;
 }
}
