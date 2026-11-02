import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PurchaseOrderActionRepository } from "../src/purchase-order-action-repository.js";
import { FakeMerchantOrderPort, merchantOrderContent, orderContentHash, type MerchantOrder } from "../src/purchase-order-action.js";
import { ActionExecutor, operateOutbox, reconcileOutbox, type OutboundAction } from "../src/outbox.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { verifiedTenantContextFromMembership, verifiedTenantContextForQueuedJob } from "../src/tenant-context.js";

afterEach(() => vi.unstubAllEnvs());

// Transaction protocol double. PostgreSQL constraints, RLS and actual predicates
// have separate integration tests; this suite does not claim PostgreSQL evidence.
function fixture() {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  const tenant = randomUUID(), job = randomUUID(), revision = randomUUID(), member = randomUUID(), draft = randomUUID();
  const orderRow = { id: revision, draft_id: draft, revision: 1, quantity_decimal: "10", unit_price_pence: 2500,
    recipient: "orders@fictional.invalid", delivery_date: "2030-02-15", requirement_id: randomUUID(), sku_id: randomUUID(),
    merchant_id: randomUUID(), rate_id: randomUUID(), rate_version: 1, price_pence: 2000, price_unit: "each",
    tax_basis: "net", pack_quantity: "1", applicable_count: 1 };
  let state = { receipts: [] as any[], effects: [] as any[], placements: [] as any[], attestations: [] as any[],
    identities: [] as any[], results: [] as any[], audits: [] as any[], grants: [] as any[], attempts: [] as any[] };
  let snapshot = structuredClone(state), active = false;
  let current = true, locked = false, owner = true;
  const query = vi.fn(async (sql: string, values: any[] = []) => {
    const result = (rows: any[] = [], rowCount = rows.length) => ({ rows, rowCount });
    if (sql === "BEGIN") { snapshot = structuredClone(state); active = true; return result(); }
    if (sql === "ROLLBACK") { state = snapshot; active = false; return result(); }
    if (sql === "COMMIT") { active = false; return result(); }
    if (sql.includes("set_config") || sql.includes("pg_advisory_xact_lock") || sql.includes("require_watchdog_live")) return result();
    if (sql.startsWith("SELECT 1 FROM app.final_account_lock")) return result(locked ? [{}] : []);
    if (sql.startsWith("SELECT r.id,r.draft_id")) return result(current && values[0] === tenant && values[1] === job && values[2] === revision ? [{ ...orderRow }] : []);
    if (sql.startsWith("SELECT role FROM app.membership")) return result(owner ? [{ role: "owner" }] : []);
    if (sql.startsWith("SELECT 1 FROM app.membership")) return result(owner ? [{}] : []);
    if (sql.startsWith("INSERT INTO app.command_receipt")) {
      if (state.receipts.some(r => r.id === values[0] || r.key === values[3])) return result();
      state.receipts.push({ id: values[0], key: values[3], request_hash: values[4] }); return result([{}]);
    }
    if (sql.startsWith("SELECT request_hash,status,result")) return result(state.receipts.filter(r => r.id === values[1] || r.key === values[3]));
    if (sql.startsWith("UPDATE app.command_receipt")) { Object.assign(state.receipts.find(r => r.id === values[1]), { status: "succeeded", result: JSON.parse(values[2]) }); return result(); }
    if (sql.startsWith("INSERT INTO app.decision")) return result();
    if (sql.startsWith("INSERT INTO app.action_authorization")) { state.grants.push(values); return result(); }
    if (sql.startsWith("SELECT revision_id,outbox_action_id") || sql.startsWith("SELECT 1 FROM app.purchase_order_placement")) return result(state.placements);
    if (sql.startsWith("SELECT 1 FROM app.purchase_order_manual_attestation")) return result(state.attestations);
    if (sql.startsWith("INSERT INTO app.purchase_order_placement")) { state.placements.push({ revision_id: values[4], outbox_action_id: values[6] }); return result(); }
    if (sql.startsWith("INSERT INTO app.purchase_order_manual_attestation")) { state.attestations.push(values); return result(); }
    if (sql.startsWith("INSERT INTO app.action_outbox")) {
      state.effects.push({ id: values[0], tenant_id: values[1], authorization_id: values[2], adapter: values[3],
        provider_effect_key: values[4], action_type: values[5], recipient: values[6], content_hash: values[7], immutable_content: values[8],
        aggregate_revision: values[9], amount_pence: values[10], currency: values[11], policy_version: values[12],
        authorization_expires_at: values[13], status: "pending", created_at: new Date(), next_attempt_at: new Date(0) }); return result();
    }
    if (sql.startsWith("SELECT name FROM unnest") || sql.startsWith("\n  SELECT 'readiness.record'")) return result();
    if (sql.startsWith("INSERT INTO app.watchdog_command_identity")) {
      if (state.identities.some(r => r.command_id === values[1])) return result();
      state.identities.push({ command_id: values[1], job_id: values[2], command_type: values[3], request_hash: values[4] }); return result([{}]);
    }
    if (sql.startsWith("SELECT job_id,command_type,request_hash")) return result(state.identities.filter(r => r.command_id === values[1]));
    if (sql.startsWith("SELECT result FROM app.watchdog_command_result")) return result(state.results.filter(r => r.id === values[1]));
    if (sql.startsWith("INSERT INTO app.watchdog_command_result")) { state.results.push({ id: values[1], result: JSON.parse(values[2]) }); return result(); }
    if (sql.includes("current_setting('app.tenant_id'")) return result([{ tenant_id: tenant }]);
    if (sql.includes("lock_audit_head") || sql.includes("advance_audit_head")) return result();
    if (sql.startsWith("SELECT clock_timestamp")) return result([{ occurred_at: new Date() }]);
    if (sql.startsWith("INSERT INTO app.audit_event")) { state.audits.push(values); return result(); }
    if (sql.startsWith("SELECT o.*")) return result(state.effects.filter(e => e.id === values[0]));
    if (sql.startsWith("SELECT 1 FROM app.job j")) return result(!locked ? [{}] : []);
    if (sql.startsWith("SELECT count(*)::int n FROM app.action_attempt")) return result([{ n: state.attempts.length }]);
    if (sql.startsWith("INSERT INTO app.action_attempt")) { state.attempts.push(values); return result(); }
    if (sql.startsWith("UPDATE app.action_attempt")) return result();
    if (sql.startsWith("SELECT status") || sql.startsWith("SELECT provider_effect_key")) return result(state.effects.filter(e => e.id === values[0]).map(e => ({ ...e, revision: e.updated_at })));
    if (sql.startsWith("UPDATE app.action_outbox")) {
      const effect = state.effects.find(e => e.id === values[0]);
      effect.status = sql.includes("SET status=$2") ? values[1] : /SET status='([^']+)'/u.exec(sql)![1];
      effect.updated_at = new Date().toISOString(); return result([], 1);
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  const pool = { connect: async () => ({ query, release() {} }) } as unknown as Pool;
  const repo = new PurchaseOrderActionRepository(pool), context = verifiedTenantContextFromMembership({ tenantId: tenant, membershipId: member, identityUserId: randomUUID() } as Parameters<typeof verifiedTenantContextFromMembership>[0]);
  const scope = { version: "merchant-order-scope.v1", jobId: job, revisionId: revision };
  const port = new FakeMerchantOrderPort();
  const deliver = vi.spyOn(port, "deliver").mockImplementation(async action => { expect(active).toBe(false); return FakeMerchantOrderPort.prototype.deliver.call(port, action); });
  const executor = new ActionExecutor(pool, new Map([[port.name, port]]), { emit() {} });
  async function command() {
    const view = await repo.preview(context, scope);
    return { version: "command.v1", commandId: randomUUID(), commandType: "purchase_order.send.dark",
      semanticKey: `merchant-order:${job}:${revision}`, actorMembershipId: member, subjectType: "purchase_order", subjectRef: revision,
      action: { actionType: "purchase_order.send.dark", recipient: view.order.recipient, contentHash: view.contentHash,
        aggregateRevision: 1, amountPence: view.amountPence, currency: "GBP", policyVersion: "dark-merchant-order.v1", expiresAt: new Date("2099-01-01") } };
  }
  return { repo, context, member, scope, command, orderRow, query, pool, port, deliver, executor, state: () => state,
    supersede: () => { current = false; }, lock: () => { locked = true; }, revoke: () => { owner = false; },
    manual: { version: "manual-order-attestation.v1", jobId: job, revisionId: revision, commandId: randomUUID(),
      supplierReference: "synthetic-order-1" } };
}

describe("M2-1 dark exact approved merchant action", () => {
  it("binds cited merchant, rate, item and delivery details; unknown availability and prevention stay fee-free", async () => {
    const f = fixture(), view = await f.repo.preview(f.context, f.scope);
    expect(view).toMatchObject({ stock: "unknown", leadTime: "unknown", realExternalActions: 0,
      finding: { aboveAgreedRate: true, classification: "prevention", feeEligible: false, feePence: 0 } });
    const command = await f.command(), queued = await f.repo.approve(f.context, f.scope, command);
    expect(f.state().grants).toHaveLength(1); expect(f.port.placedCount).toBe(0);
    await f.executor.execute(f.context, queued.outboxActionId);
    await f.executor.execute(f.context, queued.outboxActionId);
    expect(f.port.placedCount).toBe(1); expect(f.deliver).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(f.state().audits)).not.toContain("fictional.invalid");
    expect(f.state().attempts).toHaveLength(1);
  });
  it("replays identical commands and semantic keys without a second effect; rejects changed payload", async () => {
    const f = fixture(), command = await f.command(), queued = await f.repo.approve(f.context, f.scope, command);
    expect(await f.repo.approve(f.context, f.scope, command)).toEqual(queued);
    expect(await f.repo.approve(f.context, f.scope, { ...command, commandId: randomUUID() })).toEqual(queued);
    await expect(f.repo.approve(f.context, f.scope, { ...command, action: { ...command.action, amountPence: 1 } })).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    await expect(f.repo.approve(f.context, f.scope, { ...command, commandId: randomUUID(), action: { ...command.action, amountPence: 1 } })).rejects.toThrow("COMMAND_CONFLICT");
    expect(f.state().effects).toHaveLength(1); expect(f.state().grants).toHaveLength(1);
  });
  it.each(["quantity_decimal", "unit_price_pence", "recipient", "delivery_date", "rate_version", "merchant_id", "sku_id", "pack_quantity", "price_pence"])("changed %s invalidates prior authority before enqueue", async field => {
    const f = fixture(), command = await f.command();
    const row = f.orderRow as Record<string, unknown>;
    row[field] = typeof row[field] === "number" ? Number(row[field]) + 1 : field.endsWith("_id") ? randomUUID() : field === "recipient" ? "other@fictional.invalid" : field === "delivery_date" ? "2030-03-01" : "11";
    await expect(f.repo.approve(f.context, f.scope, command)).rejects.toThrow("ORDER_AUTHORITY_STALE");
    expect(f.state().effects).toHaveLength(0); expect(f.state().grants).toHaveLength(0);
  });
  it.each(["supersede", "lock"] as const)("%s after approval cancels pending delivery", async boundary => {
    const f = fixture(), queued = await f.repo.approve(f.context, f.scope, await f.command());
    f[boundary](); await f.executor.execute(f.context, queued.outboxActionId);
    expect(f.state().effects[0].status).toBe("cancelled"); expect(f.deliver).not.toHaveBeenCalled();
  });
  it("wrong-job and cross-tenant ids cannot read or replay an approved effect", async () => {
    const f = fixture(), command = await f.command(); await f.repo.approve(f.context, f.scope, command);
    await expect(f.repo.approve(f.context, { ...f.scope, jobId: randomUUID() }, command)).rejects.toThrow("ORDER_ACTION_INVALID");
    await expect(f.repo.preview(f.context, { ...f.scope, jobId: randomUUID() })).rejects.toThrow("ORDER_AUTHORITY_STALE");
    await expect(f.repo.preview(testTenantContext(randomUUID()), f.scope)).rejects.toThrow("ORDER_AUTHORITY_STALE");
    expect(f.state().effects).toHaveLength(1);
  });
  it("revoked owners cannot confirm and locked jobs cannot preview", async () => {
    const f = fixture(), command = await f.command(); f.revoke();
    await expect(f.repo.approve(f.context, f.scope, command)).rejects.toThrow("FORBIDDEN");
    f.lock(); await expect(f.repo.preview(f.context, f.scope)).rejects.toThrow("ORDER_AUTHORITY_STALE");
  });
  it("rejects unsupported bill references, ambiguous rates, unknown tax and expired approval", async () => {
    const f = fixture(), command = await f.command();
    await expect(f.repo.preview(f.context, { ...f.scope, finalAccountRevisionId: randomUUID() })).rejects.toThrow();
    await expect(f.repo.approve(f.context, f.scope, { ...command, action: { ...command.action, expiresAt: new Date(0) } })).rejects.toThrow("AUTHORIZATION_INVALID");
    f.orderRow.applicable_count = 2;
    await expect(f.repo.preview(f.context, f.scope)).rejects.toThrow("ORDER_AUTHORITY_STALE");
    f.orderRow.applicable_count = 1; f.orderRow.tax_basis = "unknown";
    await expect(f.repo.preview(f.context, f.scope)).rejects.toThrow("ORDER_AUTHORITY_STALE");
    expect(f.state().effects).toHaveLength(0);
  });
  it("live-mode executor refuses an already queued dark order", async () => {
    const f = fixture(), queued = await f.repo.approve(f.context, f.scope, await f.command());
    vi.stubEnv("JOBGUARD_ENV", "production");
    await f.executor.execute(f.context, queued.outboxActionId);
    expect(f.deliver).not.toHaveBeenCalled(); expect(f.state().effects[0].status).toBe("cancelled");
  });
  it.each([undefined, "production", "pilot_no_charge"])("refuses all entrypoints outside synthetic mode (%s)", async environment => {
    const f = fixture(), command = await f.command(); vi.stubEnv("JOBGUARD_ENV", environment);
    await expect(f.repo.preview(f.context, f.scope)).rejects.toThrow("SYNTHETIC_MODE_REQUIRED");
    await expect(f.repo.approve(f.context, f.scope, command)).rejects.toThrow("SYNTHETIC_MODE_REQUIRED");
    await expect(f.repo.attestManual(f.context, f.manual)).rejects.toThrow("SYNTHETIC_MODE_REQUIRED");
    expect(f.state().effects).toHaveLength(0);
  });
  it("refuses a caller-supplied different owner without any persisted effect", async () => {
    const f = fixture();
    await expect(f.repo.attestManual(f.context, { ...f.manual, actorMembershipId: randomUUID() })).rejects.toThrow();
    expect(f.state().attestations).toHaveLength(0);
    expect(f.state().audits).toHaveLength(0);
    expect(f.state().identities).toHaveLength(0);
  });
  it("does not replay another authenticated owner's attestation command", async () => {
    const f = fixture(); await f.repo.attestManual(f.context, f.manual);
    const other = verifiedTenantContextFromMembership({ tenantId: f.context.tenantId, membershipId: randomUUID(),
      identityUserId: randomUUID() } as Parameters<typeof verifiedTenantContextFromMembership>[0]);
    await expect(f.repo.attestManual(other, f.manual)).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    expect(f.state().attestations).toHaveLength(1);
    expect(f.state().audits).toHaveLength(1);
  });
  it("requires the original membership context, never a queued or copied context", async () => {
    const f = fixture();
    for (const context of [verifiedTenantContextForQueuedJob(f.context.tenantId), { ...f.context }]) {
      await expect(f.repo.attestManual(context, f.manual)).rejects.toThrow("A verified tenant context");
    }
    expect(f.state().attestations).toHaveLength(0);
  });
  it("refuses a revoked owner, including replay after revocation", async () => {
    const f = fixture(); f.revoke();
    await expect(f.repo.attestManual(f.context, f.manual)).rejects.toThrow("ORDER_ACTION_INVALID");
    expect(f.state().attestations).toHaveLength(0);
    const g = fixture(); await g.repo.attestManual(g.context, g.manual); g.revoke();
    await expect(g.repo.attestManual(g.context, g.manual)).rejects.toThrow("ORDER_ACTION_INVALID");
    expect(g.state().attestations).toHaveLength(1);
    expect(g.state().audits).toHaveLength(1);
  });
  it("manual placement is a replayable separate fact, without a Decision, send or fee", async () => {
    const f = fixture(), fact = await f.repo.attestManual(f.context, f.manual);
    expect(fact).toMatchObject({ fact: "owner_attestation", providerConfirmed: false, realExternalActions: 0 });
    expect(f.state().attestations[0][6]).toBe(f.member);
    expect(f.state().audits[0][4]).toBe(`membership:${f.member}`);
    expect(await f.repo.attestManual(f.context, f.manual)).toEqual(fact);
    await expect(f.repo.attestManual(f.context, { ...f.manual, supplierReference: "synthetic-other" })).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    await expect(f.repo.approve(f.context, f.scope, await f.command())).rejects.toThrow("ORDER_ALREADY_COMMITTED");
    expect(f.state().attestations).toHaveLength(1); expect(f.state().effects).toHaveLength(0); expect(f.state().grants).toHaveLength(0);
  });
  it("manual attestation cannot cause an already queued order to be placed again", async () => {
    const f = fixture(); await f.repo.approve(f.context, f.scope, await f.command());
    await expect(f.repo.attestManual(f.context, f.manual)).rejects.toThrow("ORDER_ALREADY_COMMITTED");
    expect(f.state().attestations).toHaveLength(0); expect(f.state().effects).toHaveLength(1);
  });
  it("cancellation before send is terminal; unknown outcomes need reconciliation, not blind retry", async () => {
    const f = fixture(), queued = await f.repo.approve(f.context, f.scope, await f.command());
    await operateOutbox(f.pool, f.context, queued.outboxActionId, "cancel");
    await f.executor.execute(f.context, queued.outboxActionId); expect(f.deliver).not.toHaveBeenCalled();
    await expect(operateOutbox(f.pool, f.context, queued.outboxActionId, "retry")).rejects.toThrow("UNSAFE_OUTBOX_COMMAND");
    const g = fixture(), pending = await g.repo.approve(g.context, g.scope, await g.command());
    g.deliver.mockImplementationOnce(async action => { await FakeMerchantOrderPort.prototype.deliver.call(g.port, action); return { kind: "outcome_unknown", code: "synthetic_timeout" }; });
    await g.executor.execute(g.context, pending.outboxActionId);
    await g.executor.execute(g.context, pending.outboxActionId); expect(g.port.placedCount).toBe(1);
    await expect(operateOutbox(g.pool, g.context, pending.outboxActionId, "retry", true)).rejects.toThrow("UNSAFE_OUTBOX_COMMAND");
    expect(await reconcileOutbox(g.pool, g.context, pending.outboxActionId, g.port)).toBe("succeeded");
    expect(g.port.placedCount).toBe(1);
    // Cancelling a completed effect cannot rewrite the external fact.
    await expect(operateOutbox(g.pool, g.context, pending.outboxActionId, "cancel")).rejects.toThrow("UNSAFE_OUTBOX_COMMAND");
  });
});

describe("fake merchant boundary", () => {
  function action(order: MerchantOrder): OutboundAction {
    const content = merchantOrderContent(order);
    return { version: "outbound-action.v1", id: randomUUID(), authorizationId: randomUUID(), adapter: "fake_merchant_order",
      providerEffectKey: `merchant-order:${order.tenantId}:${order.draftId}`, actionType: "purchase_order.send.dark",
      recipient: order.recipient, contentHash: orderContentHash(content), immutableContent: content, aggregateRevision: order.revision,
      amountPence: 0, currency: "GBP", policyVersion: "dark-merchant-order.v1", authorizationExpiresAt: new Date("2099-01-01") };
  }
  it("deduplicates provider calls and rejects altered effect payloads", async () => {
    const f = fixture(), view = await f.repo.preview(f.context, f.scope), a = { ...action(view.order), amountPence: view.amountPence };
    expect(await f.port.deliver(a)).toEqual(await f.port.deliver(a)); expect(f.port.placedCount).toBe(1);
    const changed = { ...view.order, recipient: "other@fictional.invalid" };
    await expect(f.port.deliver({ ...action(changed), amountPence: view.amountPence })).rejects.toThrow("ORDER_ACTION_INVALID");
  });
  it.each([-1, 1_000_000_000_001, 0.5])("rejects invalid price %s", async price => {
    const f = fixture(), view = await f.repo.preview(f.context, f.scope);
    expect(() => merchantOrderContent({ ...view.order, line: { ...view.order.line, unitPricePence: price } })).toThrow();
  });
  it("allows zero price explicitly, uses half-even pennies and refuses magnitude overflow", async () => {
    const f = fixture(); f.orderRow.quantity_decimal = "0.5"; f.orderRow.unit_price_pence = 1;
    expect((await f.repo.preview(f.context, f.scope)).amountPence).toBe(0);
    f.orderRow.unit_price_pence = 3; expect((await f.repo.preview(f.context, f.scope)).amountPence).toBe(2);
    f.orderRow.unit_price_pence = 0; expect((await f.repo.preview(f.context, f.scope)).amountPence).toBe(0);
    f.orderRow.quantity_decimal = "2"; f.orderRow.unit_price_pence = 1_000_000_000_000;
    await expect(f.repo.preview(f.context, f.scope)).rejects.toThrow("MATERIAL_MONEY_OUT_OF_RANGE");
  });
});
