import { randomUUID } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, MIGRATION_URLS } from "../src/migrate.js";
import { closeTestPools, freePort } from "./pool-test-utils.js";
import { rolledBack } from "./upgrade-proof-utils.js";

type Queryable = Pick<Pool | PoolClient, "query">;
type Family = "schema" | "sequence" | "view" | "default privileges";
type Subject = { family: Family; oid: string; name: string; facts: string[] };
type Difference = { family: Family; object: string; change: "+" | "-"; fact: string };
type Path = { pool: Pool; before: Subject[]; after: Subject[]; prefixAndOwn: string[] };
let postgres: EmbeddedPostgres | undefined, port: number, auditPath: Path, shadowPath: Path;
const connections: Pool[] = [];
const shadowRoles = ["jobguard_shadow", "jobguard_shadow_emergency_access"] as const;
const filename = (url: URL) => fileURLToPath(url).split("/").at(-1)!;
const ident = (value: string) => '"' + value.replaceAll('"', '""') + '"';

// Assertions first. Helpers are local: no shared harness, production SQL or merged test changes.
beforeAll(startCluster);
afterAll(async () => {
  await closeTestPools(...connections);
  await postgres?.stop();
  // Leave the disposable directory for the dispatcher's cleanup; this order authorizes no deletion.
});

describe("[A02 A03] audit-export own-step catalogue", () => {
  it("[F8-01] 0121 preserves schema, sequence, view and default-privilege facts at its own step", async () => {
    auditPath = await ownStep("0121_audit_export.sql", "f8_audit");
    expect(differences(auditPath.before, auditPath.after)).toEqual([]);
    expect(await receipts(auditPath.pool)).toEqual(auditPath.prefixAndOwn);
  }, 60_000);
});

describe("[A04 A05 A06 A11] shadow own-step catalogue", () => {
  it("[F8-02] 0128 permits only its two schema USAGE additions in these catalogue families", async () => {
    shadowPath = await ownStep("0128_shadow_persistence.sql", "f8_shadow");
    const raw = differences(shadowPath.before, shadowPath.after);
    expect(raw).toEqual(expectedUsage(shadowPath.before));
    expect(differences(shadowPath.before, shadowPath.after, true)).toEqual([]);
    expect(await receipts(shadowPath.pool)).toEqual(shadowPath.prefixAndOwn);
  }, 60_000);
});

describe("[A05 A07 A08 A09 A10 A11] real catalogue controls", () => {
  it("[F8-03] every catalogue family has a real fixture and changed facts are detected", async () => {
    const pool = shadowPath.pool;
    const before = await catalogue(pool);
    await fixtureCoverage(pool, before);
    for (const control of forbiddenControls) {
      await rolledBack(pool, async client => {
        expect((await client.query(control.precondition)).rows[0]?.ok, control.label).toBe(true);
        await client.query(control.sql);
        const changes = differences(before, await catalogue(client), true);
        expect(changes, control.label).toContainEqual(expect.objectContaining(control.expected));
        if (control.factPrefix) expect(changes.some(change => change.family === control.expected.family
          && change.object === control.expected.object && change.fact.startsWith(control.factPrefix!)), control.label).toBe(true);
        expect(changes.length, control.label).toBeGreaterThan(0);
      });
      expect(await catalogue(pool), control.label).toEqual(before);
    }
    await rolledBack(pool, async client => {
      await client.query("REVOKE USAGE ON SCHEMA app FROM jobguard_shadow,jobguard_shadow_emergency_access");
      const withoutUsage = await catalogue(client);
      expect(differences(withoutUsage, before)).toEqual(expectedUsage(withoutUsage));
      await client.query("GRANT USAGE ON SCHEMA app TO jobguard_shadow,jobguard_shadow_emergency_access");
      const withUsage = await catalogue(client);
      expect(differences(withoutUsage, withUsage, true)).toEqual([]);
      expect(differences(withoutUsage, withUsage)).toEqual(expectedUsage(withoutUsage));
    });
    expect(await catalogue(pool)).toEqual(before);
  });
});

describe("[A12 A13 A15] catalogue persistence and rollback", () => {
  it("[F8-04] controls and refused access roll back and fresh connections see the original facts", async () => {
    const pool = shadowPath.pool;
    const before = await catalogue(pool);
    const fresh = connect("f8_shadow");
    expect(await catalogue(fresh)).toEqual(before);
    await expect(rolledBack(pool, async client => {
      await client.query("GRANT CREATE ON SCHEMA f8_fixture TO f8_reader");
      expect(differences(before, await catalogue(client))).toEqual([]);
    })).rejects.toThrow();
    expect(await catalogue(fresh)).toEqual(before);
    await expect(rolledBack(pool, async client => {
      await client.query("GRANT CREATE ON SCHEMA f8_fixture TO f8_reader");
      await client.query("SET LOCAL ROLE jobguard_shadow");
      await client.query("CREATE TABLE app.f8_refused(value integer)");
    })).rejects.toMatchObject({ code: "42501" });
    expect((await fresh.query("SELECT to_regclass('app.f8_refused') IS NULL AS absent")).rows[0]?.absent).toBe(true);
    expect(await catalogue(fresh)).toEqual(before);
  });
});

describe("[A14 A15] actual non-superuser access", () => {
  it("[F8-05] runtime and shadow access obey the existing schema boundary", async () => {
    const pool = shadowPath.pool;
    const before = await catalogue(pool);
    await probe(pool, "jobguard_runtime", "SELECT * FROM app.shadow_commercial_signal");
    await probe(pool, "jobguard_shadow", "SELECT * FROM identity.identity_user");
    for (const role of shadowRoles) {
      await probe(pool, role, "CREATE TABLE app.f8_refused(value integer)");
      const privileges = (await pool.query(`SELECT has_schema_privilege($1,'app','USAGE') AS usage,
        has_schema_privilege($1,'app','CREATE') AS create_allowed,
        has_schema_privilege($1,'app','USAGE WITH GRANT OPTION') AS grantable`, [role])).rows[0];
      expect(privileges).toEqual({ usage: true, create_allowed: false, grantable: false });
    }
    expect((await pool.query("SELECT to_regclass('app.f8_refused') IS NULL AS absent")).rows[0]?.absent).toBe(true);
    expect(await catalogue(pool)).toEqual(before);
  });
});

describe("[A16] later migrations are allowed to evolve the catalogue", () => {
  it("[F8-06] both historic prefixes reach the complete registered schema twice", async () => {
    for (const path of [auditPath, shadowPath]) {
      await migrate(path.pool);
      expect(await receipts(path.pool)).toEqual(MIGRATION_URLS.map(filename).sort());
      await migrate(path.pool);
      expect(await receipts(path.pool)).toEqual(MIGRATION_URLS.map(filename).sort());
    }
    // No catalogue equality after later migrations; no business-row proof belongs to this batch.
  }, 60_000);
});

// Both sides include every selected non-system object, and global defaults have no namespace filter.
// Object NULL ACLs expand with PostgreSQL's applicable defaults; column NULL ACLs expand to no grants.
async function catalogue(db: Queryable): Promise<Subject[]> {
  const rows = (await db.query(`
    WITH namespaces AS (
      SELECT * FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname <> 'information_schema'
    ), objects AS (
      SELECT 'schema'::text AS family,n.oid,n.nspname::text AS name,n.nspowner AS owner,
        coalesce(n.nspacl,acldefault('n',n.nspowner)) AS acl,ARRAY[]::text[] AS extra
      FROM namespaces n
      UNION ALL
      SELECT CASE WHEN c.relkind='S' THEN 'sequence' ELSE 'view' END,c.oid,
        (n.nspname||'.'||c.relname)::text,c.relowner,
        coalesce(c.relacl,acldefault(CASE WHEN c.relkind='S' THEN 's' ELSE 'r' END::"char",c.relowner)),
        CASE WHEN c.relkind='S' THEN ARRAY[]::text[] ELSE
          ARRAY['kind '||c.relkind::text,'definition '||pg_get_viewdef(c.oid,true)] ||
          ARRAY(SELECT 'column '||row_to_json(x)::text FROM (
            SELECT a.attnum AS position,a.attname::text AS name,format_type(a.atttypid,a.atttypmod) AS type
            FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
            ORDER BY a.attnum) x) ||
          ARRAY(SELECT 'column acl '||row_to_json(x)::text FROM (
            SELECT a.attname::text AS column_name,pg_get_userbyid(e.grantor) AS grantor,
              CASE WHEN e.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(e.grantee) END AS grantee,
              e.privilege_type AS privilege,e.is_grantable AS grantable
            FROM pg_attribute a CROSS JOIN LATERAL aclexplode(coalesce(a.attacl,acldefault('c',c.relowner))) e
            WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
            ORDER BY a.attnum,grantor,grantee,privilege,grantable) x) END
      FROM pg_class c JOIN namespaces n ON n.oid=c.relnamespace WHERE c.relkind IN ('S','v','m')
      UNION ALL
      SELECT 'default privileges',d.oid,
        (pg_get_userbyid(d.defaclrole)||'.'||coalesce(n.nspname,'<global>')||'.'||d.defaclobjtype::text)::text,
        d.defaclrole,coalesce(d.defaclacl,acldefault(CASE WHEN d.defaclobjtype='S' THEN 's'
          ELSE d.defaclobjtype END::"char",d.defaclrole)),
        ARRAY['defining role '||pg_get_userbyid(d.defaclrole),
          'scope '||coalesce(n.nspname,'<global>'),'object kind '||d.defaclobjtype::text]
      FROM pg_default_acl d LEFT JOIN namespaces n ON n.oid=d.defaclnamespace
      WHERE d.defaclnamespace=0 OR n.oid IS NOT NULL
    )
    SELECT row_to_json(s)::text AS bytes FROM (
      SELECT o.family,o.oid::text AS oid,o.name,
        ARRAY['owner '||pg_get_userbyid(o.owner)] || o.extra ||
        ARRAY(SELECT 'acl '||row_to_json(x)::text FROM (
          SELECT pg_get_userbyid(e.grantor) AS grantor,
            CASE WHEN e.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(e.grantee) END AS grantee,
            e.privilege_type AS privilege,e.is_grantable AS grantable
          FROM aclexplode(o.acl) e ORDER BY grantor,grantee,privilege,grantable) x) AS facts
      FROM objects o ORDER BY o.family COLLATE "C",o.name COLLATE "C",o.oid
    ) s
  `)).rows as { bytes: string }[];
  return rows.map(row => {
    const subject = JSON.parse(row.bytes) as Subject;
    return { ...subject, facts: subject.facts.sort() };
  });
}

function usageFact(owner: string, grantee: string) {
  return "acl " + JSON.stringify({ grantor: owner, grantee, privilege: "USAGE", grantable: false });
}
function expectedUsage(before: Subject[]): Difference[] {
  const app = before.find(subject => subject.family === "schema" && subject.name === "app");
  if (!app) throw new Error("schema app: missing captured object");
  const owner = app.facts.find(fact => fact.startsWith("owner "))?.slice(6);
  if (!owner) throw new Error("schema app: missing owner");
  return shadowRoles.map(role => ({ family: "schema", object: "app", change: "+", fact: usageFact(owner, role) }));
}
function differences(before: Subject[], after: Subject[], permitUsage = false): Difference[] {
  const result: Difference[] = [];
  const key = (subject: Subject) => JSON.stringify([subject.family, subject.oid, subject.name]);
  const old = new Map(before.map(subject => [key(subject), subject]));
  const live = new Map(after.map(subject => [key(subject), subject]));
  for (const id of new Set([...old.keys(), ...live.keys()])) {
    const was = old.get(id), now = live.get(id), subject = now ?? was!;
    const record = (change: "+" | "-", fact: string) => result.push({
      family: subject.family, object: subject.name, change, fact,
    });
    if (!was) record("+", "object");
    if (!now) record("-", "object");
    for (const fact of was?.facts ?? []) if (!now?.facts.includes(fact)) record("-", fact);
    for (const fact of now?.facts ?? []) if (!was?.facts.includes(fact)) record("+", fact);
  }
  const allowed = permitUsage ? expectedUsage(before) : [];
  return result.filter(change => !allowed.some(entry => JSON.stringify(entry) === JSON.stringify(change)))
    .sort((a, b) => {
      const left = JSON.stringify(a), right = JSON.stringify(b);
      return left < right ? -1 : left > right ? 1 : 0;
    });
}

async function startCluster() {
  const directory = await mkdtemp(join(tmpdir(), "fixlater-8-pg16-"));
  port = await freePort(55200, 500);
  const value = randomUUID();
  postgres = new EmbeddedPostgres({
    databaseDir: directory, port, user: "postgres",
    password: value,
    persistent: true, createPostgresUser: process.getuid?.() === 0,
    initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined,
  });
  await postgres.initialise();
  await postgres.start();
  adminConfig = { host: "127.0.0.1", port, user: "postgres", database: "postgres" };
  adminConfig.password = value;
  const admin = connect("postgres");
  await admin.query("CREATE ROLE f8_owner NOLOGIN; CREATE ROLE f8_reader NOLOGIN; CREATE ROLE f8_other NOLOGIN");
  for (const database of ["f8_audit", "f8_shadow"]) await admin.query(`CREATE DATABASE ${ident(database)}`);
}
let adminConfig: ConstructorParameters<typeof Pool>[0];
function connect(database: string) {
  const pool = new Pool({ ...adminConfig, database, max: 1 });
  connections.push(pool);
  return pool;
}
async function receipts(db: Queryable): Promise<string[]> {
  return (await db.query("SELECT migration_name FROM public.jobguard_schema_migration ORDER BY migration_name"))
    .rows.map(row => row.migration_name as string);
}
async function apply(db: Queryable, url: URL) {
  const sql = await readFile(url, "utf8");
  const mode = process.env.JOBGUARD_ENV === "synthetic_demo" ? "synthetic_demo" : "details_needed";
  await db.query(filename(url) === "0095_job_parties.sql"
    ? sql.replace("BEGIN;", `BEGIN; SELECT set_config('app.deployment_mode','${mode}',true);`) : sql);
  await db.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [filename(url)]);
}
async function ownStep(name: string, database: string): Promise<Path> {
  const own = MIGRATION_URLS.findIndex(url => filename(url) === name);
  if (own < 0) throw new Error(`migration ${name}: missing from registry`);
  const pool = connect(database);
  const client = await pool.connect();
  try {
    await client.query(`CREATE TABLE public.jobguard_schema_migration(
      migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())`);
    for (const url of MIGRATION_URLS.slice(0, own)) await apply(client, url);
    expect(await receipts(client)).toEqual(MIGRATION_URLS.slice(0, own).map(filename).sort());
    await fixtures(client);
    const before = await catalogue(client);
    await fixtureCoverage(client, before);
    await apply(client, MIGRATION_URLS[own]!);
    const after = await catalogue(client);
    await fixtureCoverage(client, after);
    return { pool, before, after, prefixAndOwn: MIGRATION_URLS.slice(0, own + 1).map(filename).sort() };
  } finally {
    client.release();
  }
}

async function fixtures(db: Queryable) {
  await db.query(`BEGIN;
    CREATE SCHEMA f8_fixture AUTHORIZATION f8_owner;
    CREATE SCHEMA f8_null AUTHORIZATION f8_owner;
    SET LOCAL ROLE f8_owner;
    CREATE SEQUENCE f8_fixture.sequence_fixture;
    CREATE VIEW f8_fixture.view_fixture AS SELECT 7::integer AS payload;
    CREATE VIEW f8_fixture.null_acl_fixture AS SELECT 11::integer AS payload;
    CREATE MATERIALIZED VIEW f8_fixture.materialized_fixture AS SELECT 9::numeric(12,2) AS payload;
    GRANT USAGE ON SCHEMA f8_fixture TO PUBLIC;
    GRANT SELECT ON f8_fixture.view_fixture TO PUBLIC;
    GRANT SELECT(payload) ON f8_fixture.view_fixture TO f8_reader;
    GRANT SELECT ON f8_fixture.materialized_fixture TO f8_reader WITH GRANT OPTION;
    ALTER DEFAULT PRIVILEGES FOR ROLE f8_owner GRANT SELECT ON TABLES TO f8_reader;
    ALTER DEFAULT PRIVILEGES FOR ROLE f8_owner IN SCHEMA f8_fixture GRANT INSERT ON TABLES TO f8_reader WITH GRANT OPTION;
    COMMIT;`);
}
async function fixtureCoverage(db: Queryable, subjects: Subject[]) {
  const find = (family: Family, name: string) => {
    const found = subjects.find(subject => subject.family === family && subject.name === name);
    expect(found, `${family} ${name}: nonempty coverage`).toBeDefined();
    expect(found!.facts.length).toBeGreaterThan(0);
    return found!;
  };
  expect(find("schema", "f8_fixture").facts).toContain(usageFact("f8_owner", "PUBLIC"));
  const nullSchema = find("schema", "f8_null");
  expect(nullSchema.facts).toContain(usageFact("f8_owner", "f8_owner"));
  expect((await db.query("SELECT nspacl IS NULL AS absent FROM pg_namespace WHERE oid=$1", [nullSchema.oid])).rows[0]?.absent).toBe(true);
  const sequence = find("sequence", "f8_fixture.sequence_fixture");
  for (const privilege of ["SELECT", "UPDATE", "USAGE"]) {
    expect(sequence.facts).toContain("acl " + JSON.stringify({
      grantor: "f8_owner", grantee: "f8_owner", privilege, grantable: false,
    }));
  }
  expect((await db.query("SELECT relacl IS NULL AS absent FROM pg_class WHERE oid=$1", [sequence.oid])).rows[0]?.absent).toBe(true);
  const view = find("view", "f8_fixture.view_fixture");
  expect(view.facts).toContain("kind v");
  expect(view.facts).toContain('column {"position":1,"name":"payload","type":"integer"}');
  expect(view.facts).toContain('column acl {"column_name":"payload","grantor":"f8_owner","grantee":"f8_reader","privilege":"SELECT","grantable":false}');
  expect(view.facts).toContain('acl {"grantor":"f8_owner","grantee":"PUBLIC","privilege":"SELECT","grantable":false}');
  const nullView = find("view", "f8_fixture.null_acl_fixture");
  expect(nullView.facts).toContain('acl {"grantor":"f8_owner","grantee":"f8_owner","privilege":"SELECT","grantable":false}');
  expect((await db.query("SELECT relacl IS NULL AS absent FROM pg_class WHERE oid=$1", [nullView.oid])).rows[0]?.absent).toBe(true);
  const materialized = find("view", "f8_fixture.materialized_fixture");
  expect(materialized.facts).toContain("kind m");
  expect(materialized.facts).toContain('column {"position":1,"name":"payload","type":"numeric(12,2)"}');
  expect(materialized.facts).toContain('acl {"grantor":"f8_owner","grantee":"f8_reader","privilege":"SELECT","grantable":true}');
  expect(find("default privileges", "f8_owner.<global>.r").facts)
    .toContain('acl {"grantor":"f8_owner","grantee":"f8_reader","privilege":"SELECT","grantable":false}');
  expect(find("default privileges", "f8_owner.f8_fixture.r").facts)
    .toContain('acl {"grantor":"f8_owner","grantee":"f8_reader","privilege":"INSERT","grantable":true}');
}

type Control = { label: string; precondition: string; sql: string; expected: Partial<Difference>; factPrefix?: string };
const forbiddenControls: Control[] = [
  {
    label: "schema CREATE outside exception", precondition: "SELECT NOT has_schema_privilege('jobguard_shadow','app','CREATE') AS ok",
    sql: "GRANT CREATE ON SCHEMA app TO jobguard_shadow",
    expected: { family: "schema", object: "app", change: "+", fact: 'acl {"grantor":"jobguard_migration","grantee":"jobguard_shadow","privilege":"CREATE","grantable":false}' },
  },
  {
    label: "schema USAGE grant option", precondition: "SELECT NOT has_schema_privilege('jobguard_shadow','app','USAGE WITH GRANT OPTION') AS ok",
    sql: "GRANT USAGE ON SCHEMA app TO jobguard_shadow WITH GRANT OPTION",
    expected: { family: "schema", object: "app", change: "+", fact: 'acl {"grantor":"jobguard_migration","grantee":"jobguard_shadow","privilege":"USAGE","grantable":true}' },
  },
  {
    label: "other schema", precondition: "SELECT NOT has_schema_privilege('jobguard_shadow','f8_fixture','CREATE') AS ok",
    sql: "GRANT CREATE ON SCHEMA f8_fixture TO jobguard_shadow",
    expected: { family: "schema", object: "f8_fixture", change: "+", fact: 'acl {"grantor":"f8_owner","grantee":"jobguard_shadow","privilege":"CREATE","grantable":false}' },
  },
  {
    label: "USAGE on another schema", precondition: `SELECT NOT EXISTS(SELECT 1 FROM pg_namespace n,
      LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) e
      WHERE n.nspname='f8_fixture' AND e.grantee='jobguard_shadow'::regrole AND e.privilege_type='USAGE') AS ok`,
    sql: "GRANT USAGE ON SCHEMA f8_fixture TO jobguard_shadow",
    expected: { family: "schema", object: "f8_fixture", change: "+", fact: 'acl {"grantor":"f8_owner","grantee":"jobguard_shadow","privilege":"USAGE","grantable":false}' },
  },
  {
    label: "other grantee", precondition: "SELECT NOT has_schema_privilege('f8_reader','app','USAGE') AS ok",
    sql: "GRANT USAGE ON SCHEMA app TO f8_reader",
    expected: { family: "schema", object: "app", change: "+", fact: 'acl {"grantor":"jobguard_migration","grantee":"f8_reader","privilege":"USAGE","grantable":false}' },
  },
  {
    label: "sequence ACL", precondition: "SELECT NOT has_sequence_privilege('f8_reader','f8_fixture.sequence_fixture','USAGE') AS ok",
    sql: "GRANT USAGE ON SEQUENCE f8_fixture.sequence_fixture TO f8_reader",
    expected: { family: "sequence", object: "f8_fixture.sequence_fixture", change: "+", fact: 'acl {"grantor":"f8_owner","grantee":"f8_reader","privilege":"USAGE","grantable":false}' },
  },
  {
    label: "view ACL", precondition: "SELECT has_table_privilege('f8_other','f8_fixture.view_fixture','SELECT') AS ok",
    sql: "REVOKE SELECT ON f8_fixture.view_fixture FROM PUBLIC",
    expected: { family: "view", object: "f8_fixture.view_fixture", change: "-", fact: 'acl {"grantor":"f8_owner","grantee":"PUBLIC","privilege":"SELECT","grantable":false}' },
  },
  {
    label: "view-column ACL", precondition: `SELECT EXISTS(SELECT 1 FROM pg_attribute a,
      LATERAL aclexplode(a.attacl) e WHERE a.attrelid='f8_fixture.view_fixture'::regclass AND
      a.attname='payload' AND e.grantee='f8_reader'::regrole AND e.privilege_type='SELECT') AS ok`,
    sql: "REVOKE SELECT(payload) ON f8_fixture.view_fixture FROM f8_reader",
    expected: { family: "view", object: "f8_fixture.view_fixture", change: "-", fact: 'column acl {"column_name":"payload","grantor":"f8_owner","grantee":"f8_reader","privilege":"SELECT","grantable":false}' },
  },
  {
    label: "global default ACL", precondition: `SELECT EXISTS(SELECT 1 FROM pg_default_acl d,
      LATERAL aclexplode(d.defaclacl) e WHERE d.defaclrole='f8_owner'::regrole AND d.defaclnamespace=0
      AND d.defaclobjtype='r' AND e.grantee='f8_reader'::regrole AND e.privilege_type='SELECT') AS ok`,
    sql: "ALTER DEFAULT PRIVILEGES FOR ROLE f8_owner REVOKE SELECT ON TABLES FROM f8_reader",
    expected: { family: "default privileges", object: "f8_owner.<global>.r", change: "-", fact: 'acl {"grantor":"f8_owner","grantee":"f8_reader","privilege":"SELECT","grantable":false}' },
  },
  {
    label: "schema-scoped default ACL", precondition: `SELECT EXISTS(SELECT 1 FROM pg_default_acl d,
      LATERAL aclexplode(d.defaclacl) e WHERE d.defaclrole='f8_owner'::regrole
      AND d.defaclnamespace='f8_fixture'::regnamespace AND d.defaclobjtype='r'
      AND e.grantee='f8_reader'::regrole AND e.privilege_type='INSERT' AND e.is_grantable) AS ok`,
    sql: "ALTER DEFAULT PRIVILEGES FOR ROLE f8_owner IN SCHEMA f8_fixture REVOKE INSERT ON TABLES FROM f8_reader",
    expected: { family: "default privileges", object: "f8_owner.f8_fixture.r", change: "-", fact: 'acl {"grantor":"f8_owner","grantee":"f8_reader","privilege":"INSERT","grantable":true}' },
  },
  {
    label: "missing captured qualified object", precondition: "SELECT to_regclass('f8_fixture.sequence_fixture') IS NOT NULL AS ok",
    sql: "ALTER SEQUENCE f8_fixture.sequence_fixture RENAME TO sequence_moved",
    expected: { family: "sequence", object: "f8_fixture.sequence_fixture", change: "-", fact: "object" },
  },
  {
    label: "changed owner", precondition: "SELECT relowner='f8_owner'::regrole AS ok FROM pg_class WHERE oid='f8_fixture.sequence_fixture'::regclass",
    sql: "GRANT CREATE ON SCHEMA f8_fixture TO f8_reader; ALTER SEQUENCE f8_fixture.sequence_fixture OWNER TO f8_reader",
    expected: { family: "sequence", object: "f8_fixture.sequence_fixture", change: "+", fact: "owner f8_reader" },
  },
  {
    label: "view definition", precondition: "SELECT pg_get_viewdef('f8_fixture.view_fixture'::regclass,true) LIKE '%7%' AS ok",
    sql: "CREATE OR REPLACE VIEW f8_fixture.view_fixture AS SELECT 8::integer AS payload",
    expected: { family: "view", object: "f8_fixture.view_fixture", change: "-" },
    factPrefix: "definition ",
  },
];

async function probe(pool: Pool, role: string, refused: string) {
  await rolledBack(pool, async client => {
    await client.query(`SET LOCAL ROLE ${ident(role)}`);
    const posture = (await client.query(`SELECT current_user AS name,rolsuper,rolbypassrls
      FROM pg_roles WHERE rolname=current_user`)).rows[0];
    expect(posture).toEqual({ name: role, rolsuper: false, rolbypassrls: false });
    expect((await client.query("SELECT payload FROM f8_fixture.view_fixture")).rows).toEqual([{ payload: 7 }]);
    await client.query("SAVEPOINT f8_probe");
    try {
      await expect(client.query(refused)).rejects.toMatchObject({ code: "42501" });
    } finally {
      await client.query("ROLLBACK TO SAVEPOINT f8_probe");
    }
    expect((await client.query("SELECT payload FROM f8_fixture.view_fixture")).rows).toEqual([{ payload: 7 }]);
  });
}
