import { z } from "zod";
import { MAX_MONEY_PENCE } from "./money.js";
import { receiptQuantityMicros } from "./supplier-documents.js";
import { parseSupplierText } from "./supplier-facts.js";

export const merchantCapabilityNames = ["read", "quote", "order", "acknowledgment"] as const;
const fixtureRef = z.string().regex(/^fixture:[a-z0-9-]+$(?![\s\S])/u);
const capabilityV1 = z.object({
  available: z.boolean(), source: fixtureRef, terms: fixtureRef, accessRoute: fixtureRef,
  regionalApproval: fixtureRef,
}).strict();
export const merchantConnectorV1 = z.object({
  version: z.literal("merchant-connector.v1"), id: z.literal("fictional-merchant"),
  environment: z.literal("synthetic_demo"), supplierAccount: z.literal("fictional-account"),
  schemaVersion: z.literal("merchant-feed.v1"),
  capabilities: z.object({ read: capabilityV1, quote: capabilityV1, order: capabilityV1, acknowledgment: capabilityV1 }).strict(),
}).strict();
const evidence = {
  source: "fixture:merchant-contract", terms: "fixture:merchant-terms",
  accessRoute: "fixture:in-process-only", regionalApproval: "fixture:no-external-data",
} as const;
// Not provider verification or G5 approval. No endpoint, credentials, scraper or live implementation exists.
const fixtureConnector = merchantConnectorV1.parse({
  version: "merchant-connector.v1", id: "fictional-merchant", environment: "synthetic_demo",
  supplierAccount: "fictional-account", schemaVersion: "merchant-feed.v1",
  capabilities: {
    read: { ...evidence, available: true }, quote: { ...evidence, available: false },
    order: { ...evidence, available: false }, acknowledgment: { ...evidence, available: false },
  },
});
export class MerchantIngestionError extends Error {
  constructor(readonly code: "MERCHANT_LIVE_DISABLED" | "MERCHANT_CAPABILITY_UNAVAILABLE" | "UNKNOWN_FIXTURE_ALIAS") {
    super(code); this.name = "MerchantIngestionError";
  }
}
/** A fresh validated copy prevents a caller from widening the server registry. */
export function merchantConnector(id: string, environment: string | undefined) {
  if (environment !== "synthetic_demo") throw new MerchantIngestionError("MERCHANT_LIVE_DISABLED");
  if (id !== fixtureConnector.id) throw new MerchantIngestionError("MERCHANT_CAPABILITY_UNAVAILABLE");
  return merchantConnectorV1.parse(fixtureConnector);
}
export function requireMerchantCapability(id: string, capability: typeof merchantCapabilityNames[number], environment: string | undefined) {
  const connector = merchantConnector(id, environment);
  if (!connector.capabilities[capability]?.available) throw new MerchantIngestionError("MERCHANT_CAPABILITY_UNAVAILABLE");
  return connector;
}
export const merchantSourceV1 = z.object({
  version: z.literal("merchant-feed.v1"), supplierAccount: z.literal("fictional-account"),
  type: z.enum(["invoice", "credit", "delivery"]), number: z.string().min(1).max(120),
  text: z.string().min(1).max(10 * 1024 * 1024),
}).strict();
export type MerchantReview = "schema_drift" | "supplier_identity" | "malformed_document" | "changed_document";
/** Unknown shapes and accounts never fall back to supplier names or email sender claims. */
export function assessMerchantSource(raw: unknown): MerchantReview | null {
  const parsed = merchantSourceV1.safeParse(raw);
  if (!parsed.success) {
    if (raw && typeof raw === "object" && "supplierAccount" in raw && raw.supplierAccount !== "fictional-account") return "supplier_identity";
    return "schema_drift";
  }
  if (parsed.data.type === "delivery") return null; // Retains the existing synthetic PDF validation/hold policy.
  const facts = parseSupplierText(parsed.data.text);
  if (facts.documentType !== parsed.data.type || facts.issues.length || facts.netPence === null
    || facts.unitPricePence === null || facts.netPence > MAX_MONEY_PENCE || facts.unitPricePence > MAX_MONEY_PENCE) return "malformed_document";
  try { receiptQuantityMicros(facts.quantity ?? ""); } catch { return "malformed_document"; }
  return null;
}
/** Alias is routing metadata, never an authentication or purchase-authorization credential. */
export function validateMerchantAlias(channel: string, alias: string | undefined): void {
  if ((channel === "fixture_mail" && alias !== "materials@fictional-builder.invalid")
    || (channel !== "fixture_mail" && alias !== undefined)) throw new MerchantIngestionError("UNKNOWN_FIXTURE_ALIAS");
}
