/** ENT-10a2 [U1]. NOT RUN (sandbox cannot start PostgreSQL / a browser). */
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Pool, PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MIGRATION_URLS, migrate } from "../src/index.js";
import { createScimHarness, fixture, person } from "./scim-fixtures.js";

const migrationName = "0137_scim_deactivation.sql";
const comparedTables = [
  "app.membership", "identity.session", "identity.sso_subject", "identity.sso_session_binding",
  "identity.sso_grant", "app.role_grant", "app.role_grant_revocation", "identity.membership_locator",
  "identity.sso_required_event",
] as const;
type Queryable = Pick<Pool | PoolClient, "query">;
type Column = { name: string; type: string };
type Row = { identity: string; bytes: string };
type TableSnapshot = { columns: Column[]; primaryKey: string[]; rows: Row[] };
type Snapshot = Record<string, TableSnapshot>;
type CatalogRow = { identity: string; bytes: string };
type Catalog = { relations: CatalogRow[]; columns: CatalogRow[]; functions: CatalogRow[]; policies: CatalogRow[]; triggers: CatalogRow[]; constraints: CatalogRow[]; types: CatalogRow[] };
let harness: Awaited<ReturnType<typeof createScimHarness>>;
let snapshot: Snapshot;
let beforeCatalog: Catalog;

const ident = (name: string) => `"${name.replaceAll('"', '""')}"`;
const relation = (name: string) => name.split(".").map(ident).join(".");
const nameOf = (url: URL) => url.pathname.split("/").at(-1)!;

async function columnsOf(db: Queryable, table: string): Promise<Column[]> {
  return (await db.query<Column>(`SELECT attname AS name,format_type(atttypid,atttypmod) AS type
    FROM pg_attribute WHERE attrelid=$1::regclass AND attnum>0 AND NOT attisdropped ORDER BY attnum`, [table])).rows;
}
async function primaryKeyOf(db: Queryable, table: string): Promise<string[]> {
  return (await db.query<{ name: string }>(`SELECT a.attname AS name FROM pg_constraint c
    CROSS JOIN LATERAL unnest(c.conkey) WITH ORDINALITY k(attnum,position)
    JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.attnum
    WHERE c.conrelid=$1::regclass AND c.contype='p' ORDER BY k.position`, [table])).rows.map(row => row.name);
}
/** Both values and row identities remain PostgreSQL canonical text; the driver never parses stored times. */
async function rowsOf(db: Queryable, table: string, columns: Column[], primaryKey: string[], identities?: string[]): Promise<Row[]> {
  const values = columns.map(column => `s.${ident(column.name)}`).join(",");
  const keys = primaryKey.map(name => `s.${ident(name)}`).join(",");
  return (await db.query<Row>(`SELECT row_to_json(i)::text AS identity,row_to_json(t)::text AS bytes
    FROM ${relation(table)} s CROSS JOIN LATERAL (SELECT ${values}) t CROSS JOIN LATERAL (SELECT ${keys}) i
    ${identities ? "WHERE row_to_json(i)::text=ANY($1::text[])" : ""}
    ORDER BY row_to_json(i)::text COLLATE "C"`, identities ? [identities] : [])).rows;
}
async function capture(db: Queryable): Promise<Snapshot> {
  const result: Snapshot = {};
  for (const table of comparedTables) {
    const columns = await columnsOf(db, table), primaryKey = await primaryKeyOf(db, table);
    expect(primaryKey.length, `${table}: primary key exists`).toBeGreaterThan(0);
    const rows = await rowsOf(db, table, columns, primaryKey);
    expect(rows.length, `${table}: populated upgrade fixture`).toBeGreaterThan(0);
    result[table] = { columns, primaryKey, rows };
  }
  return result;
}
/** Later additions are allowed. Every captured name/type and captured primary-key row must remain exact. */
async function assertPreserved(db: Queryable, before: Snapshot): Promise<void> {
  for (const table of comparedTables) {
    const previous = before[table]!;
    expect(previous.rows.length, `${table}: at least one pre-existing row`).toBeGreaterThan(0);
    const now = await columnsOf(db, table), byName = new Map(now.map(column => [column.name, column.type]));
    expect(previous.columns.map(column => ({ name: column.name, type: byName.get(column.name) })), `${table}: pre-existing names and full types`).toEqual(previous.columns);
    expect(await primaryKeyOf(db, table), `${table}: captured primary key`).toEqual(previous.primaryKey);
    expect(await rowsOf(db, table, previous.columns, previous.primaryKey, previous.rows.map(row => row.identity)), `${table}: captured rows by identity`).toEqual(previous.rows);
  }
}

/** Full definitions, owners, definer flags, configurations and ACLs at N's own step only. */
async function catalog(db: Queryable): Promise<Catalog> {
  const namespaces = "n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'";
  const relations = (await db.query<CatalogRow>(`SELECT n.nspname||'.'||c.relname AS identity,row_to_json(t)::text AS bytes
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL
    (SELECT c.relkind,pg_get_userbyid(c.relowner) AS owner,c.relacl::text AS acl,c.relrowsecurity,c.relforcerowsecurity) t
    WHERE ${namespaces} AND c.relkind IN('r','i','v','S','m','p','f') ORDER BY identity`)).rows;
  const columns = (await db.query<CatalogRow>(`SELECT n.nspname||'.'||c.relname||'.'||a.attname AS identity,row_to_json(t)::text AS bytes
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid
    LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    CROSS JOIN LATERAL (SELECT a.attnum,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull,a.attidentity,a.attgenerated,
      a.attacl::text AS acl,pg_get_expr(d.adbin,d.adrelid) AS default_expression) t
    WHERE ${namespaces} AND c.relkind IN('r','v','m','p','f') AND a.attnum>0 AND NOT a.attisdropped ORDER BY identity`)).rows;
  const functions = (await db.query<CatalogRow>(`SELECT n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' AS identity,
    row_to_json(t)::text AS bytes FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN LATERAL
    (SELECT pg_get_functiondef(p.oid) AS definition,pg_get_userbyid(p.proowner) AS owner,p.prosecdef,p.proconfig,p.proacl::text AS acl) t
    WHERE ${namespaces} AND p.prokind IN('f','p') ORDER BY identity`)).rows;
  const policies = (await db.query<CatalogRow>(`SELECT schemaname||'.'||tablename||'.'||policyname AS identity,row_to_json(p)::text AS bytes
    FROM pg_policies p WHERE schemaname NOT LIKE 'pg_%' AND schemaname<>'information_schema' ORDER BY identity`)).rows;
  const triggers = (await db.query<CatalogRow>(`SELECT n.nspname||'.'||c.relname||'.'||g.tgname AS identity,row_to_json(t)::text AS bytes
    FROM pg_trigger g JOIN pg_class c ON c.oid=g.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    CROSS JOIN LATERAL (SELECT pg_get_triggerdef(g.oid) AS definition,g.tgenabled,g.tgisinternal) t
    WHERE ${namespaces} ORDER BY identity`)).rows;
  const constraints = (await db.query<CatalogRow>(`SELECT n.nspname||'.'||c.relname||'.'||k.conname AS identity,row_to_json(t)::text AS bytes
    FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    CROSS JOIN LATERAL (SELECT k.contype,pg_get_constraintdef(k.oid) AS definition,k.convalidated) t
    WHERE ${namespaces} ORDER BY identity`)).rows;
  const types = (await db.query<CatalogRow>(`SELECT n.nspname||'.'||p.typname AS identity,row_to_json(t)::text AS bytes
    FROM pg_type p JOIN pg_namespace n ON n.oid=p.typnamespace CROSS JOIN LATERAL
    (SELECT p.typtype,pg_get_userbyid(p.typowner) AS owner,p.typacl::text AS acl) t
    WHERE ${namespaces} ORDER BY identity`)).rows;
  return { relations, columns, functions, policies, triggers, constraints, types };
}
function newCatalogRows(before: CatalogRow[], after: CatalogRow[]): CatalogRow[] {
  const existing = new Map(after.map(row => [row.identity, row]));
  for (const row of before) expect(existing.get(row.identity), `unchanged existing object ${row.identity}`).toEqual(row);
  const names = new Set(before.map(row => row.identity));
  return after.filter(row => !names.has(row.identity));
}
async function rolledBack(control: (client: PoolClient) => Promise<void>): Promise<void> {
  const client = await harness.admin.connect();
  try { await client.query("BEGIN"); await control(client); }
  finally { await client.query("ROLLBACK"); client.release(); }
  await assertPreserved(harness.admin, snapshot);
}

beforeAll(async () => {
  harness = await createScimHarness("jg-scim-upgrade-", migrationName);
  const company = await fixture(harness), member = await person(company, "finance");
  await company.signin(member.email, member.subject, false, ["finance"]);
  await company.enable();
  const withoutConnection = await fixture(harness, false, false);
  expect((await harness.admin.query("SELECT count(*)::int n FROM identity.sso_connection WHERE tenant_id=$1", [withoutConnection.principal.tenantId])).rows[0]!.n).toBe(0);
  expect((await harness.admin.query("SELECT count(*)::int n FROM identity.session WHERE revoked_at IS NOT NULL")).rows[0]!.n).toBeGreaterThan(0);
  snapshot = await capture(harness.admin);
  beforeCatalog = await catalog(harness.admin);
}, 120000);
afterAll(async () => { await harness?.close(); });

describe("ENT-10a2 populated migration upgrade", () => {
  it("[U1] applies only N over populated identity history, preserves every pre-existing object at N, then later migrations twice and rolled-back comparison controls", async () => {
    const names = MIGRATION_URLS.map(nameOf), index = names.indexOf(migrationName);
    expect(index).toBeGreaterThan(names.indexOf("0129_sso_required.sql"));
    expect(names).toEqual([...names].sort());
    const installed = (await harness.admin.query<{ migration_name: string }>("SELECT migration_name FROM public.jobguard_schema_migration ORDER BY migration_name")).rows.map(row => row.migration_name);
    expect(installed).toEqual(names.slice(0, index));
    expect((await harness.admin.query("SELECT to_regclass('identity.scim_event') name")).rows[0]!.name).toBeNull();
    const client = await harness.admin.connect();
    try {
      await client.query("SET ROLE jobguard_migration");
      await client.query(await readFile(MIGRATION_URLS[index]!, "utf8"));
    } finally { await client.query("RESET ROLE"); client.release(); }
    await harness.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [migrationName]);
    await assertPreserved(harness.admin, snapshot);
    const after = await catalog(harness.admin);
    const addedRelations = newCatalogRows(beforeCatalog.relations, after.relations);
    expect(addedRelations.map(row => row.identity).filter(name => name === "identity.scim_event")).toEqual(["identity.scim_event"]);
    for (const added of addedRelations.filter(row => row.identity !== "identity.scim_event")) {
      expect((await harness.admin.query("SELECT indrelid::regclass::text parent FROM pg_index WHERE indexrelid=$1::regclass", [added.identity])).rows).toEqual([{ parent: "identity.scim_event" }]);
    }
    const addedColumns = newCatalogRows(beforeCatalog.columns, after.columns);
    expect(addedColumns).toHaveLength(13);
    for (const column of addedColumns) expect(column.identity).toMatch(/^identity\.scim_event\./u);
    const addedFunctions = newCatalogRows(beforeCatalog.functions, after.functions);
    expect(addedFunctions.map(row => row.identity)).toEqual(["identity.scim_deactivate(c uuid, p jsonb)"]);
    const addedPolicies = newCatalogRows(beforeCatalog.policies, after.policies);
    expect(addedPolicies).toHaveLength(1); expect(addedPolicies[0]!.identity).toMatch(/^identity\.scim_event\./u);
    const addedTriggers = newCatalogRows(beforeCatalog.triggers, after.triggers);
    const ordinaryTriggers: CatalogRow[] = [];
    for (const row of addedTriggers) {
      const parts = row.identity.split("."), table = parts.slice(0, 2).join("."), trigger = parts[2]!;
      const info = (await harness.admin.query<{ internal: boolean; constraint_relation: string | null }>(`SELECT g.tgisinternal AS internal,k.conrelid::regclass::text AS constraint_relation
        FROM pg_trigger g LEFT JOIN pg_constraint k ON k.oid=g.tgconstraint
        WHERE g.tgrelid=$1::regclass AND g.tgname=$2`, [table, trigger])).rows[0]!;
      if (info.internal) expect(info.constraint_relation).toBe("identity.scim_event");
      else ordinaryTriggers.push(row);
    }
    // Foreign keys necessarily install internal constraint triggers on their referenced relations.
    expect(ordinaryTriggers).toHaveLength(1); expect(ordinaryTriggers[0]!.identity).toMatch(/^identity\.scim_event\./u);
    const addedConstraints = newCatalogRows(beforeCatalog.constraints, after.constraints);
    expect(addedConstraints.length).toBeGreaterThan(0);
    for (const row of addedConstraints) expect(row.identity).toMatch(/^identity\.scim_event\./u);
    expect(newCatalogRows(beforeCatalog.types, after.types).map(row => row.identity).sort()).toEqual(["identity._scim_event", "identity.scim_event"]);
    expect((await harness.admin.query("SELECT count(*)::int n FROM identity.scim_event")).rows[0]!.n).toBe(0);

    // N alone owns the catalogue assertion. Later migrations may change routines or append rows.
    await migrate(harness.admin); await assertPreserved(harness.admin, snapshot);
    await migrate(harness.admin); await assertPreserved(harness.admin, snapshot);
    expect((await harness.admin.query("SELECT migration_name FROM public.jobguard_schema_migration ORDER BY migration_name")).rows.map(row => row.migration_name)).toEqual(names);

    await rolledBack(async db => {
      await db.query("UPDATE identity.session SET expires_at=expires_at+interval '1 microsecond' WHERE id=(SELECT id FROM identity.session ORDER BY id LIMIT 1)");
      await expect(assertPreserved(db, snapshot)).rejects.toThrow();
    });
    await rolledBack(async db => {
      await db.query("ALTER TABLE identity.session ALTER COLUMN csrf_token TYPE varchar(65)");
      // Serialised values remain identical; names and full types must still reject the change.
      expect(await rowsOf(db, "identity.session", snapshot["identity.session"]!.columns, snapshot["identity.session"]!.primaryKey,
        snapshot["identity.session"]!.rows.map(row => row.identity))).toEqual(snapshot["identity.session"]!.rows);
      await expect(assertPreserved(db, snapshot)).rejects.toThrow();
    });
    await rolledBack(async db => {
      await db.query("ALTER TABLE identity.session ADD COLUMN scim_upgrade_nullable text");
      await assertPreserved(db, snapshot);
    });
    await rolledBack(async db => {
      // Replacing this task's own routine after N must not be confused with an old-row change.
      await db.query("CREATE OR REPLACE FUNCTION identity.scim_deactivate(c uuid,p jsonb) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT '{}'::jsonb $$");
      await assertPreserved(db, snapshot);
    });
    await rolledBack(async db => {
      const id = randomUUID(), digest = createHash("sha256").update(id).digest("hex");
      await db.query("INSERT INTO identity.session(id,user_id,environment,token_digest,csrf_token,expires_at) SELECT $1,user_id,environment,$2,$3,expires_at FROM identity.session ORDER BY id LIMIT 1", [id, digest, randomUUID()]);
      expect((await db.query("SELECT count(*)::int n FROM identity.session")).rows[0]!.n).toBe(snapshot["identity.session"]!.rows.length + 1);
      await assertPreserved(db, snapshot);
    });
    const empty = { ...snapshot, "identity.session": { ...snapshot["identity.session"]!, rows: [] } };
    await expect(assertPreserved(harness.admin, empty)).rejects.toThrow();
  }, 120000);
});
