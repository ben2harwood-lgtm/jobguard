import { merchantConnector } from "./merchant-connectors.js";
import {
  merchantConformanceSourceV1,
  type MerchantAdapterUnderTest, type MerchantConformanceContext, type MerchantConformanceDocument,
  type MerchantConformanceReason, type MerchantConformanceRequest, type MerchantConformanceResult,
  type MerchantConformanceSnapshot,
} from "./merchant-conformance-kit.js";

/** In-memory illustration only. No persistence, authentication, transport or production adapter. */
export function createGoodMerchantFake(): MerchantAdapterUnderTest {
  const documents = new Map<string, MerchantConformanceDocument>();
  const audit: MerchantConformanceSnapshot["audit"] = [];
  const scoped = (ctx: MerchantConformanceContext, row: Pick<MerchantConformanceContext, "tenantId" | "jobId">) =>
    ctx.tenantId === row.tenantId && ctx.jobId === row.jobId;
  function hold(input: MerchantConformanceRequest, reason: MerchantConformanceReason): MerchantConformanceResult {
    const raw = input.raw as { number?: unknown } | null;
    audit.push({ tenantId: input.context.tenantId, jobId: input.context.jobId,
      sourceNumber: typeof raw?.number === "string" ? raw.number : "unknown", reason });
    return { status: "held", reason, fallback: "manual_review" };
  }
  return {
    capabilities: () => merchantConnector("fictional-merchant", "synthetic_demo"),
    async receive(input) {
      const connector = merchantConnector("fictional-merchant", input.context.environment);
      if (!connector.capabilities[input.capability].available) return hold(input, "capability_unavailable");
      if (input.transport === "outage") return hold(input, "outage");
      const raw = input.raw;
      if (raw && typeof raw === "object" && "supplierAccount" in raw && raw.supplierAccount !== connector.supplierAccount) {
        return hold(input, "supplier_identity");
      }
      const parsed = merchantConformanceSourceV1.safeParse(raw);
      if (!parsed.success) return hold(input, "schema_drift");
      const source = parsed.data;
      const key = JSON.stringify([input.context.tenantId, input.context.jobId, source.supplierAccount, source.type, source.number]);
      const previous = documents.get(key);
      if (previous) {
        if (previous.source.text !== source.text) return hold(input, "changed_document");
        return { status: "duplicate", documentId: previous.id };
      }
      const document = { id: `fixture-document-${documents.size + 1}`,
        tenantId: input.context.tenantId, jobId: input.context.jobId, source };
      documents.set(key, document);
      return { status: "accepted", documentId: document.id };
    },
    async snapshot(ctx) {
      return structuredClone({ documents: [...documents.values()].filter((row) => scoped(ctx, row)),
        deliverySourceIds: [], settledPence: 0, audit: audit.filter((row) => scoped(ctx, row)) });
    },
  };
}

/** Deliberately wrong at every boundary. It must never pass a named check. */
export function createBadMerchantFake(): MerchantAdapterUnderTest {
  const documents: MerchantConformanceDocument[] = [];
  return {
    capabilities() {
      const connector = merchantConnector("fictional-merchant", "synthetic_demo");
      connector.capabilities.order.available = true;
      return connector;
    },
    async receive(input) {
      const source = input.raw as MerchantConformanceDocument["source"];
      const id = `fixture-bad-${documents.length + 1}`;
      documents.push({ id, tenantId: "fixture-wrong-tenant", jobId: "fixture-wrong-job",
        source: { ...source, type: "delivery", supplierAccount: "fictional-account" } });
      return { status: "accepted", documentId: id };
    },
    async snapshot() {
      return structuredClone({ documents, deliverySourceIds: documents.map((entry) => entry.id), settledPence: 100, audit: [] });
    },
  };
}
