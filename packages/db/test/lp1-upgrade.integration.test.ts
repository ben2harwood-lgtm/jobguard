import { randomUUID } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MIGRATION_URLS, migrate } from "../src/migrate.js";
import { closeTestPools, freePort } from "./pool-test-utils.js";
import { appendAuditBatch } from "../src/audit.js";
import { withTenant } from "../src/tenant-context.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
import { seedEvidencePackFixture } from "./evidence-pack-fixture.js";
import { loadEvidencePackSources } from "../src/evidence-pack-sources.js";
import { buildEvidenceManifest, canonicalManifest, manifestDigest, renderStandalonePack, sha256, verifyStandalonePack } from "@jobguard/core";

type Column = { name: string; type: string };
type TableSnapshot = { columns: Column[]; primaryKey: string[]; rows: Array<{ identity: string; bytes: string }> };
type Snapshot = Record<string, TableSnapshot>;

describe("LP-1 comparator fixtures (no PostgreSQL claim)", () => {
  const base: Snapshot = { scratch: { columns: [{ name: "id", type: "integer" }, { name: "at", type: "timestamp with time zone" }],
    primaryKey: ["id"], rows: [{ identity: '{"id":1}', bytes: '{"id":1,"at":"2026-10-13T00:00:00.000001+00:00"}' }] } };
  it("[LP1-12] comparator fixtures detect precise value and type changes and allow later additions", () => {
    expect(compareSnapshots(base, structuredClone(base))).toEqual([]);
    const time = structuredClone(base); time.scratch!.rows[0]!.bytes = time.scratch!.rows[0]!.bytes.replace("000001", "000002");
    expect(compareSnapshots(base, time)).toEqual(["scratch: changed row {\"id\":1}"]);
    const type = structuredClone(base); type.scratch!.columns[0]!.type = "bigint";
    expect(compareSnapshots(base, type)).toEqual(["scratch.id: integer -> bigint"]);
    const later = structuredClone(base); later.scratch!.columns.push({ name: "later", type: "text" });
    later.scratch!.rows.push({ identity: '{"id":2}', bytes: '{"id":2,"at":null}' });
    expect(compareSnapshots(base, later)).toEqual([]);
    const gone = structuredClone(base); gone.scratch!.rows = [];
    expect(compareSnapshots(base, gone)).toEqual(["scratch: missing row {\"id\":1}"]);
    const empty = structuredClone(base); empty.scratch!.rows = [];
    expect(() => compareSnapshots(empty, empty)).toThrow("scratch: no pre-existing row");
  });
});

function compareSnapshots(before: Snapshot, after: Snapshot): string[] {
  const differences: string[] = [];
  for (const [table, was] of Object.entries(before)) {
    if (!was.rows.length) throw new Error(`${table}: no pre-existing row`);
    const now = after[table], types = new Map(now?.columns.map(column => [column.name, column.type]));
    for (const column of was.columns) {
      if (types.get(column.name) !== column.type) differences.push(`${table}.${column.name}: ${column.type} -> ${types.get(column.name) ?? "(gone)"}`);
    }
    const rows = new Map(now?.rows.map(row => [row.identity, row.bytes]));
    for (const row of was.rows) {
      if (!rows.has(row.identity)) differences.push(`${table}: missing row ${row.identity}`);
      else if (rows.get(row.identity) !== row.bytes) differences.push(`${table}: changed row ${row.identity}`);
    }
  }
  return differences;
}
const ident = (name: string) => `"${name.replaceAll('"', '""')}"`;
const relation = (name: string) => name.split(".").map(ident).join(".");
async function snapshot(db: Pool | PoolClient, tables: string[], before?: Snapshot): Promise<Snapshot> {
  const result: Snapshot = {};
  for (const table of tables) {
    const columns = (await db.query(`SELECT attname::text AS name,format_type(atttypid,atttypmod) AS type
      FROM pg_attribute WHERE attrelid=$1::regclass AND attnum>0 AND NOT attisdropped ORDER BY attnum`, [table])).rows as Column[];
    const primaryKey = before?.[table]?.primaryKey ?? (await db.query(`SELECT a.attname::text AS name FROM pg_index i
      JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=ANY(i.indkey)
      WHERE i.indrelid=$1::regclass AND i.indisprimary ORDER BY array_position(i.indkey::int2[],a.attnum)`, [table])).rows.map(row => row.name as string);
    if (!primaryKey.length) throw new Error(`${table}: no primary key`);
    const names = (before?.[table]?.columns ?? columns).map(column => column.name);
    const rows = names.every(name => columns.some(column => column.name === name)) ? (await db.query(`SELECT * FROM (SELECT
      (SELECT row_to_json(k)::text FROM (SELECT ${primaryKey.map(name => `t.${ident(name)}`).join(",")}) k) AS identity,
      row_to_json(t)::text AS bytes FROM (SELECT ${names.map(ident).join(",")} FROM ${relation(table)}) t) snapshot_rows
      ORDER BY snapshot_rows.identity COLLATE "C"`)).rows as TableSnapshot["rows"] : [];
    result[table] = { columns, primaryKey, rows };
  }
  return result;
}

async function unrelatedSecurity(db: Pool) {
  // Compared at N's own step only. No later-function/whole-row freeze.
  const queries = {
    relations: `SELECT n.nspname,c.relname,c.relowner::regrole::text,c.relrowsecurity,c.relforcerowsecurity,
      CASE WHEN c.oid IN('app.account'::regclass,'app.membership'::regclass) THEN NULL ELSE c.relacl::text END AS acl
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('app','identity','control_plane','audit_control','infrastructure') ORDER BY 1,2`,
    policies: "SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies ORDER BY 1,2,3",
    routines: `SELECT p.oid::regprocedure::text,pg_get_functiondef(p.oid),p.proowner::regrole::text,p.proacl::text
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname IN('app','identity','control_plane','audit_control','infrastructure') AND p.prokind='f'
      AND p.oid::regprocedure::text<>'app.lp1_reject_lock_column_update()' ORDER BY 1`,
    triggers: `SELECT tgrelid::regclass::text,tgname,pg_get_triggerdef(oid) FROM pg_trigger WHERE NOT tgisinternal
      AND tgname NOT IN('lp1_account_lock_column_immutable','lp1_membership_lock_column_immutable') ORDER BY 1,2`,
    roles: "SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolbypassrls FROM pg_roles ORDER BY rolname",
    memberships: "SELECT roleid::regrole::text,member::regrole::text,admin_option,inherit_option,set_option FROM pg_auth_members ORDER BY 1,2",
  };
  return Object.fromEntries(await Promise.all(Object.entries(queries).map(async ([name, sql]) => [name, (await db.query(sql)).rows])));
}

describe("LP-1 PostgreSQL upgrade", () => {
  let postgres: EmbeddedPostgres, owner: Pool;
  const phrase = randomUUID();
  beforeAll(async () => {
    const directory = await mkdtemp(join(tmpdir(), "jg-lp1-upgrade-")), port = await freePort(62700, 100);
    postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password: phrase, persistent: false,
      createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
    await postgres.initialise(); await postgres.start();
    owner = new Pool({ host: "127.0.0.1", port, database: "postgres", user: "postgres", password: phrase });
  }, 60_000);
  afterAll(async () => { await closeTestPools(owner); await postgres?.stop(); });

  it("[LP1-12] the upgrade comparator detects corruption without freezing later migrations", async () => {
    const db = await owner.connect();
    try {
      await db.query("BEGIN");
      await db.query("CREATE TABLE public.lp1_compare(id integer PRIMARY KEY,at timestamptz NOT NULL)");
      await db.query("INSERT INTO public.lp1_compare VALUES(1,'2026-10-13T00:00:00.000001Z')");
      await db.query("CREATE FUNCTION public.lp1_compare_function() RETURNS integer LANGUAGE sql AS 'SELECT 1'");
      const tables = ["public.lp1_compare"], before = await snapshot(db, tables);
      const changes = async () => compareSnapshots(before, await snapshot(db, tables, before));
      expect(await changes()).toEqual([]);
      for (const [sql, expected] of [
        ["UPDATE public.lp1_compare SET at=at+interval '1 microsecond'", "changed row"],
        ["ALTER TABLE public.lp1_compare ALTER COLUMN id TYPE bigint", "integer -> bigint"],
      ]) {
        await db.query("SAVEPOINT control");
        try { await db.query(sql!); expect((await changes()).join("\n")).toContain(expected); }
        finally { await db.query("ROLLBACK TO SAVEPOINT control"); }
        expect(await changes()).toEqual([]);
      }
      for (const sql of [
        "ALTER TABLE public.lp1_compare ADD COLUMN later text",
        "CREATE OR REPLACE FUNCTION public.lp1_compare_function() RETURNS integer LANGUAGE sql AS 'SELECT 2'",
        "INSERT INTO public.lp1_compare VALUES(2,'2026-10-14T00:00:00.000001Z')",
      ]) {
        await db.query("SAVEPOINT control");
        try { await db.query(sql); expect(await changes()).toEqual([]); }
        finally { await db.query("ROLLBACK TO SAVEPOINT control"); }
      }
      await db.query("SAVEPOINT control");
      await db.query("DELETE FROM public.lp1_compare WHERE id=1");
      expect((await changes()).join("\n")).toContain("missing row");
      await db.query("ROLLBACK TO SAVEPOINT control");
      expect(await changes()).toEqual([]);
      await db.query("ROLLBACK");
      expect((await db.query("SELECT to_regclass('public.lp1_compare') AS table_name,to_regprocedure('public.lp1_compare_function()') AS function_name")).rows)
        .toEqual([{ table_name: null, function_name: null }]);
    } finally { await db.query("ROLLBACK"); db.release(); }
  });

  it("[LP1-11] LP-1 preserves populated history at its own migration step and through later migrations", async () => {
    const ownName = "0162_membership_account_closed.sql";
    const own = MIGRATION_URLS.find(url => url.pathname.endsWith(`/${ownName}`));
    expect(own, "migration 0162 and its registration must arrive together with the seed conversion").toBeDefined();
    const names = MIGRATION_URLS.map(url => url.pathname.split("/").at(-1)!);
    const index = names.indexOf(ownName);
    await owner.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
    for (const url of MIGRATION_URLS.slice(0, index)) {
      await owner.query(await readFile(url, "utf8"));
      await owner.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [url.pathname.split("/").at(-1)]);
    }
    await installLegacySyntheticPartyFixtures(owner);
    const commercial = await seedEvidencePackFixture(owner);
    let artifact = "", digest = "";
    await withTenant(owner, testTenantContext(commercial.tenantId), async db => {
      const loaded = await loadEvidencePackSources(db, commercial.tenantId, commercial.caseId);
      const manifest = buildEvidenceManifest(commercial.caseId, commercial.jobId, loaded.sources, loaded.omissions);
      artifact = renderStandalonePack(manifest, loaded.sources); digest = manifestDigest(manifest);
      const pack = randomUUID();
      await db.$client.query("INSERT INTO app.evidence_pack(tenant_id,id,job_id,case_id) VALUES($1,$2,$3,$4)", [commercial.tenantId, pack, commercial.jobId, commercial.caseId]);
      await db.$client.query(`INSERT INTO app.evidence_pack_revision(tenant_id,id,job_id,case_id,pack_id,revision,command_id,canonical_manifest,manifest_hash,content_hash,sources,format,actor_ref,subject_hash,artifact_text)
        VALUES($1,$2,$3,$4,$5,1,$6,$7,$8,$9,$10,'TEXT','fixture-owner',$11,$12)`, [commercial.tenantId, randomUUID(), commercial.jobId, commercial.caseId, pack, randomUUID(), canonicalManifest(manifest), digest, sha256(artifact), JSON.stringify(loaded.sources), sha256("lp1 synthetic subject"), artifact]);
    });
    const tenant = randomUUID(), person = randomUUID(), account = randomUUID();
    await owner.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [tenant]);
    await owner.query("INSERT INTO identity.identity_user(id) VALUES($1)", [person]);
    await owner.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'LP1 generated history')", [account, tenant]);
    const member = randomUUID();
    for (const state of ["active", "expired", "revoked"]) {
      await owner.query(`INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role,revoked_at,expires_at)
        VALUES($1,$2,$3,$4,'member',CASE WHEN $5='revoked' THEN clock_timestamp()-interval '1 day' END,
        CASE WHEN $5='expired' THEN clock_timestamp()-interval '1 day' END)`, [state === "active" ? member : randomUUID(), tenant, account, person, state]);
    }
    await withTenant(owner, testTenantContext(tenant), async db => {
      await db.$client.query(`INSERT INTO app.command_receipt(command_id,tenant_id,command_type,semantic_key,request_hash,status,result,actor_membership_id,completed_at)
        VALUES($1,$2,'lp1.synthetic_history','lp1.generated_history',$3,'succeeded','{"version":"lp1.fixture.v1","created":true}',$4,clock_timestamp())`,
        [randomUUID(), tenant, "a".repeat(64), member]);
      await appendAuditBatch(db, [{ id: randomUUID(), version: "audit.v1", actorRef: `membership:${member}`, eventType: "lp1.synthetic_history",
        subjectType: "membership", subjectRef: member, payload: { references: { membership: member } } }]);
    });
    const tables = ["control_plane.tenant", "identity.identity_user", "app.account", "app.membership", "app.command_receipt", "app.audit_event", "audit_control.audit_head",
      "app.job", "app.quote_document_version", "app.quote_acceptance", "app.evidence_object", "app.variation_revision", "app.variation_approval",
      "app.material_rate_revision", "app.supplier_document", "app.supplier_document_version", "app.customer_invoice", "app.recovery_claim_revision",
      "app.evidence_pack", "app.evidence_pack_revision"];
    const before = await snapshot(owner, tables);
    for (const was of Object.values(before)) expect(was.rows.length).toBeGreaterThan(0);
    const security = await unrelatedSecurity(owner);
    await owner.query(await readFile(own!, "utf8"));
    await owner.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [ownName]);
    expect(compareSnapshots(before, await snapshot(owner, tables, before))).toEqual([]);
    expect(await unrelatedSecurity(owner)).toEqual(security);
    for (const table of ["app.account", "app.membership"]) {
      const effective = (await owner.query(`SELECT has_table_privilege('jobguard_runtime',$1,'SELECT') AS read,
        has_table_privilege('jobguard_runtime',$1,'INSERT') AS insert,
        has_table_privilege('jobguard_runtime',$1,'UPDATE') AS update,
        has_table_privilege('jobguard_runtime',$1,'DELETE') AS delete,
        has_column_privilege('jobguard_runtime',$1,'created_at','UPDATE') AS lock`, [table])).rows;
      expect(effective).toEqual([{ read: true, insert: false, update: false, delete: false, lock: true }]);
    }
    // At this step only, require unchanged table shapes. Later migrations may add columns.
    for (const [table, was] of Object.entries(before)) expect((await snapshot(owner, [table]))[table]!.columns).toEqual(was.columns);
    for (let pass = 0; pass < 2; pass++) {
      await migrate(owner);
      expect(compareSnapshots(before, await snapshot(owner, tables, before))).toEqual([]);
    }
    const pack = (await owner.query("SELECT artifact_text,manifest_hash,content_hash FROM app.evidence_pack_revision WHERE manifest_hash=$1", [digest])).rows;
    expect(pack).toEqual([{ artifact_text: artifact, manifest_hash: digest, content_hash: sha256(artifact) }]);
    expect(verifyStandalonePack(pack[0]!.artifact_text)).toEqual(verifyStandalonePack(artifact));
    expect((await owner.query("SELECT migration_name FROM public.jobguard_schema_migration ORDER BY migration_name")).rows.map(row => row.migration_name))
      .toEqual(names.sort());
  }, 120_000);
});
