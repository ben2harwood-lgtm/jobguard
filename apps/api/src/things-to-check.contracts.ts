import {z} from "zod";
export const evaluateThingsV1=z.object({version:z.literal("things-to-check-evaluate.v1"),commandId:z.string().uuid(),ruleRevision:z.literal("supplier-overcharge.v1")}).strict();
export const reviewThingV1=z.object({version:z.literal("things-to-check-review.v1"),commandId:z.string().uuid(),findingId:z.string().uuid(),expectedRevision:z.number().int().nonnegative(),outcome:z.enum(["dismissed","disputed"]),reason:z.string().trim().min(1).max(500)}).strict();
export const supersedeBillV1=z.object({version:z.literal("supplier-bill-supersession.v1"),commandId:z.string().uuid(),originalFactRevisionId:z.string().uuid(),replacementFactRevisionId:z.string().uuid(),expectedRevision:z.number().int().nonnegative()}).strict();
