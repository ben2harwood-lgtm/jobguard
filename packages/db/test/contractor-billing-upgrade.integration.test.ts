import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MIGRATION_URLS, migrate } from "../src/migrate.js";
import { seedEvidencePackFixture } from "./evidence-pack-fixture.js";
import { closeWorkFixture, createWorkFixture, type WorkFixture } from "./job-work-state-fixtures.js";
import { installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
import { proofBefore, proofColumns, proofDifferences, rolledBack, scratchReplaceFunction } from "./upgrade-proof-utils.js";

/* An upgrade proof proves ITS OWN migration only: install everything before N, snapshot, apply N alone, compare; then apply everything after N and require success twice. Compare existing rows by named pre-existing columns after all migrations. Never assert that later migrations add no column or replace no function; the fingerprinted-table guard owns 'may never gain a column'. */
// PostgreSQL execution is reserved for the dispatcher/CI; this sandbox cannot start PostgreSQL.
const name = (url: URL) => url.pathname.split("/").at(-1)!;
const compared = ["app.job", "app.quote_document_version", "app.quote_acceptance", "app.evidence_upload", "app.evidence_object", "app.variation", "app.variation_revision", "app.variation_approval", "app.material_rate_revision", "app.supplier_document", "app.supplier_document_version", "app.customer_invoice", "app.recovery_claim_revision", "app.command_receipt", "app.audit_event"];

describe("ENT-6B billing own-step upgrade", () => {
  let f: WorkFixture;
  beforeAll(async () => { f = await createWorkFixture(false); }, 60_000);
  afterAll(async () => { await closeWorkFixture(f); });

  it("E6-29 ENT6B-UPGRADE-1 preserves populated named columns, full types and row identities at its own step and after later migrations twice", async () => {
    const own = MIGRATION_URLS.findIndex(url => /\d+_contractor_billing\.sql$/.test(name(url)));
    expect(own, "the discovered migration registry contains the billing migration").toBeGreaterThan(0);
    await f.admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
    for (const url of MIGRATION_URLS.slice(0, own)) {
      const sql = await readFile(url, "utf8");
      await f.admin.query(name(url) === "0095_job_parties.sql" ? sql.replace("BEGIN;", "BEGIN; SELECT set_config('app.deployment_mode','details_needed',true);") : sql);
      await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [name(url)]);
    }
    await installLegacySyntheticPartyFixtures(f.admin);
    const seeded = await seedEvidencePackFixture(f.admin, { withVariation: true });
    await f.admin.query("SELECT set_config('app.tenant_id',$1,false)", [seeded.tenantId]);
    await f.admin.query("SELECT app.accept_final_check_terms($1,$2,$3,$4)", [seeded.tenantId, seeded.memberId, randomUUID(), "synthetic_final_check_terms.v1"]);
    const before = await proofBefore(f.admin, compared);
    for (const [table, snapshot] of Object.entries(before)) expect(Object.keys(snapshot.rows).length, `${table}: at least one pre-existing row`).toBeGreaterThan(0);
    const allTables = (await f.admin.query("SELECT n.nspname||'.'||c.relname name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND n.nspname IN ('app','identity','control_plane','infrastructure','audit_control') ORDER BY 1")).rows.map(row => row.name as string);
    const columnsBefore = Object.fromEntries(await Promise.all(allTables.map(async table => [table, await proofColumns(f.admin, table)])));
    const relations = async () => (await f.admin.query("SELECT c.oid::text,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner) owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('app','identity','control_plane','infrastructure','audit_control') ORDER BY c.oid")).rows;
    const routines = async () => (await f.admin.query("SELECT p.oid::text,p.proacl::text,pg_get_userbyid(p.proowner) owner,pg_get_functiondef(p.oid) definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('app','identity','control_plane','infrastructure','audit_control') AND p.prokind IN ('f','p') ORDER BY p.oid")).rows;
    const oldRelations = await relations(), oldRoutines = await routines();
    await f.admin.query(await readFile(MIGRATION_URLS[own]!, "utf8"));
    await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [name(MIGRATION_URLS[own]!)]);
    expect(await proofDifferences(f.admin, before)).toEqual({ rows: [], types: [] });
    for (const table of allTables) expect(await proofColumns(f.admin, table), `${table}: own migration adds no existing column`).toEqual(columnsBefore[table]);
    expect((await relations()).filter(row => oldRelations.some(old => old.oid === row.oid))).toEqual(oldRelations);
    expect((await routines()).filter(row => oldRoutines.some(old => old.oid === row.oid))).toEqual(oldRoutines);
    await migrate(f.admin); await migrate(f.admin);
    expect(await proofDifferences(f.admin, before)).toEqual({ rows: [], types: [] });
    for (const [table, columns] of Object.entries(columnsBefore)) {
      const after = await proofColumns(f.admin, table);
      for (const column of columns) expect(after.find(current => current.name === column.name), `${table}.${column.name}: original full type`).toEqual(column);
    }
    expect((await f.admin.query("SELECT migration_name FROM public.jobguard_schema_migration ORDER BY migration_name")).rows.map(row => row.migration_name)).toEqual(MIGRATION_URLS.map(name).sort());

    await rolledBack(f.admin, async db => {
      await db.query("SET LOCAL session_replication_role='replica'");
      await db.query("UPDATE app.evidence_object SET server_received_at=server_received_at+interval '1 microsecond' WHERE id=$1", [seeded.proofId]);
      expect((await proofDifferences(db, before)).rows.some(row => row.startsWith("app.evidence_object"))).toBe(true);
    });
    await rolledBack(f.admin, async db => {
      await db.query("ALTER TABLE app.job ALTER COLUMN title TYPE text");
      expect((await proofDifferences(db, before)).types.some(row => row.startsWith("app.job: title"))).toBe(true);
    });
    await rolledBack(f.admin, async db => {
      await db.query("ALTER TABLE app.job ADD COLUMN ent6b_later_nullable text");
      expect(await scratchReplaceFunction(db, "app.sor_line_net_pence(text,bigint,bigint,bigint)")).toBe(true);
      expect(await proofDifferences(db, before)).toEqual({ rows: [], types: [] });
      await db.query("INSERT INTO app.job(id,tenant_id,title) VALUES($1,$2,'Fictional later row')", [randomUUID(), seeded.tenantId]);
      expect(await proofDifferences(db, before)).toEqual({ rows: [], types: [] });
    });
    expect(await proofDifferences(f.admin, before)).toEqual({ rows: [], types: [] });
  }, 300_000);

  it("E6-29 ENT6B-UPGRADE-2 fresh install and repeat migrate succeed without legacy business rows", async () => {
    const fresh = await createWorkFixture(false);
    try {
      await migrate(fresh.admin); await migrate(fresh.admin);
      expect((await fresh.admin.query("SELECT to_regclass('app.billing_export_batch')::text name")).rows[0]!.name).toBe("app.billing_export_batch");
    } finally { await closeWorkFixture(fresh); }
  }, 300_000);
});
