import { z } from "zod";
import { money, type Money } from "./money.js";

const uuid = z.string().uuid();
const hash = z.string().regex(/^[a-f0-9]{64}$/u);

export const builderAttestedAcceptanceV1 = z.object({
  version: z.literal("quote-acceptance.v1"),
  acceptanceId: uuid,
  jobId: uuid,
  documentId: uuid,
  documentVersion: z.number().int().positive(),
  documentHash: hash,
  expectedJobRevision: z.number().int().nonnegative(),
  acceptedTotalPence: z.number().int().nonnegative(),
  acceptedAt: z.coerce.date(),
  statedCustomerName: z.string().trim().min(1).max(160),
  statedMethod: z.enum(["verbal", "email", "message", "signed-paper"]),
  evidenceId: uuid.nullable(),
}).strict();
export type BuilderAttestedAcceptance = z.infer<typeof builderAttestedAcceptanceV1>;

export const quoteDispositionV1 = z.object({
  version: z.literal("quote-disposition.v1"),
  eventId: uuid,
  jobId: uuid,
  documentId: uuid,
  documentVersion: z.number().int().positive(),
  documentHash: hash,
  expectedJobRevision: z.number().int().nonnegative(),
  kind: z.enum(["declined", "superseded", "acceptance_cancelled"]),
  occurredAt: z.coerce.date(),
}).strict();
export type QuoteDisposition = z.infer<typeof quoteDispositionV1>;

export const acceptanceLabel = "Builder attestation of customer approval — not an e-signature or independently authenticated customer action" as const;

/** Exact immutable terms are suitable for acceptance only when every document identity field matches. */
export function acceptanceMatchesDocument(input: BuilderAttestedAcceptance, document: {id:string;documentVersion:number;contentHash:string;total:Money}): boolean {
  return input.documentId === document.id && input.documentVersion === document.documentVersion &&
    input.documentHash === document.contentHash && input.acceptedTotalPence === document.total.pence && document.total.currency === "GBP";
}
export function assertAcceptanceAllowed(input:BuilderAttestedAcceptance,document:{id:string;documentVersion:number;contentHash:string;total:Money},authority:{authorized:boolean;currentJobRevision:number}):void {
  if(!authority.authorized)throw new Error("ACCEPTANCE_FORBIDDEN");
  if(input.expectedJobRevision!==authority.currentJobRevision||!acceptanceMatchesDocument(input,document))throw new Error("STALE_ACCEPTANCE");
}

export function acceptedTerms(input: BuilderAttestedAcceptance): Readonly<{documentId:string;documentVersion:number;documentHash:string;total:Money}> {
  return Object.freeze({documentId:input.documentId,documentVersion:input.documentVersion,documentHash:input.documentHash,total:money(input.acceptedTotalPence)});
}

export const acceptanceHasZeroPlatformEffects = (): Readonly<{feeObligations:0;platformJournals:0;chargeAttempts:0;planActivations:0}> =>
  Object.freeze({feeObligations:0,platformJournals:0,chargeAttempts:0,planActivations:0});
