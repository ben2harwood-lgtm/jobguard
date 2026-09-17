import {z} from "zod";
export const decisionQueryV1=z.object({tenantId:z.string().uuid(),jobId:z.string().uuid().optional()}).strict();
export const findingEvaluationCommandV1=z.object({version:z.literal("finding-evaluation-command.v1"),commandId:z.string().uuid(),tenantId:z.string().uuid(),jobId:z.string().uuid()}).strict();
export const decisionResolutionWebCommandV1=z.object({version:z.literal("decision-resolution-command.v1"),commandId:z.string().uuid(),tenantId:z.string().uuid(),decisionId:z.string().uuid(),findingFingerprint:z.string().regex(/^[a-f0-9]{64}$/u),resolution:z.literal("dismissed"),expectedSnapshotRevision:z.number().int().nonnegative()}).strict();
