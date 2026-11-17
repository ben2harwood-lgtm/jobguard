import { randomUUID } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appendAuditBatch, LedgerRepository, MIGRATION_URLS, migrate } from "../src/index.js";
import { closeTestPools, freePort } from "./pool-test-utils.js";
import { testTenantContext } from "./tenant-context-test-utils.js";

const migrationName = "0151_ledger_corrections_fix.sql";
const nameOf = (url: URL) => fileURLToPath(url).split("/").at(-1)!;
const ident = (name: string) => `"${name.replaceAll('"', '""')}"`;
const relation = (name: string) => name.split(".").map(ident).join(".");
const tables = ["control_plane.tenant", "identity.identity_user", "app.account", "app.membership", "app.ledger_book",
  "app.ledger_account", "app.financial_authorization", "app.journal", "app.journal_line", "app.audit_event", "audit_control.audit_head"];
type Column = { name: string; type: string };
type Snapshot = { table: string; columns: Column[]; keys: string[]; rows: Array<{ identity: string; bytes: string }> };
let postgres: EmbeddedPostgres, admin: Pool, runtime: Pool, before: Snapshot[], sql: string;
const tenant = randomUUID(), user = randomUUID(), member = randomUUID(), book = randomUUID();
const receivable = randomUUID(), income = randomUUID(), clearing = randomUUID(), hash = "a".repeat(64);

async function columns(db: Pool | PoolClient, table: string): Promise<Column[]> {
  return (await db.query("SELECT attname::text AS name,format_type(atttypid,atttypmod) AS type FROM pg_attribute WHERE attrelid=$1::regclass AND attnum>0 AND NOT attisdropped ORDER BY attnum", [table])).rows;
}
async function rows(db: Pool | PoolClient, table: string, cols: Column[], keys: string[], identities?: string[]) {
  const identity = `jsonb_build_array(${keys.map(ident).join(",")})::text`;
  return (await db.query(`SELECT ${identity} AS identity,row_to_json(t)::text AS bytes
    FROM (SELECT ${cols.map(c => ident(c.name)).join(",")} FROM ${relation(table)}
      ${identities ? `WHERE ${identity}=ANY($1::text[])` : ""}) t ORDER BY ${identity} COLLATE "C"`, identities ? [identities] : [])).rows as Snapshot["rows"];
}
async function snapshot(): Promise<Snapshot[]> {
  const result: Snapshot[] = [];
  for (const table of tables) {
    const cols = await columns(admin, table);
    const keys = (await admin.query("SELECT a.attname::text AS name FROM pg_index i CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY k(attnum,position) JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.attnum WHERE i.indrelid=$1::regclass AND i.indisprimary ORDER BY k.position", [table])).rows.map(r => r.name as string);
    expect(keys.length, `${table} has a primary identity`).toBeGreaterThan(0);
    const stored = await rows(admin, table, cols, keys);
    expect(stored.length, `${table} has pre-existing rows`).toBeGreaterThan(0);
    result.push({ table, columns: cols, keys, rows: stored });
  }
  return result;
}
async function compare(db: Pool | PoolClient) {
  for (const s of before) {
    const live = await columns(db, s.table);
    expect(s.columns.map(c => live.find(now => now.name === c.name)), `${s.table} original names and full types`).toEqual(s.columns);
    expect(await rows(db, s.table, s.columns, s.keys, s.rows.map(r => r.identity)), `${s.table} original rows`).toEqual(s.rows);
  }
}
async function privileges() {
  return {
    tables: (await admin.query("SELECT n.nspname,c.relname,pg_get_userbyid(c.relowner) owner,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN('r','v','S') AND n.nspname IN('app','identity','control_plane','audit_control','infrastructure') ORDER BY n.nspname,c.relname")).rows,
    policies: (await admin.query("SELECT * FROM pg_policies WHERE schemaname IN('app','identity','control_plane','audit_control','infrastructure') ORDER BY schemaname,tablename,policyname")).rows,
    routines: (await admin.query("SELECT p.oid::regprocedure::text signature,pg_get_userbyid(p.proowner) owner,p.prosecdef,p.proconfig,p.proacl::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('app','identity','control_plane','audit_control','infrastructure') ORDER BY signature")).rows,
  };
}
async function control(change: string, shouldFail: boolean) {
  const client = await admin.connect();
  try {
    await client.query("BEGIN"); await client.query(change);
    if (shouldFail) await expect(compare(client)).rejects.toThrow();
    else await compare(client);
  } finally { await client.query("ROLLBACK"); client.release(); }
  await compare(admin);
}

beforeAll(async () => {
  const directory = await mkdtemp(join(tmpdir(), "jg-migfix-2-upgrade-"));
  const port = await freePort(57400, 200), loginValue = randomUUID();
  postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password: loginValue,
    persistent: false, createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C"] });
  await postgres.initialise(); await postgres.start();
  admin = new Pool({ host: "127.0.0.1", port, user: "postgres", password: loginValue, database: "postgres" });
  await admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
  for (const url of MIGRATION_URLS.filter(u => nameOf(u) < migrationName)) {
    const name = nameOf(url), bytes = await readFile(fileURLToPath(url), "utf8");
    await admin.query(name === "0095_job_parties.sql" ? bytes.replace("BEGIN;", "BEGIN; SELECT set_config('app.deployment_mode','details_needed',true);") : bytes);
    await admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [name]);
  }
  const ddl = await admin.query("SELECT format('CREATE ROLE migfix_2_upgrade_login LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS', $1::text) AS ddl", [loginValue]);
  await admin.query(ddl.rows[0].ddl); await admin.query("GRANT jobguard_runtime TO migfix_2_upgrade_login");
  runtime = new Pool({ host: "127.0.0.1", port, user: "migfix_2_upgrade_login", password: loginValue, database: "postgres" });
  await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [tenant]);
  await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [user]);
  await admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Synthetic upgrade')", [user, tenant]);
  await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$3,'owner')", [member, tenant, user]);
  await admin.query("INSERT INTO app.ledger_book(id,tenant_id,code,currency,chart_status) VALUES($1,$2,'synthetic','GBP','synthetic')", [book, tenant]);
  for (const [id, classification] of [[receivable, "receivable"], [income, "deferred_income"], [clearing, "provider_clearing"]]) {
    await admin.query("INSERT INTO app.ledger_account(id,tenant_id,book_id,currency,code,class,mapping_status) VALUES($1,$2,$3,'GBP',$4,$4,'synthetic')", [id, tenant, book, classification]);
  }
  const repo = new LedgerRepository(runtime), context = testTenantContext(tenant);
  let obligation = "", settlement = "";
  for (const purpose of ["plan_obligation", "plan_settlement", "correction"] as const) {
    const auth = randomUUID(), journalId = randomUUID(), amount = purpose === "plan_obligation" ? 1000 : 400;
    await admin.query("INSERT INTO app.financial_authorization(id,tenant_id,membership_id,purpose,amount_pence,currency,artifact_hash,status) VALUES($1,$2,$3,$4,$5,'GBP',$6,'approved')", [auth, tenant, member, purpose, amount, hash]);
    const proof = { authorizationId: auth, actorRef: `membership:${member}`, permission: "finance:approve" as const };
    const base = { schemaVersion: 1, journalId, bookId: book, currency: "GBP", amountPence: amount, sourceEventId: journalId, provenanceRef: "synthetic", artifactHash: hash, authorizationId: auth, actorRef: proof.actorRef };
    if (purpose === "plan_obligation") obligation = await repo.postPlanObligation(context, proof, { ...base, receivableAccountId: receivable, deferredIncomeAccountId: income, provenanceKind: "synthetic_authorized_plan" });
    else if (purpose === "plan_settlement") settlement = await repo.postPlanSettlement(context, proof, { ...base, obligationJournalId: obligation, clearingAccountId: clearing, receivableAccountId: receivable });
    else {
      const { amountPence: _amount, currency: _currency, ...reversal } = base;
      await repo.reverse(context, proof, { ...reversal, originalJournalId: settlement });
    }
  }
  // Retain actual PostgreSQL fractional microseconds in the reference comparison.
  await admin.query("UPDATE app.account SET created_at='2026-10-13 10:11:12.123456+00' WHERE id=$1", [user]);
  before = await snapshot();
  sql = await readFile(new URL(`../migrations/${migrationName}`, import.meta.url), "utf8");
}, 120_000);
afterAll(async () => { await closeTestPools(runtime, admin); await postgres?.stop(); });

describe("MIGFIX-2 populated migration upgrade", () => {
  it("[MIGFIX-2-HISTORY] refuses historical duplicate reversals without rewriting old rows", async () => {
    const client = await admin.connect();
    try {
      await client.query("BEGIN");
      // Model an installed pre-0151 duplicate; every change in this control rolls back.
      const auth = randomUUID(), journal = randomUUID(), audit = randomUUID();
      await client.query("INSERT INTO app.financial_authorization(id,tenant_id,membership_id,purpose,amount_pence,currency,artifact_hash,status) VALUES($1,$2,$3,'correction',400,'GBP',$4,'approved')", [auth, tenant, member, hash]);
      await client.query("SELECT set_config('app.tenant_id',$1,true)", [tenant]);
      const original = (await client.query("SELECT reverses_journal_id FROM app.journal WHERE tenant_id=$1 AND kind='reversal'", [tenant])).rows[0].reverses_journal_id;
      await client.query("SELECT app.reverse_journal($1,$2,$3,$4,$5,$6,$7,$8)", [journal, book, original, journal, "synthetic", hash, auth, audit]);
      await appendAuditBatch({ $client: client } as Parameters<typeof appendAuditBatch>[0], [{ id: audit, version: "audit.v1", actorRef: `membership:${member}`,
        eventType: "financial.journal_posted", subjectType: "journal", subjectRef: journal, payload: { hashes: { artifact: hash } } }]);
      // Flush deferred checks so ALTER TABLE tests the duplicate key, rather than
      // refusing DDL merely because this fixture has pending constraint triggers.
      await client.query("SET CONSTRAINTS ALL IMMEDIATE");
      await expect(client.query(sql.replace(/^BEGIN;\s*/u, "").replace(/COMMIT;\s*$/u, ""))).rejects.toMatchObject({ code: "23505" });
    } finally { await client.query("ROLLBACK"); client.release(); }
    await compare(admin);
  });

  it("[MIGFIX-2-UPGRADE] applies 0151 alone as migration owner, preserves rows and privileges, then applies later migrations twice", async () => {
    const names = MIGRATION_URLS.map(nameOf);
    expect(names).toContain(migrationName); expect(names).toEqual([...names].sort());
    const grants = await privileges(), client = await admin.connect();
    try { await client.query("SET ROLE jobguard_migration"); await client.query(sql); }
    finally { await client.query("RESET ROLE"); client.release(); }
    await compare(admin); expect(await privileges()).toEqual(grants);
    await admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [migrationName]);
    await migrate(admin); await migrate(admin);
    await compare(admin);
  });

  it("[MIGFIX-2-UPGRADE-CONTROLS] fails a one-microsecond mutation and a retype using the same comparison", async () => {
    await control("UPDATE app.account SET created_at=created_at+interval '1 microsecond'", true);
    await control("ALTER TABLE app.account ALTER COLUMN name TYPE varchar(201)", true);
  });

  it("[MIGFIX-2-UPGRADE-CONTROLS] permits a later nullable column, function replacement and new row by identity", async () => {
    await control("ALTER TABLE app.ledger_book ADD COLUMN migfix_2_later_note text", false);
    await control("CREATE OR REPLACE FUNCTION app.reject_ledger_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'later immutable routine' USING ERRCODE='55000'; END $$", false);
    await control(`INSERT INTO app.account(id,tenant_id,name) VALUES(gen_random_uuid(),'${tenant}','Later synthetic row')`, false);
  });


});
