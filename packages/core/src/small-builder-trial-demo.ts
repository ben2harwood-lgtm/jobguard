import { z } from "zod";
const uuid=z.string().uuid();
export const trialDemoCommandV1=z.discriminatedUnion("action",[
 z.object({version:z.literal("trial-demo-command.v1"),action:z.literal("bind"),commandId:uuid,runId:uuid,firstJobId:uuid,secondJobId:uuid}).strict().refine(v=>v.firstJobId!==v.secondJobId),
 z.object({version:z.literal("trial-demo-command.v1"),action:z.literal("read"),runId:uuid}).strict(),
 z.object({version:z.literal("trial-demo-command.v1"),action:z.literal("snapshot"),commandId:uuid,runId:uuid}).strict(),
 z.object({version:z.literal("trial-demo-command.v1"),action:z.literal("report"),runId:uuid,snapshotId:uuid}).strict(),
]);
export type TrialDemoCommand=z.infer<typeof trialDemoCommandV1>;
