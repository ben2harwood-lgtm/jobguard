import { z } from "zod";
const uuid = z.guid();
export const recordExtraProceedV1 = z.object({
 version: z.literal("record-extra-proceed.v1"), commandId: uuid, requestId: uuid,
 reason: z.string().trim().min(1).max(1000),
}).strict();
export const extraProceedFactV1 = z.object({
 statementId: uuid, commandId: uuid, requestId: uuid, revisionHash: z.string().regex(/^[a-f0-9]{64}$/u),
 actorMembershipId: uuid, recordedAt: z.iso.datetime(), reason: z.string().min(1).max(1000),
}).strict();
export const extraProceedViewV1 = z.object({
 version: z.literal("extra-proceed-view.v1"), jobId: uuid, extraId: uuid,
 requestId: uuid.nullable(), history: z.array(extraProceedFactV1),
}).strict();
