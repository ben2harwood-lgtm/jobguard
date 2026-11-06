import { createHmac, randomUUID } from "node:crypto";
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
    f.source.agreement.statementApproval!.termsHash = hash;
    const sessions = { ...f.sessions, findMembership: async () => ({ ...f.membership, tenantId }) };
    const context = { ...ctx, tenantId };
    await db.admin.query("INSERT INTO public.fee_source_fixture VALUES($1,$2)", [tenantId, JSON.stringify(f.source)]);
    await db.admin.query("INSERT INTO app.fee_provider_fixture_key VALUES($1,'stripe_card',$2),($1,'direct_debit',$3)",
      [tenantId, "synthetic-test-signing-secret", "fake-dd-test-signing-secret"]);
    const readers = (tx: TenantTransaction) => ({
      collection: async () => (await tx.$client.query("SELECT value FROM public.fee_source_fixture WHERE tenant_id=$1 FOR UPDATE", [tenantId])).rows[0]?.value,
      credit: async () => ({ ...f.credit, tenantId }),
    });
    const store = () => new PostgresReservationStore(db.runtime, testTenantContext(tenantId), readers);
    const dd = new FakeGoCardlessRail("fake-dd-test-signing-secret");
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
      const restarted = new PostgresReservationStore(restartedPool, testTenantContext(f.tenantId), () => ({ collection: async () => f.source, credit: async () => f.credit }));
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

  it("refuses the runtime SQL attack that erases an unknown attempt and opens a second collection", async () => {
    const f = await setup();
    await f.executor().reserve(f.context, f.intent);
    f.rail.crashAfterAcceptance = true;
    await expect(f.executor().execute(f.context, id(10))).rejects.toThrow("FAKE_CRASH_AFTER_ACCEPTANCE");
    const before = await f.read();
    await expect(withTenant(db.runtime, testTenantContext(f.tenantId), tx => tx.$client.query(
      "UPDATE app.fee_reservation_book SET book=jsonb_set(book,'{attempts}','[]'::jsonb) WHERE tenant_id=$1", [f.tenantId],
    ))).rejects.toMatchObject({ code: "42501" });
    expect(await f.read()).toEqual(before);
    await expect(f.executor().reserve(f.context, { ...f.intent, commandId: id(11), rail: "direct_debit" }))
      .rejects.toMatchObject({ code: "COLLECTION_REFUSED" });
    expect(await f.executor().reserve(f.context, f.intent)).toEqual(before.attempts[0]);
    expect(await f.read()).toEqual(before);
  });

  it("guards raw INSERT, UPDATE and DELETE without changing a book", async () => {
    const f = await setup();
    await f.executor().reserve(f.context, f.intent);
    const before = await f.read();
    for (const sql of ["UPDATE app.fee_reservation_book SET book=book WHERE tenant_id=$1",
      "DELETE FROM app.fee_reservation_book WHERE tenant_id=$1"]) {
      await expect(withTenant(db.runtime, testTenantContext(f.tenantId), tx => tx.$client.query(sql, [f.tenantId])))
        .rejects.toMatchObject({ code: "42501" });
      expect(await f.read()).toEqual(before);
    }
    const fresh = await setup();
    await expect(withTenant(db.runtime, testTenantContext(fresh.tenantId), tx => tx.$client.query(
      "INSERT INTO app.fee_reservation_book(tenant_id,book) VALUES($1,$2)",
      [fresh.tenantId, JSON.stringify({ version: "fee-reservation-book.v1", ...before })])))
      .rejects.toMatchObject({ code: "42501" });
    expect((await fresh.read()).attempts).toEqual([]);
  });

  it("refuses direct routine history attacks and keeps unknown blocking the other rail", async () => {
    const f = await setup(), predecessor = fixture();
    await predecessor.executor.reserve(ctx, predecessor.intent);
    predecessor.rail.crashAfterAcceptance = true;
    await expect(predecessor.executor.execute(ctx, id(10))).rejects.toThrow("FAKE_CRASH_AFTER_ACCEPTANCE");
    const before = structuredClone(predecessor.book());
    // Populate an uncompacted predecessor without duplicating already archived audit.
    const active = { version: "fee-reservation-book.v1", ...before, events: { original: "a".repeat(64) } };
    await db.admin.query("INSERT INTO app.fee_reservation_book(tenant_id,book) VALUES($1,$2)", [f.tenantId, JSON.stringify(active)]);
    const attacks = [
      { ...active, attempts: [] },
      { ...active, attempts: [{ ...active.attempts[0], amountPence: 1 }] },
      { ...active, attempts: [{ ...active.attempts[0], state: "reserved" }] },
      { ...active, attempts: [{ ...active.attempts[0], state: "released" }] },
      { ...active, attempts: [{ ...active.attempts[0], state: "provider_accepted" }] },
      { ...active, audit: [] },
      { ...active, audit: [{ commandId: id(99), state: "reserved" }] },
      { ...active, audit: [...active.audit].reverse() },
      { ...active, events: {} },
      { ...active, events: { original: "b".repeat(64) } },
    ];
    for (const book of attacks) {
      await expect(withTenant(db.runtime, testTenantContext(f.tenantId), tx => tx.$client.query(
        "SELECT app.replace_fee_reservation_book($1,$2::jsonb)", [f.tenantId, JSON.stringify(book)])))
        .rejects.toMatchObject({ code: "23514" });
      expect((await db.admin.query("SELECT book FROM app.fee_reservation_book WHERE tenant_id=$1", [f.tenantId])).rows[0]?.book).toEqual(active);
    }
    await expect(f.executor().reserve(f.context, { ...f.intent, commandId: id(11), rail: "direct_debit" }))
      .rejects.toMatchObject({ code: "COLLECTION_REFUSED" });
    expect(await f.executor().reserve(f.context, f.intent)).toEqual(before.attempts[0]);
    expect((await f.read()).attempts).toEqual(before.attempts);
  });

  it("refuses routine calls for another tenant or without context", async () => {
    const f = await setup();
    await f.executor().reserve(f.context, f.intent);
    const before = await f.read();
    for (const sql of ["SELECT app.lock_fee_reservation_book($1)", "SELECT app.replace_fee_reservation_book($1,$2::jsonb)"]) {
      const values = sql.includes("$2") ? [f.tenantId, JSON.stringify({ version: "fee-reservation-book.v1", ...before })] : [f.tenantId];
      await expect(withTenant(db.runtime, testTenantContext(id(90)), tx => tx.$client.query(sql, values)))
        .rejects.toMatchObject({ code: "42501" });
      await expect(db.runtime.query(sql, values)).rejects.toMatchObject({ code: "42501" });
      expect(await f.read()).toEqual(before);
    }
  });

  it("compacts released rows through the guard and changes the book on later store calls", async () => {
    const f = await setup();
    await f.executor().reserve(f.context, f.intent);
    f.rail.definiteFailure = true;
    await f.executor().execute(f.context, id(10));
    const raw = async () => (await db.admin.query(
      "SELECT book FROM app.fee_reservation_book WHERE tenant_id=$1", [f.tenantId])).rows[0]?.book;
    expect(await raw()).toEqual({ version: "fee-reservation-book.v1", attempts: [], events: {}, audit: [] });
    const archived = (await db.admin.query(
      "SELECT kind,key,payload FROM app.fee_reservation_archive WHERE tenant_id=$1 ORDER BY kind,key", [f.tenantId])).rows;
    expect(archived.filter(row => row.kind === "attempt")).toEqual([
      expect.objectContaining({ key: `${id(10)}:0`, payload: expect.objectContaining({ state: "released" }) }),
    ]);
    expect(archived.filter(row => row.kind === "audit")).toHaveLength(3);
    const before = await f.read();
    await f.executor().reserve(f.context, { ...f.intent, commandId: id(11), rail: "direct_debit" });
    expect((await raw()).attempts).toEqual([expect.objectContaining({ commandId: id(11), state: "reserved" })]);
    expect((await f.read()).attempts).toEqual([...before.attempts,
      expect.objectContaining({ commandId: id(11), state: "reserved" })]);
    expect((await f.read()).audit).toEqual([...before.audit, { commandId: id(11), state: "reserved" }]);
    expect((await db.admin.query("SELECT kind,key,payload FROM app.fee_reservation_archive WHERE tenant_id=$1 ORDER BY kind,key", [f.tenantId])).rows)
      .toEqual(expect.arrayContaining(archived));
  });

  it("refuses removal without an identical archive row, including another tenant's matching row", async () => {
    const f = await setup(), other = await setup(), predecessor = fixture();
    await predecessor.executor.reserve(ctx, predecessor.intent);
    predecessor.rail.definiteFailure = true;
    await predecessor.executor.execute(ctx, id(10));
    const active = { version: "fee-reservation-book.v1", ...predecessor.book() };
    await db.admin.query("INSERT INTO app.fee_reservation_book VALUES($1,$2)", [f.tenantId, JSON.stringify(active)]);
    await other.read();
    const refuse = async () => {
      await expect(withTenant(db.runtime, testTenantContext(f.tenantId), tx => tx.$client.query(
        "SELECT app.replace_fee_reservation_book($1,$2::jsonb)",
        [f.tenantId, JSON.stringify({ ...active, attempts: [] })])))
        .rejects.toMatchObject({ code: "23514" });
      expect((await db.admin.query("SELECT book FROM app.fee_reservation_book WHERE tenant_id=$1", [f.tenantId])).rows[0]?.book).toEqual(active);
    };
    await refuse();
    await db.admin.query("INSERT INTO app.fee_reservation_archive VALUES($1,'attempt',$2,$3)",
      [other.tenantId, `${id(10)}:0`, JSON.stringify(active.attempts[0])]);
    await refuse();
    // Same tenant but different bytes cannot substitute for the released attempt either.
    await db.admin.query("INSERT INTO app.fee_reservation_archive VALUES($1,'attempt',$2,$3)",
      [f.tenantId, `${id(10)}:0`, JSON.stringify({ ...active.attempts[0], amountPence: 1 })]);
    await refuse();
  });

  it("limits the migration owner's archive visibility to the session tenant and forbids archive writes", async () => {
    const f = await setup(), other = await setup();
    await f.read();
    await other.read();
    const payload = { commandId: id(10), state: "released" };
    await db.admin.query("INSERT INTO app.fee_reservation_archive VALUES($1,'attempt',$2,$3)",
      [f.tenantId, `${id(10)}:0`, JSON.stringify(payload)]);
    const before = (await db.admin.query("SELECT * FROM app.fee_reservation_archive WHERE tenant_id=$1", [f.tenantId])).rows;
    const book = (await db.admin.query("SELECT book FROM app.fee_reservation_book WHERE tenant_id=$1", [f.tenantId])).rows[0]?.book;
    const client = await db.admin.connect();
    const asOwner = async <T,>(tenant: string, work: () => Promise<T>) => {
      await client.query("BEGIN");
      try {
        await client.query("SET LOCAL ROLE jobguard_migration");
        await client.query("SELECT set_config('app.tenant_id',$1,true)", [tenant]);
        return await work();
      } finally { await client.query("ROLLBACK"); }
    };
    try {
      for (const tenant of [other.tenantId, ""]) {
        expect(await asOwner(tenant, async () => (await client.query("SELECT * FROM app.fee_reservation_archive")).rows)).toEqual([]);
        for (const sql of ["SELECT app.lock_fee_reservation_book($1)", "SELECT app.replace_fee_reservation_book($1,$2::jsonb)"]) {
          await expect(asOwner(tenant, () => client.query(sql, sql.includes("$2")
            ? [f.tenantId, JSON.stringify(book)] : [f.tenantId]))).rejects.toMatchObject({ code: "42501" });
        }
      }
      expect(await asOwner(f.tenantId, async () => (await client.query("SELECT * FROM app.fee_reservation_archive")).rows)).toEqual(before);
      await expect(asOwner(f.tenantId, () => client.query(
        "INSERT INTO app.fee_reservation_archive VALUES($1,'event','forged','null'::jsonb)", [f.tenantId])))
        .rejects.toMatchObject({ code: "42501" });
      // Owner table privileges exist, but no write policy: UPDATE and DELETE affect zero real rows.
      for (const sql of ["UPDATE app.fee_reservation_archive SET payload='null'::jsonb WHERE tenant_id=$1 RETURNING *",
        "DELETE FROM app.fee_reservation_archive WHERE tenant_id=$1 RETURNING *"]) {
        expect(await asOwner(f.tenantId, async () => (await client.query(sql, [f.tenantId])).rows)).toEqual([]);
        expect((await db.admin.query("SELECT * FROM app.fee_reservation_archive WHERE tenant_id=$1", [f.tenantId])).rows).toEqual(before);
      }
      const policies = (await db.admin.query("SELECT policyname,cmd,roles,with_check FROM pg_policies WHERE schemaname='app' AND tablename='fee_reservation_archive' ORDER BY policyname")).rows;
      expect(policies).toEqual([
        expect.objectContaining({ policyname: "fee_seal_insert", cmd: "INSERT", roles: "{jobguard_audit_writer}" }),
        { policyname: "migration_tenant_select", cmd: "SELECT", roles: "{jobguard_migration}", with_check: null },
        expect.objectContaining({ policyname: "tenant_isolation", cmd: "ALL", roles: "{jobguard_runtime}" }),
      ]);
      expect((await db.admin.query("SELECT book FROM app.fee_reservation_book WHERE tenant_id=$1", [f.tenantId])).rows[0]?.book).toEqual(book);
    } finally { client.release(); }
  });

  it("revokes raw archive INSERT and excludes infrastructure from the routines", async () => {
    const rows = (await db.admin.query(`SELECT
      has_table_privilege('jobguard_runtime','app.fee_reservation_archive','SELECT') AS can_read,
      has_table_privilege('jobguard_runtime','app.fee_reservation_archive','INSERT') AS can_insert,
      has_table_privilege('jobguard_runtime','app.fee_reservation_archive','UPDATE') AS can_update,
      has_table_privilege('jobguard_runtime','app.fee_reservation_archive','DELETE') AS can_delete,
      has_function_privilege('jobguard_infrastructure','app.lock_fee_reservation_book(uuid)','EXECUTE') AS infrastructure_lock,
      has_function_privilege('jobguard_infrastructure','app.replace_fee_reservation_book(uuid,jsonb)','EXECUTE') AS infrastructure_replace`)).rows;
    expect(rows).toEqual([{ can_read: true, can_insert: false, can_update: false, can_delete: false,
      infrastructure_lock: false, infrastructure_replace: false }]);
  });

  it("refuses a complete forged release history and archive compaction from runtime SQL", async () => {
    const f = await setup();
    await f.executor().reserve(f.context, f.intent);
    f.rail.crashAfterAcceptance = true;
    await expect(f.executor().execute(f.context, id(10))).rejects.toThrow("FAKE_CRASH_AFTER_ACCEPTANCE");
    const before = await f.read();
    const forged = structuredClone(before);
    forged.attempts[0]!.state = "released";
    forged.audit.push({ commandId: id(10), state: "released" });
    // Each attack has its own transaction: one refusal must not skip later steps.
    await expect(withTenant(db.runtime, testTenantContext(f.tenantId), tx => tx.$client.query(
      "SELECT app.replace_fee_reservation_book($1,$2::jsonb)", [f.tenantId, JSON.stringify(forged)])))
      .rejects.toMatchObject({ code: "23514" });
    const records = [
      { kind: "attempt", key: `${id(10)}:0`, payload: forged.attempts[0] },
      ...forged.audit.map((payload, i) => ({ kind: "audit", key: String(i), payload })),
    ];
    await expect(withTenant(db.runtime, testTenantContext(f.tenantId), tx => tx.$client.query(
      `INSERT INTO app.fee_reservation_archive(tenant_id,kind,key,payload)
        SELECT $1,kind,key,payload FROM jsonb_to_recordset($2::jsonb) r(kind text,key text,payload jsonb)
        ON CONFLICT DO NOTHING`, [f.tenantId, JSON.stringify(records)])))
      .rejects.toMatchObject({ code: "42501" });
    await expect(withTenant(db.runtime, testTenantContext(f.tenantId), tx => tx.$client.query(
      "SELECT app.replace_fee_reservation_book($1,$2::jsonb)",
      [f.tenantId, JSON.stringify({ version: "fee-reservation-book.v1", attempts: [], events: {}, audit: [] })])))
      .rejects.toMatchObject({ code: "23514" });
    await expect(withTenant(db.runtime, testTenantContext(f.tenantId), tx => tx.$client.query(
      "INSERT INTO app.fee_reservation_archive VALUES($1,'attempt',$2,$3)",
      [f.tenantId, `${id(10)}:0`, JSON.stringify(forged.attempts[0])]))).rejects.toMatchObject({ code: "42501" });
    expect(await f.read()).toEqual(before);
    await expect(f.executor().reserve(f.context, { ...f.intent, commandId: id(11), rail: "direct_debit" }))
      .rejects.toMatchObject({ code: "COLLECTION_REFUSED" });
    expect((await db.admin.query("SELECT * FROM app.audit_event WHERE tenant_id=$1 AND event_type='fee.collection.released'", [f.tenantId])).rows).toEqual([]);
  });

  it("refuses a raw archive poison row without locking the company out of its book", async () => {
    const f = await setup();
    await f.executor().reserve(f.context, f.intent);
    const before = await f.read();
    await expect(withTenant(db.runtime, testTenantContext(f.tenantId), tx => tx.$client.query(
      "INSERT INTO app.fee_reservation_archive VALUES($1,'audit','999','null'::jsonb)",
      [f.tenantId]))).rejects.toMatchObject({ code: "42501" });
    expect(await f.read()).toEqual(before);
    for (const poisoned of [{ ...before, events: { poisoned: null } },
      { ...before, attempts: [{ ...before.attempts[0], amountPence: -1 }] }]) {
      await expect(withTenant(db.runtime, testTenantContext(f.tenantId), tx => tx.$client.query(
        "SELECT app.replace_fee_reservation_book($1,$2::jsonb)", [f.tenantId, JSON.stringify(poisoned)])))
        .rejects.toMatchObject({ code: "23514" });
      expect(await f.read()).toEqual(before);
    }
    await f.executor().execute(f.context, id(10));
    expect((await f.read()).attempts[0]?.state).toBe("provider_accepted");
  });

  it("refuses unsigned, altered, wrong-company and wrong-command result fixtures, then accepts the verified webhook once", async () => {
    const f = await setup();
    await f.executor().reserve(f.context, f.intent);
    f.rail.crashAfterAcceptance = true;
    await expect(f.executor().execute(f.context, id(10))).rejects.toThrow("FAKE_CRASH_AFTER_ACCEPTANCE");
    const before = await f.read();
    const next = structuredClone(before);
    next.attempts[0]!.state = "released";
    next.audit.push({ commandId: id(10), state: "released" });
    const signed = f.rail.signStoreResult(f.tenantId, next.attempts[0]!);
    const other = await setup();
    const proofs = [null, { ...signed, signature: "0".repeat(64) },
      { ...signed, body: signed.body.replace('"released"', '"settled"') },
      f.rail.signStoreResult(other.tenantId, next.attempts[0]!),
      f.rail.signStoreResult(f.tenantId, { ...next.attempts[0]!, commandId: id(99) }),
      f.rail.signStoreResult(f.tenantId, { ...next.attempts[0]!, amountPence: 1 })];
    for (const proof of proofs) {
      await expect(withTenant(db.runtime, testTenantContext(f.tenantId), tx => tx.$client.query(
        "SELECT app.replace_fee_reservation_book($1,$2::jsonb,$3::jsonb)",
        [f.tenantId, JSON.stringify(next), JSON.stringify(proof)]))).rejects.toMatchObject({ code: "23514" });
      expect(await f.read()).toEqual(before);
    }
    await expect(withTenant(db.runtime, testTenantContext(f.tenantId), tx => tx.$client.query(
      "SELECT signing_secret FROM app.fee_provider_fixture_key WHERE tenant_id=$1", [f.tenantId])))
      .rejects.toMatchObject({ code: "42501" });
    await expect(withTenant(db.runtime, testTenantContext(f.tenantId), tx => tx.$client.query(
      "SELECT app.seal_fee_reservation_change($1,'[]','[]')", [f.tenantId])))
      .rejects.toMatchObject({ code: "42501" });
    const body = JSON.stringify({ version: "fake-stripe-event.v1", environment: "synthetic_demo", account: "fake_jobguard_card",
      tenantId: f.tenantId, eventId: id(61), commandId: id(10), objectId: f.rail.objectId(f.tenantId,id(10)),
      amountPence: 600, kind: "collection", state: "definite_failure" });
    await expect(f.executor().webhook(f.context, "stripe_card", body, "0".repeat(64))).rejects.toMatchObject({ code: "INVALID_WEBHOOK" });
    await f.executor().webhook(f.context, "stripe_card", body, f.rail.sign(body));
    await f.executor().webhook(f.context, "stripe_card", body, f.rail.sign(body));
    expect((await f.read()).attempts[0]?.state).toBe("released");
    const audit = (await db.admin.query("SELECT * FROM app.audit_event WHERE tenant_id=$1 ORDER BY sequence", [f.tenantId])).rows;
    expect(audit.map(a => a.event_type)).toEqual(["fee.collection.reserved", "fee.collection.outcome_unknown", "fee.collection.released", "fee.collection.webhook_recorded"]);
    expect(audit.every(a => a.payload.references.auditTrust === "checked_operation")).toBe(true);
    for (let i=1;i<audit.length;i++) expect(audit[i].previous_hash).toBe(audit[i-1].event_hash);
    await f.executor().reserve(f.context, { ...f.intent, commandId: id(11), rail: "direct_debit" });
  });

  it("seals raw routine state changes and rolls the book, archive and audit back together", async () => {
    const f = await setup();
    await f.executor().reserve(f.context, f.intent);
    const before = await f.read();
    const next = structuredClone(before);
    next.attempts[0]!.state = "outcome_unknown";
    next.audit.push({ commandId: id(10), state: "outcome_unknown" });
    const auditCount = async () => (await db.admin.query("SELECT * FROM app.audit_event WHERE tenant_id=$1 ORDER BY sequence", [f.tenantId])).rows;
    const archive = async () => (await db.admin.query("SELECT * FROM app.fee_reservation_archive WHERE tenant_id=$1 ORDER BY kind,key", [f.tenantId])).rows;
    const priorAudit = await auditCount(), priorArchive = await archive();
    await expect(withTenant(db.runtime, testTenantContext(f.tenantId), async tx => {
      await tx.$client.query("SELECT app.replace_fee_reservation_book($1,$2::jsonb)", [f.tenantId, JSON.stringify(next)]);
      throw new Error("rollback-after-routine");
    })).rejects.toThrow("rollback-after-routine");
    expect(await f.read()).toEqual(before);
    expect(await auditCount()).toEqual(priorAudit);
    expect(await archive()).toEqual(priorArchive);
    await withTenant(db.runtime, testTenantContext(f.tenantId), tx => tx.$client.query(
      "SELECT app.replace_fee_reservation_book($1,$2::jsonb)", [f.tenantId, JSON.stringify(next)]));
    expect((await auditCount()).map(a => a.event_type)).toEqual(["fee.collection.reserved", "fee.collection.outcome_unknown"]);
    expect((await f.read()).attempts[0]?.state).toBe("outcome_unknown");
  });

  it("authenticates and chains same-state lifecycle updates without rewriting archived releases", async () => {
    const f = await setup();
    await f.executor().reserve(f.context, f.intent);
    f.rail.definiteFailure = true;
    await f.executor().execute(f.context, id(10));
    const before = await f.read();
    const archive = (await db.admin.query("SELECT * FROM app.fee_reservation_archive WHERE tenant_id=$1 AND kind='attempt'", [f.tenantId])).rows;
    await expect(f.store().transaction(f.tenantId, async book => { book.attempts[0]!.paymentState = "cancelled"; }))
      .rejects.toMatchObject({ name: "FeeCollectionError", code: "COLLECTION_REFUSED" });
    expect(await f.read()).toEqual(before);
    let proof: ReturnType<typeof f.rail.signStoreResult> | undefined;
    await f.store().transaction(f.tenantId, async book => {
      book.attempts[0]!.paymentState = "cancelled";
      proof = f.rail.signStoreResult(f.tenantId, book.attempts[0]!);
    }, () => proof);
    const after = await f.read();
    expect(after.audit).toEqual(before.audit);
    expect(after.attempts[0]?.paymentState).toBe("cancelled");
    const history = (await db.admin.query("SELECT * FROM app.fee_reservation_archive WHERE tenant_id=$1 AND kind='attempt' ORDER BY key", [f.tenantId])).rows;
    expect(history).toHaveLength(2);
    expect(history[0]).toEqual(archive[0]);
    const audit = (await db.admin.query("SELECT * FROM app.audit_event WHERE tenant_id=$1 ORDER BY sequence", [f.tenantId])).rows;
    expect(audit.map(a => a.event_type)).toEqual(["fee.collection.reserved","fee.collection.outcome_unknown","fee.collection.released","fee.collection.lifecycle"]);
    expect(audit.at(-1)?.payload.references.paymentState).toBe("cancelled");
    await f.read();
    expect((await db.admin.query("SELECT * FROM app.audit_event WHERE tenant_id=$1 ORDER BY sequence", [f.tenantId])).rows).toEqual(audit);
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

    });
    await expect(withTenant(db.runtime, testTenantContext(id(90)), tx => tx.$client.query("UPDATE app.fee_reservation_book SET book=book WHERE tenant_id=$1", [f.tenantId]))).rejects.toMatchObject({ code: "42501" });
    await expect(withTenant(db.runtime, testTenantContext(id(90)), tx => tx.$client.query("INSERT INTO app.fee_reservation_book(tenant_id) VALUES($1)", [ctx.tenantId]))).rejects.toMatchObject({ code: "42501" });
    expect((await db.runtime.query("SELECT * FROM app.fee_reservation_book")).rows).toEqual([]);
    for (const action of ["DELETE", "TRUNCATE"]) await expect(db.runtime.query(`${action === "DELETE" ? "DELETE FROM" : "TRUNCATE"} app.fee_reservation_book`)).rejects.toMatchObject({ code: "42501" });
  });

  it("rolls back book and chained audit together, retains webhook replay identities and replays migration safely", async () => {
    const f = await setup();
    await expect(f.store().transaction(f.tenantId, async book => { book.audit.push({ commandId: id(10), state: "reserved" }); throw new Error("rollback"); })).rejects.toThrow("rollback");
    expect((await f.read()).audit).toEqual([]);
    // The routine refuses an asserted audit entry without the corresponding attempt.
    await expect(f.store().transaction(f.tenantId, async book => {
      book.events.test = "a".repeat(64);
      book.audit.push({ commandId: id(99), state: "reserved" });
    })).rejects.toMatchObject({ name: "FeeCollectionError", code: "COLLECTION_REFUSED" });
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
    expect(audit.rows.map(r => r.event_type)).toEqual([...before.audit.map(a => `fee.collection.${a.state}`), "fee.collection.webhook_recorded"]);
    await migrate(db.admin);
    expect(await f.read()).toEqual(before);
  });
  it("refuses captured older signed results and backwards moves in separate committed calls", async () => {
    const f = await setup();
    await f.executor().reserve(f.context, { ...f.intent, rail: "direct_debit" });
    await f.store().transaction(f.tenantId, async book => {
      book.attempts[0]!.state = "outcome_unknown";
      book.audit.push({ commandId: id(10), state: "outcome_unknown" });
    });
    const dd = new FakeGoCardlessRail("fake-dd-test-signing-secret");
    let captured: ReturnType<typeof dd.signStoreResult> | undefined;
    let submitted: Awaited<ReturnType<typeof f.read>> | undefined;
    for (const paymentState of ["pending_submission", "submitted", "confirmed", "paid_out"] as const) {
      let proof: ReturnType<typeof dd.signStoreResult> | undefined;
      await f.store().transaction(f.tenantId, async book => {
        const a = book.attempts[0]!;
        a.paymentState = paymentState;
        a.providerObjectId = "synthetic-dd-object";
        const state = paymentState === "paid_out" ? "settled" : "provider_accepted";
        if (a.state !== state) { a.state = state; book.audit.push({ commandId: a.commandId, state }); }
        proof = dd.signStoreResult(f.tenantId, a);
      }, () => proof);
      // The identical result must remain an audited no-op, in its own statement.
      const current = await f.read();
      await withTenant(db.runtime, testTenantContext(f.tenantId), tx => tx.$client.query(
        "SELECT app.replace_fee_reservation_book($1,$2::jsonb,$3::jsonb)",
        [f.tenantId, JSON.stringify({ version: "fee-reservation-book.v1", ...current }), JSON.stringify(proof)]));
      expect(await f.read()).toEqual(current);
      if (paymentState === "submitted") { submitted = current; captured = proof; }
      if (paymentState === "confirmed") {
        const backwards = structuredClone(current);
        backwards.attempts[0] = submitted!.attempts[0]!;
        // Preserve today's audit prefix: refusal must be the payment-order check.
        await expect(withTenant(db.runtime, testTenantContext(f.tenantId), tx => tx.$client.query(
          "SELECT app.replace_fee_reservation_book($1,$2::jsonb,$3::jsonb)",
          [f.tenantId, JSON.stringify({ version: "fee-reservation-book.v1", ...backwards }), JSON.stringify(captured)])))
          .rejects.toMatchObject({ code: "23514" });
        expect(await f.read()).toEqual(current);
        let freshProof: ReturnType<typeof dd.signStoreResult> | undefined;
        await expect(f.store().transaction(f.tenantId, async book => {
          book.attempts[0]!.paymentState = "pending_submission";
          freshProof = dd.signStoreResult(f.tenantId, book.attempts[0]!);
        }, () => freshProof)).rejects.toMatchObject({ name: "FeeCollectionError", code: "COLLECTION_REFUSED" });
        expect(await f.read()).toEqual(current);
        let failureProof: ReturnType<typeof dd.signStoreResult> | undefined;
        await expect(f.store().transaction(f.tenantId, async book => {
          const a = book.attempts[0]!;
          a.paymentState = "failed"; a.state = "released";
          book.audit.push({ commandId: a.commandId, state: "released" });
          failureProof = dd.signStoreResult(f.tenantId, a);
        }, () => failureProof)).rejects.toMatchObject({ name: "FeeCollectionError", code: "COLLECTION_REFUSED" });
        expect(await f.read()).toEqual(current);
      }
    }
    const before = await f.read();
    let proof: ReturnType<typeof dd.signStoreResult> | undefined;
    await expect(f.store().transaction(f.tenantId, async book => {
      const a = book.attempts[0]!;
      a.paymentState = "failed"; a.state = "released";
      book.audit.push({ commandId: a.commandId, state: "released" });
      proof = dd.signStoreResult(f.tenantId, a);
    }, () => proof)).rejects.toMatchObject({ name: "FeeCollectionError", code: "COLLECTION_REFUSED" });
    expect(await f.read()).toEqual(before);
  });

  it("refuses unsigned event-key preseeding without rows or audit, then processes the real webhook", async () => {
    const f = await setup();
    await f.executor().reserve(f.context, f.intent);
    await f.executor().execute(f.context, id(10));
    const before = await f.read();
    const auditBefore = (await db.admin.query("SELECT * FROM app.audit_event WHERE tenant_id=$1 ORDER BY sequence", [f.tenantId])).rows;
    const forged = { version: "fee-reservation-book.v1", ...before,
      events: { ...before.events, [`stripe_card:${id(81)}`]: "a".repeat(64) } };
    await expect(withTenant(db.runtime, testTenantContext(f.tenantId), tx => tx.$client.query(
      "SELECT app.replace_fee_reservation_book($1,$2::jsonb)", [f.tenantId, JSON.stringify(forged)])))
      .rejects.toMatchObject({ code: "23514" });
    expect(await f.read()).toEqual(before);
    expect((await db.admin.query("SELECT * FROM app.fee_reservation_archive WHERE tenant_id=$1 AND kind='event'", [f.tenantId])).rows).toEqual([]);
    expect((await db.admin.query("SELECT * FROM app.audit_event WHERE tenant_id=$1 ORDER BY sequence", [f.tenantId])).rows).toEqual(auditBefore);
    const body = JSON.stringify({ version: "fake-stripe-event.v1", environment: "synthetic_demo", account: "fake_jobguard_card",
      tenantId: f.tenantId, eventId: id(81), commandId: id(10), objectId: f.rail.objectId(f.tenantId, id(10)),
      amountPence: 600, kind: "collection", state: "settled" });
    await f.executor().webhook(f.context, "stripe_card", body, f.rail.sign(body));
    expect((await f.read()).attempts[0]!.state).toBe("settled");
    const recorded = (await db.admin.query("SELECT * FROM app.audit_event WHERE tenant_id=$1 AND event_type='fee.collection.webhook_recorded'", [f.tenantId])).rows;
    expect(recorded).toHaveLength(1);
    await f.executor().webhook(f.context, "stripe_card", body, f.rail.sign(body));
    expect((await db.admin.query("SELECT * FROM app.audit_event WHERE tenant_id=$1 AND event_type='fee.collection.webhook_recorded'", [f.tenantId])).rows).toEqual(recorded);
  });

  it("reports a database refusal as typed and commits the next item in a signed batch", async () => {
    const f = await setup();
    await f.executor().reserve(f.context, { ...f.intent, rail: "direct_debit" });
    await f.store().transaction(f.tenantId, async book => {
      book.attempts[0]!.state = "outcome_unknown";
      book.audit.push({ commandId: id(10), state: "outcome_unknown" });
    });
    const dd = new FakeGoCardlessRail("fake-dd-test-signing-secret");
    // Reuse the real verifier and signer; make the first signed result stale.
    const sign = dd.signStoreResult.bind(dd);
    let first = true;
    dd.signStoreResult = (tenantId, attempt) => {
      if (!first) return sign(tenantId, attempt);
      first = false;
      return sign(tenantId, { ...attempt, amountPence: 1 });
    };
    // verifyWebhookBatch validates the object's known fake submission identity.
    const mandateId = id(82);
    dd.setup({ version: "fake-dd-setup.v1", environment: "synthetic_demo", tenantId: f.tenantId,
      commandId: id(83), mandateId, approvedDecisionId: id(84), noticeApproved: true, providerDefaultsDisabled: true });
    const mandateBody = JSON.stringify({ events: [{ version: "fake-dd-mandate-event.v1", environment: "synthetic_demo",
      account: "fake_jobguard_dd", tenantId: f.tenantId, mandateId, eventId: id(85), state: "active" }] });
    dd.ingestMandates(mandateBody, dd.sign(mandateBody));
    await dd.submit(f.tenantId, (await f.read()).attempts[0]!);
    const event = (eventId: string, state: string) => ({ version: "fake-dd-event.v1", environment: "synthetic_demo",
      account: "fake_jobguard_dd", tenantId: f.tenantId, eventId, commandId: id(10), objectId: dd.objectId(f.tenantId, id(10)),
      amountPence: 600, kind: "collection", state });
    const executor = new DarkFeeCollectionExecutor(f.store(), [dd]);
    const body = JSON.stringify({ events: [event(id(86), "submitted"), event(id(87), "confirmed")] });
    expect(await executor.directDebitWebhook(f.context, body, dd.sign(body)))
      .toEqual([{ code: "COLLECTION_REFUSED" }, { code: "processed" }]);
    const after = await f.read();
    expect(after.attempts[0]).toMatchObject({ paymentState: "confirmed", state: "outcome_unknown" });
    expect(after.events[`direct_debit:${id(86)}`]).toBeUndefined();
    expect(after.events[`direct_debit:${id(87)}`]).toBeDefined();
    const failure = JSON.stringify({ events: [event(id(88), "failed")] });
    expect(await executor.directDebitWebhook(f.context, failure, dd.sign(failure))).toEqual([{ code: "processed" }]);
    expect((await f.read()).attempts[0]).toMatchObject({ paymentState: "failed", state: "reconciliation_required" });
  });

  it("reports malformed signed JSON as typed without writes and commits the next item in the batch", async () => {
    const f = await setup();
    await f.executor().reserve(f.context, { ...f.intent, rail: "direct_debit" });
    await f.store().transaction(f.tenantId, async book => {
      book.attempts[0]!.state = "outcome_unknown";
      book.audit.push({ commandId: id(10), state: "outcome_unknown" });
    });
    const dd = new FakeGoCardlessRail("fake-dd-test-signing-secret");
    const before = await f.read();
    const beforeAudit = (await db.admin.query("SELECT * FROM app.audit_event WHERE tenant_id=$1 ORDER BY sequence", [f.tenantId])).rows;
    // Keep batch verification real; only the first store result has a malformed body.
    const sign = dd.signStoreResult.bind(dd);
    let first = true;
    dd.signStoreResult = (tenantId, attempt) => {
      if (!first) return sign(tenantId, attempt);
      first = false;
      const body = '{"version":';
      return { body, signature: createHmac("sha256", "fake-dd-test-signing-secret").update(body).digest("hex") };
    };
    // verifyWebhookBatch validates the object's known fake submission identity.
    const mandateId = id(82);
    dd.setup({ version: "fake-dd-setup.v1", environment: "synthetic_demo", tenantId: f.tenantId,
      commandId: id(83), mandateId, approvedDecisionId: id(84), noticeApproved: true, providerDefaultsDisabled: true });
    const mandateBody = JSON.stringify({ events: [{ version: "fake-dd-mandate-event.v1", environment: "synthetic_demo",
      account: "fake_jobguard_dd", tenantId: f.tenantId, mandateId, eventId: id(85), state: "active" }] });
    dd.ingestMandates(mandateBody, dd.sign(mandateBody));
    await dd.submit(f.tenantId, (await f.read()).attempts[0]!);
    const event = (eventId: string, state: string) => ({ version: "fake-dd-event.v1", environment: "synthetic_demo",
      account: "fake_jobguard_dd", tenantId: f.tenantId, eventId, commandId: id(10), objectId: dd.objectId(f.tenantId, id(10)),
      amountPence: 600, kind: "collection", state });
    const executor = new DarkFeeCollectionExecutor(f.store(), [dd]);
    const body = JSON.stringify({ events: [event(id(86), "submitted"), event(id(87), "confirmed")] });
    expect(await executor.directDebitWebhook(f.context, body, dd.sign(body)))
      .toEqual([{ code: "COLLECTION_REFUSED" }, { code: "processed" }]);
    const after = await f.read();
    expect(after.attempts[0]).toMatchObject({ paymentState: "confirmed", state: "outcome_unknown" });
    expect(after.events[`direct_debit:${id(86)}`]).toBeUndefined();
    expect(after.events[`direct_debit:${id(87)}`]).toBeDefined();
    expect(after.audit).toEqual(before.audit);
    const books = (await db.admin.query("SELECT book FROM app.fee_reservation_book WHERE tenant_id=$1", [f.tenantId])).rows;
    expect(books).toHaveLength(1);
    expect(books[0]!.book.attempts).toEqual(after.attempts);
    const recorded = (await db.admin.query("SELECT * FROM app.audit_event WHERE tenant_id=$1 ORDER BY sequence", [f.tenantId])).rows;
    expect(recorded.slice(0, beforeAudit.length)).toEqual(beforeAudit);
    // Only the confirmed lifecycle and its webhook receipt were appended.
    expect(recorded.slice(beforeAudit.length).map(row => row.event_type)).toEqual([
      "fee.collection.lifecycle", "fee.collection.webhook_recorded",
    ]);
    expect(recorded[beforeAudit.length]!.payload.references.paymentState).toBe("confirmed");
  });

});
