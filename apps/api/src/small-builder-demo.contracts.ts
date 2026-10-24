import { z } from "zod";

/** Request-shape preparation only. Selection is not execution or authority.
 * No runtime, operation binding or storage writer is installed by this module.
 * Intent/checkpoint schemas remain held until accepted P1 recipes and producer
 * references are available; a generic operation/result record is not permitted.
 */
const uuid = z.string().uuid();
const expectedRunRevision = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

export const smallBuilderDemoCreateV1 = z.object({
  contractVersion: z.literal("small-builder-demo.create.v1"),
  commandId: uuid,
  scenario: z.enum(["core-1000", "recovery-18800", "shadow-30000", "meter", "trial"]),
}).strict();

export const smallBuilderDemoResetV1 = z.object({
  contractVersion: z.literal("small-builder-demo.reset.v1"),
  commandId: uuid,
  expectedRunRevision,
}).strict();

export const smallBuilderDemoReportSnapshotV1 = z.object({
  contractVersion: z.literal("small-builder-demo.report-snapshot.v1"),
  commandId: uuid,
  expectedRunRevision,
}).strict();

// These are subject locators, never proof of ownership or permission to read.
export const smallBuilderDemoReadRunV1 = z.object({ runId: uuid }).strict();
export const smallBuilderDemoReadReportV1 = z.object({ runId: uuid, snapshotId: uuid.optional() }).strict();
