import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { PurchaseOrderRepository } from "../src/purchase-order-repository.js";
import type { ConsequentialCommand } from "../src/commands.js";
import { testTenantContext } from "./tenant-context-test-utils.js";

// Executable repository regressions without sockets. This SQL double is not
// PostgreSQL evidence; purchase-order-audit.integration.test.ts checks real SQL.
function fixture() {
  const tenant = randomUUID(), job = randomUUID(), requirement = randomUUID(), member = randomUUID();
  const rates = [{ version: 1, price_pence: 2000, price_unit: "each", pack_each_quantity: undefined as string | undefined,
    effective_from: "2026-10-01", effective_to: "2026-10-31" }];
  let state = { draft: "", revisions: [] as any[], placements: [] as any[], effects: [] as unknown[],
    authorizations: [] as unknown[], audits: [] as unknown[], receipts: [] as any[] };
  let before = structuredClone(state);
  const statements: Array<{ sql: string; values: any[] }> = [];
  const client = { release() {}, async query(sql: string, values: any[] = []) {
    statements.push({ sql, values });
    const result = (rows: any[] = []) => ({ rows, rowCount: rows.length });
    if (sql === "BEGIN") { before = structuredClone(state); return result(); }
    if (sql === "ROLLBACK") { state = before; return result(); }
    if (sql === "COMMIT" || sql.includes("set_config") || sql.includes("pg_advisory_xact_lock") ||
        sql.includes("require_watchdog_live") || sql.includes("advance_audit_head")) return result();
    if (sql.includes("JOIN app.merchant_sku")) {
      let candidates = rates.slice();
      // Model only the two predicates under audit, retaining the old behavior
      // until the repository supplies each bound validity predicate.
      if (/r\.effective_from\s*<=\s*\$4/u.test(sql)) candidates = candidates.filter(r => r.effective_from <= values[3]);
      if (/r\.effective_to\s*>=\s*\$4/u.test(sql)) candidates = candidates.filter(r => r.effective_to >= values[3]);
      const rate = candidates.sort((a, b) => b.version - a.version)[0];
      return result(rate ? [{ id: requirement, quantity_decimal: "10", unit: "each", tax_basis: "net", ...rate }] : []);
    }
    if (sql.startsWith("SELECT id FROM app.purchase_order_draft")) return result(state.draft ? [{ id: state.draft }] : []);
    if (sql.startsWith("INSERT INTO app.purchase_order_draft")) { state.draft = values[0]; return result(); }
    if (sql.includes("max(revision)")) return result([{ n: state.revisions.length }]);
    if (sql.startsWith("INSERT INTO app.purchase_order_revision")) {
      const [id, tenant_id, job_id, draft_id, revision, quantity_decimal, unit_price_pence, order_net_pence,
        agreed_net_pence, recipient, required_date_iso, authority_hash] = values;
      state.revisions.push({ id, tenant_id, job_id, draft_id, revision, quantity_decimal, unit_price_pence,
        order_net_pence, agreed_net_pence, recipient, required_date_iso, authority_hash }); return result();
    }
    if (sql.startsWith("SELECT r.*")) return result(state.revisions.slice(-1));
    if (sql.startsWith("SELECT *,to_char")) return result(state.revisions.filter(r => r.id === values[2] && r.revision === values[3]));
    if (sql.startsWith("SELECT id,outbox_action_id")) return result(state.placements);
    if (sql.startsWith("INSERT INTO app.purchase_order_placement")) {
      state.placements.push({ id: values[0], revision_id: values[4], outbox_action_id: values[6] }); return result();
    }
    if (sql.startsWith("SELECT role FROM app.membership")) return result([{ role: "owner" }]);
    if (sql.startsWith("SELECT 1 FROM app.command_receipt c") || sql.includes("UNION ALL")) return result();
    if (sql.startsWith("INSERT INTO app.watchdog_command_identity")) return result([{ command_id: values[1] }]);
    if (sql.startsWith("INSERT INTO app.watchdog_command_result")) return result();
    if (sql.startsWith("INSERT INTO app.command_receipt")) {
      if (state.receipts.some(r => r.command_id === values[0] || r.semantic_key === values[3])) return result();
      state.receipts.push({ command_id: values[0], semantic_key: values[3], request_hash: values[4] }); return result([{}]);
    }
    if (sql.startsWith("SELECT request_hash,status,result")) return result(state.receipts.filter(r => r.command_id === values[1] || r.semantic_key === values[3]));
    if (sql.startsWith("UPDATE app.command_receipt")) {
      Object.assign(state.receipts.find(r => r.command_id === values[1]), { status: "succeeded", result: JSON.parse(values[2]) }); return result();
    }
    if (sql.startsWith("INSERT INTO app.decision")) return result();
    if (sql.startsWith("INSERT INTO app.action_authorization")) { state.authorizations.push(values); return result(); }
    if (sql.startsWith("INSERT INTO app.action_outbox")) { state.effects.push(values); return result(); }
    if (sql.includes("current_setting('app.tenant_id'")) return result([{ tenant_id: tenant }]);
    if (sql.includes("lock_audit_head")) return result();
    if (sql.includes("clock_timestamp() AS occurred_at")) return result([{ occurred_at: new Date("2026-10-13T12:00:00Z") }]);
    if (sql.startsWith("INSERT INTO app.audit_event")) { state.audits.push(values); return result(); }
    throw new Error(`Unexpected query: ${sql}`);
  } };
  const repo = new PurchaseOrderRepository({ connect: async () => client } as unknown as Pool);
  const ctx = testTenantContext(tenant);
  const input = { version: "purchase-order-draft.v1" as const, commandId: randomUUID(), requirementId: requirement,
    quantity: "10", unitPricePence: 2000, recipient: "orders@fictional.invalid", requiredDate: "2026-10-20", expectedRevision: 0 };
  function command(order: Awaited<ReturnType<PurchaseOrderRepository["revise"]>>): ConsequentialCommand {
    return { version: "command.v1", commandId: randomUUID(), commandType: "purchase_order.place", semanticKey: randomUUID(),
      actorMembershipId: member, subjectType: "purchase_order", subjectRef: order.id,
      action: { actionType: "purchase_order.simulate", recipient: state.revisions.find(r => r.id === order.id).recipient,
        contentHash: order.authorityHash, aggregateRevision: order.revision, amountPence: order.orderNetPence,
        currency: "GBP", policyVersion: "synthetic-po.v1", expiresAt: new Date("2099-01-01T00:00:00Z") } };
  }
  return { repo, ctx, job, input, rates, command, statements, state: () => state };
}

describe("purchase-order blocking audit regressions", () => {
  it("normalizes box agreement before purchase-order comparison", async () => {
    const f = fixture(); Object.assign(f.rates[0]!, { price_pence: 20000, price_unit: "box", pack_each_quantity: "10" });
    await f.repo.revise(f.ctx, f.job, f.input);
    expect(await f.repo.view(f.ctx, f.job)).toMatchObject({ orderNetPence: 20000, agreedNetPence: 20000, differencePence: 0 });
  });
  it.each(["future", "expired"])("purchase-order comparison excludes %s rate revisions", async period => {
    const f = fixture();
    f.rates.push({ ...f.rates[0]!, version: 2, price_pence: 2500,
      effective_from: period === "future" ? "2026-11-01" : "2026-09-01",
      effective_to: period === "future" ? "2026-11-30" : "2026-09-30" });
    await f.repo.revise(f.ctx, f.job, f.input);
    expect(await f.repo.view(f.ctx, f.job)).toMatchObject({ agreedNetPence: 20000, differencePence: 0 });
  });
  it("rejects fresh placement of superseded revision", async () => {
    const f = fixture(), first = await f.repo.revise(f.ctx, f.job, f.input), command = f.command(first);
    await f.repo.revise(f.ctx, f.job, { ...f.input, commandId: randomUUID(), expectedRevision: 1, quantity: "11", recipient: "other@fictional.invalid" });
    const before = structuredClone(f.state());
    await expect(f.repo.place(f.ctx, f.job, command)).rejects.toThrow("PURCHASE_ORDER_AUTHORITY_STALE");
    expect(f.state()).toEqual(before);
  });
  it("refuses changed revision as replay of placed order", async () => {
    const f = fixture(), first = await f.repo.revise(f.ctx, f.job, f.input);
    await f.repo.place(f.ctx, f.job, f.command(first));
    const second = await f.repo.revise(f.ctx, f.job, { ...f.input, commandId: randomUUID(), expectedRevision: 1, quantity: "11", recipient: "other@fictional.invalid" });
    const before = structuredClone(f.state());
    await expect(f.repo.place(f.ctx, f.job, f.command(second))).rejects.toThrow("PURCHASE_ORDER_AUTHORITY_STALE");
    expect(f.state()).toEqual(before);
    expect(f.state().placements[0].revision_id).toBe(first.id);
  });
  it("preserves an exact receipt replay after a later revision", async () => {
    const f = fixture(), first = await f.repo.revise(f.ctx, f.job, f.input), command = f.command(first);
    const placed = await f.repo.place(f.ctx, f.job, command);
    await f.repo.revise(f.ctx, f.job, { ...f.input, commandId: randomUUID(), expectedRevision: 1, quantity: "11" });
    const before = structuredClone(f.state());
    expect(await f.repo.place(f.ctx, f.job, command)).toEqual(placed);
    expect(f.state()).toEqual(before);
  });
  it("reuses only the same placed revision for a fresh exact approval", async () => {
    const f = fixture(), order = await f.repo.revise(f.ctx, f.job, f.input);
    const placed = await f.repo.place(f.ctx, f.job, f.command(order));
    expect(await f.repo.place(f.ctx, f.job, f.command(order))).toEqual({ ...placed, reused: true });
    expect(f.state().placements).toHaveLength(1);
    expect(f.state().effects).toHaveLength(1);
  });
  it("holds revise's aggregate lock before placement identity, revision checks and audit", async () => {
    const f = fixture(), order = await f.repo.revise(f.ctx, f.job, f.input);
    const reviseLock = f.statements.find(q => q.sql.includes("pg_advisory_xact_lock"))!.values[0];
    f.statements.length = 0;
    await f.repo.place(f.ctx, f.job, f.command(order));
    const at = (predicate: (q: typeof f.statements[number]) => boolean) => f.statements.findIndex(predicate);
    const lock = at(q => q.sql.includes("pg_advisory_xact_lock") && q.values[0] === reviseLock);
    expect(lock).toBeGreaterThan(-1);
    expect(lock).toBeLessThan(at(q => q.sql.startsWith("INSERT INTO app.watchdog_command_identity")));
    expect(lock).toBeLessThan(at(q => q.sql.includes("max(revision)")));
    expect(lock).toBeLessThan(at(q => q.sql.includes("lock_audit_head")));
  });
  it("refuses an unknown pack size instead of recording a fabricated comparison", async () => {
    const f = fixture(); Object.assign(f.rates[0]!, { price_pence: 20000, price_unit: "box" });
    await expect(f.repo.revise(f.ctx, f.job, f.input)).rejects.toThrow("MATERIAL_RATE_NOT_COMPARABLE");
    expect(f.state().revisions).toHaveLength(0);
  });
});
