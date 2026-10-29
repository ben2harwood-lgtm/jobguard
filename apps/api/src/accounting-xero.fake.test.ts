import { describe, expect, it } from "vitest";
import { AccountingExportSandbox, FakeCodatAdapter } from "./accounting-export.sandbox.js";
import { FakeXeroAdapter, fakeXeroTaxCodes } from "./accounting-xero.fake.js";
import { ctx, consent, source, scope, command, adjustment, scopeFor } from "./accounting-export.test-fixtures.js";

const connection = { version: 1, tenantId: ctx.tenantId, companyId: scope.companyId,
  state: "connected", revision: 1, synthetic: true };
function setup() {
  const codat = new FakeCodatAdapter();
  const xero = new FakeXeroAdapter([connection], codat.objects);
  const model = new AccountingExportSandbox(codat, [source], [consent], true, [xero]);
  return { codat, xero, model };
}
function changeRoute(model: AccountingExportSandbox, route: "codat" | "xero", suffix = route) {
  const preview = model.previewRouteChange(ctx, scope, route, 100);
  const decision = { version: 1, decisionId: `demo-route-${suffix}`, tenantId: ctx.tenantId, actorId: ctx.actorId,
    action: "accounting_export.route", previewHash: preview.previewHash, humanConfirmed: true, status: "approved", expiresAt: 2000 };
  model.confirmRouteChange(ctx, scope, route, decision, 100);
  return decision;
}

describe("M5-2 dark direct Xero", () => {
  it.each(["customer_invoice", "credit", "receipt"] as const)("maps %s and fixture tax treatments without changing pennies or recipients", kind => {
    for (const tax of ["no_tax", "standard", "zero_rated"] as const) {
      const xero = new FakeXeroAdapter([connection]);
      const item = { ...(kind === "customer_invoice" ? source : adjustment(kind, 1)), tax };
      const s = { ...scopeFor(item), mapping: { ...scope.mapping, tax } };
      const model = new AccountingExportSandbox(xero, kind === "customer_invoice" ? [item] : [source, item], [consent], true);
      const result = model.push(ctx, command(model, s), 100);
      expect(xero.documents.get(result.externalId!)).toEqual({
        type: { customer_invoice: "DEMO_INVOICE", credit: "DEMO_CREDIT_NOTE", receipt: "DEMO_RECEIPT" }[kind],
        company: scope.companyId, contact: scope.mapping.customerId, account: scope.mapping.accountId,
        totalPence: item.amount.pence, currency: "GBP", taxCode: fakeXeroTaxCodes[tax],
        source: item.sourceId, revision: item.revision, invoice: item.invoiceId, invoiceRevision: item.invoiceRevision,
      });
      expect(model.reconcile(ctx, s, 100).qualifyingRecoveryProof).toBe(false);
    }
  });
  it("rejects unsupported or mismatched tax codes explicitly", () => {
    const xero = new FakeXeroAdapter([connection]);
    const model = new AccountingExportSandbox(xero, [source], [consent], true);
    for (const tax of ["invented", "standard", "zero_rated"]) {
      expect(() => model.preview(ctx, { ...scope, mapping: { ...scope.mapping, tax } }, 100)).toThrow("unsupported_mapping");
    }
    expect(xero.pushes).toBe(0);
  });
  it.each(["token_expired", "revoked"])("refuses %s connections before preview, execution or reconciliation", state => {
    const xero = new FakeXeroAdapter([connection]);
    const model = new AccountingExportSandbox(xero, [source], [consent], true);
    const c = command(model);
    model.push(ctx, c, 100);
    xero.setSyntheticConnection({ ...connection, revision: 2, state });
    for (const method of ["preview", "reconcile"] as const) expect(() => model[method](ctx, scope, 100)).toThrow("connection_required");
    expect(() => model.push(ctx, c, 100)).toThrow("connection_required");
    expect(() => xero.find("demo-reference", scope)).toThrow("connection_required");
    expect(() => xero.setSyntheticConnection(connection)).toThrow("reference_conflict");
    xero.setSyntheticConnection({ ...connection, revision: 3 });
    expect(() => model.push(ctx, c, 100)).toThrow("approval_required");
    expect(model.push(ctx, command(model, scope, "renewed"), 100).status).toBe("pushed");
    expect(xero.pushes).toBe(1);
  });
  it("cannot resolve another tenant's connection, mapping, company or target records", () => {
    const xero = new FakeXeroAdapter([{ ...connection, tenantId: "demo-other-tenant" }]);
    const model = new AccountingExportSandbox(xero, [source], [consent], true);
    expect(() => model.preview(ctx, scope, 100)).toThrow("connection_required");
    xero.setSyntheticConnection(connection);
    expect(() => model.preview(ctx, { ...scope, mapping: { ...scope.mapping, tenantId: "demo-other-tenant" } }, 100)).toThrow("reference_conflict");
    expect(() => model.preview(ctx, { ...scope, companyId: "demo-other-company" }, 100)).toThrow("consent_expired");
    const result = model.push(ctx, command(model), 100);
    expect(xero.find(result.reference, { tenantId: "demo-other-tenant", companyId: scope.companyId })).toEqual([]);
    expect(() => model.routeHistory({ ...ctx, tenantId: "demo-other-tenant" }, scope, 100)).toThrow("forbidden");
    expect(() => xero.setSyntheticConnection({ ...connection, token: "secret@example.com" })).toThrow(/^Accounting export: invalid_input$/);
    expect(JSON.stringify(model.history(ctx))).not.toMatch(/customer|actor|secret|@/);
  });
  it("waits for bounded rate-limit backoff and retries the exact approved amount and recipient", () => {
    const xero = new FakeXeroAdapter([connection]);
    const model = new AccountingExportSandbox(xero, [source], [consent], true);
    const c = command(model);
    xero.next = "rate_limit";
    expect(model.push(ctx, c, 100)).toMatchObject({ status: "rate_limited", retryAt: 130, attempts: 1 });
    expect(() => model.push(ctx, c, 129)).toThrow("rate_limited");
    expect(() => model.reconcile(ctx, scope, 129)).toThrow("rate_limited");
    const changed = { ...scope, mapping: { ...scope.mapping, customerId: "demo-changed" } };
    expect(() => model.push(ctx, { ...c, scope: changed }, 130)).toThrow("approval_required");
    expect(model.push(ctx, c, 130)).toMatchObject({ status: "pushed", retryAt: null, pence: 101 });
    expect(xero.objects).toHaveLength(1);
    expect(xero.objects[0]!.payload).toMatchObject({ amount: source.amount, customerId: scope.mapping.customerId });
    expect(xero.pushes).toBe(2);
  });
  it("detects Xero document edits and never treats an external paid label as recovery proof", () => {
    const xero = new FakeXeroAdapter([connection]);
    const model = new AccountingExportSandbox(xero, [source], [consent], true);
    const c = command(model); const result = model.push(ctx, c, 100);
    xero.objects[0]!.paid = true;
    expect(model.reconcile(ctx, scope, 100).qualifyingRecoveryProof).toBe(false);
    xero.documents.get(result.externalId!)!.contact = "demo-edited";
    expect(model.reconcile(ctx, scope, 100).status).toBe("external_edit");
    expect(() => model.push(ctx, c, 100)).toThrow("reconcile_required");
    expect(xero.pushes).toBe(1);
  });
  it("preserves historic target IDs and mapping artifacts when switching routes in either direction", () => {
    const { model, codat, xero } = setup();
    const oldCommand = command(model);
    const initial = model.push(ctx, oldCommand, 100);
    const original = model.ledger(ctx, scope, 100);
    changeRoute(model, "xero");
    expect(() => model.push(ctx, oldCommand, 100)).toThrow("approval_required");
    expect(model.push(ctx, command(model, scope, "xero"), 100)).toEqual(initial);
    expect(model.reconcile(ctx, scope, 100).externalId).toBe(initial.externalId);
    expect(model.ledger(ctx, scope, 100)).toEqual(original);
    expect(xero.pushes).toBe(0);
    changeRoute(model, "codat");
    expect(model.push(ctx, command(model, scope, "back"), 100).externalId).toBe(initial.externalId);
    expect(codat.pushes + xero.pushes).toBe(1);
    const history = model.routeHistory(ctx, scope, 100);
    expect(history.map(h => [h.from, h.to])).toEqual([["codat", "xero"], ["xero", "codat"]]);
    expect(history[0]!.scope.mapping).toEqual(scope.mapping);
    history[0]!.scope.mapping.customerId = "demo-mutation";
    expect(model.routeHistory(ctx, scope, 100)[0]!.scope.mapping).toEqual(scope.mapping);
  });
  it("routes only the approved job and rejects broader, expired or changed connection approvals", () => {
    const { model, codat, xero } = setup();
    const preview = model.previewRouteChange(ctx, scope, "xero", 100);
    const decision = { version: 1, decisionId: "demo-switch", tenantId: ctx.tenantId, actorId: ctx.actorId,
      action: "accounting_export.route", previewHash: preview.previewHash, humanConfirmed: true, status: "approved", expiresAt: 2000 };
    for (const patch of [{ humanConfirmed: false }, { status: "rejected" }, { expiresAt: 100 },
      { actorId: "demo-other" }, { tenantId: "demo-other" }, { action: "accounting_export.push" }]) {
      expect(() => model.confirmRouteChange(ctx, scope, "xero", { ...decision, ...patch }, 100)).toThrow();
    }
    expect(() => model.confirmRouteChange(ctx, scope, "codat", decision, 100)).toThrow("approval_required");
    xero.setSyntheticConnection({ ...connection, revision: 2 });
    expect(() => model.confirmRouteChange(ctx, scope, "xero", decision, 100)).toThrow("approval_required");
    changeRoute(model, "xero");
    const other = { ...source, sourceId: "demo-invoice-other", jobId: "demo-other-job" };
    model.setSyntheticSource(other);
    const otherScope = { ...scopeFor(other), jobId: other.jobId };
    expect(model.preview(ctx, otherScope, 100).artifact.route).toBe("codat");
    model.push(ctx, command(model, otherScope, "other"), 100);
    model.push(ctx, command(model, scope, "xero"), 100);
    expect(codat.pushes).toBe(1); expect(xero.pushes).toBe(1);
  });
  it.each(["unknown_before", "unknown_after", "reject"] as const)("blocks a route switch over unresolved %s", mode => {
    const { model, codat, xero } = setup();
    codat.next = mode; model.push(ctx, command(model), 100);
    expect(() => changeRoute(model, "xero")).toThrow("reconcile_required");
    expect(xero.pushes).toBe(0);
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
  it("keeps new Xero paths disabled by default and refuses live or credential-bearing connection input", () => {
    const { codat, xero } = setup();
    const model = new AccountingExportSandbox(codat, [source], [consent], false, [xero]);
    expect(() => changeRoute(model, "xero")).toThrow("disabled");
    expect(() => model.routeHistory(ctx, scope, 100)).toThrow("disabled");
    for (const patch of [{ synthetic: false }, { endpoint: "https://example.com" }, { token: "secret" }, { companyId: "real-company" }]) {
      expect(() => xero.setSyntheticConnection({ ...connection, ...patch })).toThrow(/^Accounting export: invalid_input$/);
    }
    expect(() => new FakeXeroAdapter().assertConnection(ctx.tenantId, scope.companyId)).toThrow("connection_required");
  });
  it("refuses wrong-job route scope, reused route Decisions, external edits and missing incoming targets", () => {
    const { model, codat, xero } = setup();
    expect(() => model.previewRouteChange(ctx, { ...scope, jobId: "demo-wrong-job" }, "xero", 100)).toThrow("source_unavailable");
    const decision = changeRoute(model, "xero");
    expect(() => model.confirmRouteChange(ctx, scope, "xero", decision, 100)).toThrow();
    const result = model.push(ctx, command(model), 100);
    xero.documents.get(result.externalId!)!.totalPence = 100;
    expect(() => changeRoute(model, "codat")).toThrow("reconcile_required");
    expect(model.reconcile(ctx, scope, 100).status).toBe("external_edit");
    expect(codat.pushes).toBe(0);
    const freshCodat = new FakeCodatAdapter();
    const separateXero = new FakeXeroAdapter([connection]);
    const separate = new AccountingExportSandbox(freshCodat, [source], [consent], true, [separateXero]);
    separate.push(ctx, command(separate), 100);
    expect(() => changeRoute(separate, "xero")).toThrow("reconcile_required");
    expect(separateXero.pushes).toBe(0);
  });

});
