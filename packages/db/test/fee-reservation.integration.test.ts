import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresReservationStore } from "../../../apps/api/src/fee-collection/postgres-reservation-store.js";
import { DarkFeeCollectionExecutor } from "../../../apps/api/src/fee-collection/executor.js";
import { FakeGoCardlessRail } from "../../../apps/api/src/fee-collection/fake-gocardless.js";
import { ctx, fixture, id } from "../../../apps/api/src/fee-collection/test-fixture.js";
import { withTenant, type TenantTransaction } from "../src/tenant-context.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { closeWorkFixture, createWorkFixture, type WorkFixture } from "./job-work-state-fixtures.js";
import { migrate } from "../src/migrate.js";

// Real PostgreSQL, fake financial sources and provider adapters only. This does not
// claim a production M4-10 source reader or a live provider integration.
describe("M4-12 PostgreSQL shared reservation store", () => {
  let db: WorkFixture;
  beforeAll(async () => {
    db = await createWorkFixture();
    await db.admin.query("INSERT INTO control_plane.tenant(id) VALUES($1),($2)", [ctx.tenantId, id(90)]);
    // Source fixture lives outside app and is not a migration/business capability.
    await db.admin.query(`CREATE TABLE public.fee_source_fixture(tenant_id uuid PRIMARY KEY, value jsonb NOT NULL);
      GRANT SELECT, UPDATE ON public.fee_source_fixture TO jobguard_runtime`);
  }, 120_000);
  afterAll(async () => closeWorkFixture(db));

  async function setup() {
    const f = fixture();
    // Each test uses an isolated synthetic tenant, including fresh book creation races.
    const tenantId = randomUUID();
    await db.admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [tenantId]);
    f.source.tenantId = tenantId;
    f.source.agreement.tenantId = tenantId;
    f.source.agreement.record!.selection.tenantId = tenantId;
    // Agreement hashes bind the tenant; use the canonical helper after changing it.
    const { subscriptionAgreementHash } = await import("@jobguard/core");
    const hash = subscriptionAgreementHash(f.source.agreement.record!.selection);
    f.source.agreement.currentTermsHash = hash;
    f.source.agreement.record!.termsHash = hash;
    f.source.agreement.record!.approval.termsHash = hash;
    f.source.agreement.statementApproval!.tenantId = tenantId;
    const sessions = { ...f.sessions, findMembership: async () => ({ ...f.membership, tenantId }) };
    const context = { ...ctx, tenantId };
    await db.admin.query("INSERT INTO public.fee_source_fixture VALUES($1,$2)", [tenantId, JSON.stringify(f.source)]);
    const readers = (tx: TenantTransaction) => ({
      collection: async () => (await tx.$client.query("SELECT value FROM public.fee_source_fixture WHERE tenant_id=$1 FOR UPDATE", [tenantId])).rows[0]?.value,
      credit: async () => ({ ...f.credit, tenantId }),
    });
    const store = () => new PostgresReservationStore(db.runtime, async requested => {
      if (requested !== tenantId) throw new Error("COLLECTION_REFUSED");
      return testTenantContext(tenantId);
    }, readers);
    const dd = new FakeGoCardlessRail("fake-dd-test");
    const executor = () => new DarkFeeCollectionExecutor(store(), [f.rail, dd], () => new Date("2026-10-29T00:00:00Z"), sessions);
    const read = () => store().transaction(tenantId, async book => structuredClone(book));
    return { ...f, context, tenantId, store, executor, read };
  }

  it.each(["stripe_card", "direct_debit"])("serializes concurrent card versus %s collectors across store instances", async rail => {
    const f = await setup();
    const results = await Promise.allSettled([
      f.executor().reserve(f.context, f.intent),
      f.executor().reserve(f.context, { ...f.intent, commandId: id(11), rail }),
    ]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
    expect((await f.read()).attempts).toHaveLength(1);
    expect((await f.read()).audit).toHaveLength(1);
  });

  it("persists across pool reconnects and replays one command without another audit entry", async () => {
    const f = await setup();
    const first = await f.executor().reserve(f.context, f.intent);
    // A separate connection pool is an independent process-equivalent reader.
    const { Pool } = await import("pg");
    const restartedPool = new Pool(db.runtime.options);
    try {
      const restarted = new PostgresReservationStore(restartedPool, async () => testTenantContext(f.tenantId), () => ({ collection: async () => f.source, credit: async () => f.credit }));
      expect(await restarted.transaction(f.tenantId, async book => book.attempts[0])).toEqual(first);
    } finally { await restartedPool.end(); }
    expect(await f.executor().reserve(f.context, f.intent)).toEqual(first);
    await expect(f.executor().reserve(f.context, { ...f.intent, rail: "direct_debit" })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expect((await f.read()).audit).toHaveLength(1);
  });

  it("retains unknown outcomes after acceptance/crash and never retries or releases them", async () => {
    const f = await setup();
    await f.executor().reserve(f.context, f.intent);
    f.rail.crashAfterAcceptance = true;
    await expect(f.executor().execute(f.context, id(10))).rejects.toThrow("FAKE_CRASH_AFTER_ACCEPTANCE");
    expect((await f.read()).attempts[0]?.state).toBe("outcome_unknown");
    await expect(f.executor().execute(f.context, id(10))).rejects.toMatchObject({ code: "RECONCILIATION_REQUIRED" });
    await expect(f.executor().reserve(f.context, { ...f.intent, commandId: id(11), rail: "direct_debit" })).rejects.toMatchObject({ code: "COLLECTION_REFUSED" });
    expect((await f.read()).audit.map(a => a.state)).toEqual(["reserved", "outcome_unknown"]);
  });

  it("releases only a definite failure and lets the other rail reserve afterward", async () => {
    const f = await setup();
    await f.executor().reserve(f.context, f.intent);
    f.rail.definiteFailure = true;
    await f.executor().execute(f.context, id(10));
    expect((await f.read()).attempts[0]?.state).toBe("released");
    await f.executor().reserve(f.context, { ...f.intent, commandId: id(11), rail: "direct_debit" });
    expect((await f.read()).attempts[1]?.state).toBe("reserved");
  });

  it("replaces a definite failure concurrently with one reservation and one release", async () => {
    const f = await setup();
    await f.executor().reserve(f.context, f.intent);
    f.rail.definiteFailure = true;
    await f.executor().execute(f.context, id(10));
    const replacement = { ...f.intent, commandId: id(11) };
    const same = await Promise.all([f.executor().reserve(f.context, replacement), f.executor().reserve(f.context, replacement)]);
    expect(same[0]).toEqual(same[1]);
    await expect(f.executor().reserve(f.context, { ...replacement, commandId: id(12), rail: "direct_debit" })).rejects.toMatchObject({ code: "COLLECTION_REFUSED" });
    const book = await f.read();
    expect(book.attempts.filter(a => a.state !== "released").map(a => a.amountPence)).toEqual([600]);
    expect(book.audit.filter(a => a.state === "released")).toHaveLength(1);
    expect(book.audit.filter(a => a.commandId === id(11))).toEqual([{ commandId: id(11), state: "reserved" }]);
    expect(await f.executor().reserve(f.context, f.intent)).toMatchObject({ state: "released" });
    const archive = await db.admin.query("SELECT payload FROM app.fee_reservation_archive WHERE tenant_id=$1 AND kind='attempt'", [f.tenantId]);
    expect(archive.rows).toHaveLength(1);
    expect(archive.rows[0]?.payload).toMatchObject({ commandId: id(10), state: "released" });
    const audit = await db.admin.query("SELECT event_type FROM app.audit_event WHERE tenant_id=$1 AND event_type='fee.collection.released'", [f.tenantId]);
    expect(audit.rows).toHaveLength(1);
  });

  it("allows only one distinct concurrent replacement across rails", async () => {
    const f = await setup();
    await f.executor().reserve(f.context, f.intent);
    f.rail.definiteFailure = true;
    await f.executor().execute(f.context, id(10));
    const results = await Promise.allSettled([
      f.executor().reserve(f.context, { ...f.intent, commandId: id(11) }),
      f.executor().reserve(f.context, { ...f.intent, commandId: id(12), rail: "direct_debit" }),
    ]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
    expect((await f.read()).audit.filter(a => a.state === "released")).toHaveLength(1);
  });

  it("bounds the active book during retry churn and retains archived replays after restart", async () => {
    const f = await setup();
    f.rail.definiteFailure = true;
    for (let i = 100; i < 110; i++) {
      await f.executor().reserve(f.context, { ...f.intent, commandId: id(i) });
      await f.executor().execute(f.context, id(i));
      const row = await db.admin.query("SELECT book FROM app.fee_reservation_book WHERE tenant_id=$1", [f.tenantId]);
      expect(row.rows[0]?.book).toEqual({ version: "fee-reservation-book.v1", attempts: [], audit: [], events: {} });
    }
    const before = await f.read();
    expect(before.attempts).toHaveLength(10);
    expect(before.audit.filter(a => a.state === "released")).toHaveLength(10);
    expect(await f.executor().reserve(f.context, { ...f.intent, commandId: id(100) })).toMatchObject({ state: "released" });
    expect(await f.read()).toEqual(before);
    await expect(f.executor().reserve(f.context, { ...f.intent, commandId: id(100), rail: "direct_debit" })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await migrate(db.admin);
    expect(await f.read()).toEqual(before);
  });

  it("keeps archived failure replays and blocks a replacement after late settlement", async () => {
    const f = await setup();
    await f.executor().reserve(f.context, f.intent); await f.executor().execute(f.context, id(10));
    const body = (state: string, eventId: string) => JSON.stringify({ version: "fake-stripe-event.v1", environment: "synthetic_demo", account: "fake_jobguard_card", tenantId: f.tenantId,
      eventId, commandId: id(10), objectId: f.rail.objectId(f.tenantId, id(10)), amountPence: 600, kind: "collection", state });
    const failure = body("definite_failure", id(51));
    await f.executor().webhook(f.context, "stripe_card", failure, f.rail.sign(failure));
    await f.executor().webhook(f.context, "stripe_card", failure, f.rail.sign(failure));
    await f.executor().reserve(f.context, { ...f.intent, commandId: id(11) });
    const late = body("settled", id(52));
    await f.executor().webhook(f.context, "stripe_card", late, f.rail.sign(late));
    await f.executor().webhook(f.context, "stripe_card", late, f.rail.sign(late));
    await expect(f.executor().execute(f.context, id(11))).rejects.toMatchObject({ code: "RECONCILIATION_REQUIRED" });
    const book = await f.read();
    expect(book.audit.filter(a => a.state === "released")).toHaveLength(1);
    expect(book.audit.filter(a => a.state === "reconciliation_required")).toHaveLength(1);
    expect(book.attempts.find(a => a.commandId === id(10))?.state).toBe("reconciliation_required");
    const changed = body("settled", id(51));
    await expect(f.executor().webhook(f.context, "stripe_card", changed, f.rail.sign(changed))).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it("keeps the archive tenant isolated and append only for runtime", async () => {
    const f = await setup();
    await f.executor().reserve(f.context, f.intent);
    await withTenant(db.runtime, testTenantContext(id(90)), async tx => {
      expect((await tx.$client.query("SELECT * FROM app.fee_reservation_archive WHERE tenant_id=$1", [f.tenantId])).rows).toEqual([]);
    });
    await expect(withTenant(db.runtime, testTenantContext(id(90)), tx => tx.$client.query(
      "INSERT INTO app.fee_reservation_archive VALUES($1,'event','cross-tenant','null')", [f.tenantId]))).rejects.toMatchObject({ code: "42501" });
    for (const sql of ["UPDATE app.fee_reservation_archive SET payload=payload", "DELETE FROM app.fee_reservation_archive", "TRUNCATE app.fee_reservation_archive"])
      await expect(db.runtime.query(sql)).rejects.toMatchObject({ code: "42501" });
    expect((await db.runtime.query("SELECT * FROM app.fee_reservation_archive")).rows).toEqual([]);
  });

  it("refuses obsolete sources at reservation and again before submission without freeing the balance", async () => {
    const f = await setup();
    const stale = { ...f.source, statementHash: "b".repeat(64) };
    await db.admin.query("UPDATE public.fee_source_fixture SET value=$2 WHERE tenant_id=$1", [f.tenantId, JSON.stringify(stale)]);
    await expect(f.executor().reserve(f.context, f.intent)).rejects.toMatchObject({ code: "COLLECTION_REFUSED" });
    expect((await f.read()).attempts).toEqual([]);
    await db.admin.query("UPDATE public.fee_source_fixture SET value=$2 WHERE tenant_id=$1", [f.tenantId, JSON.stringify(f.source)]);
    await f.executor().reserve(f.context, f.intent);
    await db.admin.query("UPDATE public.fee_source_fixture SET value=$2 WHERE tenant_id=$1", [f.tenantId, JSON.stringify(stale)]);
    await expect(f.executor().execute(f.context, id(10))).rejects.toMatchObject({ code: "COLLECTION_REFUSED" });
    expect((await f.read()).attempts[0]?.state).toBe("reserved");
  });

  it("refuses an obsolete statement revision even with unchanged content hashes", async () => {
    const f = await setup();
    const stale = structuredClone(f.source);
    stale.agreement.currentStatement!.revision++;
    await db.admin.query("UPDATE public.fee_source_fixture SET value=$2 WHERE tenant_id=$1", [f.tenantId, JSON.stringify(stale)]);
    await expect(f.executor().reserve(f.context, f.intent)).rejects.toMatchObject({ code: "AGREEMENT_INELIGIBLE" });
    expect((await f.read()).attempts).toEqual([]);
  });

  it("RLS rejects cross-tenant insert/read/update; missing context and destructive privileges fail closed", async () => {
    const f = await setup();
    await f.executor().reserve(f.context, f.intent);
    await expect(f.store().transaction(id(90), async () => undefined)).rejects.toThrow("COLLECTION_REFUSED");
    await withTenant(db.runtime, testTenantContext(id(90)), async tx => {
      expect((await tx.$client.query("SELECT * FROM app.fee_reservation_book WHERE tenant_id=$1", [f.tenantId])).rows).toEqual([]);
      expect((await tx.$client.query("UPDATE app.fee_reservation_book SET book=book WHERE tenant_id=$1", [f.tenantId])).rowCount).toBe(0);
    });
    await expect(withTenant(db.runtime, testTenantContext(id(90)), tx => tx.$client.query("INSERT INTO app.fee_reservation_book(tenant_id) VALUES($1)", [ctx.tenantId]))).rejects.toMatchObject({ code: "42501" });
    expect((await db.runtime.query("SELECT * FROM app.fee_reservation_book")).rows).toEqual([]);
    for (const action of ["DELETE", "TRUNCATE"]) await expect(db.runtime.query(`${action === "DELETE" ? "DELETE FROM" : "TRUNCATE"} app.fee_reservation_book`)).rejects.toMatchObject({ code: "42501" });
  });

  it("rolls back book and chained audit together, retains webhook replay identities and replays migration safely", async () => {
    const f = await setup();
    await expect(f.store().transaction(f.tenantId, async book => { book.audit.push({ commandId: id(10), state: "reserved" }); throw new Error("rollback"); })).rejects.toThrow("rollback");
    expect((await f.read()).audit).toEqual([]);
    // Fail after the book UPDATE while constructing the chained audit batch.
    await expect(f.store().transaction(f.tenantId, async book => {
      book.events.test = "a".repeat(64);
      book.audit.push({ commandId: id(99), state: "reserved" });
    })).rejects.toMatchObject({ code: "COLLECTION_REFUSED" });
    expect((await f.read()).events).toEqual({});
    expect((await f.read()).audit).toEqual([]);
    expect((await db.admin.query("SELECT * FROM app.fee_reservation_archive WHERE tenant_id=$1", [f.tenantId])).rows).toEqual([]);
    await f.executor().reserve(f.context, f.intent);
    await f.executor().execute(f.context, id(10));
    const body = JSON.stringify({ version: "fake-stripe-event.v1", environment: "synthetic_demo", account: "fake_jobguard_card", tenantId: f.tenantId,
      eventId: id(30), commandId: id(10), objectId: f.rail.objectId(f.tenantId, id(10)), amountPence: 600, kind: "collection", state: "settled" });
    await f.executor().webhook(f.context, "stripe_card", body, f.rail.sign(body));
    const before = await f.read();
    await f.executor().webhook(f.context, "stripe_card", body, f.rail.sign(body));
    expect(await f.read()).toEqual(before);
    const audit = await db.admin.query("SELECT event_type FROM app.audit_event WHERE tenant_id=$1 ORDER BY sequence", [f.tenantId]);
    expect(audit.rows.map(r => r.event_type)).toEqual(before.audit.map(a => `fee.collection.${a.state}`));
    await migrate(db.admin);
    expect(await f.read()).toEqual(before);
  });
});
