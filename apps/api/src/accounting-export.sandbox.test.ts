import { describe, expect, it } from "vitest";
import { MAX_MONEY_PENCE } from "@jobguard/core";
import { AccountingExportSandbox, FakeCodatAdapter } from "./accounting-export.sandbox.js";
import type { AccountingSource, AccountingScope } from "./accounting-export.contracts.js";

const ctx = { tenantId: "demo-tenant", actorId: "demo-actor", canExport: true };
const consent = { tenantId: ctx.tenantId, companyId: "demo-company", revision: 1, expiresAt: 5000, revoked: false };
const source: AccountingSource = { version: 1, tenantId: ctx.tenantId, jobId: "demo-job", sourceId: "demo-invoice", revision: 1,
  kind: "customer_invoice", amount: { pence: 101, currency: "GBP" }, state: "issued", visibility: "builder", synthetic: true,
  finalAccount: { revision: 2, lockedRevision: 2 }, invoiceId: null, invoiceRevision: null,
  tax: "unsupported", retention: "unsupported", cis: "unsupported", drc: "unsupported" };
const scope: AccountingScope = { version: 1, tenantId: ctx.tenantId, jobId: source.jobId, companyId: consent.companyId,
  sourceId: source.sourceId, sourceRevision: 1, mapping: { version: 1, tenantId: ctx.tenantId, companyId: consent.companyId,
    revision: 1, accountId: "demo-sales", customerId: "demo-customer", approval: "synthetic_reference_only",
    tax: "unsupported", retention: "unsupported", cis: "unsupported", drc: "unsupported" } };
function setup(sources: AccountingSource[] = [source], enabled = true) {
  const adapter = new FakeCodatAdapter();
  const model = new AccountingExportSandbox(adapter, sources, [consent], enabled);
  return { model, adapter };
}
function command(model: AccountingExportSandbox, s = scope, suffix = "one") {
  const result = { version: 1 as const, commandId: `demo-command-${suffix}`, idempotencyKey: `demo-key-${suffix}`, scope: s,
    decision: { version: 1 as const, decisionId: `demo-decision-${suffix}`, tenantId: ctx.tenantId, actorId: ctx.actorId,
      action: "accounting_export.push" as const, previewHash: model.preview(ctx, s, 100).previewHash,
      status: "approved" as const, humanConfirmed: true as const, expiresAt: 2000 } };
  model.confirmPreview(ctx, s, result.decision, 100);
  return result;
}
function adjustment(kind: "credit" | "receipt", pence = 50, id = `demo-${kind}`): AccountingSource {
  return { ...source, sourceId: id, kind, amount: { pence, currency: "GBP" }, invoiceId: source.sourceId, invoiceRevision: 1, finalAccount: null, state: "posted" };
}
const scopeFor = (s: AccountingSource): AccountingScope => ({ ...scope, sourceId: s.sourceId, sourceRevision: s.revision });

describe("M5-1 dark accounting export", () => {
  it("is disabled by default, rejects live/PII input and leaks no input through errors", () => {
    const adapter = new FakeCodatAdapter();
    const model = new AccountingExportSandbox(adapter, [source], [consent]);
    expect(() => model.preview(ctx, scope, 100)).toThrow("disabled");
    const active = setup().model;
    for (const patch of [{ synthetic: false }, { visibility: "shadow" }, { email: "secret@example.com" }, { sourceId: "real-customer" }]) {
      expect(() => active.setSyntheticSource({ ...source, ...patch })).toThrow(/^Accounting export: invalid_input$/);
    }
    expect(adapter.pushes).toBe(0);
  });
  it.each(["customer_invoice", "credit", "receipt"] as const)("exports %s with exact pennies and immutable source/mapping ledger", kind => {
    const item = kind === "customer_invoice" ? source : adjustment(kind, 1);
    const { model, adapter } = setup(kind === "customer_invoice" ? [source] : [source, item]);
    const s = scopeFor(item);
    const result = model.push(ctx, command(model, s), 100);
    expect(result.status).toBe("pushed");
    expect(result.pence).toBe(item.amount.pence);
    expect(adapter.objects[0]!.payload).toMatchObject({ sourceId: item.sourceId, sourceRevision: item.revision, amount: item.amount, companyId: s.companyId, accountId: s.mapping.accountId });
    expect(result.sourceRevision).toBe(1);
    const ledger = model.ledger(ctx, s, 100);
    expect(ledger.artifact?.scope.mapping).toEqual(s.mapping);
    expect(ledger.artifact?.source).toEqual(item);
    ledger.entry.status = "failed";
    expect(model.ledger(ctx, s, 100).entry.status).toBe("pushed");
  });
  it("deduplicates commands, idempotency keys and new commands for the same business effect", () => {
    const { model, adapter } = setup(); const c = command(model);
    const first = model.push(ctx, c, 100);
    expect(model.push(ctx, c, 100)).toEqual(first);
    model.push(ctx, command(model, scope, "two"), 100);
    expect(adapter.pushes).toBe(1);
    expect(() => model.push(ctx, { ...c, decision: { ...c.decision, expiresAt: 1900 } }, 100)).toThrow("approval_required");
    expect(() => model.push(ctx, { ...c, commandId: "demo-different" }, 100)).toThrow("replay_conflict");
    expect(() => model.push(ctx, { ...c, idempotencyKey: "demo-different" }, 100)).toThrow("replay_conflict");
  });
  it.each(["reject", "unknown_before", "unknown_after"] as const)("requires reconciliation after %s before retry", mode => {
    const { model, adapter } = setup(); const c = command(model); adapter.next = mode;
    expect(model.push(ctx, c, 100).status).toBe(mode === "reject" ? "failed" : "outcome_unknown");
    expect(() => model.push(ctx, c, 100)).toThrow("reconcile_required");
    expect(adapter.pushes).toBe(1);
    expect(model.reconcile(ctx, scope, 100).status).toBe(mode === "unknown_after" ? "pushed" : "confirmed_absent");
    expect(model.push(ctx, c, 100).status).toBe("pushed");
    expect(adapter.objects).toHaveLength(1);
  });
  it("detects external edits, duplicate imports, changed references and paid labels without importing proof", () => {
    const { model, adapter } = setup(); const c = command(model);
    model.push(ctx, c, 100);
    const object = adapter.objects[0]!;
    object.paid = true;
    expect(model.reconcile(ctx, scope, 100).qualifyingRecoveryProof).toBe(false);
    object.payload.amount.pence = 99;
    expect(model.reconcile(ctx, scope, 100).status).toBe("external_edit");
    object.payload.amount.pence = source.amount.pence;
    object.contentHash = "edited";
    expect(model.reconcile(ctx, scope, 100).status).toBe("external_edit");
    expect(() => model.push(ctx, c, 100)).toThrow("reconcile_required");
    object.contentHash = c.decision.previewHash;
    adapter.objects.push({ ...object, id: "demo-duplicate" });
    expect(model.reconcile(ctx, scope, 100).status).toBe("duplicate_import");
    adapter.objects.pop(); object.id = "demo-replaced";
    expect(model.reconcile(ctx, scope, 100).status).toBe("reference_conflict");
    object.reference = "unmatched";
    expect(model.reconcile(ctx, scope, 100).status).toBe("reference_conflict");
    expect(adapter.pushes).toBe(1);
  });
  it("reconciles a pre-existing import without another create", () => {
    const { model, adapter } = setup(); const c = command(model);
    adapter.next = "unknown_after"; const row = model.push(ctx, c, 100);
    // Reuse the same external fake with a fresh model to simulate an imported target object.
    const restored = new AccountingExportSandbox(adapter, [source], [consent], true);
    expect(restored.push(ctx, command(restored), 100).externalId).toBe(adapter.objects[0]!.id);
    expect(restored.reconcile(ctx, scope, 100).reference).toBe(row.reference);
    expect(adapter.pushes).toBe(1);
  });
  it("checks approval, actor, expiry, company, mapping, scope and consent again at execution", () => {
    const { model, adapter } = setup(); const c = command(model);
    for (const decision of [{ ...c.decision, humanConfirmed: false }, { ...c.decision, status: "rejected" },
      { ...c.decision, action: "send" }, { ...c.decision, actorId: "demo-other" }, { ...c.decision, expiresAt: 100 }]) {
      expect(() => model.push(ctx, { ...c, decision }, 100)).toThrow();
    }
    expect(() => model.push(ctx, { ...c, scope: { ...scope, mapping: { ...scope.mapping, accountId: "demo-other" } } }, 100)).toThrow("approval_required");
    expect(() => model.push(ctx, { ...c, scope: { ...scope, companyId: "demo-other" } }, 100)).toThrow("consent_expired");
    model.setSyntheticConsent({ ...consent, revision: 2 });
    expect(() => model.push(ctx, c, 100)).toThrow("approval_required");
    model.setSyntheticConsent({ ...consent, revoked: true });
    expect(() => model.push(ctx, c, 100)).toThrow("consent_expired");
    model.setSyntheticConsent(consent);
    expect(() => model.push(ctx, c, 5000)).toThrow("consent_expired");
    expect(adapter.pushes).toBe(0);
  });
  it("refuses cross-tenant, same-tenant wrong-job and unauthorized operations", () => {
    const { model } = setup(); const c = command(model); model.push(ctx, c, 100);
    const outsider = { ...ctx, tenantId: "demo-other" };
    for (const method of ["preview", "reconcile", "ledger"] as const) {
      expect(() => model[method](outsider, scope, 100)).toThrow("forbidden");
      expect(() => model[method]({ ...ctx, canExport: false }, scope, 100)).toThrow("forbidden");
      expect(() => model[method](ctx, { ...scope, jobId: "demo-other-job" }, 100)).toThrow("source_unavailable");
    }
    expect(() => model.push(outsider, c, 100)).toThrow("forbidden");
    expect(model.history(outsider)).toEqual([]);
    expect(JSON.stringify(model.history(ctx))).not.toMatch(/demo-customer|demo-sales|demo-actor/);
  });
  it.each([0, -1, MAX_MONEY_PENCE + 1, 1.5, Number.NaN])("rejects invalid pence %s", pence => {
    expect(() => setup([{ ...source, amount: { pence, currency: "GBP" } }])).toThrow("invalid_input");
  });
  it("permits the exact cap and penny values without arithmetic rounding", () => {
    const { model } = setup([{ ...source, amount: { pence: MAX_MONEY_PENCE, currency: "GBP" } }]);
    expect(model.push(ctx, command(model), 100).pence).toBe(MAX_MONEY_PENCE);
  });
  it.each(["credit", "receipt"] as const)("bounds %s references and aggregate allocation using immutable exported amounts", kind => {
    const a = adjustment(kind, 60); const b = adjustment(kind, 42, "demo-adjustment-two");
    const { model } = setup([source, a, b]);
    model.push(ctx, command(model, scopeFor(a)), 100);
    model.setSyntheticSource({ ...a, amount: { pence: 1, currency: "GBP" }, state: "cancelled" });
    expect(() => model.preview(ctx, scopeFor(b), 100)).toThrow("reference_conflict");
    model.setSyntheticSource({ ...b, amount: { pence: 41, currency: "GBP" } });
    expect(model.push(ctx, command(model, scopeFor(b), "two"), 100).status).toBe("pushed");
  });
  it("rejects adjustments before their invoice, wrong-job references and amounts above invoice", () => {
    const a = adjustment("credit", 102);
    expect(() => setup([a]).model.preview(ctx, scopeFor(a), 100)).toThrow("reference_conflict");
    expect(() => setup([source, a]).model.preview(ctx, scopeFor(a), 100)).toThrow("reference_conflict");
    expect(() => setup([source, { ...a, jobId: "demo-other-job" }]).model.preview(ctx, { ...scopeFor(a), jobId: "demo-other-job" }, 100)).toThrow("reference_conflict");
    expect(() => setup([{ ...source, tenantId: "demo-other" }, a]).model.preview(ctx, scopeFor(a), 100)).toThrow("reference_conflict");
  });
  it("refuses cancelled/superseded sources before or after an export and requires exact locked final revision", () => {
    const { model, adapter } = setup(); const c = command(model); model.push(ctx, c, 100);
    for (const state of ["cancelled", "superseded"] as const) {
      model.setSyntheticSource({ ...source, state });
      expect(() => model.push(ctx, c, 100)).toThrow("source_unavailable");
      expect(() => setup([{ ...source, state }]).model.preview(ctx, scope, 100)).toThrow("source_unavailable");
    }
    model.setSyntheticSource({ ...source, revision: 2 });
    expect(() => model.push(ctx, c, 100)).toThrow("source_unavailable");
    const newer = { ...scope, sourceRevision: 2 };
    expect(() => model.push(ctx, command(model, newer, "two"), 100)).toThrow("reference_conflict");
    model.setSyntheticSource({ ...source, finalAccount: { revision: 3, lockedRevision: 2 } });
    expect(() => model.preview(ctx, scope, 100)).toThrow("source_unavailable");
    expect(adapter.pushes).toBe(1);
  });
  it.each(["tax", "retention", "cis", "drc"])("fails explicitly on unsupported %s mappings", field => {
    const { model } = setup();
    expect(() => model.preview(ctx, { ...scope, mapping: { ...scope.mapping, [field]: "supported" } }, 100)).toThrow("unsupported_mapping");
    expect(() => model.setSyntheticSource({ ...source, [field]: { pence: 10 } })).toThrow("unsupported_mapping");
  });
  it("requires a stored human confirmation, rejects reused Decision IDs and binds the parent invoice revision", () => {
    const { model } = setup(); const c = command(model);
    expect(() => model.push(ctx, { ...c, decision: { ...c.decision, decisionId: "demo-unconfirmed" } }, 100)).toThrow("approval_required");
    const changed = { ...scope, mapping: { ...scope.mapping, revision: 2 } };
    const previewHash = model.preview(ctx, changed, 100).previewHash;
    expect(() => model.confirmPreview(ctx, changed, { ...c.decision, previewHash }, 100)).toThrow("replay_conflict");
    const receipt = adjustment("receipt");
    const other = setup([{ ...source, revision: 2 }, receipt]).model;
    expect(() => other.preview(ctx, scopeFor(receipt), 100)).toThrow("reference_conflict");
  });
  it("refuses a revoked confirmation and cannot silently reapprove its Decision ID", () => {
    const { model, adapter } = setup(); const c = command(model);
    expect(() => model.revokeConfirmation({ ...ctx, tenantId: "demo-other" }, c.decision)).toThrow("forbidden");
    model.revokeConfirmation(ctx, c.decision);
    expect(() => model.push(ctx, c, 100)).toThrow("approval_required");
    expect(() => model.confirmPreview(ctx, scope, c.decision, 100)).toThrow("replay_conflict");
    expect(adapter.pushes).toBe(0);
  });
  it("keeps the ledger available for reconciliation after source cancellation without authorizing a new push", () => {
    const { model } = setup(); model.push(ctx, command(model), 100);
    model.setSyntheticSource({ ...source, state: "cancelled" });
    expect(model.ledger(ctx, scope, 100).artifact?.source.state).toBe("issued");
    expect(model.reconcile(ctx, scope, 100).status).toBe("pushed");
  });
});
