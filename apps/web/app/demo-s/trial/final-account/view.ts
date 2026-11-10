import { z } from "zod";
const uuid = z.string().uuid();
export const companyAccountV1 = z.object({
 version: z.literal("company-final-check-read.v1"),
 draft: z.object({ id: uuid, revision: z.number().int().nonnegative(), net_pence: z.number().int().safe(), tax_pence: z.number().int().safe(), total_pence: z.number().int().safe(), issue_blocked: z.boolean() }).passthrough().nullable(),
 lines: z.array(z.object({ scope_item_id: uuid, line_kind: z.enum(["baseline", "variation"]), description: z.string(), net_pence: z.number().int().safe() }).passthrough()),
 lock: z.object({ id: uuid }).passthrough().nullable(), termsAccepted: z.boolean(),
 dispositions: z.array(z.object({ scope_item_id: uuid, disposition: z.enum(["done", "removed", "deferred"]) })),
}).passthrough();
export type CompanyAccount = z.infer<typeof companyAccountV1>;
