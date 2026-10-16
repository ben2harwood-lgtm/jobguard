import { describe, expect, it } from "vitest";
import { attachCancellationKit, cancellationKitV1, CANCELLATION_KIT_LABEL } from "./cancellation-kit.js";
import { quoteDocumentV1, quotePdfText, renderQuotePdf, snapshotQuote } from "./quote-document.js";
import { sha256 } from "./evidence-pack.js";

const revision = "10000000-0000-4000-8000-000000000001";
export const cancellationQuoteFixture = () => ({
 schemaVersion: "quote-document.v1" as const, documentVersion: 1, reference: "Q-PRACTICE", quoteRevisionId: revision, currency: "GBP" as const,
 issuer: { name: "Fictional Builder", address: ["Fictional site"], email: "builder@example.invalid" },
 customer: { name: "Fictional Customer", address: ["Fictional site"], email: "customer@example.invalid" },
 lines: [{ scopeItemId: revision, description: "Fictional work", quantity: "1", unit: "item", netPence: 1000 }],
 exclusions: [], qualifications: [], subtotalPence: 1000, discountPence: 0, netPence: 1000, taxPence: 200, totalPence: 1200,
});

describe("MON-5B synthetic cancellation companion", () => {
 it("MP-21 binds the labelled template and its manifest to the exact quote revision and version", () => {
  const original = cancellationQuoteFixture(), document = attachCancellationKit(original, "synthetic_demo");
  expect(original).not.toHaveProperty("cancellationKit");
  expect(document.cancellationKit).toMatchObject({ version: "cancellation-kit.v1", label: CANCELLATION_KIT_LABEL, quoteRevisionId: revision, documentVersion: 1, reference: original.reference });
  expect(document.cancellationKit!.contentHash).toBe(sha256(document.cancellationKit!.text));
  expect(cancellationKitV1.parse(document.cancellationKit)).toEqual(document.cancellationKit);
  expect(quotePdfText(document).join("\n")).toContain(CANCELLATION_KIT_LABEL);
  expect(new TextDecoder().decode(renderQuotePdf(document))).toContain("Practice cancellation request");
  expect(Object.isFrozen(snapshotQuote(document).cancellationKit)).toBe(true);
 });
 it("MP-21 rejects tampered text, substituted revision and stale companion version", () => {
  const document = attachCancellationKit(cancellationQuoteFixture(), "synthetic_demo");
  for (const change of [{ text: "Tampered" }, { contentHash: "b".repeat(64) }]) {
   expect(quoteDocumentV1.safeParse({ ...document, cancellationKit: { ...document.cancellationKit, ...change } }).success).toBe(false);
  }
  for (const change of [{ quoteRevisionId: "10000000-0000-4000-8000-000000000002" }, { documentVersion: 2 }, { reference: "Q-OTHER" }]) {
   expect(quoteDocumentV1.safeParse({ ...document, ...change }).success).toBe(false);
  }
 });
 it("MP-21 preserves legacy documents and makes the companion part of the approval artifact hash", () => {
  const legacy = quoteDocumentV1.parse(cancellationQuoteFixture());
  const bytes = renderQuotePdf(legacy);
  expect(quotePdfText(legacy).join("\n")).not.toContain(CANCELLATION_KIT_LABEL);
  const current = attachCancellationKit(legacy, "synthetic_demo");
  expect(renderQuotePdf(legacy)).toEqual(bytes);
  expect(sha256(new TextDecoder().decode(renderQuotePdf(current)))).not.toBe(sha256(new TextDecoder().decode(bytes)));
  expect(attachCancellationKit(current, "synthetic_demo")).toEqual(current);
 });
 it("MP-23 adds a kit only in the server-selected synthetic mode", () => {
  for (const mode of [undefined, "pilot_no_charge", "production_billing", "provider_sandbox"]) {
   expect(attachCancellationKit(cancellationQuoteFixture(), mode)).not.toHaveProperty("cancellationKit");
   expect(() => attachCancellationKit(attachCancellationKit(cancellationQuoteFixture(), "synthetic_demo"), mode)).toThrow("CANCELLATION_KIT_SYNTHETIC_ONLY");
  }
 });
});
