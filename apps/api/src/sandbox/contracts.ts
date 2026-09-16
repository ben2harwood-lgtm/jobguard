import { z } from "zod";
export const sandboxRunIdV1=z.string().uuid();
export const sandboxCommandV1=z.object({contractVersion:z.literal("sandbox_command_v1"),commandId:z.string().uuid(),scenario:z.literal("core-1000").optional(),environment:z.literal("synthetic_demo").optional()}).strict();
export const sandboxRunResponseV1=z.object({version:z.literal(1),environment:z.literal("synthetic_demo"),run:z.object({id:z.string().uuid(),jobId:z.string().uuid(),scenario:z.literal("core-1000"),status:z.enum(["Synthetic practice","Archived"]),step:z.number().int().min(0).max(3),stepCount:z.literal(3),fakeClockTick:z.number().int().min(0),realExternalActions:z.literal(0),headline:z.string()})});
export type SandboxRunResponse=z.infer<typeof sandboxRunResponseV1>;
