import { describe, expect, it } from "vitest";
import {
  electManagedRecovery, managedRecoveryOfferingEnabled, managedRecoveryStateV1,
  previewManagedRecoveryInvoice, startManagedRecoveryPursuit,
} from "./managed-recovery.js";
import { MAX_MONEY_PENCE } from "./money.js";

const tenantId = "10000000-0000-4000-8000-000000000001";
const jobId = "10000000-0000-4000-8000-000000000002";
const caseId = "10000000-0000-4000-8000-000000000003";
const other = "20000000-0000-4000-8000-000000000001";
const now = "2026-10-29T06:00:00Z";
const scope = { tenantId, jobId, caseId };
const fresh = () => ({ version: "managed-recovery-state.v1", environment: "synthetic_demo", ...scope, election: null, pursuitStartedAt: null });
const context = () => ({ environment: "synthetic_demo", ...scope, actorMembershipId: "10000000-0000-4000-8000-000000000004", canApprove: true, now });
const command = (solicitor = false) => ({ version: "managed-recovery-election-command.v1", caseId,
  commandId: "10000000-0000-4000-8000-000000000005", termsVersion: "managed-recovery.synthetic-terms.v1",
  selection: solicitor ? { service: "solicitor_letter", points: 10 } : { service: "drafted_for_you", points: 5 } });
const invoice = (numerator = "80000", denominator = "1") => ({ version: "managed-recovery-invoice-preview.v1", environment: "synthetic_demo", ...scope,
  cumulativeQualifyingPrincipal: { numerator, denominator } });
const elected = (solicitor = false) => electManagedRecovery(fresh(), command(solicitor), context());

describe("MON-9 dark managed-recovery preparation", () => {
  it.each([false, true])("binds case, service, points, actor and proposed terms (%s)", solicitor => {
    const s = elected(solicitor);
    expect(managedRecoveryStateV1.safeParse(s).success).toBe(true);
    expect(s.election).toMatchObject({ ...scope, termsVersion: command().termsVersion, selection: command(solicitor).selection, electedAt: now });
    const result = previewManagedRecoveryInvoice(s, invoice());
    expect(result.serviceChargeInvoice).toMatchObject({ label: "Managed-recovery service charge", principal: { pence: solicitor ? 8000 : 4000, currency: "GBP" } });
    expect(result.offeringEnabled).toBe(false);
    expect(result.realExternalActions).toBe(0);
    expect(result.warning).toContain("nothing issued or charged");
    expect(result.vatLabel).toBe("VAT not calculated");
  });

  it("never creates a service charge without opt-in; pursuit needs no election", () => {
    const s = startManagedRecoveryPursuit(fresh(), context());
    expect(previewManagedRecoveryInvoice(s, invoice()).serviceChargeInvoice).toBeNull();
    expect(managedRecoveryOfferingEnabled).toBe(false);
  });

  it("keeps the complete success-fee result identical for either election, no election and reversals", () => {
    for (const principal of ["80000", "60000", "0", "5", "15", "25"]) {
      const expected = previewManagedRecoveryInvoice(fresh(), invoice(principal)).successFee;
      for (const s of [elected(), elected(true)]) expect(previewManagedRecoveryInvoice(s, invoice(principal)).successFee).toEqual(expected);
    }
    const s = elected();
    expect(previewManagedRecoveryInvoice(s, invoice("60000")).serviceChargeInvoice?.principal.pence).toBe(3000);
    expect(previewManagedRecoveryInvoice(s, invoice("0")).serviceChargeInvoice?.principal.pence).toBe(0);
    // Earlier previews and elected terms are never mutated by a reversal projection.
    expect(previewManagedRecoveryInvoice(s, invoice()).serviceChargeInvoice?.principal.pence).toBe(4000);
  });

  it("is deterministic under duplicates/replays, without accumulating charge or changing election time", () => {
    const s = elected();
    const later = { ...context(), now: "2026-10-29T07:00:00Z" };
    expect(electManagedRecovery(s, command(), later)).toEqual(s);
    const pursuing = startManagedRecoveryPursuit(s, later);
    expect(electManagedRecovery(pursuing, command(), later)).toEqual(pursuing);
    expect(startManagedRecoveryPursuit(pursuing, context())).toEqual(pursuing);
    expect(previewManagedRecoveryInvoice(s, invoice())).toEqual(previewManagedRecoveryInvoice(s, invoice()));
    expect(s.pursuitStartedAt).toBeNull();
  });

  it("refuses changed replays and a second election", () => {
    for (const changed of [command(true), { ...command(), commandId: other }, { ...command(), termsVersion: "future" }]) {
      expect(() => electManagedRecovery(elected(), changed, context())).toThrow();
    }
    expect(() => electManagedRecovery(elected(), command(), { ...context(), actorMembershipId: other })).toThrow();
  });

  it("refuses new elections after any pursuit, including same-time attempts", () => {
    const s = startManagedRecoveryPursuit(fresh(), context());
    expect(() => electManagedRecovery(s, command(), context())).toThrow("PURSUIT_ALREADY_STARTED");
    expect(() => startManagedRecoveryPursuit(elected(), { ...context(), now: "2026-10-28T06:00:00Z" })).toThrow();
  });

  it.each(["tenantId", "jobId", "caseId"])("refuses cross-scope %s in contexts, documents and election references", key => {
    expect(() => electManagedRecovery(fresh(), command(), { ...context(), [key]: other })).toThrow();
    expect(() => startManagedRecoveryPursuit(fresh(), { ...context(), [key]: other })).toThrow();
    expect(() => previewManagedRecoveryInvoice(elected(), { ...invoice(), [key]: other })).toThrow();
    const s = elected();
    expect(() => previewManagedRecoveryInvoice({ ...s, election: { ...s.election, [key]: other } }, invoice())).toThrow();
  });

  it("rejects altered bindings, points, service and terms", () => {
    for (const selection of [{ service: "drafted_for_you", points: 10 }, { service: "solicitor_letter", points: 5 }, { service: "other", points: 100 }]) {
      expect(() => electManagedRecovery(fresh(), { ...command(), selection }, context())).toThrow();
    }
    for (const patch of [{ bindingHash: "a".repeat(64) }, { termsVersion: "approved" }, { selection: command(true).selection }, { electedAt: "2026-10-28T06:00:00Z" }]) {
      const s = elected();
      expect(() => previewManagedRecoveryInvoice({ ...s, election: { ...s.election, ...patch } }, invoice())).toThrow();
    }
  });

  it("refuses live environments and unapproved authority", () => {
    expect(() => electManagedRecovery(fresh(), command(), { ...context(), canApprove: false })).toThrow();
    for (const environment of ["production_billing", "pilot_no_charge", "live"]) {
      expect(() => electManagedRecovery({ ...fresh(), environment }, command(), context())).toThrow();
      expect(() => electManagedRecovery(fresh(), command(), { ...context(), environment })).toThrow();
      expect(() => previewManagedRecoveryInvoice(elected(), { ...invoice(), environment })).toThrow();
    }
  });

  it("bounds exact principal, uses half-even and never accepts client money/allocation/bill/shadow overrides", () => {
    for (const [n, d] of [["-1", "1"], [String(MAX_MONEY_PENCE + 1), "1"], ["1", "0"], ["1.5", "1"]]) {
      expect(() => previewManagedRecoveryInvoice(elected(), invoice(n, d))).toThrow();
    }
    expect(previewManagedRecoveryInvoice(elected(), invoice("10")).serviceChargeInvoice?.principal.pence).toBe(0);
    expect(previewManagedRecoveryInvoice(elected(), invoice("30")).serviceChargeInvoice?.principal.pence).toBe(2);
    expect(previewManagedRecoveryInvoice(elected(), invoice("30", "2")).serviceChargeInvoice?.principal.pence).toBe(1);
    expect(previewManagedRecoveryInvoice(elected(true), invoice(String(MAX_MONEY_PENCE))).serviceChargeInvoice?.principal.pence).toBe(MAX_MONEY_PENCE / 10);
    for (const key of ["amountPence", "allocations", "lockId", "billRevision", "shadowSignals", "hiddenCount", "tenantId"]) {
      expect(() => electManagedRecovery(fresh(), { ...command(), [key]: other }, context())).toThrow();
    }
    for (const key of ["amountPence", "allocations", "lockId", "billRevision", "shadowSignals", "hiddenCount"]) {
      expect(() => previewManagedRecoveryInvoice(elected(), { ...invoice(), [key]: other })).toThrow();
    }
    expect(Object.keys(previewManagedRecoveryInvoice(elected(), invoice())).sort()).toEqual([
      "caseId", "environment", "jobId", "offeringEnabled", "realExternalActions", "serviceChargeInvoice", "successFee", "tenantId", "vatLabel", "version", "warning",
    ]);
  });
});
