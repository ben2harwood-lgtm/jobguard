// ENT-3c upgrade proof, in the rule-9 shape: it proves ITS OWN migration only. Install everything before 0140 and populate it, snapshot, apply 0140 alone and compare;
// then apply everything after it and require success twice; compare existing rows by their named pre-existing columns, as canonical row_to_json text, matched by identity.
// Never asserts that later migrations add no column or replace no function (the fingerprinted-table guard owns "may never gain a column").
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MIGRATION_URLS, SiteExtraRepository } from "../src/index.js";
import { clusterBefore, siteFixture, ownerTx, noteText, type SiteFixture } from "./site-extra-pricing-fixtures.js";
import { rawVariation } from "./extra-fixtures.js";

const own = "0140_site_extra_pricing.sql";
type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }> };
let c: Awaited<ReturnType<typeof clusterBefore>>, f: SiteFixture;

// ---- the comparison code, used by the proof and by every control ----
const schemas = "('app','identity','control_plane','infrastructure','audit_control')";
/** Every table's columns as "name type" with the type as format_type prints it (atttypid and atttypmod), in column order. */
async function columnsOf(db: Db): Promise<Record<string, string[]>> {
  const rows = (await db.query(`SELECT n.nspname||'.'||c.relname AS name,array_agg(a.attname::text||' '||format_type(a.atttypid,a.atttypmod) ORDER BY a.attnum) AS columns
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
    WHERE c.relkind='r' AND n.nspname IN ${schemas} GROUP BY 1`)).rows;
  return Object.fromEntries(rows.map(row => [row.name as string, row.columns as string[]]));
}
const nameOf = (column: string) => column.slice(0, column.indexOf(" "));
/** Compared tables, with the key that identifies a row. Only rows that existed before 0140 are compared afterwards. */
const compared: Record<string, string[]> = {
  "app.variation": ["tenant_id", "id"], "app.variation_revision": ["tenant_id", "id"], "app.extra_origin": ["tenant_id", "variation_id"], "app.extra_event": ["tenant_id", "id"],
  "app.work_order_revision": ["tenant_id", "id"], "app.work_order_line": ["tenant_id", "id"], "app.sor_item": ["tenant_id", "version_id", "code"], "app.command_receipt": ["tenant_id", "command_id"], "app.audit_event": ["tenant_id", "id"],
};
const q = (name: string) => `"${name.replaceAll('"', '""')}"`;
/** Canonical text of the named pre-existing columns of every row, by identity: row_to_json(...)::text over a sub-select of exactly those columns (never driver-parsed values). */
async function rowsByIdentity(db: Db, namedColumns: Record<string, string[]>): Promise<Record<string, Map<string, string>>> {
  const out: Record<string, Map<string, string>> = {};
  for (const [table, key] of Object.entries(compared)) {
    const [schema, relation] = table.split(".") as [string, string], names = namedColumns[table]!.map(nameOf);
    const rows = (await db.query(`SELECT row_to_json(ident)::text AS identity,row_to_json(named)::text AS bytes FROM ${q(schema)}.${q(relation)} t,
      LATERAL (SELECT ${key.map(k => `t.${q(k)}`).join(",")}) ident,LATERAL (SELECT ${names.map(n => `t.${q(n)}`).join(",")}) named`)).rows;
    out[table] = new Map(rows.map(row => [row.identity as string, row.bytes as string]));
  }
  return out;
}
type Snapshot = { columns: Record<string, string[]>; rows: Record<string, Map<string, string>> };
const snapshot = async (db: Db, columns?: Record<string, string[]>): Promise<Snapshot> => { const now = columns ?? await columnsOf(db); return { columns: now, rows: await rowsByIdentity(db, now) }; };
/** After ALL later migrations: every pre-existing column still there with the same name and full type; every pre-existing row still there and unchanged in its named columns. */
async function problemsAfterAll(db: Db, before: Snapshot): Promise<string[]> {
  const problems: string[] = [], now = await columnsOf(db);
  for (const [table, columns] of Object.entries(before.columns)) {
    const live = new Map((now[table] ?? []).map(column => [nameOf(column), column]));
    for (const column of columns) if (live.get(nameOf(column)) !== column) problems.push(`${table}.${column} -> ${live.get(nameOf(column)) ?? "(gone)"}`);
  }
  const rows = await rowsByIdentity(db, before.columns);
  for (const [table, identities] of Object.entries(before.rows)) for (const [identity, bytes] of identities) {
    const live = rows[table]!.get(identity);
    if (live === undefined) problems.push(`${table} ${identity} is gone`); else if (live !== bytes) problems.push(`${table} ${identity} changed`);
  }
  return problems;
}
/** 0140's OWN step only: everything above, plus the exact set of tables, each pre-existing table's indexes, constraints, policies, grants, non-internal triggers, and every function's text. */
async function catalogue(db: Db) {
  const per = async (sql: string) => Object.fromEntries((await db.query(sql)).rows.map(row => [row.name as string, row.items as string[]]));
  return {
    tables: (await db.query(`SELECT n.nspname||'.'||c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND n.nspname IN ${schemas} ORDER BY 1`)).rows.map(r => r.name as string),
    indexes: await per(`SELECT c.oid::regclass::text AS name,coalesce(array_agg(pg_get_indexdef(i.indexrelid) ORDER BY i.indexrelid::regclass::text),'{}') AS items FROM pg_class c LEFT JOIN pg_index i ON i.indrelid=c.oid WHERE c.relkind='r' AND c.relnamespace::regnamespace::text IN ('app','identity','control_plane','infrastructure','audit_control') GROUP BY 1`),
    constraints: await per(`SELECT c.oid::regclass::text AS name,coalesce(array_agg(k.conname||' '||pg_get_constraintdef(k.oid) ORDER BY k.conname),'{}') AS items FROM pg_class c LEFT JOIN pg_constraint k ON k.conrelid=c.oid WHERE c.relkind='r' AND c.relnamespace::regnamespace::text IN ('app','identity','control_plane','infrastructure','audit_control') GROUP BY 1`),
    policies: await per(`SELECT c.oid::regclass::text AS name,coalesce(array_agg(p.policyname||' '||p.cmd||' '||p.roles::text||' '||coalesce(p.qual,'')||' '||coalesce(p.with_check,'') ORDER BY p.policyname),'{}') AS items FROM pg_class c LEFT JOIN pg_policies p ON p.schemaname=c.relnamespace::regnamespace::text AND p.tablename=c.relname WHERE c.relkind='r' AND c.relnamespace::regnamespace::text IN ('app','identity','control_plane','infrastructure','audit_control') GROUP BY 1`),
    grants: await per(`SELECT c.oid::regclass::text AS name,ARRAY[coalesce(c.relacl::text,''),pg_get_userbyid(c.relowner),c.relrowsecurity::text,c.relforcerowsecurity::text] AS items FROM pg_class c WHERE c.relkind='r' AND c.relnamespace::regnamespace::text IN ('app','identity','control_plane','infrastructure','audit_control')`),
    triggers: await per(`SELECT c.oid::regclass::text AS name,coalesce(array_agg(pg_get_triggerdef(t.oid) ORDER BY t.tgname) FILTER (WHERE NOT t.tgisinternal),'{}') AS items FROM pg_class c LEFT JOIN pg_trigger t ON t.tgrelid=c.oid WHERE c.relkind='r' AND c.relnamespace::regnamespace::text IN ('app','identity','control_plane','infrastructure','audit_control') GROUP BY 1`),
    functions: Object.fromEntries((await db.query(`SELECT p.oid::regprocedure::text AS name,pg_get_functiondef(p.oid)||coalesce(p.proacl::text,'') AS definition FROM pg_proc p WHERE p.pronamespace::regnamespace::text IN ('app','identity','control_plane','infrastructure','audit_control') AND p.prokind IN ('f','p')`)).rows.map(row => [row.name as string, row.definition as string])),
  };
}
type Catalogue = Awaited<ReturnType<typeof catalogue>>;
function problemsAtOwnStep(before: Catalogue, after: Catalogue, newTables: string[]): string[] {
  const problems: string[] = [];
  const added = after.tables.filter(table => !before.tables.includes(table)).sort();
  if (JSON.stringify(added) !== JSON.stringify([...newTables].sort())) problems.push(`tables added: ${JSON.stringify(added)}`);
  if (before.tables.some(table => !after.tables.includes(table))) problems.push("a table is gone");
  for (const kind of ["indexes", "constraints", "policies", "grants", "triggers"] as const) for (const table of before.tables) {
    if (JSON.stringify(before[kind][table]) !== JSON.stringify(after[kind][table])) problems.push(`${kind} of ${table} changed`);
  }
  for (const [name, definition] of Object.entries(before.functions)) if (after.functions[name] !== definition) problems.push(`function ${name} ${after.functions[name] === undefined ? "is gone" : "changed"}`);
  return problems;
}
const twelve = ["app.quote_document_version", "app.quote_acceptance", "app.evidence_object", "app.variation_revision", "app.variation_approval", "app.recovery_claim_revision", "app.recovery_case_event", "app.material_rate_revision", "app.supplier_document_version", "app.supplier_document", "app.customer_invoice", "app.discrepancy_review_outcome"];

let names: string[], beforeSnapshot: Snapshot, beforeCatalogue: Catalogue;
beforeAll(async () => {
  c = await clusterBefore(own); names = c.names;
  f = await siteFixture(c);
  const repo = new SiteExtraRepository(c.runtime);
  // Populated before 0140: orders and price lists (merged import), free-text extras, receipts and audit events (merged ENT-3a log), and a priced small-builder variation revision.
  for (const who of [f.members.supervisor, f.members.surveyor]) await repo.logSiteExtra(f.ctx, who.member, { commandId: randomUUID(), jobId: f.jobId, note: noteText, description: "Fictional free-text extra" });
  await ownerTx(c, f.p.tenantId, async db => {
    const job = randomUUID(); await db.$client.query("INSERT INTO app.job(tenant_id,id,title,status) VALUES($1,$2,'Fictional legacy small builder','live')", [f.p.tenantId, job]);
    await rawVariation(db, f.p.tenantId, job, randomUUID(), "builder_logged", "small_builder");
  });
  await ownerTx(c, f.p.tenantId, async db => {
    const v = (await db.$client.query("SELECT * FROM app.variation WHERE tenant_id=$1 AND job_track='small_builder' LIMIT 1", [f.p.tenantId])).rows[0]!;
    await db.$client.query("INSERT INTO app.variation_revision(tenant_id,id,job_id,variation_id,scope_item_id,revision,description,quantity_decimal,unit,unit_rate_pence,signed_delta_pence,content_hash,confirmed_by_membership_id,rate_provenance_kind,rate_source_ref,rate_source_hash,rate_version) SELECT $1,$2,$3,$4,$5,1,'Fictional preceding revision','1',unit,rate_pence,rate_pence,$6,$7,'human_entered','fixture://merged-sor',$6,'fixture-v1' FROM app.sor_item WHERE tenant_id=$1 AND version_id=$8 AND code='FIT-LOCK'",
      [f.p.tenantId, randomUUID(), v.job_id, v.id, v.scope_item_id, "a".repeat(64), f.p.membershipId, f.demo.sorVersionId]);
  });
  beforeSnapshot = await snapshot(c.admin); beforeCatalogue = await catalogue(c.admin);
}, 120_000);
afterAll(async () => { await c?.close(); });

describe("ENT-3c 0140 upgrade proof", () => {
  it("[C21] the registry is ordered, the populated database is the one before 0140, and every compared table has at least one pre-existing row", async () => {
    expect(names).toEqual([...names].sort()); expect(new Set(names).size).toBe(names.length);
    const index = names.indexOf(own); expect(index).toBeGreaterThan(names.indexOf("0110_work_orders.sql")); expect(index).toBeGreaterThan(names.indexOf("0122_extra_origin_persistence.sql")); expect(index).toBeGreaterThan(names.indexOf("0135_site_extra_authority.sql"));
    expect((await c.admin.query("SELECT migration_name FROM public.jobguard_schema_migration ORDER BY migration_name")).rows.map(r => r.migration_name)).toEqual(names.filter(name => name < own));
    expect(beforeSnapshot.columns["app.extra_sor_revision"]).toBeUndefined(); expect(beforeSnapshot.columns["app.extra_pricing_basis"]).toBeUndefined();
    for (const table of Object.keys(compared)) expect(beforeSnapshot.rows[table]!.size, `${table} has a pre-existing row`).toBeGreaterThan(0);
    expect((await c.admin.query("SELECT 1 FROM app.variation_revision WHERE job_id IN(SELECT job_id FROM app.variation WHERE job_track='small_builder')")).rowCount).toBeGreaterThan(0);
  });

  it("[C21] 0140 alone: only the two new tables appear, no existing table gains or changes a column, index, constraint, policy, grant or user trigger, every existing function is textually unchanged, every existing row is unchanged", async () => {
    // The same step the runner takes for this file: read, run, record its name. Nothing later is installed yet.
    await c.admin.query(await readFile(fileURLToPath(MIGRATION_URLS.find(url => fileURLToPath(url).endsWith(own))!), "utf8"));
    await c.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1) ON CONFLICT DO NOTHING", [own]);
    expect((await c.admin.query("SELECT migration_name FROM public.jobguard_schema_migration ORDER BY migration_name")).rows.map(r => r.migration_name), "0140 alone, nothing later").toEqual(names.filter(name => name <= own));
    const after = await catalogue(c.admin);
    expect(problemsAtOwnStep(beforeCatalogue, after, ["app.extra_pricing_basis", "app.extra_sor_revision"])).toEqual([]);
    expect(await problemsAfterAll(c.admin, beforeSnapshot)).toEqual([]);
    const columns = await columnsOf(c.admin);
    for (const table of Object.keys(beforeSnapshot.columns)) expect(columns[table], table).toEqual(beforeSnapshot.columns[table]); // not one added column at this step
    expect(Object.keys(columns).filter(table => !(table in beforeSnapshot.columns)).sort()).toEqual(["app.extra_pricing_basis", "app.extra_sor_revision"]);
    const created = Object.keys(after.functions).filter(name => !(name in beforeCatalogue.functions)).sort();
    expect(created).toEqual(["app.ent3c_pricing_basis_guard()", "app.ent3c_record_sor_revision(uuid,uuid,text,text)", "app.ent3c_require_pricing_basis()", "app.ent3c_require_sor_revision_audit()", "app.ent3c_sor_revision_guard()"]);
    for (const table of ["app.variation", "app.variation_revision", "app.extra_origin"]) expect(after.grants[table], `${table} privileges are what they were`).toEqual(beforeCatalogue.grants[table]);
  });

  it("[C26] the column names and full types of all twelve fingerprinted tables are identical before and after 0140", async () => {
    const now = await columnsOf(c.admin);
    for (const table of twelve) { expect(beforeSnapshot.columns[table], table).toBeDefined(); expect(now[table], table).toEqual(beforeSnapshot.columns[table]); }
  });

  it("[C21] then everything after it applies, migrate succeeds twice, and the pre-existing rows still match by identity", async () => {
    await c.migrate(); await c.migrate();
    expect((await c.admin.query("SELECT migration_name FROM public.jobguard_schema_migration ORDER BY migration_name")).rows.map(r => r.migration_name)).toEqual(names);
    expect(await problemsAfterAll(c.admin, beforeSnapshot)).toEqual([]);
  });

  describe("controls (every one rolled back, using the same comparison code)", () => {
    const rolledBack = async (work: (db: Db) => Promise<void>) => {
      const db = await c.admin.connect();
      try { await db.query("BEGIN"); await db.query("SET LOCAL session_replication_role=replica"); await work(db); } finally { try { await db.query("ROLLBACK"); } finally { db.release(); } }
    };
    it("a one-microsecond change to a stored time FAILS the row comparison", async () => {
      await rolledBack(async db => {
        const before = await db.query("SELECT occurred_at::text AS t FROM app.audit_event WHERE tenant_id=$1 ORDER BY sequence LIMIT 1", [f.p.tenantId]);
        await db.query("UPDATE app.audit_event SET occurred_at=occurred_at+interval '1 microsecond' WHERE tenant_id=$1 AND sequence=(SELECT min(sequence) FROM app.audit_event WHERE tenant_id=$1)", [f.p.tenantId]);
        expect((await db.query("SELECT occurred_at::text AS t FROM app.audit_event WHERE tenant_id=$1 ORDER BY sequence LIMIT 1", [f.p.tenantId])).rows[0]!.t).not.toBe(before.rows[0]!.t);
        const problems = await problemsAfterAll(db, beforeSnapshot);
        expect(problems.some(problem => problem.startsWith("app.audit_event") && problem.endsWith("changed"))).toBe(true);
      });
      expect(await problemsAfterAll(c.admin, beforeSnapshot)).toEqual([]);
    });
    it("a retype of a pre-existing column FAILS the comparison, although every serialised value is unchanged", async () => {
      await rolledBack(async db => {
        await db.query("ALTER TABLE app.sor_item ALTER COLUMN standard_minutes TYPE bigint");
        const problems = await problemsAfterAll(db, beforeSnapshot);
        expect(problems.some(problem => problem.startsWith("app.sor_item.standard_minutes integer"))).toBe(true);
        expect(problems.every(problem => !problem.endsWith("changed"))).toBe(true);
      });
    });
    it("an added nullable column and a replaced function after 0140's step PASS", async () => {
      await rolledBack(async db => {
        await db.query("ALTER TABLE app.sor_item ADD COLUMN control_added text");
        await db.query("CREATE OR REPLACE FUNCTION app.sor_line_net_pence(qty text, rate bigint, adjustment_numerator bigint, adjustment_denominator bigint) RETURNS bigint LANGUAGE plpgsql IMMUTABLE STRICT SET search_path=pg_catalog AS $$ BEGIN RETURN 0; END $$");
        expect(await problemsAfterAll(db, beforeSnapshot)).toEqual([]);
      });
    });
    it("a row added by a later migration or command (its own audit event, a new receipt) leaves the proof passing", async () => {
      await rolledBack(async db => {
        await db.query("INSERT INTO control_plane.tenant(id) VALUES(gen_random_uuid())");
        await db.query("SELECT set_config('app.tenant_id',$1,true)", [f.p.tenantId]);
        await db.query("INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,actor_membership_id) VALUES($1,$2,'LogSiteExtra',$3,$4,'processing',$5)", [f.p.tenantId, randomUUID(), `control:${randomUUID()}`, "a".repeat(64), f.p.membershipId]);
        expect(await problemsAfterAll(db, beforeSnapshot)).toEqual([]);
      });
    });
    it("a removed row FAILS, and 0140's own-step comparison catches a function replaced at that step", async () => {
      await rolledBack(async db => {
        await db.query("DELETE FROM app.sor_item WHERE tenant_id=$1 AND version_id=$2 AND code='CLEAR-VOID'", [f.p.tenantId, f.demo.sorVersionId]);
        expect((await problemsAfterAll(db, beforeSnapshot)).some(problem => problem.includes("is gone"))).toBe(true);
      });
      await rolledBack(async db => {
        await db.query("CREATE OR REPLACE FUNCTION app.sor_line_net_pence(qty text, rate bigint, adjustment_numerator bigint, adjustment_denominator bigint) RETURNS bigint LANGUAGE plpgsql IMMUTABLE STRICT SET search_path=pg_catalog AS $$ BEGIN RETURN 0; END $$");
        const problems = problemsAtOwnStep(beforeCatalogue, await catalogue(db), ["app.extra_pricing_basis", "app.extra_sor_revision"]);
        expect(problems.some(problem => problem.startsWith("function app.sor_line_net_pence"))).toBe(true);
      });
    });
  });
});
