import { describe, expect, it } from "vitest";
import { attachCancellationKit, cancellationKitV1, CANCELLATION_KIT_LABEL } from "./cancellation-kit.js";
import { quoteDocumentV1, quotePdfText, renderQuotePdf, snapshotQuote } from "./quote-document.js";
import { sha256 } from "./evidence-pack.js";

import { customerTypes, type JobPartiesSnapshotV1 } from "./job-parties.js";

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

const id = "10000000-0000-4000-8000-000000000001";
const parties = (type: JobPartiesSnapshotV1["customer"]["type"]): JobPartiesSnapshotV1 => ({
 version: "job-parties-snapshot.v1", bindingId: id, customerRevisionId: id, siteRevisionId: id, payingPartyRevisionId: id,
 customer: { version: "customer.v1", type, name: "Fictional customer" },
 payingParty: { version: "customer.v1", type: "business", name: "Fictional payer" },
 site: { version: "site.v1", addressLines: ["1 Fictional Road"], town: "London", postcode: "SW1A 1AA" },
});

describe("domestic practice kit selection", () => {
 it("uses the customer, includes the fixed template hash, and leaves every price unchanged", () => {
  const document = quoteDocumentV1.parse({ ...cancellationQuoteFixture(), jobParties: parties("person") });
  const current = attachCancellationKit(document, "synthetic_demo");
  expect(current.cancellationKit?.contentHash).toBe("0838fd7d952073b9713db51509b4a478499cc93e7ea79c07a95dcdbe1e15f93e");
  const { cancellationKit, ...unchanged } = current;
  expect(cancellationKit).toBeDefined();
  expect(unchanged).toEqual(document);
 });
 it.each(customerTypes.filter(type => type !== "person"))("excludes %s customers and refuses a supplied kit", type => {
  const base = cancellationQuoteFixture();
  const kit = attachCancellationKit(base, "synthetic_demo").cancellationKit;
  const document = { ...base, jobParties: parties(type) };
  expect(attachCancellationKit(document, "synthetic_demo")).not.toHaveProperty("cancellationKit");
  expect(() => attachCancellationKit({ ...document, cancellationKit: kit }, "synthetic_demo")).toThrow("CANCELLATION_KIT_CUSTOMER_MISMATCH");
  expect(quoteDocumentV1.safeParse({ ...document, cancellationKit: kit }).success).toBe(false);
 });
 it("keeps the pre-kit fixture PDF bytes frozen", () => {
  const bytes = renderQuotePdf(quoteDocumentV1.parse(cancellationQuoteFixture()));
  expect(sha256(new TextDecoder().decode(bytes))).toBe("ed88cfc92e647dd532fbfc9bd450b22238ff972d69ef3947b5a2933a062a52c4");
 });
});
