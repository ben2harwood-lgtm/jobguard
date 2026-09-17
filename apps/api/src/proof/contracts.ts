import{z}from"zod";const uuid=z.string().uuid();
export const proofQueryV1=z.object({jobId:uuid}).strict();
export const proofCommandV1=z.discriminatedUnion("action",[
 z.object({version:z.literal("practice-proof-command.v1"),action:z.literal("select_generated"),commandId:uuid,scopeItemId:uuid,fixture:z.literal("completion-photo")}).strict(),
 z.object({version:z.literal("practice-proof-command.v1"),action:z.literal("finalize"),commandId:uuid,uploadId:uuid,objectVersionId:z.string().min(1).max(120)}).strict(),
 z.object({version:z.literal("practice-proof-command.v1"),action:z.literal("complete"),commandId:uuid,evidenceId:uuid,scopeItemId:uuid}).strict(),
 z.object({version:z.literal("practice-proof-command.v1"),action:z.literal("invalidate"),commandId:uuid,evidenceId:uuid,reasonCode:z.enum(["object_revoked","verification_invalid","wrong_subject"])}).strict()
]);
