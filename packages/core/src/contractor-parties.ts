import { z } from "zod";
const uuid = z.string().uuid();
export const noResidentReasons = ["void_property", "communal_area", "client_withheld"] as const;
/** Synthetic-only entry boundary. No route accepts real resident contacts while G1 is closed. */
const residentContactFields = {
  phone: z.string().trim().min(3).max(40).optional(),
  email: z.string().trim().email().max(320).endsWith(".invalid").optional(),
};
export const residentContactV1 = z.object({
  version: z.literal("resident-contact.v1"), name: z.string().trim().min(1).max(160), ...residentContactFields,
}).strict().refine(value => value.phone !== undefined || value.email !== undefined, { message: "A phone or email is required" });
export const contractorResidentV1 = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("contact"), contact: residentContactV1 }).strict(),
  z.object({ kind: z.literal("none"), reason: z.enum(noResidentReasons) }).strict(),
]);
/**
 * Import-entry boundary only. It carries the same strict shape as the schemas above, but lets a party be absent or null (and a
 * contact lack its name, or lack both phone and email) so that the controlled routine, not the schema, refuses the import with
 * CONTRACTOR_PARTIES_REQUIRED. Present-but-malformed values still fail here as INVALID_COMMAND.
 */
export const contractorResidentBoundaryV1 = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("contact"), contact: z.object({ version: z.literal("resident-contact.v1"), name: z.string().trim().min(1).max(160).nullish(), phone: residentContactFields.phone.nullish(), email: residentContactFields.email.nullish() }).strict().nullish() }).strict(),
  z.object({ kind: z.literal("none"), reason: z.enum(noResidentReasons).nullish() }).strict(),
]);
export const contractorCustomerLinkV1 = z.object({
  version: z.literal("contractor-customer-link.v1"), environment: z.literal("synthetic_demo"), commandId: uuid, customerRevisionId: uuid,
}).strict();
const contractorPartyImportFields = {
  version: z.literal("contractor-party-import.v1"), environment: z.literal("synthetic_demo"), commandId: uuid,
  jobId: uuid, workOrderId: uuid, expectedJobRevision: z.number().int().nonnegative().max(2147483646), payingPartyRevisionId: uuid.optional(),
};
export const contractorPartyImportV1 = z.object({
  ...contractorPartyImportFields, clientId: uuid, contractId: uuid, siteRevisionId: uuid, resident: contractorResidentV1,
}).strict();
/** Accepted by `ContractorPartyRepository.bindInTransaction`/`bind`; see `contractorResidentBoundaryV1`. */
export const contractorPartyImportBoundaryV1 = z.object({
  ...contractorPartyImportFields, clientId: uuid.nullish(), contractId: uuid.nullish(), siteRevisionId: uuid.nullish(), resident: contractorResidentBoundaryV1.nullish(),
}).strict();
export type ContractorPartyImport = z.infer<typeof contractorPartyImportV1>;
export const contractorPartyResultV1 = z.object({
  version: z.literal("contractor-party-result.v1"), environment: z.literal("synthetic_demo"), commandId: uuid, id: uuid, realExternalActions: z.literal(0),
}).strict();
export const contractorResidentReadV1 = z.object({
  version: z.literal("contractor-resident-read.v1"), environment: z.literal("synthetic_demo"), jobId: uuid, resident: contractorResidentV1,
}).strict();
/** Strict per-feature allowlist: no arbitrary reference keys can smuggle contact fields. */
export const contractorPartyAuditPayloadV1 = z.object({
  references: z.object({ commandId: uuid, identityId: uuid, environment: z.literal("synthetic_demo") }).strict(),
  hashes: z.object({ document: z.string().regex(/^[a-f0-9]{64}$/u) }).strict(),
  classifications: z.object({ action: z.literal("operational") }).strict(),
}).strict();
export const contractorPartyEventTypes = ["contractor.parties.customer_linked", "contractor.parties.bound"] as const;
export function contractorPartyAuditPayload(_action: "customer_linked" | "bound", commandId: string, identityId: string, document: string) {
  return contractorPartyAuditPayloadV1.parse({ references: { commandId, identityId, environment: "synthetic_demo" }, hashes: { document }, classifications: { action: "operational" } });
}
export const contractorPartyErrorCodes = ["UNAUTHENTICATED", "MODE_FORBIDDEN", "INVALID_COMMAND", "NOT_FOUND", "CONTRACTOR_PARTIES_REQUIRED", "CUSTOMER_TYPE_MISMATCH", "PARTY_NOT_FOUND", "COMMAND_CONFLICT", "STALE_REVISION", "DATABASE_UNAVAILABLE"] as const;
export class ContractorPartyError extends Error {
  constructor(readonly code: typeof contractorPartyErrorCodes[number]) { super(code); }
}
