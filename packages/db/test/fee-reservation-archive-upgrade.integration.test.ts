import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { appendAuditBatch } from "../src/audit.js";
import { withTenant } from "../src/tenant-context.js";
import { describe, expect, it } from "vitest";
import { PostgresReservationStore } from "../../../apps/api/src/fee-collection/postgres-reservation-store.js";
import { ctx, fixture, id } from "../../../apps/api/src/fee-collection/test-fixture.js";
import { startBeforeMigration, applyMigration } from "./contractor-practice-session-fixtures.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { migrate } from "../src/migrate.js";

const own = "0604_fee_reservation_archive.sql";
describe("M4-12 reservation archive populated upgrade", () => {
  it("preserves the predecessor book, compacts without losing history and retains grants/RLS on replay", async () => {
    const db = await startBeforeMigration(own);
    try {
      const f = fixture();
      await f.executor.reserve(ctx, f.intent);
      f.rail.definiteFailure = true;
      await f.executor.execute(ctx, id(10));
      const legacy = { version: "fee-reservation-book.v1", ...f.book() };
      await db.admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [ctx.tenantId]);
      await db.admin.query("INSERT INTO app.fee_reservation_book VALUES($1,$2)", [ctx.tenantId, JSON.stringify(legacy)]);
      await withTenant(db.runtime, testTenantContext(ctx.tenantId), tx => appendAuditBatch(tx, f.book().audit.map(entry => ({
        id: randomUUID(), version: "audit.v1" as const, actorRef: id(2), eventType: `fee.collection.${entry.state}`,
        subjectType: "fee_collection_attempt", subjectRef: entry.commandId, payload: { classifications: { action: "financial" as const } },
      }))));
      const chain = (await db.admin.query("SELECT * FROM app.audit_event WHERE tenant_id=$1 ORDER BY sequence", [ctx.tenantId])).rows;
      expect(chain).toHaveLength(3);
      await applyMigration(db, own);
      expect((await db.admin.query("SELECT book FROM app.fee_reservation_book WHERE tenant_id=$1", [ctx.tenantId])).rows[0]?.book).toEqual(legacy);
      await migrate(db.admin);
      await migrate(db.admin);
      const store = new PostgresReservationStore(db.runtime, testTenantContext(ctx.tenantId), () => ({
        collection: async () => f.source, credit: async () => f.credit,
      }));
      const read = () => store.transaction(ctx.tenantId, async book => structuredClone(book));
      expect(await read()).toEqual({ version: "fee-reservation-book.v1", ...f.book() });
      expect((await db.admin.query("SELECT book FROM app.fee_reservation_book WHERE tenant_id=$1", [ctx.tenantId])).rows[0]?.book).toEqual({ version: "fee-reservation-book.v1", attempts: [], events: {}, audit: [] });
      const history = (await db.admin.query("SELECT kind,key,payload FROM app.fee_reservation_archive WHERE tenant_id=$1 ORDER BY kind,key", [ctx.tenantId])).rows;
      expect(history.filter(r => r.kind === "attempt")).toHaveLength(1);
      expect(history.filter(r => r.kind === "audit")).toHaveLength(3);
      // Old audit was already committed by the predecessor: compaction must not append it again.
      expect((await db.admin.query("SELECT * FROM app.audit_event WHERE tenant_id=$1 ORDER BY sequence", [ctx.tenantId])).rows).toEqual(chain);
      const catalogue = async () => ({
        relation: (await db.admin.query(`SELECT c.relacl,c.relrowsecurity,c.relforcerowsecurity,r.rolname owner
          FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner WHERE c.oid='app.fee_reservation_archive'::regclass`)).rows,
        policy: (await db.admin.query("SELECT * FROM pg_policies WHERE schemaname='app' AND tablename='fee_reservation_archive'")).rows,
      });
      const before = await catalogue();
      expect(before.relation[0]).toMatchObject({ owner: "jobguard_migration", relrowsecurity: true, relforcerowsecurity: true });
      expect(before.policy).toHaveLength(3);
      expect(before.policy).toEqual(expect.arrayContaining([
        expect.objectContaining({ policyname: "migration_tenant_select", roles: "{jobguard_migration}", cmd: "SELECT", with_check: null }),
        expect.objectContaining({ policyname: "tenant_isolation", roles: "{jobguard_runtime}", cmd: "ALL" }),
      ]));
      for (let i = 0; i < 2; i++) {
        await migrate(db.admin);
        expect(await read()).toEqual({ version: "fee-reservation-book.v1", ...f.book() });
        expect(await catalogue()).toEqual(before);
        expect((await db.admin.query("SELECT kind,key,payload FROM app.fee_reservation_archive WHERE tenant_id=$1 ORDER BY kind,key", [ctx.tenantId])).rows).toEqual(history);
      }
    } finally { await db.close(); }
  }, 120_000);
});


describe("FEE-STORE-UPDATE-GRANT populated upgrade", () => {
  it("preserves populated unknown history, changes real rows through the owner routine and replays safely", async () => {
    const migration = "0608_fee_reservation_book_guard.sql";
    const db = await startBeforeMigration(migration);
    try {
      const f = fixture();
      await f.executor.reserve(ctx, f.intent);
      f.rail.crashAfterAcceptance = true;
      await expect(f.executor.execute(ctx, id(10))).rejects.toThrow("FAKE_CRASH_AFTER_ACCEPTANCE");
      const legacy = { version: "fee-reservation-book.v1", ...f.book() };
      await db.admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [ctx.tenantId]);
      await db.admin.query("INSERT INTO app.fee_reservation_book VALUES($1,$2)", [ctx.tenantId, JSON.stringify(legacy)]);
      await applyMigration(db, migration);
      const raw = async () => (await db.admin.query("SELECT book FROM app.fee_reservation_book WHERE tenant_id=$1", [ctx.tenantId])).rows[0]?.book;
      expect(await raw()).toEqual(legacy);
      await migrate(db.admin);
      const store = new PostgresReservationStore(db.runtime, testTenantContext(ctx.tenantId), () => ({
        collection: async () => f.source, credit: async () => f.credit,
      }));
      expect(await store.transaction(ctx.tenantId, async book => book)).toEqual(legacy);
      // This catches a SECURITY DEFINER owner silently seeing zero rows under FORCE RLS.
      expect(await raw()).toEqual({ ...legacy, audit: [] });
      await expect(withTenant(db.runtime, testTenantContext(ctx.tenantId), tx => tx.$client.query(
        "UPDATE app.fee_reservation_book SET book=book WHERE tenant_id=$1", [ctx.tenantId])))
        .rejects.toMatchObject({ code: "42501" });
      await migrate(db.admin);
      expect(await store.transaction(ctx.tenantId, async book => book)).toEqual(legacy);
      expect(await raw()).toEqual({ ...legacy, audit: [] });
    } finally { await db.close(); }
  }, 120_000);
});

describe("FEE-STORE-AUTHORITY populated forward upgrade", () => {
  it("preserves unknown reservations, released archives and existing audit while withdrawing raw archive writes", async () => {
    const migration = "1065_fee_store_authority.sql";
    const db = await startBeforeMigration(migration);
    try {
      const f = fixture();
      await f.executor.reserve(ctx, f.intent);
      f.rail.crashAfterAcceptance = true;
      await expect(f.executor.execute(ctx, id(10))).rejects.toThrow("FAKE_CRASH_AFTER_ACCEPTANCE");
      const legacy = { version: "fee-reservation-book.v1", ...f.book() };
      await db.admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [ctx.tenantId]);
      await db.admin.query("INSERT INTO app.fee_reservation_book VALUES($1,$2)", [ctx.tenantId, JSON.stringify(legacy)]);
      await withTenant(db.runtime, testTenantContext(ctx.tenantId), tx => appendAuditBatch(tx, legacy.audit.map(entry => ({
        id: randomUUID(), version: "audit.v1" as const, actorRef: id(2), eventType: `fee.collection.${entry.state}`,
        subjectType: "fee_collection_attempt", subjectRef: entry.commandId, payload: { classifications: { action: "financial" as const } },
      }))));
      const chain = (await db.admin.query("SELECT * FROM app.audit_event WHERE tenant_id=$1 ORDER BY sequence", [ctx.tenantId])).rows;
      // A separate historical release is already compacted, including absolute audit ordinals.
      const released = { ...legacy.attempts[0], commandId: id(99), state: "released" };
      await db.admin.query("INSERT INTO app.fee_reservation_archive VALUES($1,'attempt',$2,$3)",
        [ctx.tenantId, `${id(99)}:0`, JSON.stringify(released)]);
      const beforeArchive = (await db.admin.query("SELECT * FROM app.fee_reservation_archive WHERE tenant_id=$1 ORDER BY kind,key", [ctx.tenantId])).rows;
      const catalogue = async () => (await db.admin.query(`SELECT p.oid, p.oid::regprocedure::text identity,
        pg_get_functiondef(p.oid) definition, p.proowner,p.proacl,p.prosecdef,p.proconfig
        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname IN ('app','identity','control_plane','audit_control') AND p.prokind='f' ORDER BY p.oid`)).rows;
      const routines = await catalogue();
      await applyMigration(db, migration);
      expect((await db.admin.query("SELECT book FROM app.fee_reservation_book WHERE tenant_id=$1", [ctx.tenantId])).rows[0]?.book).toEqual(legacy);
      expect((await db.admin.query("SELECT * FROM app.fee_reservation_archive WHERE tenant_id=$1 ORDER BY kind,key", [ctx.tenantId])).rows).toEqual(beforeArchive);
      expect((await db.admin.query("SELECT * FROM app.audit_event WHERE tenant_id=$1 ORDER BY sequence", [ctx.tenantId])).rows).toEqual(chain);
      const live = await catalogue();
      const sql = await readFile(new URL("../migrations/1065_fee_store_authority.sql", import.meta.url), "utf8");
      const wrapperBody = sql.split("CREATE OR REPLACE FUNCTION app.replace_fee_reservation_book")[1]!.split("AS $$")[1]!.split("$$;")[0];
      for (const prior of routines) {
        const current = live.find(row => row.oid === prior.oid);
        if (prior.identity === "app.replace_fee_reservation_book(uuid,jsonb)") {
          // Named 1065 successor: only this exact predecessor body becomes a proof-free wrapper.
          expect(current).toEqual({ ...prior, definition: current.definition });
          expect(current.definition.split("$function$")[1]).toEqual(wrapperBody);
        } else expect(current).toEqual(prior);
      }
      const guardedBody = sql.split("CREATE FUNCTION app.replace_fee_reservation_book")[1]!.split("AS $$")[1]!.split("$$;")[0];
      expect(live.find(row => row.identity === "app.replace_fee_reservation_book(uuid,jsonb,jsonb)")?.definition.split("$function$")[1]).toEqual(guardedBody);
      const store = new PostgresReservationStore(db.runtime, testTenantContext(ctx.tenantId), () => ({ collection: async () => f.source, credit: async () => f.credit }));
      const read = () => store.transaction(ctx.tenantId, async book => structuredClone(book));
      const restored = await read();
      expect(restored.attempts).toEqual(expect.arrayContaining([released, ...legacy.attempts]));
      expect(restored.audit).toEqual(legacy.audit);
      await expect(withTenant(db.runtime, testTenantContext(ctx.tenantId), tx => tx.$client.query(
        "INSERT INTO app.fee_reservation_archive VALUES($1,'audit','999','null')", [ctx.tenantId])))
        .rejects.toMatchObject({ code: "42501" });
      const forged = structuredClone(restored);
      forged.attempts.find(a => a.commandId === id(10))!.state = "released";
      forged.audit.push({ commandId: id(10), state: "released" });
      await expect(withTenant(db.runtime, testTenantContext(ctx.tenantId), tx => tx.$client.query(
        "SELECT app.replace_fee_reservation_book($1,$2::jsonb)", [ctx.tenantId, JSON.stringify(forged)])))
        .rejects.toMatchObject({ code: "23514" });
      const archive = (await db.admin.query("SELECT * FROM app.fee_reservation_archive WHERE tenant_id=$1 ORDER BY kind,key", [ctx.tenantId])).rows;
      for (let i=0;i<2;i++) {
        await migrate(db.admin);
        expect(await read()).toEqual(restored);
        expect((await db.admin.query("SELECT * FROM app.fee_reservation_archive WHERE tenant_id=$1 ORDER BY kind,key", [ctx.tenantId])).rows).toEqual(archive);
        expect((await db.admin.query("SELECT * FROM app.audit_event WHERE tenant_id=$1 ORDER BY sequence", [ctx.tenantId])).rows).toEqual(chain);
      }
    } finally { await db.close(); }
  }, 120_000);
});
