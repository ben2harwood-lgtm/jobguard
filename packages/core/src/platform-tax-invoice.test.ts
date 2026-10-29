import { describe, expect, it } from "vitest";
import { downloadPlatformInvoice, issuePlatformInvoiceFixture, platformInvoiceAccountFixture,
  refuseLivePlatformInvoice, type PlatformInvoiceRequest, type PlatformInvoiceProfile } from "./platform-tax-invoice.js";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const tenantId = id(1), issuerId = id(2);
const ref = (n: number) => ({ tenantId, id: id(n), hash: "a".repeat(64) });
const profile: PlatformInvoiceProfile = { version: "platform-invoice-profile.v1", tenantId, issuerId,
  name: "JobGuard fictional issuer", address: "Fictional address — simulation only", vatRegistration: "SIMULATION-NOT-REGISTERED", environment: "synthetic_demo" };
function request(): PlatformInvoiceRequest {
  return { version: "platform-invoice-request.v1", environment: "synthetic_demo", commandId: id(3), tenantId, issuerId, actorMembershipId: id(4),
    kind: "invoice", originalNumber: null, taxPolicy: "D02-pending-approval-example", lines: [{ id: id(5), principalPence: 28200, taxPence: 5640,
      sourcePrincipalPence: 28200, provenance: { kind: "success_fee", statement: ref(6), derivation: ref(7), proof: ref(8), approval: ref(9),
        finalAccountLock: ref(10), policyVersion: "reference_fee_policy_v3", proofState: "verified", disclosedBeforeLock: false, builderCaptured: false, priorSettlements: [ref(11)] } }] };
}
function credit(invoice = issuePlatformInvoiceFixture(profile, request(), [])): PlatformInvoiceRequest {
  const r = structuredClone(invoice.request); r.commandId = id(15); r.kind = "credit_note"; r.originalNumber = invoice.number;
  r.lines[0]!.principalPence = 25000; r.lines[0]!.taxPence = 5000; return r;
}
describe("M4-10 dark platform invoices", () => {
  it("issues immutable numbered documents with exact tax examples and no collection", () => {
    const raw = request(), invoice = issuePlatformInvoiceFixture(profile, raw, []), download = downloadPlatformInvoice(invoice);
    raw.lines[0]!.principalPence = 1;
    expect(invoice).toMatchObject({ number: "SIM-PLATFORM-1", principalPence: 28200, taxPence: 5640, grossPence: 33840, collectionStarted: false });
    expect(invoice.warning).toContain("D02 tax examples pending approval");
    expect(Object.isFrozen(invoice.request.lines[0]!.provenance)).toBe(true);
    expect(JSON.parse(new TextDecoder().decode(download.bytes))).toEqual(invoice);
    expect(download.hash).toBe(downloadPlatformInvoice(invoice).hash);
    expect(platformInvoiceAccountFixture(invoice, [], 3840)).toMatchObject({ alreadyPaidPence: 3840, remainingCashDuePence: 30000, refundDuePence: 0 });
  });
  it("replays once, rejects changed commands and duplicate fee sources even after full credit", () => {
    const r = request(), invoice = issuePlatformInvoiceFixture(profile, r, []);
    expect(issuePlatformInvoiceFixture(profile, r, [invoice])).toEqual(invoice);
    expect(() => issuePlatformInvoiceFixture(profile, { ...r, taxPolicy: "other" }, [invoice])).toThrow("INVALID_PLATFORM_INVOICE");
    const changed = structuredClone(r); changed.lines[0]!.taxPence++;
    expect(() => issuePlatformInvoiceFixture(profile, changed, [invoice])).toThrow("PLATFORM_INVOICE_CONFLICT");
    const full = credit(invoice); full.lines = structuredClone(invoice.request.lines);
    const note = issuePlatformInvoiceFixture(profile, full, [invoice]);
    expect(() => issuePlatformInvoiceFixture(profile, { ...r, commandId: id(99) }, [invoice, note])).toThrow("PLATFORM_INVOICE_CONFLICT");
  });
  it("preserves original hash after reversal and exposes refund due after payment", () => {
    const invoice = issuePlatformInvoiceFixture(profile, request(), []), before = downloadPlatformInvoice(invoice).hash;
    const note = issuePlatformInvoiceFixture(profile, credit(invoice), [invoice]);
    expect(note.number).toBe("SIM-PLATFORM-2");
    expect(issuePlatformInvoiceFixture(profile, credit(invoice), [invoice, note])).toEqual(note);
    expect(downloadPlatformInvoice(invoice).hash).toBe(before);
    expect(platformInvoiceAccountFixture(invoice, [note], 33840)).toMatchObject({ principalPence: 3200, taxPence: 640, grossPence: 3840, remainingCashDuePence: 0, refundDuePence: 30000 });
    expect(() => platformInvoiceAccountFixture(invoice, [note, note], 0)).toThrow();
  });
  it("caps cumulative credits and preserves source, line and tax references", () => {
    const invoice = issuePlatformInvoiceFixture(profile, request(), []), note = issuePlatformInvoiceFixture(profile, credit(invoice), [invoice]);
    expect(() => issuePlatformInvoiceFixture(profile, { ...credit(invoice), commandId: id(90) }, [invoice, note])).toThrow("PLATFORM_INVOICE_LIMIT");
    for (const change of [{ originalNumber: "SIM-PLATFORM-999" }, { lines: [{ ...credit(invoice).lines[0], id: id(99) }] }])
      expect(() => issuePlatformInvoiceFixture(profile, { ...credit(invoice), ...change }, [invoice])).toThrow("PLATFORM_INVOICE_FORBIDDEN");
    const badTax = credit(invoice); badTax.lines[0]!.taxPence--;
    expect(() => issuePlatformInvoiceFixture(profile, badTax, [invoice])).toThrow("INVALID_PLATFORM_INVOICE");
  });
  it("rejects cross-tenant history, proofs, prior settlements and locked-bill references", () => {
    const invoice = issuePlatformInvoiceFixture(profile, request(), []);
    expect(() => issuePlatformInvoiceFixture({ ...profile, tenantId: id(88) }, request(), [])).toThrow("PLATFORM_INVOICE_FORBIDDEN");
    for (const key of ["proof", "finalAccountLock", "approval", "statement", "derivation"] as const) {
      const r = request(), trace = r.lines[0]!.provenance;
      if (trace.kind === "success_fee") trace[key].tenantId = id(88);
      expect(() => issuePlatformInvoiceFixture(profile, r, [])).toThrow("PLATFORM_INVOICE_FORBIDDEN");
    }
    const r = request(), trace = r.lines[0]!.provenance;
    if (trace.kind === "success_fee") trace.priorSettlements[0]!.tenantId = id(88);
    expect(() => issuePlatformInvoiceFixture(profile, r, [])).toThrow("PLATFORM_INVOICE_FORBIDDEN");
    expect(() => issuePlatformInvoiceFixture(profile, request(), [{ ...invoice, issuer: { ...profile, tenantId: id(88) } }])).toThrow("PLATFORM_INVOICE_FORBIDDEN");
  });
  it("refuses live modes, missing locks, shadow disclosure and arbitrary bank metadata", () => {
    expect(refuseLivePlatformInvoice).toThrow("PLATFORM_INVOICE_LIVE_DISABLED");
    expect(() => issuePlatformInvoiceFixture(profile, { ...request(), environment: "production" }, [])).toThrow();
    for (const patch of [{ disclosedBeforeLock: true }, { builderCaptured: true }, { proofState: "pending" }, { finalAccountLock: null }, { bankAccount: "private" }, { hiddenSignalCount: 3 }]) {
      const r = request(); Object.assign(r.lines[0]!.provenance, patch);
      expect(() => issuePlatformInvoiceFixture(profile, r, [])).toThrow("INVALID_PLATFORM_INVOICE");
    }
  });
  it("rejects negative, oversized and source-exceeding amounts and mixed subscription/fee offsets", () => {
    for (const principalPence of [-1, 0, 28201, Number.MAX_SAFE_INTEGER, 1.1]) {
      const r = request(); r.lines[0]!.principalPence = principalPence;
      expect(() => issuePlatformInvoiceFixture(profile, r, [])).toThrow();
    }
    const r = request(); r.lines.push({ id: id(30), principalPence: 4900, taxPence: 980, sourcePrincipalPence: 4900,
      provenance: { kind: "subscription", statement: ref(31), period: "2026-10", policyVersion: "subscription_pricing_policy_v4" } });
    expect(() => issuePlatformInvoiceFixture(profile, r, [])).toThrow("INVALID_PLATFORM_INVOICE");
    const sub = { ...r, lines: [r.lines[1]!] }, fee = issuePlatformInvoiceFixture(profile, request(), []);
    expect(issuePlatformInvoiceFixture(profile, { ...sub, commandId: id(40) }, [fee]).number).toBe("SIM-PLATFORM-2");
    expect(() => platformInvoiceAccountFixture(fee, [], fee.grossPence + 1)).toThrow("PLATFORM_INVOICE_LIMIT");
  });
  it("requires contractor site origin, approval, customer invoice and payment references", () => {
    const r = request(); r.lines[0]!.provenance = { kind: "contractor_fee", statement: ref(6), derivation: ref(7), origin: ref(8),
      approval: ref(9), customerInvoice: ref(10), payment: ref(11), period: "2026-10", policyVersion: "enterprise_site_capture_policy_v1", originKind: "site_user" };
    expect(issuePlatformInvoiceFixture(profile, r, []).request.lines[0]!.provenance).toEqual(r.lines[0]!.provenance);
    for (const patch of [{ originKind: "office" }, { payment: null }, { approval: null }, { customerInvoice: null }]) {
      const bad = structuredClone(r); Object.assign(bad.lines[0]!.provenance, patch);
      expect(() => issuePlatformInvoiceFixture(profile, bad, [])).toThrow();
    }
  });
});
