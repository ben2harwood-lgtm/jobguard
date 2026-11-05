import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cluster, type Cluster } from "./extra-fixtures.js";
import { meterCompany } from "./meter-persistence-fixtures.js";
import type { WorkFixture } from "./job-work-state-fixtures.js";
import { DirectDebitFixtureRepository } from "../src/direct-debit-fixture-repository.js";
import { FakeGoCardlessRail, type FakeDirectDebitEvent } from "../../../apps/api/src/fee-collection/fake-gocardless.js";
import { DirectDebitFixtureRecorder } from "../../../apps/api/src/fee-collection/direct-debit-fixture-recorder.js";
const labels = { environment: "synthetic_demo" as const, account: "fake_jobguard_dd" as const };
describe("M4-15 signed fake events reach PostgreSQL across rail restarts", () => {
  let c: Cluster;
  beforeAll(async () => { c = await cluster(); }, 240_000);
  afterAll(async () => { await c?.close(); });
  async function fixture() {
    const company = await meterCompany(c as unknown as WorkFixture);
    const mandate = { version: "direct-debit-binding.v1" as const, ...labels, mandateId: randomUUID() };
    const payment = { ...mandate, commandId: randomUUID(), objectId: `fake_dd_${"a".repeat(64)}`, amountPence: 100 };
    const repository = new DirectDebitFixtureRepository(c.runtime);
    const rail = (pool = c.runtime) => new FakeGoCardlessRail("fictional-secret", undefined,
      new DirectDebitFixtureRecorder(new DirectDebitFixtureRepository(pool), company.context, mandate, [payment]));
    const initial: FakeDirectDebitEvent = { version: "fake-dd-mandate-event.v1", ...labels, tenantId: company.tenantId,
      mandateId: mandate.mandateId, eventId: randomUUID(), state: "created" };
    const event = (state: string) => ({ version: "fake-dd-event.v1", ...labels, tenantId: company.tenantId,
      commandId: payment.commandId, objectId: payment.objectId, amountPence: 100, kind: "collection", eventId: randomUUID(), state });
    const read = () => repository.read(company.context, mandate);
    const send = async (events: unknown[], target = rail()) => {
      const body = JSON.stringify({ events });
      return target.recordWebhookBatch(body, target.sign(body));
    };
    return { ...company, mandate, payment, initial, event, rail, read, send };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  async function financialSnapshot(f: Fixture) {
    // All tenant-owned app rows except the two fixture fact tables: catches any
    // reservation, invoice, fee, ledger, receipt or collection mutation too.
    const tables = (await c.admin.query<{ name: string }>(`SELECT r.relname name FROM pg_class r
      JOIN pg_namespace n ON n.oid=r.relnamespace JOIN pg_attribute a ON a.attrelid=r.oid
      WHERE n.nspname='app' AND r.relkind='r' AND a.attname='tenant_id' AND NOT a.attisdropped
      AND r.relname NOT IN ('direct_debit_mandate_fact','direct_debit_payment_fact') ORDER BY r.relname`)).rows;
    const rows: Record<string, unknown> = {};
    for (const { name } of tables) rows[name] = (await c.admin.query(
      `SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]') data FROM app."${name.replaceAll('"', '""')}" t WHERE tenant_id=$1`, [f.tenantId])).rows[0].data;
    return rows;
  }
  it("stores signed duplicates once across fresh rails and pools, including concurrent delivery; altered content conflicts", async () => {
    const f = await fixture();
    expect((await f.send([f.initial]))[0]?.code).toBe("processed");
    const e = f.event("submitted"), pool = new Pool({ ...c.config, database: "jobguard_synthetic_demo", user: "ent4b_login", max: 2 });
    try {
      const answers = await Promise.all([f.send([e]), f.send([e], f.rail(pool))]);
      expect(answers.map(a => a[0]?.code)).toEqual(["processed", "processed"]);
      expect(await f.send([e], f.rail(pool))).toEqual([{ code: "processed", eventIds: [f.initial.eventId, e.eventId] }]);
      expect((await f.read()).history).toHaveLength(2);
      expect(await f.send([{ ...e, state: "confirmed" }], f.rail(pool))).toEqual([{ code: "IDEMPOTENCY_CONFLICT" }]);
      expect((await f.read()).history).toHaveLength(2);
    } finally { await pool.end(); }
  });
  it("stores valid batch members independently; forged routes, account, object, amount and invalid schema store nothing", async () => {
    const f = await fixture(), foreign = await fixture();
    await f.send([f.initial]);
    const e = f.event("submitted"), good = f.event("confirmed");
    const invalid = [{ ...e, account: "foreign" }, { ...e, tenantId: foreign.tenantId },
      { ...e, commandId: foreign.payment.commandId }, { ...e, objectId: `fake_dd_${"b".repeat(64)}` },
      { ...e, amountPence: 101 }, { ...e, state: "invented" }, { ...e, kind: "refund" }];
    const result = await f.send([e, ...invalid, good]);
    expect(result.map(r => r.code)).toEqual(["processed", ...invalid.map(() => "INVALID_WEBHOOK"), "processed"]);
    expect((await f.read()).history.map(r => r.event.eventId)).toEqual([f.initial.eventId, e.eventId, good.eventId]);
    await expect(foreign.read()).rejects.toThrow("DD_NOT_FOUND");
  });
  it("writes nothing for missing, forged, expired signatures or a body changed after signing", async () => {
    const f = await fixture(), rail = f.rail();
    const body = JSON.stringify({ events: [f.initial] });
    for (const signature of ["", new FakeGoCardlessRail("wrong").sign(body), rail.sign(body, 1), rail.sign(body + " ")]) {
      await expect(rail.recordWebhookBatch(body, signature)).rejects.toThrow("INVALID_WEBHOOK");
      await expect(f.read()).rejects.toThrow("DD_NOT_FOUND");
    }
  });
  it("keeps request/progress unpaid until stored payout, preserves out-of-order/terminal answers, and changes only fixture facts", async () => {
    const f = await fixture(), before = await financialSnapshot(f);
    await f.send([f.initial]);
    expect((await f.read()).payments).toEqual([]);
    for (const state of ["pending_submission", "submitted", "confirmed"]) {
      await f.send([f.event(state)]);
      expect((await f.read()).payments[0]?.state).toBe(state);
      expect((await f.read()).payments[0]?.state).not.toBe("paid_out");
    }
    await f.send([f.event("paid_out"), f.event("submitted")]);
    expect((await f.read()).payments[0]?.state).toBe("paid_out");
    await f.send([f.event("charged_back"), f.event("paid_out")]);
    expect((await f.read()).payments[0]?.state).toBe("charged_back");
    await f.send([{ ...f.initial, eventId: randomUUID(), state: "cancelled" },
      { ...f.initial, eventId: randomUUID(), state: "active" }]);
    expect(await f.read()).toMatchObject({ mandateState: "cancelled", blocksNewSubmission: true });
    expect(await financialSnapshot(f)).toEqual(before);
  });
  it.each(["failed", "cancelled", "late_failure"])("keeps payment terminal %s after delayed progress", async state => {
    const f = await fixture();
    await f.send([f.initial, f.event(state), f.event("paid_out")]);
    expect((await f.read()).payments[0]?.state).toBe(state);
  });
});
