import { z } from "zod";

export const workspaceJobIdV1 = z.string().uuid();
export const workspaceJobStatusV1 = z.enum(["draft", "quoting", "accepted", "live", "invoiced", "paid", "lost"]);
export const jobWorkspaceResponseV1 = z.object({
  version: z.literal(1),
  environment: z.literal("synthetic_demo"),
  job: z.object({
    id: workspaceJobIdV1,
    tenantId: z.string().uuid(),
    title: z.string().min(1).max(200),
    status: workspaceJobStatusV1,
    revision: z.number().int().nonnegative(),
    updatedAt: z.string().datetime(),
  }),
});
export type JobWorkspaceResponse = z.infer<typeof jobWorkspaceResponseV1>;
