import { z } from "zod";
import { sha256 } from "./evidence-pack.js";
import { logSiteExtraV1 } from "./site-extra.js";
const uuid = z.guid({ error: "Invalid uuid" });
const lowerHash = z.string().regex(/^[0-9a-f]{64}$/u);
const canonicalId = (value: string): string => { if (!uuid.safeParse(value).success) throw new RangeError("invalid id"); return value.toLowerCase(); };
/** UTF-8 byte-length framing, as merged `extraOriginHashV1` uses: NULL = N; text = S<byteLength>:<text>; */
const encode = (value: string | null): string => value === null ? "N;" : `S${new TextEncoder().encode(value).length}:${value};`;

export const siteExtraContentFormatV1 = "site-extra-content.v1" as const;
export const residentConfirmationHeaderV1 = "jobguard-resident-confirmation.v1" as const;
export const residentConfirmationObjectVersion = "resident-confirmation.v1" as const;
export const residentConfirmationStatementV1 = "confirmed on the operative's device; identity not verified" as const;
export const residentConfirmationContentType = "text/plain; charset=utf-8" as const;
export const residentConfirmationEvidenceType = "resident_confirmation" as const;
export const sitePhotoEvidenceType = "site_photo" as const;

/** Content hash, format `site-extra-content.v1`: the job, the description, the note and the photo's SHA-256, taken exactly as stored. */
export function siteExtraContentSha256V1(input: { jobId: string; description: string; note: string; photoSha256: string | null }): string {
 if (input.photoSha256 !== null && !lowerHash.safeParse(input.photoSha256).success) throw new RangeError("invalid photo hash");
 return sha256(`${siteExtraContentFormatV1}\n${encode(canonicalId(input.jobId))}${encode(input.description)}${encode(input.note)}${encode(input.photoSha256)}`);
}

/** The server-written confirmation document, format `resident-confirmation.v1`: seven lines, each ended by one LF. Nothing about the resident. */
export function residentConfirmationDocumentV1(input: { tenantId: string; jobId: string; confirmationId: string; contentSha256: string }): string {
 if (!lowerHash.safeParse(input.contentSha256).success) throw new RangeError("invalid content hash");
 return [
  residentConfirmationHeaderV1,
  `tenant:${canonicalId(input.tenantId)}`,
  `job:${canonicalId(input.jobId)}`,
  `confirmation:${canonicalId(input.confirmationId)}`,
  `content-format:${siteExtraContentFormatV1}`,
  `content-sha256:${input.contentSha256}`,
  `statement:${residentConfirmationStatementV1}`,
 ].map(line => `${line}\n`).join("");
}

/** v3 is a separate, strictly additive extension of v1 (not a step in a sequence): v1's fields keep their meaning. It carries only a photo id and the hash the screen showed. */
export const logSiteExtraV3 = z.object({
 version: z.literal("log-site-extra.v3"), commandId: uuid, note: logSiteExtraV1.shape.note, description: logSiteExtraV1.shape.description,
 photoEvidenceId: uuid.optional(), residentConfirmation: z.object({ shownContentSha256: lowerHash }).strict().optional(),
}).strict();
export type LogSiteExtraV3 = z.infer<typeof logSiteExtraV3>;
export const siteExtraLoggedV3 = z.object({
 version: z.literal("site-extra-logged.v3"), environment: z.literal("synthetic_demo"), realExternalActions: z.literal(0), jobId: uuid, extraId: uuid, state: z.literal("logged"),
 evidence: z.object({ photoEvidenceId: uuid.nullable(), residentConfirmationEvidenceId: uuid.nullable(), contentFormat: z.literal(siteExtraContentFormatV1), contentSha256: lowerHash }).strict(),
}).strict();
export type SiteExtraLoggedV3 = z.infer<typeof siteExtraLoggedV3>;
