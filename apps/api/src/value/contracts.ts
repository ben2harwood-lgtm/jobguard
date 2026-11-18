import { z } from "zod";
const uuid=z.guid({ error: "Invalid uuid" });
const source=z.object({id:uuid,revision:z.number().int().positive(),label:z.string().min(1),href:z.string().min(1)}).strict();
const outcome=z.object({pence:z.number().int().min(0).max(1_000_000_000_000).nullable(),basis:z.enum(["net","gross"]),sources:z.array(source)}).strict();
export const catchAttentionV1 = z.object({
 id: uuid, description: z.string(), revisionId: uuid.nullable(), revision: z.number().int().positive().nullable(),
 pence: z.number().int().min(-1_000_000_000_000).max(1_000_000_000_000).nullable(),
 status: z.enum(["needs_price", "needs_approval", "ready_to_invoice"]), href: z.string().min(1),
}).strict().superRefine((row, context) => {
 if (row.status === "needs_price" ? row.pence !== null : row.pence === null || row.revisionId === null || row.revision === null)
  context.addIssue({ code: "custom", message: "Catch action must match its saved price and revision" });
 if (row.status === "ready_to_invoice" && (row.pence === null || row.pence <= 0))
  context.addIssue({ code: "custom", message: "Only positive approved work needs invoicing" });
});
export const jobValueResponseV1=z.object({version:z.literal("job-value.v1"),environment:z.literal("synthetic_demo"),jobId:uuid,approvedExtras:outcome,approvedReductions:outcome,invoicedGross:outcome,recordedGross:outcome,outstandingGross:outcome,pendingExtras:z.array(z.object({id:uuid,revision:z.number().int().positive(),description:z.string(),pence:z.number().int().positive(),status:z.literal("awaiting_approval"),href:z.string()})),catchAttention:z.array(catchAttentionV1).default([]),foundAfterLock:z.array(z.object({id:uuid,description:z.string(),sourceSignalId:uuid,revisionId:uuid.nullable(),revision:z.number().int().positive().nullable(),pence:z.number().int().min(-1_000_000_000_000).max(1_000_000_000_000).nullable(),approved:z.boolean(),href:z.string().min(1)}).strict()).default([]),quoteCoverage:z.array(source),blockedActions:z.array(z.object({id:uuid,title:z.string(),explanation:z.string(),sourceRef:z.string(),href:z.string()}))}).strict();
export type JobValueResponse=z.infer<typeof jobValueResponseV1>;
