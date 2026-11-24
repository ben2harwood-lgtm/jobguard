import { z } from "zod";
import { MAX_MONEY_PENCE } from "./money.js";
const uuid = z.guid().transform(value => value.toLowerCase());
export const customerVariationReadV1 = z.object({ version: z.literal("customer-variations-read.v1"), jobId: uuid }).strict();
/** MON-5 variation leaf of the proposed exact customer-portal-approval.v1 envelope. */
export const customerVariationApprovalCommandV1 = z.object({
  version: z.literal("customer-portal-approval.v1"), commandId: uuid, jobId: uuid,
  expectedJobRevision: z.number().int().nonnegative().max(2147483647),
  target: z.object({ kind: z.literal("variation"), id: uuid, revision: z.number().int().positive().max(2147483647),
    hash: z.string().regex(/^[a-f0-9]{64}$/u),
    amount: z.object({ pence: z.number().int().min(-MAX_MONEY_PENCE).max(MAX_MONEY_PENCE), currency: z.literal("GBP") }).strict(),
    // QW-1: the SHA-256 of each photo shown, in order. Required when the revision carries photos.
    photos: z.array(z.string().regex(/^[a-f0-9]{64}$/u)).max(6).optional(),
  }).strict(),
}).strict();
export const customerVariationPhotoReadV1 = z.object({
  version: z.literal("customer-variation-photo-read.v1"), jobId: uuid, evidenceId: uuid,
}).strict();
export const customerVariationPhotoV1 = z.object({
  evidenceId: uuid, sha256: z.string().regex(/^[a-f0-9]{64}$/u), receivedAt: z.iso.datetime({ precision: 3 }),
});
export const customerVariationViewV1 = z.object({
  version: z.literal("customer-variations.v1"), jobId: uuid, jobRevision: z.number().int(),
  variations: z.array(z.object({ id: uuid, revision: z.number().int(), hash: z.string(), description: z.string(),
    amount: z.object({ pence: z.number().int(), currency: z.literal("GBP") }), approved: z.boolean(),
    method: z.enum(["builder_attestation", "customer_evidence", "customer_authenticated"]).nullable(),
    photos: z.array(customerVariationPhotoV1).max(6).default([]),
  })),
});
export type CustomerVariationView = z.infer<typeof customerVariationViewV1>;
