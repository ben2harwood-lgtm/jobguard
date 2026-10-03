import { z } from "zod";
export const jobTrackV1 = z.enum(["small_builder", "contractor"]);
export const smallBuilderOriginV1 = z.enum(["builder_logged", "final_review", "jobguard_catch"]);
export const contractorOriginV1 = z.enum(["site_user", "jobguard_surfaced_confirmed", "office_entry", "client_instruction"]);
export const variationOriginV1 = z.discriminatedUnion("jobTrack", [
  z.object({ version: z.literal("variation-origin.v1"), jobTrack: z.literal("small_builder"), kind: smallBuilderOriginV1 }).strict(),
  z.object({ version: z.literal("variation-origin.v1"), jobTrack: z.literal("contractor"), kind: contractorOriginV1 }).strict(),
]);
export type VariationOrigin = z.infer<typeof variationOriginV1>;
/** This schema validates provenance; it confers no billability or fee entitlement. */
export const extraOriginV1 = z.object({
  version: z.literal("extra-origin.v1"), tenantId: z.string().uuid(), jobId: z.string().uuid(), variationId: z.string().uuid(),
  origin: variationOriginV1, commandId: z.string().uuid(), raisingMembershipId: z.string().uuid(), raisingRole: z.string().min(1).max(40),
  serverRecordedAt: z.string().datetime({ offset: true }), deviceId: z.string().min(1).max(200).nullable(),
  deviceCapturedAt: z.string().datetime({ offset: true }).nullable(), evidenceHash: z.string().regex(/^[a-f0-9]{64}$/u).nullable(),
}).strict();
