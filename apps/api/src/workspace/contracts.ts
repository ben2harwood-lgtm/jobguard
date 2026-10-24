import { z } from "zod";

// Kept local so Playwright can load this contract through its CommonJS loader.
// Compatibility with core utcDatetimeV1 is covered by contracts.datetime.test.ts.
const dateAndTime = `${z.regexes.date.source.slice(1, -1)}T${z.regexes.time({}).source.slice(1, -1)}`;
const utcDatetimeV1 = z.string().regex(new RegExp(`^${dateAndTime}Z$`), "Invalid datetime");

export const workspaceJobIdV1 = z.guid({ error: "Invalid uuid" });
export const workspaceJobStatusV1 = z.enum(["draft", "quoting", "accepted", "live", "invoiced", "paid", "lost"]);
export const jobWorkspaceResponseV1 = z.object({
  version: z.literal(1),
  environment: z.literal("synthetic_demo"),
  job: z.object({
    id: workspaceJobIdV1,
    tenantId: z.guid({ error: "Invalid uuid" }),
    title: z.string().min(1).max(200),
    status: workspaceJobStatusV1,
    revision: z.number().int().nonnegative(),
    updatedAt: utcDatetimeV1,
    // Confirmed work only; retired proposal identities never prove completion.
    scopeIdentityIds: z.array(workspaceJobIdV1),
  }),
});
export type JobWorkspaceResponse = z.infer<typeof jobWorkspaceResponseV1>;
