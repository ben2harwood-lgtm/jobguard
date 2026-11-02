import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { supplierFixtures, purchaseOrderAuthorityContent } from "@jobguard/core";
import { decodePracticeStructuredSource } from "./final-check-practice-readers.js";
const hash = (text: string) => createHash("sha256").update(text).digest("hex");

it.each(["materials-B-delivery", "materials-B-invoice", "materials-B-revised-invoice", "materials-320-invoice", "materials-B-credit"] as const)("reads the exact fictional material original %s", id => {
  const f = supplierFixtures[id], document = { supplier_context: "fictional-merchant", status: "ready", document_type: f.type, document_number: f.number, content_hash: hash(f.bytes) };
  const input = { content_hash: hash(f.bytes), media_type: f.media, byte_length: Buffer.byteLength(f.bytes), page_count: f.pages, version: 1, parent_version_id: null, page_from: null, page_to: null };
  expect(decodePracticeStructuredSource("unlinked_supplier_version", input, document)).toEqual({ text: f.bytes });
  expect(decodePracticeStructuredSource("unlinked_supplier_document", document, document)).toEqual({ text: f.bytes });
  for (const changed of [{ ...input, content_hash: "a".repeat(64) }, { ...input, byte_length: 1 }, { ...input, media_type: "image/png" }, { ...input, parent_version_id: "parent" }])
    expect(decodePracticeStructuredSource("unlinked_supplier_version", changed, document)).toBeNull();
  expect(decodePracticeStructuredSource("unlinked_supplier_version", input, { ...document, status: "held" })).toBeNull();
});

it.each(["unreadable", "pending", "password-protected", "corrupt", "oversized", "multi-page-invoice"] as const)("does not claim a zero for %s", id => {
  const f = supplierFixtures[id], doc = { supplier_context: "fictional-merchant", status: "ready", document_type: f.type, document_number: f.number, content_hash: hash(f.bytes) };
  expect(decodePracticeStructuredSource("unlinked_supplier_document", doc, doc)).toBeNull();
});

it.each([2000, 2500])("reads DR-02's exact order artifact at %i pence and rejects unknown or corrupted revisions", price => {
  const authority = { quantity: "10", unitPricePence: price, recipient: "merchant@example.invalid", requiredDate: "2026-10-28", revision: 1 };
  const row = { quantity_decimal: "10", unit_price_pence: price, order_net_pence: price === 2000 ? 20000 : 25000, agreed_net_pence: 20000,
    recipient: authority.recipient, required_date: authority.requiredDate, revision: 1, authority_hash: hash(purchaseOrderAuthorityContent(authority)) };
  expect(decodePracticeStructuredSource("unlinked_purchase_order", row, null)).toEqual({ text: purchaseOrderAuthorityContent(authority) });
  for (const changed of [{ ...row, order_net_pence: 1 }, { ...row, quantity_decimal: "11" }, { ...row, authority_hash: "a".repeat(64) }, { ...row, recipient: "real@example.com" }])
    expect(decodePracticeStructuredSource("unlinked_purchase_order", changed, null)).toBeNull();
});

it("reads the recorded merchant 40-unit order and rejects changes to its approved facts", () => {
  const authority = { quantity: "40", unitPricePence: 2000, recipient: "orders@fictional-merchant.invalid", requiredDate: "2026-10-01", revision: 1 };
  const row = { quantity_decimal: "40", unit_price_pence: 2000, order_net_pence: 80000, agreed_net_pence: 80000,
    recipient: authority.recipient, required_date: authority.requiredDate, revision: 1, authority_hash: hash(purchaseOrderAuthorityContent(authority)) };
  expect(decodePracticeStructuredSource("unlinked_purchase_order", row, null)).toEqual({ text: purchaseOrderAuthorityContent(authority) });
  for (const changed of [{ ...row, order_net_pence: 20000 }, { ...row, agreed_net_pence: 20000 },
    { ...row, quantity_decimal: "41" }, { ...row, unit_price_pence: 2800 }, { ...row, authority_hash: "a".repeat(64) },
    { ...row, recipient: "real@example.com" }])
    expect(decodePracticeStructuredSource("unlinked_purchase_order", changed, null)).toBeNull();
});

it("requires the credit's exact original, document identity and ready state", () => {
  const fixture = supplierFixtures["materials-B-credit"];
  const document = { supplier_context: "fictional-merchant", status: "ready", document_type: fixture.type,
    document_number: fixture.number, content_hash: hash(fixture.bytes) };
  const version = { content_hash: hash(fixture.bytes), media_type: fixture.media, byte_length: Buffer.byteLength(fixture.bytes),
    page_count: fixture.pages, version: 1, parent_version_id: null, page_from: null, page_to: null };
  for (const changed of [{ ...document, content_hash: "a".repeat(64) }, { ...document, document_type: "invoice" },
    { ...document, document_number: "CR-UNKNOWN" }, { ...document, status: "held" }, { ...document, supplier_context: "unknown" }])
    expect(decodePracticeStructuredSource("unlinked_supplier_version", version, changed)).toBeNull();
});
