import { z } from "zod";
const uuid=z.string().uuid();
const source=z.object({id:uuid,revision:z.number().int().positive(),label:z.string().min(1),href:z.string().min(1)}).strict();
const outcome=z.object({pence:z.number().int().min(0).max(1_000_000_000_000).nullable(),basis:z.enum(["net","gross"]),sources:z.array(source)}).strict();
export const jobValueResponseV1=z.object({version:z.literal("job-value.v1"),environment:z.literal("synthetic_demo"),jobId:uuid,approvedExtras:outcome,approvedReductions:outcome,invoicedGross:outcome,recordedGross:outcome,outstandingGross:outcome,pendingExtras:z.array(z.object({id:uuid,revision:z.number().int().positive(),description:z.string(),pence:z.number().int().positive(),status:z.literal("awaiting_approval"),href:z.string()})),quoteCoverage:z.array(source),blockedActions:z.array(z.object({id:uuid,title:z.string(),explanation:z.string(),sourceRef:z.string(),href:z.string()}))}).strict();
export type JobValueResponse=z.infer<typeof jobValueResponseV1>;
