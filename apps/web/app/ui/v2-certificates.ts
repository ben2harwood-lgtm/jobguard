import { z } from "zod";

// V2 currently uses this one work-plan template. No dependency on unmerged C5.
export const V2_CERTIFICATES_TEMPLATE_KEY = "splashback-decorating.v1";
export interface Certificate {
  key: string;
  label: string;
  when: string;
  whoIssues: string;
  needed: "always" | "if";
}

export const v2Certificates: Readonly<Record<string, readonly Certificate[]>> = {
  [V2_CERTIFICATES_TEMPLATE_KEY]: [
    { key: "electrical", label: "Minor Electrical Installation Works Certificate (BS 7671)",
      when: "If a socket or spur is moved or added behind the splashback.",
      whoIssues: "Issued by a registered electrician.", needed: "if" },
    { key: "gas", label: "Gas Safe check",
      when: "If a hob or gas pipe is disconnected or moved.",
      whoIssues: "Carried out by a Gas Safe engineer.", needed: "if" },
    { key: "tile-data", label: "Manufacturer's tile adhesive and grout data sheets",
      when: "Always keep these for the handover pack.",
      whoIssues: "Supplied by the adhesive and grout manufacturers.", needed: "always" },
    { key: "paint-data", label: "Paint product data and colour references",
      when: "Always keep these for touch-ups.",
      whoIssues: "Product data from the paint manufacturer; colour references recorded by the builder.", needed: "always" },
    { key: "waste", label: "Waste transfer note",
      when: "If a skip or waste carrier is used.",
      whoIssues: "Provided by the skip company or waste carrier.", needed: "if" },
  ],
};

export type CertificateStatus = "got_it" | "not_needed" | "still_needed";
export interface CertificateTick { status: CertificateStatus; reason: string }
export type CertificateTicks = Record<string, CertificateTick>;
const tickV1 = z.discriminatedUnion("status", [
  z.object({ status: z.literal("got_it"), reason: z.literal("") }).strict(),
  z.object({ status: z.literal("still_needed"), reason: z.literal("") }).strict(),
  z.object({ status: z.literal("not_needed"), reason: z.string().trim().min(1).max(200) }).strict(),
]);
const savedV1 = z.object({ version: z.literal("v2-certificates.v1"), ticks: z.record(z.string(), tickV1) }).strict();

export const certificateStorageKey = (jobId: string, templateKey = V2_CERTIFICATES_TEMPLATE_KEY) =>
  `jobguard:v2-certificates:${encodeURIComponent(jobId)}:${encodeURIComponent(templateKey)}`;

export const isCertificateTickValid = (tick: CertificateTick) => tickV1.safeParse(tick).success;

/** Keep only this template's valid drafts; an unexplained exemption is never saved. */
export function serialiseCertificateTicks(ticks: CertificateTicks, templateKey = V2_CERTIFICATES_TEMPLATE_KEY) {
  const valid: CertificateTicks = {};
  for (const certificate of v2Certificates[templateKey] ?? []) {
    const parsed = tickV1.safeParse(ticks[certificate.key]);
    if (parsed.success) valid[certificate.key] = parsed.data;
  }
  return JSON.stringify({ version: "v2-certificates.v1", ticks: valid });
}

export function parseCertificateTicks(raw: string | null, templateKey = V2_CERTIFICATES_TEMPLATE_KEY): CertificateTicks {
  if (raw === null) return {};
  const saved = savedV1.parse(JSON.parse(raw));
  return Object.fromEntries((v2Certificates[templateKey] ?? [])
    .filter(certificate => Object.hasOwn(saved.ticks, certificate.key))
    .map(certificate => [certificate.key, saved.ticks[certificate.key]!]));
}
