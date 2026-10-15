import { describe, expect, it } from "vitest";
import { sha256 } from "./evidence-pack.js";
import {
  BILLING_SANDBOX_LABEL, billingDeliveryV1, billingErrorV1, billingReconcileV1,
  billingStatusV1, normalizeBillingStatus, parseBillingCsv, renderBillingCsv,
  renderBillingExport, stableBillingExportLineId, allocateBillingReceipt,
} from "./contractor-billing.js";

export const billingId = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const billingLine = (kind: "original_order" | "extra" | "other" = "original_order", patch = {}) => ({
  externalInvoiceLineId: kind, kind, existedAt: "2026-10-01T00:00:00Z",
  netPence: kind === "extra" ? 24000 : 100000, vatPence: kind === "extra" ? 4800 : 20000,
  grossPence: kind === "extra" ? 28800 : 120000,
  match: kind === "extra" ? { exportLineId: billingId(5), jobId: billingId(2), extraId: billingId(3),
    scopeItemId: billingId(4), revisionId: billingId(6), revisionHash: "a".repeat(64) } : null,
  ...patch,
});
export const billingEvent = (patch = {}) => ({
  version: "billing-status.v1", clientContractId: billingId(1), source: "fictional-ledger",
  sourceEventId: "invoice-1", invoiceNumber: "INV-1", factType: "invoiced",
  effectiveAt: "2026-10-01T00:00:00Z", remittanceReference: null, reconciliationId: null,
  originalEventId: null, amount: { netPence: 124000, vatPence: 24800, grossPence: 148800 },
  composition: { declared: { netPence: 124000, vatPence: 24800, grossPence: 148800 },
    lines: [billingLine(), billingLine("extra")] }, explicit: null, separateInvoice: false,
  ...patch,
});
const exportLine = () => ({ jobId: billingId(2), extraId: billingId(3), scopeItemId: billingId(4),
  revisionId: billingId(6), revisionHash: "a".repeat(64), approvalBindingId: billingId(7),
  approvalSnapshotHash: "b".repeat(64), description: 'Fictional, "extra"\n第二行', quantity: "2.5",
  unit: "item", priceProvenance: "server_sor", approvedNet: { pence: 24000, currency: "GBP" } });

describe("ENT-6 independent contracts (persisted writers held)", () => {
  it("E6-01 rejects authority fields, unknown facts, currencies, money and fractions", () => {
    for (const patch of [{ tenantId: billingId(9) }, { actorId: billingId(9) }, { role: "finance" },
      { mode: "synthetic_demo" }, { factType: "settled" }, { amount: { netPence: 1.5, vatPence: 0, grossPence: 1.5 } },
      { amount: { netPence: 1_000_000_000_001, vatPence: 0, grossPence: 1_000_000_000_001 } },
      { amount: { netPence: 1, vatPence: 0, grossPence: 1, currency: "EUR" } },
      { explicit: [{ lineId: "extra", gross: { numerator: "1", denominator: "0" } }] }]) {
      expect(billingStatusV1.safeParse(billingEvent(patch)).success).toBe(false);
    }
    expect(billingDeliveryV1.safeParse({ version: "billing-delivery.v1", batchId: billingId(1),
      channel: "sftp", destination: "sftp://billing.invalid", contentHash: "a".repeat(64) }).success).toBe(false);
    expect(billingReconcileV1.safeParse({ version: "billing-reconcile.v1", action: "approve", id: billingId(1) }).success).toBe(false);
    expect(billingErrorV1.safeParse({ version: "billing-error.v1", code: "SQL_ERROR", detail: "private" }).success).toBe(false);
    for (const gross of [{ numerator: "1000000000001", denominator: "1" },
      { numerator: "-1", denominator: "1" }, { numerator: "1".repeat(101), denominator: "1" }]) {
      expect(billingStatusV1.safeParse(billingEvent({ factType: "paid", composition: null,
        explicit: [{ lineId: "extra", gross }] })).success).toBe(false);
    }
  });

  it("E6-01 E6-11 normalizes real CSV and API to the same semantic hash", () => {
    const event = billingEvent({ remittanceReference: 'fictional, "reference"\ncontinued' });
    const csv = renderBillingCsv([event]);
    const parsed = parseBillingCsv(new TextEncoder().encode(csv));
    expect(parsed).toHaveLength(1);
    expect(normalizeBillingStatus(parsed[0])).toEqual(normalizeBillingStatus(event));
    expect(normalizeBillingStatus({ ...event, composition: { ...event.composition, lines: [...event.composition.lines].reverse() } }))
      .toEqual(normalizeBillingStatus(event));
    expect(normalizeBillingStatus(billingEvent({ sourceEventId: "changed" })).hash).not.toBe(normalizeBillingStatus(event).hash);
    expect(csv).toContain(BILLING_SANDBOX_LABEL);
  });

  it("E6-01 rejects malformed CSV, invalid UTF-8, repeated headers and changed event headers", () => {
    const csv = renderBillingCsv([billingEvent()]);
    for (const text of [csv + '"unfinished', csv.replace('"original_order"', '"original_order"x'),
      csv.replace("version,source", "version,version"), csv.replace("124000", "1e5"),
      csv.replace("INV-1", "INV-2")]) {
      expect(() => parseBillingCsv(new TextEncoder().encode(text))).toThrow();
    }
    expect(() => parseBillingCsv(new Uint8Array([0xff]))).toThrow();
  });

  it("E6-06 independent renderer freezes deterministic CSV/JSON, IDs, hashes and exact totals", () => {
    const raw = { version: "billing-export.v1", clientContractId: billingId(1), lines: [exportLine()] };
    const artifact = renderBillingExport(raw);
    expect(artifact.csv).toContain(BILLING_SANDBOX_LABEL);
    expect(artifact.csv).toContain('"Fictional, ""extra""\n第二行"');
    expect(artifact.byteLength).toBe(new TextEncoder().encode(artifact.csv).length);
    expect(artifact.csvHash).toBe(sha256(artifact.csv));
    expect(artifact.jsonHash).toBe(sha256(artifact.json));
    expect(JSON.parse(artifact.json).totalNet).toEqual({ pence: 24000, currency: "GBP" });
    expect(artifact.lines[0]!.exportLineId).toBe(stableBillingExportLineId(billingId(1), billingId(6)));
    raw.lines[0]!.description = "changed";
    expect(artifact.json).not.toContain("changed");
    expect(Object.isFrozen(artifact.lines[0])).toBe(true);
    expect(() => renderBillingExport({ ...raw, lines: [exportLine(), exportLine()] })).toThrow();
    expect(() => renderBillingExport({ ...raw, lines: [exportLine(), { ...exportLine(), extraId: billingId(51), revisionId: billingId(50), approvedNet: { pence: 1_000_000_000_000, currency: "GBP" } }] })).toThrow("BILLING_INVALID");
  });

  it("E6-06 escapes spreadsheet formulas in both CSV writers while retaining exact source text", () => {
    for (const prefix of ["=", "+", "-", "@", "'", "'=", "''"]) {
      const text = `${prefix}SUM(1,2) "fictional"\n第二行`;
      const artifact = renderBillingExport({ version: "billing-export.v1", clientContractId: billingId(1),
        lines: [{ ...exportLine(), description: text, unit: text }] });
      const escapedCell = `"'${text.replace(/"/gu, '""')}"`;
      expect(artifact.csv.split(escapedCell)).toHaveLength(3);
      expect(JSON.parse(artifact.json).lines[0].description).toBe(text);
      expect(JSON.parse(artifact.json).lines[0].unit).toBe(text);
      const sourceId = `${prefix}event`, invoiceNumber = `${prefix}invoice`, lineId = `${prefix}line`;
      const event = billingEvent({ sourceEventId: sourceId, invoiceNumber, remittanceReference: text,
        reconciliationId: sourceId, originalEventId: sourceId,
        composition: { ...billingEvent().composition, lines: [billingLine("original_order", { externalInvoiceLineId: lineId }), billingLine("extra")] } });
      const csv = renderBillingCsv([event]);
      expect(csv).toContain(escapedCell);
      for (const value of [sourceId, invoiceNumber, lineId]) expect(csv).toContain(`"'${value}"`);
      const parsed = parseBillingCsv(new TextEncoder().encode(csv));
      expect(parsed).toHaveLength(1);
      expect(normalizeBillingStatus(parsed[0])).toEqual(normalizeBillingStatus(event));
    }
  });

  it("E6-06 sorts frozen lines independently of request order and binds contract identity", () => {
    const one = exportLine(), two = { ...exportLine(), extraId: billingId(31), revisionId: billingId(32) };
    const input = { version: "billing-export.v1", clientContractId: billingId(1), lines: [one, two] };
    expect(renderBillingExport(input)).toEqual(renderBillingExport({ ...input, lines: [two, one] }));
    expect(stableBillingExportLineId(billingId(1), billingId(6))).not.toBe(stableBillingExportLineId(billingId(2), billingId(6)));
  });

  it("E6-13 E6-14 pure ENT-F2 retains ordinary lines and exact fractions (PostgreSQL proof held)", () => {
    const result = allocateBillingReceipt({ version: "billing-allocation.v1", invoice: billingEvent(),
      sourceRef: "payment-1", effectiveAt: "2026-10-02T00:00:00Z", gross: { numerator: "50000", denominator: "1" },
      outstanding: billingEvent().composition.lines.map(l => ({ lineId: l.externalInvoiceLineId,
        gross: { numerator: String(l.grossPence), denominator: "1" } })),
      explicit: null, separateInvoice: false, direction: "receipt", original: null });
    const extra = result.find(a => a.lineId === "extra")!;
    expect(extra.gross).toEqual({ numerator: "300000", denominator: "31" });
    expect(extra.net).toEqual({ numerator: "250000", denominator: "31" });
    expect(result.find(a => a.lineId === "original_order")!.matchedExtraNet).toEqual({ numerator: "0", denominator: "1" });
  });

  it("E6-16 refuses forged composition completeness and omitted ordinary lines", () => {
    const event = billingEvent();
    expect(() => normalizeBillingStatus({ ...event, compositionComplete: true })).toThrow();
    expect(() => normalizeBillingStatus({ ...event, composition: { ...event.composition, lines: [billingLine("extra")] } })).toThrow();
    expect(() => normalizeBillingStatus({ ...event, composition: { ...event.composition, lines: [billingLine(), billingLine()] } })).toThrow();
    expect(() => normalizeBillingStatus({ ...event, composition: { ...event.composition, lines: [billingLine(), billingLine("extra", { match: null })] } })).toThrow();
    expect(billingStatusV1.safeParse(billingEvent({ composition: null })).success).toBe(true);
  });

  it("E6-11 preserves microseconds while normalizing equivalent time offsets and exact shares", () => {
    const a = billingEvent({ effectiveAt: "2026-10-01T01:00:00.0000010+01:00" });
    const b = billingEvent({ effectiveAt: "2026-10-01T00:00:00.000001Z" });
    expect(normalizeBillingStatus(a)).toEqual(normalizeBillingStatus(b));
    expect(normalizeBillingStatus(a).hash).not.toBe(normalizeBillingStatus(billingEvent({ effectiveAt: "2026-10-01T00:00:00.000002Z" })).hash);
  });
});
