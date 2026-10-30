import { describe, expect, it } from "vitest";
import { AccountingExportError } from "./accounting-export.contracts.js";
import { AccountingExportSandbox, FakeCodatAdapter } from "./accounting-export.sandbox.js";
import { FakeQuickBooksAdapter, fakeQuickBooksTaxCodes, fakeQuickBooksCapabilities } from "./accounting-quickbooks.fake.js";
import { FakeXeroAdapter } from "./accounting-xero.fake.js";
import { ctx, consent, source, scope, command, adjustment, scopeFor } from "./accounting-export.test-fixtures.js";

const connection = { version: 1, tenantId: ctx.tenantId, companyId: scope.companyId,
  state: "connected", revision: 1, synthetic: true };
function setup() {
  const codat = new FakeCodatAdapter();
  const quickbooks = new FakeQuickBooksAdapter([connection], codat.objects);
  const model = new AccountingExportSandbox(codat, [source], [consent], true, [quickbooks]);
  return { codat, quickbooks, model };
}
function changeRoute(model: AccountingExportSandbox, route: "codat" | "quickbooks", suffix = route) {
  const preview = model.previewRouteChange(ctx, scope, route, 100);
  const decision = { version: 1, decisionId: `demo-route-${suffix}`, tenantId: ctx.tenantId, actorId: ctx.actorId,
    action: "accounting_export.route", previewHash: preview.previewHash, humanConfirmed: true, status: "approved", expiresAt: 2000 };
  model.confirmRouteChange(ctx, scope, route, decision, 100);
  return decision;
}

describe("M5-3 dark direct QuickBooks", () => {
  it("advertises the bounded fake capabilities explicitly", () => {
    expect(fakeQuickBooksCapabilities).toMatchObject({ version: 1, route: "quickbooks", evidence: "synthetic_only",
      direction: "push", currency: "GBP", objects: ["invoice", "credit_note", "payment"],
      taxTreatments: Object.keys(fakeQuickBooksTaxCodes) });
    expect(fakeQuickBooksCapabilities.unsupported).toEqual(expect.arrayContaining([
      "retention", "cis", "drc", "tax_calculation", "settlement_proof", "external_overwrite", "live_access", "oauth", "provider_conformance",
    ]));
  });
  it("preserves one effect when switching through Codat, Xero and QuickBooks", () => {
    const codat = new FakeCodatAdapter();
    const xero = new FakeXeroAdapter([connection], codat.objects);
    const quickbooks = new FakeQuickBooksAdapter([connection], codat.objects);
    const model = new AccountingExportSandbox(codat, [source], [consent], true, [xero, quickbooks]);
    const initial = model.push(ctx, command(model), 100);
    for (const route of ["xero", "quickbooks", "codat"] as const) {
      const preview = model.previewRouteChange(ctx, scope, route, 100);
      model.confirmRouteChange(ctx, scope, route, { version: 1, decisionId: `demo-route-${route}`,
        tenantId: ctx.tenantId, actorId: ctx.actorId, action: "accounting_export.route", previewHash: preview.previewHash,
        humanConfirmed: true, status: "approved", expiresAt: 2000 }, 100);
      expect(model.push(ctx, command(model, scope, route), 100)).toEqual(initial);
    }
    expect(codat.objects).toHaveLength(1);
    expect(codat.pushes + xero.pushes + quickbooks.pushes).toBe(1);
    expect(model.ledger(ctx, scope, 100).artifact?.route).toBe("codat");
  });
  it("keeps an accepted unknown document and requires reconnection plus reconciliation before reuse", () => {
    const quickbooks = new FakeQuickBooksAdapter([connection]);
    const model = new AccountingExportSandbox(quickbooks, [source], [consent], true);
    const c = command(model);
    quickbooks.next = "unknown_after";
    expect(model.push(ctx, c, 100).status).toBe("outcome_unknown");
    expect(quickbooks.documents.size).toBe(1);
    quickbooks.setSyntheticConnection({ ...connection, revision: 2, state: "revoked" });
    expect(() => model.reconcile(ctx, scope, 100)).toThrow("connection_required");
    quickbooks.setSyntheticConnection({ ...connection, revision: 3 });
    expect(() => model.push(ctx, c, 100)).toThrow("approval_required");
    expect(() => model.push(ctx, command(model, scope, "reconnected"), 100)).toThrow("reconcile_required");
    expect(model.reconcile(ctx, scope, 100).status).toBe("pushed");
    expect(model.push(ctx, command(model, scope, "reconciled"), 100).externalId).toBe(quickbooks.objects[0]!.id);
    expect(quickbooks.pushes).toBe(1);
    expect(quickbooks.documents.size).toBe(1);
  });
  it.each(["customer_invoice", "credit", "receipt"] as const)("maps %s and fixture tax treatments without changing pennies or recipients", kind => {
    for (const tax of ["no_tax", "standard", "zero_rated"] as const) {
      const quickbooks = new FakeQuickBooksAdapter([connection]);
      const item = { ...(kind === "customer_invoice" ? source : adjustment(kind, 1)), tax };
      const s = { ...scopeFor(item), mapping: { ...scope.mapping, tax } };
      const model = new AccountingExportSandbox(quickbooks, kind === "customer_invoice" ? [item] : [source, item], [consent], true);
      const result = model.push(ctx, command(model, s), 100);
      expect(quickbooks.documents.get(result.externalId!)).toEqual({
        entity: { customer_invoice: "DEMO_INVOICE", credit: "DEMO_CREDIT_MEMO", receipt: "DEMO_PAYMENT" }[kind],
        realmId: scope.companyId, customerRef: { value: scope.mapping.customerId }, accountRef: { value: scope.mapping.accountId },
        total: { pence: item.amount.pence, currency: "GBP" }, taxRef: fakeQuickBooksTaxCodes[tax],
        sourceRef: { id: item.sourceId, revision: item.revision },
        linkedInvoice: item.invoiceId === null ? null : { id: item.invoiceId, revision: item.invoiceRevision },
      });
      expect(model.reconcile(ctx, s, 100).qualifyingRecoveryProof).toBe(false);
    }
  });
  it("rejects unsupported or mismatched tax codes explicitly", () => {
    const quickbooks = new FakeQuickBooksAdapter([connection]);
    const model = new AccountingExportSandbox(quickbooks, [source], [consent], true);
    for (const tax of ["invented", "standard", "zero_rated"]) {
      expect(() => model.preview(ctx, { ...scope, mapping: { ...scope.mapping, tax } }, 100)).toThrow("unsupported_mapping");
    }
    expect(quickbooks.pushes).toBe(0);
  });
  it.each(["customer_invoice", "credit", "receipt"] as const)("refuses unmapped tax on %s before preview or transport, including replays", kind => {
    const quickbooks = new FakeQuickBooksAdapter([connection]);
    const item = kind === "customer_invoice" ? source : adjustment(kind, 1);
    const sources = kind === "customer_invoice" ? [item] : [source, item];
    const model = new AccountingExportSandbox(quickbooks, sources, [consent], true);
    const s = scopeFor(item);
    const target = model.preview(ctx, s, 100).artifact.target;
    const approved = command(model, s);
    model.setSyntheticSource({ ...item, tax: "unsupported" });
    const unmapped = { ...s, mapping: { ...s.mapping, tax: "unsupported" } };
    for (let attempt = 0; attempt < 2; attempt++) {
      expect(() => model.preview(ctx, unmapped, 100)).toThrow(new AccountingExportError("unsupported_mapping"));
      expect(() => model.push(ctx, { ...approved, scope: unmapped }, 100)).toThrow(new AccountingExportError("unsupported_mapping"));
      expect(() => quickbooks.push("demo-unmapped", "demo-hash", { ...target, tax: "unsupported" }, s))
        .toThrow(new AccountingExportError("unsupported_mapping"));
    }
    expect(quickbooks.pushes).toBe(0);
    expect(quickbooks.objects).toEqual([]);
    expect(quickbooks.documents.size).toBe(0);
    expect(model.history(ctx)).toEqual([]);
    model.setSyntheticSource(item);
    expect(model.push(ctx, command(model, s), 100).status).toBe("pushed");
    expect(quickbooks.pushes).toBe(1);
    expect(quickbooks.objects).toHaveLength(1);
    expect(quickbooks.documents.size).toBe(1);
  });
  it.each(["token_expired", "revoked"])("refuses %s connections before preview, execution or reconciliation", state => {
    const quickbooks = new FakeQuickBooksAdapter([connection]);
    const model = new AccountingExportSandbox(quickbooks, [source], [consent], true);
    const c = command(model);
    model.push(ctx, c, 100);
    quickbooks.setSyntheticConnection({ ...connection, revision: 2, state });
    for (const method of ["preview", "reconcile"] as const) expect(() => model[method](ctx, scope, 100)).toThrow("connection_required");
    expect(() => model.push(ctx, c, 100)).toThrow("connection_required");
    expect(() => quickbooks.find("demo-reference", scope)).toThrow("connection_required");
    expect(() => quickbooks.setSyntheticConnection(connection)).toThrow("reference_conflict");
    quickbooks.setSyntheticConnection({ ...connection, revision: 3 });
    expect(() => model.push(ctx, c, 100)).toThrow("approval_required");
    expect(model.push(ctx, command(model, scope, "renewed"), 100).status).toBe("pushed");
    expect(quickbooks.pushes).toBe(1);
  });
  it("cannot resolve another tenant's connection, mapping, company or target records", () => {
    const quickbooks = new FakeQuickBooksAdapter([{ ...connection, tenantId: "demo-other-tenant" }]);
    const model = new AccountingExportSandbox(quickbooks, [source], [consent], true);
    expect(() => model.preview(ctx, scope, 100)).toThrow("connection_required");
    quickbooks.setSyntheticConnection(connection);
    expect(() => model.preview(ctx, { ...scope, mapping: { ...scope.mapping, tenantId: "demo-other-tenant" } }, 100)).toThrow("reference_conflict");
    expect(() => model.preview(ctx, { ...scope, companyId: "demo-other-company" }, 100)).toThrow("consent_expired");
    const result = model.push(ctx, command(model), 100);
    expect(quickbooks.find(result.reference, { tenantId: "demo-other-tenant", companyId: scope.companyId })).toEqual([]);
    expect(() => model.routeHistory({ ...ctx, tenantId: "demo-other-tenant" }, scope, 100)).toThrow("forbidden");
    expect(() => quickbooks.setSyntheticConnection({ ...connection, token: "secret@example.com" })).toThrow(/^Accounting export: invalid_input$/);
    expect(JSON.stringify(model.history(ctx))).not.toMatch(/customer|actor|secret|@/);
  });
  it("waits for bounded rate-limit backoff and retries the exact approved amount and recipient", () => {
    const quickbooks = new FakeQuickBooksAdapter([connection]);
    const model = new AccountingExportSandbox(quickbooks, [source], [consent], true);
    const c = command(model);
    quickbooks.next = "rate_limit";
    expect(model.push(ctx, c, 100)).toMatchObject({ status: "rate_limited", retryAt: 130, attempts: 1 });
    expect(() => model.push(ctx, c, 129)).toThrow("rate_limited");
    expect(() => model.reconcile(ctx, scope, 129)).toThrow("rate_limited");
    const changed = { ...scope, mapping: { ...scope.mapping, customerId: "demo-changed" } };
    expect(() => model.push(ctx, { ...c, scope: changed }, 130)).toThrow("approval_required");
    expect(model.push(ctx, c, 130)).toMatchObject({ status: "pushed", retryAt: null, pence: 101 });
    expect(quickbooks.objects).toHaveLength(1);
    expect(quickbooks.objects[0]!.payload).toMatchObject({ amount: source.amount, customerId: scope.mapping.customerId });
    expect(quickbooks.pushes).toBe(2);
  });
  it("detects QuickBooks document edits and never treats an external paid label as recovery proof", () => {
    const quickbooks = new FakeQuickBooksAdapter([connection]);
    const model = new AccountingExportSandbox(quickbooks, [source], [consent], true);
    const c = command(model); const result = model.push(ctx, c, 100);
    quickbooks.objects[0]!.paid = true;
    expect(model.reconcile(ctx, scope, 100).qualifyingRecoveryProof).toBe(false);
    quickbooks.documents.get(result.externalId!)!.customerRef.value = "demo-edited";
    expect(model.reconcile(ctx, scope, 100).status).toBe("external_edit");
    expect(() => model.push(ctx, c, 100)).toThrow("reconcile_required");
    expect(quickbooks.pushes).toBe(1);
  });
  it("preserves historic target IDs and mapping artifacts when switching routes in either direction", () => {
    const { model, codat, quickbooks } = setup();
    const oldCommand = command(model);
    const initial = model.push(ctx, oldCommand, 100);
    const original = model.ledger(ctx, scope, 100);
    changeRoute(model, "quickbooks");
    expect(() => model.push(ctx, oldCommand, 100)).toThrow("approval_required");
    expect(model.push(ctx, command(model, scope, "quickbooks"), 100)).toEqual(initial);
    expect(model.reconcile(ctx, scope, 100).externalId).toBe(initial.externalId);
    expect(model.ledger(ctx, scope, 100)).toEqual(original);
    expect(quickbooks.pushes).toBe(0);
    changeRoute(model, "codat");
    expect(model.push(ctx, command(model, scope, "back"), 100).externalId).toBe(initial.externalId);
    expect(codat.pushes + quickbooks.pushes).toBe(1);
    const history = model.routeHistory(ctx, scope, 100);
    expect(history.map(h => [h.from, h.to])).toEqual([["codat", "quickbooks"], ["quickbooks", "codat"]]);
    expect(history[0]!.scope.mapping).toEqual(scope.mapping);
    history[0]!.scope.mapping.customerId = "demo-mutation";
    expect(model.routeHistory(ctx, scope, 100)[0]!.scope.mapping).toEqual(scope.mapping);
  });
  it("routes only the approved job and rejects broader, expired or changed connection approvals", () => {
    const { model, codat, quickbooks } = setup();
    const preview = model.previewRouteChange(ctx, scope, "quickbooks", 100);
    const decision = { version: 1, decisionId: "demo-switch", tenantId: ctx.tenantId, actorId: ctx.actorId,
      action: "accounting_export.route", previewHash: preview.previewHash, humanConfirmed: true, status: "approved", expiresAt: 2000 };
    for (const patch of [{ humanConfirmed: false }, { status: "rejected" }, { expiresAt: 100 },
      { actorId: "demo-other" }, { tenantId: "demo-other" }, { action: "accounting_export.push" }]) {
      expect(() => model.confirmRouteChange(ctx, scope, "quickbooks", { ...decision, ...patch }, 100)).toThrow();
    }
    expect(() => model.confirmRouteChange(ctx, scope, "codat", decision, 100)).toThrow("approval_required");
    quickbooks.setSyntheticConnection({ ...connection, revision: 2 });
    expect(() => model.confirmRouteChange(ctx, scope, "quickbooks", decision, 100)).toThrow("approval_required");
    changeRoute(model, "quickbooks");
    const other = { ...source, sourceId: "demo-invoice-other", jobId: "demo-other-job" };
    model.setSyntheticSource(other);
    const otherScope = { ...scopeFor(other), jobId: other.jobId };
    expect(model.preview(ctx, otherScope, 100).artifact.route).toBe("codat");
    model.push(ctx, command(model, otherScope, "other"), 100);
    model.push(ctx, command(model, scope, "quickbooks"), 100);
    expect(codat.pushes).toBe(1); expect(quickbooks.pushes).toBe(1);
  });
  it.each(["unknown_before", "unknown_after", "reject"] as const)("blocks a route switch over unresolved %s", mode => {
    const { model, codat, quickbooks } = setup();
    codat.next = mode; model.push(ctx, command(model), 100);
    expect(() => changeRoute(model, "quickbooks")).toThrow("reconcile_required");
    expect(quickbooks.pushes).toBe(0);
  });
  it("requires new human approval for changed mappings/company and refuses historic reposts", () => {
    const { model, codat } = setup();
    const c = command(model); model.push(ctx, c, 100);
    const changed = { ...scope, mapping: { ...scope.mapping, revision: 2, accountId: "demo-new-account" } };
    expect(() => model.push(ctx, { ...c, scope: changed }, 100)).toThrow("approval_required");
    expect(() => model.push(ctx, command(model, changed, "mapping"), 100)).toThrow("reference_conflict");
    const companyId = "demo-new-company";
    model.setSyntheticConsent({ ...consent, companyId });
    const next = { ...scope, companyId, mapping: { ...scope.mapping, companyId } };
    expect(() => model.push(ctx, { ...c, scope: next }, 100)).toThrow("approval_required");
    expect(() => model.push(ctx, command(model, next, "company"), 100)).toThrow("reference_conflict");
    expect(codat.pushes).toBe(1);
  });
  it("keeps new QuickBooks paths disabled by default and refuses live or credential-bearing connection input", () => {
    const { codat, quickbooks } = setup();
    const model = new AccountingExportSandbox(codat, [source], [consent], false, [quickbooks]);
    expect(() => changeRoute(model, "quickbooks")).toThrow("disabled");
    expect(() => model.routeHistory(ctx, scope, 100)).toThrow("disabled");
    for (const patch of [{ synthetic: false }, { endpoint: "https://example.com" }, { token: "secret" }, { companyId: "real-company" }]) {
      expect(() => quickbooks.setSyntheticConnection({ ...connection, ...patch })).toThrow(/^Accounting export: invalid_input$/);
    }
    expect(() => new FakeQuickBooksAdapter().assertConnection(ctx.tenantId, scope.companyId)).toThrow("connection_required");
  });
  it("refuses wrong-job route scope, reused route Decisions, external edits and missing incoming targets", () => {
    const { model, codat, quickbooks } = setup();
    expect(() => model.previewRouteChange(ctx, { ...scope, jobId: "demo-wrong-job" }, "quickbooks", 100)).toThrow("source_unavailable");
    const decision = changeRoute(model, "quickbooks");
    expect(() => model.confirmRouteChange(ctx, scope, "quickbooks", decision, 100)).toThrow();
    const result = model.push(ctx, command(model), 100);
    quickbooks.documents.get(result.externalId!)!.total.pence = 100;
    expect(() => changeRoute(model, "codat")).toThrow("reconcile_required");
    expect(model.reconcile(ctx, scope, 100).status).toBe("external_edit");
    expect(codat.pushes).toBe(0);
    const freshCodat = new FakeCodatAdapter();
    const separateQuickBooks = new FakeQuickBooksAdapter([connection]);
    const separate = new AccountingExportSandbox(freshCodat, [source], [consent], true, [separateQuickBooks]);
    separate.push(ctx, command(separate), 100);
    expect(() => changeRoute(separate, "quickbooks")).toThrow("reconcile_required");
    expect(separateQuickBooks.pushes).toBe(0);
  });

});
