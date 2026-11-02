import { z } from "zod";
import { extraOriginV1 } from "./extra-origin.js";
import { enterpriseStates } from "./enterprise-domain/contracts.js";
import { instantV1 } from "./receipt-allocation.js";
import { sha256 } from "./evidence-pack.js";
const uuid = z.guid({ error: "Invalid uuid" });
const hash = z.string().regex(/^[0-9a-f]{64}$/u);
export const raiseExtraV1 = z.object({
 version: z.literal("raise-extra.v1"), commandId: uuid, commandType: z.enum(["LogSiteExtra", "ConfirmPrompt", "RecordOfficeExtra", "RecordClientInstruction"]),
 jobId: uuid, actorMembershipId: uuid, grantId: uuid, note: z.string().min(1).max(5000), description: z.string().min(1).max(500),
 sorItem: z.object({ versionId: uuid, code: z.string().min(1).max(80) }).strict().optional(), excessOfScopeItemId: uuid.optional(),
 clientCaptureId: uuid.optional(), deviceId: z.string().min(1).max(200).optional(), deviceCapturedAt: instantV1.optional(), siteVisitId: uuid.optional(), evidenceId: uuid.optional(), residentConfirmationEvidenceId: uuid.optional(),
}).strict();
export type RaiseExtra = z.infer<typeof raiseExtraV1>;
export const contractorProvenanceV1 = z.object({ commandType: raiseExtraV1.shape.commandType.nullable(), raisingGrantId: uuid.nullable(), raiserAssigned: z.boolean().nullable(), workOrderId: uuid.nullable(), workOrderRevisionId: uuid.nullable(), siteVisitId: uuid.nullable(), evidenceId: uuid.nullable(), residentConfirmationEvidenceId: uuid.nullable(), clientCaptureId: uuid.nullable(), originHash: hash.nullable() }).strict();
export const extraRecordV1 = z.object({ version: z.literal("extra-record.v1"), origin: extraOriginV1, contractorProvenance: contractorProvenanceV1, latestEventKind: z.enum(enterpriseStates).nullable() }).strict();
export type ExtraRecord = z.infer<typeof extraRecordV1>;
/** Leaf-owned legacy read contract; SH-1's command-origin schema remains strict. */
export const extraOriginLegacyV1 = extraOriginV1.extend({
 version: z.literal("extra-origin-legacy.v1"), legacy: z.literal(true),
 provenance: z.enum(["legacy_synthetic_capture", "backfilled_synthetic_fixture"]),
 origin: z.object({ version: z.literal("variation-origin.v1"), jobTrack: z.literal("small_builder"), kind: z.literal("builder_logged") }).strict(),
 commandId: z.null(), raisingMembershipId: uuid.nullable(), raisingRole: z.literal("legacy_unrecorded"),
}).strict();
export const extraRecordLegacyV1 = extraRecordV1.extend({ version: z.literal("extra-record-legacy.v1"), origin: extraOriginLegacyV1 }).strict();
export type ExtraLegacyRecord = z.infer<typeof extraRecordLegacyV1>;
export type ExtraReadRecord = ExtraRecord | ExtraLegacyRecord;
export const extraDuplicateLinkV1 = z.object({ version: z.literal("extra-duplicate-link.v1"), commandId: uuid, jobId: uuid, actorMembershipId: uuid, duplicateId: uuid, canonicalId: uuid }).strict();
export const extraOrderLineLinkV1 = z.object({ version: z.literal("extra-order-line-link.v1"), commandId: uuid, jobId: uuid, actorMembershipId: uuid, variationId: uuid, workOrderId: uuid, revisionId: uuid, scopeItemId: uuid }).strict();
export const extraPersistenceErrorCodes = ["NOT_FOUND", "INVALID_COMMAND", "COMMAND_CONFLICT", "INVALID_ORIGIN", "STALE_REVISION", "PROMPT_ORIGIN_HELD", "DUPLICATE_LINK_REFUSED", "EXTRA_EXPORTED", "ORDER_LINE_LINK_REFUSED", "DATABASE_UNAVAILABLE", "UNLINK_FORBIDDEN", "NOT_LINKED", "ALREADY_UNLINKED"] as const;
export type ExtraPersistenceErrorCode = typeof extraPersistenceErrorCodes[number];
export class ExtraPersistenceError extends Error {
 constructor(readonly code: ExtraPersistenceErrorCode) { super(code); this.name = "ExtraPersistenceError"; }
}
/** Fixed order; never object iteration or JSON timestamp conversion. */
export const extraOriginHashFields = ["tenantId", "jobId", "variationId", "jobTrack", "kind", "provenance", "commandId", "commandType", "raisingMembershipId", "raisingRole", "raisingGrantId", "raiserAssigned", "serverRecordedAt", "deviceId", "deviceCapturedAt", "clientCaptureId", "workOrderId", "workOrderRevisionId", "siteVisitId", "evidenceId", "evidenceHash", "residentConfirmationEvidenceId", "sourceCaptureKind", "sourceCaptureHash"] as const;
export type ExtraOriginHashInput = { [K in typeof extraOriginHashFields[number]]: K extends "raiserAssigned" ? boolean | null : string | null };
/** UTF-8 byte-length framing: NULL = N; string = S<byteLength>:<value>; boolean = true/false. */
export function extraOriginHashV1(input: ExtraOriginHashInput): string {
 const encode = (v: string | boolean | null) => v === null ? "N;" : `S${new TextEncoder().encode(String(v)).length}:${String(v)};`;
 return sha256(`extra-origin-hash.v1\n${extraOriginHashFields.map(k => encode(input[k])).join("")}`);
}

export const extraUnlinkCommandType = "UnlinkDuplicate" as const;
export const extraUnlinkReasonCodes = ["not_same_work", "wrong_pair", "linked_in_error"] as const;
export const extraDuplicateUnlinkV1 = z.object({
 version: z.literal("extra-duplicate-unlink.v1"), commandId: uuid, jobId: uuid, actorMembershipId: uuid, linkId: uuid,
 expectedRevision: z.number().int().min(1).max(1_000_000), reasonCode: z.enum(extraUnlinkReasonCodes),
}).strict();
export type ExtraDuplicateUnlink = z.infer<typeof extraDuplicateUnlinkV1>;
export const extraDuplicateLinksV1 = z.object({
 version: z.literal("extra-duplicate-links.v1"), jobId: uuid, revision: z.number().int().nonnegative().safe(),
 activeLinks: z.array(z.object({ linkId: uuid, duplicateId: uuid, canonicalId: uuid }).strict()),
}).strict();
export type ExtraDuplicateLinks = z.infer<typeof extraDuplicateLinksV1>;
