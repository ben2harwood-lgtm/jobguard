import { describe, expect, it } from "vitest";
import { allocateEnterpriseReceipt, EnterpriseDomainError, type EnterpriseGroup } from "./index.js";
import { extra, group, id, hash, exact, at } from "./origin.test.js";
import { exactPence } from "../cumulative-fee.js";
import type { ReceiptAllocationInput } from "../receipt-allocation.js";

// All data is generated and fictional. Extra line: GBP 288 gross / GBP 240 net. Order line: GBP 1,200 gross / GBP 1,000 net.
const line = (name: string, net: number, gross: number, outstanding = gross) =>
  ({ id: name, invoiceId: "generated-invoice", existedAt: "2026-10-01T00:00:00Z", outstandingGross: exact(outstanding), netPence: net, grossPence: gross });
const original = (explicit: ReceiptAllocationInput["explicit"]): ReceiptAllocationInput => ({
  version: "receipt-allocation.v1", sourceRef: "generated-receipt", receiptGross: exact(148800), effectiveAt: at, direction: "receipt",
  invoiceId: "generated-invoice", separateInvoiceId: null, explicit, lines: [line("order", 100000, 120000), line("extra", 24000, 28800)],
});
const explicitOriginal = () => original([{ lineId: "order", gross: exact(120000) }, { lineId: "extra", gross: exact(28800) }]);
function build(g: EnterpriseGroup, patch: { gross?: number; explicit?: ReceiptAllocationInput["explicit"]; original?: ReceiptAllocationInput; sourceRef?: string;
  remaining?: Record<string, number>; invoiceId?: string; separateInvoiceId?: string | null } = {}) {
  const orig = patch.original ?? explicitOriginal();
  const remaining = { order: 120000, extra: 28800, ...patch.remaining };
  const gross = patch.gross ?? 6000;
  return {
    version: "enterprise-receipt.v1", tenantId: g.tenantId, jobId: g.jobId, compositionComplete: true,
    receipt: { ...orig, direction: "reversal", sourceRef: patch.sourceRef ?? "generated-refund", receiptGross: exact(gross),
      invoiceId: patch.invoiceId ?? orig.invoiceId, separateInvoiceId: patch.separateInvoiceId ?? orig.separateInvoiceId,
      explicit: patch.explicit === undefined ? [{ lineId: "extra", gross: exact(gross) }] : patch.explicit,
      lines: orig.lines.map(l => ({ ...l, outstandingGross: exact(remaining[l.id as "order" | "extra"]!) })) },
    bindings: [{ lineId: "order", extraId: null, exportLineId: null, revisionId: null, revisionHash: null },
      { lineId: "extra", extraId: g.canonicalId, exportLineId: id(7), revisionId: id(2), revisionHash: hash() }],
    groups: [g],
    original: { sourceRef: orig.sourceRef, receipt: orig, remainingGross: [{ lineId: "order", gross: exact(remaining.order) }, { lineId: "extra", gross: exact(remaining.extra) }] },
  };
}
const refused = (input: unknown) => {
  try { allocateEnterpriseReceipt(input); } catch (error) {
    expect(error).toBeInstanceOf(EnterpriseDomainError);
    expect((error as EnterpriseDomainError).code).toBe("INVALID_ALLOCATION");
    return;
  }
  throw new Error("expected INVALID_ALLOCATION refusal");
};

describe("LATER-B23 explicit enterprise refund allocation", () => {
  it("explicit refund reverses its original extra allocation", () => {
    const g = group([extra()]);
    const out = allocateEnterpriseReceipt(build(g));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ lineId: "extra", extraId: g.canonicalId, rule: "explicit", sourceRef: "generated-refund", originalSourceRef: "generated-receipt",
      gross: exactPence(-6000n), net: exactPence(-5000n) });
  });
  it("explicit refund conserves gross and net, and an order line named in the refund earns no extra fee line", () => {
    const g = group([extra()]);
    const both = allocateEnterpriseReceipt(build(g, { gross: 12000, explicit: [{ lineId: "order", gross: exact(6000) }, { lineId: "extra", gross: exact(6000) }] }));
    expect(both.map(l => l.lineId)).toEqual(["order", "extra"]);
    expect(both.map(l => l.extraId)).toEqual([null, g.canonicalId]);
    expect(both.reduce((n, l) => n + l.gross.numerator, 0n)).toBe(-12000n);
    expect(both[0]!.net).toEqual(exactPence(-5000n)); expect(both[1]!.net).toEqual(exactPence(-5000n));
    // The unrelated order line is not named: nothing is allocated to it.
    expect(allocateEnterpriseReceipt(build(g)).some(l => l.lineId === "order")).toBe(false);
  });
  it("explicit refund can be taken in two parts up to, and not beyond, the explicit original share", () => {
    const g = group([extra()]);
    expect(allocateEnterpriseReceipt(build(g, { gross: 22800, remaining: { extra: 28800 }, explicit: [{ lineId: "extra", gross: exact(22800) }] }))[0]!.net).toEqual(exactPence(-19000n));
    refused(build(g, { gross: 6000, remaining: { extra: 4000 } }));
  });
  it("negative: over-refund is refused", () => {
    const g = group([extra()]);
    refused(build(g, { gross: 28801 })); // above the line's outstanding settled balance
    refused(build(g, { gross: 6000, explicit: [{ lineId: "extra", gross: exact(5000) }] })); // shares do not sum to the refund
  });
  it("negative: wrong line is refused", () => {
    const g = group([extra()]);
    refused(build(g, { explicit: [{ lineId: "missing", gross: exact(6000) }] }));
    // Original paid the extra only; the order line was never explicitly settled.
    const onlyExtra = original([{ lineId: "extra", gross: exact(28800) }]);
    refused(build(g, { original: { ...onlyExtra, receiptGross: exact(28800) }, explicit: [{ lineId: "order", gross: exact(6000) }], remaining: { order: 0 } }));
    // Original was pro-rata: an explicit refund may not steer it between lines.
    refused(build(g, { original: original(null), explicit: [{ lineId: "extra", gross: exact(6000) }], remaining: { order: 120000, extra: 28800 } }));
  });
  it("negative: forged original allocation is refused", () => {
    const g = group([extra()]);
    refused(build(g, { remaining: { extra: 28801 } })); // balance above what the original settled
    const forged = build(g); (forged.original as { sourceRef: string }).sourceRef = "someone-elses-receipt";
    refused(forged);
    const lower = original([{ lineId: "order", gross: exact(144800) }, { lineId: "extra", gross: exact(4000) }]);
    refused(build(g, { original: lower })); // claimed original shares exceed the order line's outstanding
    const ratio = build(g); const lines = (ratio.receipt as { lines: { id: string; netPence: number }[] }).lines;
    lines.find(l => l.id === "extra")!.netPence = 20000; // refund ratio differs from the original line's ratio
    refused(ratio);
  });
  it("negative: repeated source identity cannot reverse twice (explicit and pro-rata)", () => {
    const g = group([extra()]);
    refused(build(g, { sourceRef: "generated-receipt" }));
    const e = extra(); e.billingFacts.push({ ...e.billingFacts[1]!, kind: "reversed", sourceRef: "generated-refund", originalSourceRef: "generated-receipt", net: exact(-5000), allocationRule: "explicit" });
    refused(build(group([e])));
    // Pro-rata reversal reusing a source already recorded as a reversal: refused as well.
    const orig = original(null);
    refused(build(group([e]), { original: orig, explicit: null, gross: 14880 }));
  });
  it("negative: mismatched invoice is refused", () => {
    const g = group([extra()]);
    refused(build(g, { invoiceId: "other-invoice" }));
    refused(build(g, { separateInvoiceId: "generated-invoice" }));
  });
});
