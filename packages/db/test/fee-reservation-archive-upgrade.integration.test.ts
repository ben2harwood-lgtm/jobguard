import { randomUUID } from "node:crypto";
import { appendAuditBatch } from "../src/audit.js";
import { withTenant } from "../src/tenant-context.js";
import { describe, expect, it } from "vitest";
import { PostgresReservationStore } from "../../../apps/api/src/fee-collection/postgres-reservation-store.js";
import { ctx, fixture, id } from "../../../apps/api/src/fee-collection/test-fixture.js";
import { startBeforeMigration, applyMigration } from "./contractor-practice-session-fixtures.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { migrate } from "../src/migrate.js";

const own = "0499_fee_reservation_archive.sql";
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
      const store = new PostgresReservationStore(db.runtime, async () => testTenantContext(ctx.tenantId), () => ({
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
      expect(before.policy).toHaveLength(1);
      for (let i = 0; i < 2; i++) {
        await migrate(db.admin);
        expect(await read()).toEqual({ version: "fee-reservation-book.v1", ...f.book() });
        expect(await catalogue()).toEqual(before);
        expect((await db.admin.query("SELECT kind,key,payload FROM app.fee_reservation_archive WHERE tenant_id=$1 ORDER BY kind,key", [ctx.tenantId])).rows).toEqual(history);
      }
    } finally { await db.close(); }
  }, 120_000);
});
