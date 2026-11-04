import { describe, expect, it } from "vitest";
import { assessMerchantSource, merchantConnector, merchantConnectorV1, requireMerchantCapability, validateMerchantAlias } from "./merchant-connectors.js";
import { supplierDocumentIntakeV1, supplierFixtures } from "./supplier-documents.js";
const source = { version: "merchant-feed.v1", supplierAccount: "fictional-account", type: "invoice", number: "INV-MB-001", text: supplierFixtures["materials-B-invoice"].bytes };
describe("dark merchant capability and ingestion contract", () => {
  it("separates capabilities and refuses unknown merchants, live and unspecified environments", () => {
    for (const environment of [undefined, "production", "pilot_no_charge", "sandbox"]) {
      expect(() => merchantConnector("fictional-merchant", environment)).toThrow("MERCHANT_LIVE_DISABLED");
    }
    expect(requireMerchantCapability("fictional-merchant", "read", "synthetic_demo").capabilities.read.accessRoute).toBe("fixture:in-process-only");
    for (const capability of ["quote", "order", "acknowledgment"] as const) expect(() => requireMerchantCapability("fictional-merchant", capability, "synthetic_demo")).toThrow("MERCHANT_CAPABILITY_UNAVAILABLE");
    expect(() => merchantConnector("real-provider", "synthetic_demo")).toThrow("MERCHANT_CAPABILITY_UNAVAILABLE");
    const copy = merchantConnector("fictional-merchant", "synthetic_demo"); copy.capabilities.order.available = true;
    expect(() => requireMerchantCapability("fictional-merchant", "order", "synthetic_demo")).toThrow();
    expect(() => merchantConnectorV1.parse({ ...copy, endpoint: "https://merchant.invalid" })).toThrow();
    expect(() => merchantConnectorV1.parse({ ...copy, capabilities: { ...copy.capabilities, read: { available: true } } })).toThrow();
  });
  it("detects supplier/account substitution, version and shape drift instead of trusting sender claims", () => {
    expect(assessMerchantSource(source)).toBeNull();
    expect(assessMerchantSource({ ...source, supplierAccount: "another-account" })).toBe("supplier_identity");
    expect(assessMerchantSource({ ...source, version: "merchant-feed.v2" })).toBe("schema_drift");
    expect(assessMerchantSource({ ...source, owner: "another-tenant" })).toBe("schema_drift");
    expect(assessMerchantSource({ ...source, number: null })).toBe("schema_drift");
    expect(assessMerchantSource({ ...source, type: "acknowledgment" })).toBe("schema_drift");
  });
  it("quarantines invalid arithmetic, credit/type confusion and amounts beyond the application limit", () => {
    for (const text of ["malformed", supplierFixtures["merchant-invalid-amount"].bytes,
      "INVOICE\n1 each @ GBP 10000000000.01\nNET GBP 10000000000.01", "INVOICE\n999999999999999999999 each @ GBP 0.00\nNET GBP 0.00", "INVOICE\n0.0000001 each @ GBP 0.00\nNET GBP 0.00"]) {
      expect(assessMerchantSource({ ...source, text })).toBe("malformed_document");
    }
    expect(assessMerchantSource({ ...source, type: "credit" })).toBe("malformed_document");
    expect(assessMerchantSource({ ...source, type: "credit", text: source.text.replace("INVOICE", "CREDIT") })).toBeNull();
  });
  it("accepts only exact fictional aliases and fixture IDs; never accepts external data or commercial authority", () => {
    validateMerchantAlias("fixture_mail", "materials@fictional-builder.invalid");
    for (const alias of [undefined, "materials@fictional-builder.invalid\r\nBcc: other", "Materials@fictional-builder.invalid"]) expect(() => validateMerchantAlias("fixture_mail", alias)).toThrow();
    expect(() => validateMerchantAlias("fixture_portal", "materials@fictional-builder.invalid")).toThrow();
    const input = { version: "supplier-document-intake.v1", fixtureId: "materials-B-invoice", channel: "fixture_portal", expectedRevision: 0 };
    expect(supplierDocumentIntakeV1.parse(input).channel).toBe("fixture_portal");
    for (const fields of [{ fixtureId: "real-document" }, { tenantId: "other" }, { remoteUrl: "https://merchant.invalid" }, { approved: true }, { allocationPence: 1 }, { lockedBillId: "bill" }, { shadowCount: 1 }]) expect(() => supplierDocumentIntakeV1.parse({ ...input, ...fields })).toThrow();
  });
});
