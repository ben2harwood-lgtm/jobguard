import { z } from "zod";
import { sha256 } from "./evidence-pack.js";

export const CANCELLATION_KIT_LABEL = "synthetic template, not reviewed (D06 v2)";
const template = [
 "Practice cancellation request",
 "This fictional form is for sandbox practice only. D06 v2 review is pending.",
 "Quote reference: ____________________",
 "To the builder: ____________________",
 "Work concerned: ____________________",
 "Customer name: ____________________",
 "Customer address: ____________________",
 "Request: I wish to cancel the work identified above.",
 "Date: ____________________",
 "Signature (if used): ____________________",
 "No request is submitted by completing or downloading this practice form.",
].join("\n");

export const cancellationKitV1 = z.object({
 version: z.literal("cancellation-kit.v1"),
 environment: z.literal("synthetic_demo"),
 label: z.literal(CANCELLATION_KIT_LABEL),
 quoteRevisionId: z.string().uuid(),
 documentVersion: z.number().int().positive(),
 reference: z.string().min(1).max(80),
 templateVersion: z.literal("cancellation-template.synthetic.v1"),
 text: z.literal(template),
 contentHash: z.literal(sha256(template)),
}).strict().readonly();
export type CancellationKit = z.infer<typeof cancellationKitV1>;

export class CancellationKitError extends Error {
 readonly code = "CANCELLATION_KIT_SYNTHETIC_ONLY";
 constructor() { super("CANCELLATION_KIT_SYNTHETIC_ONLY"); }
}

/** Include in every new synthetic quote; do not infer domestic legal status from party type. */
export function attachCancellationKit<T extends { quoteRevisionId: string; documentVersion: number; reference: string; cancellationKit?: CancellationKit | undefined }>(document: T, environment: string | undefined): T & { cancellationKit?: CancellationKit | undefined } {
 if (environment !== "synthetic_demo") {
  if (document.cancellationKit) throw new CancellationKitError();
  return document;
 }
 return { ...document, cancellationKit: cancellationKitV1.parse({ version: "cancellation-kit.v1", environment, label: CANCELLATION_KIT_LABEL,
  quoteRevisionId: document.quoteRevisionId, documentVersion: document.documentVersion, reference: document.reference,
  templateVersion: "cancellation-template.synthetic.v1", text: template, contentHash: sha256(template) }) };
}

export function cancellationKitRows(raw: unknown): string[] {
 const kit = cancellationKitV1.parse(raw);
 return ["DOMESTIC CANCELLATION-NOTICE KIT", kit.label, `Template: ${kit.templateVersion}`,
  `Companion for ${kit.reference}, version ${kit.documentVersion}`, `Quote revision: ${kit.quoteRevisionId}`,
  "Template SHA-256:", kit.contentHash, ...kit.text.split("\n")];
}
