import { z } from "zod";

const uuid = z.string().uuid();
const revision = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const smallBuilderDemoCreateV1 = z.object({
 contractVersion: z.literal("small-builder-demo.create.v1"), commandId: uuid,
 scenario: z.enum(["core-1000", "recovery-18800", "shadow-30000", "meter", "trial"]),
}).strict();
export const smallBuilderDemoResetV1 = z.object({contractVersion:z.literal("small-builder-demo.reset.v1"),commandId:uuid,expectedRunRevision:revision}).strict();
export const smallBuilderDemoReportSnapshotV1 = z.object({contractVersion:z.literal("small-builder-demo.report-snapshot.v1"),commandId:uuid,expectedRunRevision:revision}).strict();
export const smallBuilderDemoReadRunV1 = z.object({runId:uuid}).strict();
export const smallBuilderDemoReadReportV1 = z.object({runId:uuid,snapshotId:uuid.optional()}).strict();
export const smallBuilderDemoRunV1 = z.object({
 version:z.literal("small-builder-demo-run.v1"),environment:z.literal("synthetic_demo"),runId:uuid,
 scenario:smallBuilderDemoCreateV1.shape.scenario,revision:z.number().int().min(1).max(2),
 status:z.enum(["blocked","archived"]),reason:z.string().min(1),createdAt:z.string(),archivedAt:z.string().nullable(),
 predecessorId:uuid.nullable(),successorId:uuid.nullable(),
}).strict();
export const smallBuilderDemoReportV1 = z.object({version:z.literal("small-builder-demo-report.v1"),snapshotId:uuid,facts:smallBuilderDemoRunV1}).strict();

export const smallBuilderDemoHttpCommandV1 = z.discriminatedUnion("operation", [
 z.object({operation:z.literal("create"),runId:z.null(),input:smallBuilderDemoCreateV1}).strict(),
 z.object({operation:z.literal("reset"),runId:uuid,input:smallBuilderDemoResetV1}).strict(),
 z.object({operation:z.literal("snapshot"),runId:uuid,input:smallBuilderDemoReportSnapshotV1}).strict(),
]);
export type SmallBuilderDemoRun = z.infer<typeof smallBuilderDemoRunV1>;
export type SmallBuilderDemoReport = z.infer<typeof smallBuilderDemoReportV1>;
export type SmallBuilderDemoHttpCommand = z.infer<typeof smallBuilderDemoHttpCommandV1>;
