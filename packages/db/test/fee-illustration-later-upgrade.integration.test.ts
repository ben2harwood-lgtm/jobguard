import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, expect, it } from "vitest";
import { DEMO_TENANT_ID, MIGRATION_URLS, migrate } from "../src/index.js";
import { createWorkFixture, closeWorkFixture, seedWorkPractice, workTenant, type WorkFixture } from "./job-work-state-fixtures.js";
import { proofBefore, proofDifferences, rolledBack, scratchReplaceFunction } from "./upgrade-proof-utils.js";

/* An upgrade proof proves ITS OWN migration only: install everything before N, snapshot, apply N alone, compare; then apply everything after N and require success twice. Compare existing rows by named pre-existing columns after all migrations. Never assert that later migrations add no column or replace no function; the fingerprinted-table guard owns 'may never gain a column'. */
let f: WorkFixture;
const previousEnvironment = process.env.JOBGUARD_ENV;
beforeAll(async () => { process.env.JOBGUARD_ENV = "synthetic_demo"; f = await createWorkFixture(false, "jobguard_synthetic_demo"); }, 120000);
afterAll(async () => {
  if (previousEnvironment === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV = previousEnvironment;
  await closeWorkFixture(f);
});

it("L101 upgrade preserves populated illustration identities, named values, full types and permissions; later migrations twice; comparator controls", async () => {
  const n = MIGRATION_URLS.findIndex(url => url.pathname.endsWith("_fee_illustration_replay.sql"));
  expect(n).toBeGreaterThan(0);
  await f.admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
  for (const url of MIGRATION_URLS.slice(0, n)) {
    await f.admin.query(await readFile(url, "utf8"));
    await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [url.pathname.split("/").at(-1)]);
  }
  const owner = await seedWorkPractice(f), commandId = randomUUID();
  await workTenant(f.admin, DEMO_TENANT_ID, db => db.query("SELECT app.create_fee_illustration_source($1,$2)", [owner.jobId, commandId]));
  const before = await proofBefore(f.admin, ["app.fee_illustration_source", "app.job", "app.membership"]);
  for (const [table, snapshot] of Object.entries(before)) expect(Object.keys(snapshot.rows).length, `${table}: pre-existing rows`).toBeGreaterThan(0);
  const permissions = async () => ({
    tables: (await f.admin.query("SELECT oid::text,relacl::text,relowner,relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid IN ('app.fee_illustration_source'::regclass,'app.job'::regclass,'app.membership'::regclass) ORDER BY oid")).rows,
    routine: (await f.admin.query("SELECT proacl::text,proowner,prosecdef,proconfig FROM pg_proc WHERE oid='app.create_fee_illustration_source(uuid,uuid)'::regprocedure")).rows,
    policies: (await f.admin.query("SELECT * FROM pg_policies WHERE schemaname='app' AND tablename='fee_illustration_source' ORDER BY policyname")).rows,
  });
  const priorPermissions = await permissions();
  const db = await f.admin.connect();
  try {
    await db.query("SET ROLE jobguard_migration");
    await db.query(await readFile(MIGRATION_URLS[n]!, "utf8"));
  } finally { await db.query("RESET ROLE"); db.release(); }
  await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [MIGRATION_URLS[n]!.pathname.split("/").at(-1)]);
  expect(await proofDifferences(f.admin, before)).toEqual({ rows: [], types: [] });
  expect(await permissions()).toEqual(priorPermissions);
  await migrate(f.admin); await migrate(f.admin);
  expect(await proofDifferences(f.admin, before)).toEqual({ rows: [], types: [] });
  // The pre-upgrade command replays with the same persisted source IDs and timestamp.
  await workTenant(f.admin, DEMO_TENANT_ID, db => db.query("SELECT app.create_fee_illustration_source($1,$2)", [owner.jobId, commandId]));
  expect(await proofDifferences(f.admin, before)).toEqual({ rows: [], types: [] });
  await rolledBack(f.admin, async db => {
    await db.query("SET LOCAL session_replication_role='replica'");
    await db.query("UPDATE app.fee_illustration_source SET created_at=created_at+interval '1 microsecond'");
    expect((await proofDifferences(db, before)).rows.length).toBeGreaterThan(0);
  });
  await rolledBack(f.admin, async db => {
    await db.query("ALTER TABLE app.fee_illustration_source ALTER COLUMN source_version TYPE text");
    expect((await proofDifferences(db, before)).types.length).toBeGreaterThan(0);
  });
  await rolledBack(f.admin, async db => {
    await db.query("ALTER TABLE app.fee_illustration_source ADD COLUMN b18_later_nullable text");
    expect(await scratchReplaceFunction(db, "app.create_fee_illustration_source(uuid,uuid)")).toBe(true);
    expect(await proofDifferences(db, before)).toEqual({ rows: [], types: [] });
    await db.query("INSERT INTO app.job(tenant_id,id,title) VALUES($1,$2,'Fictional later row')", [DEMO_TENANT_ID, randomUUID()]);
    expect(await proofDifferences(db, before)).toEqual({ rows: [], types: [] });
  });
}, 120000);
