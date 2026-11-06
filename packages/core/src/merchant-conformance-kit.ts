import { z } from "zod";
import { merchantConnectorV1, merchantSourceV1 } from "./merchant-connectors.js";

/** Test-only extension: does not enable these document types in merchant ingestion. */
export const merchantConformanceSourceV1 = merchantSourceV1.extend({
  type: z.enum(["quote", "acknowledgment", "invoice", "credit", "delivery"]),
});
export type MerchantConformanceSource = z.infer<typeof merchantConformanceSourceV1>;
export const merchantConformanceContext = {
  tenantId: "fixture-tenant-a", jobId: "fixture-job-a", environment: "synthetic_demo",
};
export type MerchantConformanceContext = typeof merchantConformanceContext;
export const merchantConformanceFixtures: readonly MerchantConformanceSource[] =
  (["quote", "acknowledgment", "invoice", "credit", "delivery"] as const).map((type) => ({
    version: "merchant-feed.v1", supplierAccount: "fictional-account", type,
    // Deliberately shared number: document kind must remain part of identity.
    number: "FIXTURE-001", text: `Fictional ${type} source; no delivery or cash assertion.`,
  }));
export type MerchantConformanceReason = "capability_unavailable"
  | "supplier_identity" | "changed_document" | "schema_drift" | "outage";
export interface MerchantConformanceDocument {
  id: string;
  tenantId: string;
  jobId: string;
  source: MerchantConformanceSource;
}
export interface MerchantConformanceSnapshot {
  documents: MerchantConformanceDocument[];
  deliverySourceIds: string[];
  settledPence: number;
  audit: { tenantId: string; jobId: string; sourceNumber: string; reason: MerchantConformanceReason }[];
}
export interface MerchantConformanceRequest {
  context: MerchantConformanceContext;
  capability: "read" | "quote" | "order" | "acknowledgment";
  raw: unknown;
  transport: "available" | "outage";
}
export type MerchantConformanceResult = { status: "accepted" | "duplicate"; documentId: string }
  | { status: "held"; reason: MerchantConformanceReason; fallback: "manual_review" };
/** Supply a fresh isolated synthetic instance per check. No live adapter is supplied here. */
export interface MerchantAdapterUnderTest {
  capabilities(): unknown;
  receive(request: MerchantConformanceRequest): Promise<MerchantConformanceResult>;
  snapshot(context: MerchantConformanceContext): Promise<MerchantConformanceSnapshot>;
}
export const merchantConformanceCheckNames = [
  "capability", "tenant", "identity", "deduplication", "document_meanings",
  "acknowledgment_not_delivery_or_settlement", "outage", "schema_change",
] as const;
export type MerchantConformanceCheck = typeof merchantConformanceCheckNames[number];
export interface MerchantConformanceCheckResult {
  check: MerchantConformanceCheck;
  passed: boolean;
}
function requireCheck(condition: boolean): asserts condition {
  if (!condition) throw new Error("Merchant conformance assertion failed");
}
function same(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object") return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  const a = left as Record<string, unknown>, b = right as Record<string, unknown>;
  return Object.keys(a).length === Object.keys(b).length
    && Object.keys(a).every((key) => Object.hasOwn(b, key) && same(a[key], b[key]));
}
const context = () => ({ ...merchantConformanceContext });
function request(raw: unknown, overrides: Partial<MerchantConformanceRequest> = {}): MerchantConformanceRequest {
  return structuredClone({ context: context(), raw, capability: "read", transport: "available", ...overrides });
}
async function held(adapter: MerchantAdapterUnderTest, input: MerchantConformanceRequest, reason: MerchantConformanceReason) {
  const before = structuredClone(await adapter.snapshot(input.context));
  const result = await adapter.receive(input);
  requireCheck(same(result, { status: "held", reason, fallback: "manual_review" }));
  const after = await adapter.snapshot(input.context);
  requireCheck(same(after.documents, before.documents));
  requireCheck(same(after.deliverySourceIds, before.deliverySourceIds) && after.settledPence === before.settledPence);
  const raw = input.raw as { number?: unknown } | null;
  requireCheck(same(after.audit, [...before.audit, {
    tenantId: input.context.tenantId, jobId: input.context.jobId,
    sourceNumber: typeof raw?.number === "string" ? raw.number : "unknown", reason,
  }]));
}
async function accepted(adapter: MerchantAdapterUnderTest, source: MerchantConformanceSource, ctx = context()) {
  const result = await adapter.receive(request(source, { context: ctx }));
  requireCheck(result.status === "accepted" && result.documentId.length > 0);
  const snapshot = await adapter.snapshot(ctx);
  const document = snapshot.documents.find((entry) => entry.id === result.documentId);
  requireCheck(document !== undefined && same(document.source, source)
    && document.tenantId === ctx.tenantId && document.jobId === ctx.jobId);
  return result.documentId;
}
async function checkAdapter(check: MerchantConformanceCheck, adapter: MerchantAdapterUnderTest) {
  const invoice = merchantConformanceFixtures.find((entry) => entry.type === "invoice")!;
  switch (check) {
    case "capability": {
      const registry = merchantConnectorV1.parse(adapter.capabilities());
      requireCheck(registry.capabilities.read.available);
      for (const capability of ["quote", "order", "acknowledgment"] as const) {
        requireCheck(!registry.capabilities[capability].available);
        await held(adapter, request(invoice, { capability }), "capability_unavailable");
      }
      await accepted(adapter, invoice);
      break;
    }
    case "tenant": {
      const first = await accepted(adapter, invoice);
      for (const ctx of [{ ...context(), tenantId: "fixture-tenant-b" }, { ...context(), jobId: "fixture-job-b" }]) {
        requireCheck((await adapter.snapshot(ctx)).documents.length === 0);
        const second = await accepted(adapter, invoice, ctx);
        requireCheck(first !== second);
      }
      await held(adapter, request({ ...invoice, tenantId: "fixture-tenant-b" }), "schema_drift");
      requireCheck((await adapter.snapshot(context())).documents.length === 1);
      break;
    }
    case "identity": {
      await held(adapter, request({ ...invoice, supplierAccount: "fictional-impostor" }), "supplier_identity");
      await accepted(adapter, invoice);
      break;
    }
    case "deduplication": {
      const id = await accepted(adapter, invoice);
      const replay = await adapter.receive(request({ ...invoice }));
      requireCheck(replay.status === "duplicate" && replay.documentId === id);
      requireCheck((await adapter.snapshot(context())).documents.length === 1);
      await held(adapter, request({ ...invoice, text: "Changed fictional bytes" }), "changed_document");
      requireCheck(same((await adapter.snapshot(context())).documents[0]?.source, invoice));
      break;
    }
    case "document_meanings": {
      const ids = [];
      for (const source of merchantConformanceFixtures) ids.push(await accepted(adapter, source));
      const snapshot = await adapter.snapshot(context());
      requireCheck(new Set(ids).size === 5 && snapshot.documents.length === 5);
      requireCheck(snapshot.deliverySourceIds.length === 0 && snapshot.settledPence === 0);
      break;
    }
    case "acknowledgment_not_delivery_or_settlement": {
      const acknowledgment = merchantConformanceFixtures.find((entry) => entry.type === "acknowledgment")!;
      await accepted(adapter, acknowledgment);
      const snapshot = await adapter.snapshot(context());
      requireCheck(snapshot.documents.length === 1 && snapshot.documents[0]?.source.type === "acknowledgment");
      requireCheck(snapshot.deliverySourceIds.length === 0 && snapshot.settledPence === 0);
      break;
    }
    case "outage":
      await held(adapter, request(invoice, { transport: "outage" }), "outage");
      await accepted(adapter, invoice);
      requireCheck((await adapter.snapshot(context())).audit.length === 1);
      break;
    case "schema_change":
      for (const raw of [{ ...invoice, version: "merchant-feed.v2" }, { ...invoice, unexpected: true }, { ...invoice, number: null }]) {
        await held(adapter, request(raw), "schema_drift");
      }
      await accepted(adapter, invoice);
      requireCheck((await adapter.snapshot(context())).audit.length === 3);
  }
}
/** Deterministic contract checks only; never partner conformance or an approval. */
export async function runMerchantConformanceKit(createAdapter: () => MerchantAdapterUnderTest): Promise<MerchantConformanceCheckResult[]> {
  const results: MerchantConformanceCheckResult[] = [];
  for (const check of merchantConformanceCheckNames) {
    try {
      await checkAdapter(check, createAdapter());
      results.push({ check, passed: true });
    } catch {
      // A thrown adapter error cannot masquerade as the required audited human fallback.
      results.push({ check, passed: false });
    }
  }
  return results;
}
