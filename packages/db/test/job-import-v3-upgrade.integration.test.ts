import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MIGRATION_URLS, migrate } from "../src/migrate.js";
import { createWorkFixture, closeWorkFixture, seedWorkJob, type WorkFixture } from "./job-work-state-fixtures.js";
import { installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
import { proofBefore, proofDifferences, rolledBack } from "./upgrade-proof-utils.js";

const signature = "app.adopt_in_flight_job_v3(uuid,uuid,text,uuid,uuid,jsonb)";
describe("CH5-P own 0323 upgrade, no adoption persistence claimed — CI only", () => {
  let f: WorkFixture;
  beforeAll(async () => { f = await createWorkFixture(false); }, 60000);
  afterAll(async () => { await closeWorkFixture(f); });
  it("applies alone after actual predecessor, preserves rows/types/security and permits successors twice", async () => {
    const own = "0323_job_import_v3.sql", index = MIGRATION_URLS.findIndex(u => u.pathname.endsWith(own));
    expect(index).toBeGreaterThan(0);
    // Assert the actual predecessor under current main rather than the obsolete build-ahead base.
    expect(MIGRATION_URLS[index - 1]?.pathname.split("/").at(-1)).toBe("0303_job_source_intake.sql");
    await f.admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
    for (const url of MIGRATION_URLS.slice(0, index)) {
      await f.admin.query(await readFile(url, "utf8"));
      await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [url.pathname.split("/").at(-1)]);
    }
    await installLegacySyntheticPartyFixtures(f.admin);
    const job = await seedWorkJob(f);
    const before = await proofBefore(f.admin, ["app.account", "app.membership", "app.job", "app.scope_identity"]);
    for (const table of Object.values(before)) expect(Object.keys(table.rows).length).toBeGreaterThan(0);
    const catalogSql = "SELECT oid,relacl::text,relowner,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relnamespace='app'::regnamespace AND relkind='r' ORDER BY oid";
    const policySql = "SELECT schemaname,tablename,policyname,permissive,roles::text[],cmd,qual,with_check FROM pg_policies WHERE schemaname='app' ORDER BY tablename,policyname";
    const catalog = (await f.admin.query(catalogSql)).rows, policies = (await f.admin.query(policySql)).rows;
    const oldFunctions = (await f.admin.query("SELECT oid,pg_get_functiondef(oid) definition FROM pg_proc WHERE pronamespace='app'::regnamespace AND prokind='f' ORDER BY oid")).rows;
    await f.admin.query(await readFile(MIGRATION_URLS[index]!, "utf8"));
    await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [own]);
    expect(await proofDifferences(f.admin, before)).toEqual({ rows: [], types: [] });
    expect((await f.admin.query(catalogSql)).rows).toEqual(catalog);
    expect((await f.admin.query(policySql)).rows).toEqual(policies);
    for (const row of oldFunctions) expect((await f.admin.query("SELECT pg_get_functiondef($1::oid) definition", [row.oid])).rows[0].definition).toBe(row.definition);
    const def = (await f.admin.query("SELECT pg_get_functiondef($1::regprocedure) definition", [signature])).rows[0].definition as string;
    expect(def).toContain("METER_PLACE_SOURCE_HANDOFF_HELD");
    expect(def).not.toMatch(/INSERT|UPDATE|DELETE|TRUNCATE|pg_advisory_xact_lock/u);
    await migrate(f.admin); await migrate(f.admin);
    expect(await proofDifferences(f.admin, before)).toEqual({ rows: [], types: [] });
    // Removing the unconditional guard must make the actual behavioral assertion fail.
    await rolledBack(f.admin, async db => {
      const broken = def.replace(/RAISE EXCEPTION 'METER_PLACE_SOURCE_HANDOFF_HELD' USING ERRCODE='55000';/u, "RETURN '{}'::jsonb;");
      expect(broken).not.toBe(def); await db.query(broken);
      await expect((async () => { await expect(db.query("SELECT app.adopt_in_flight_job_v3($1,$2,$3,$4,$5,$6)", [job.tenantId, job.jobId, "a".repeat(64), randomUUID(), randomUUID(), {}])).rejects.toThrow("METER_PLACE_SOURCE_HANDOFF_HELD"); })()).rejects.toThrow();
    });
    await expect(f.admin.query("SELECT app.adopt_in_flight_job_v3($1,$2,$3,$4,$5,$6)", [job.tenantId, job.jobId, "a".repeat(64), randomUUID(), randomUUID(), {}])).rejects.toThrow("METER_PLACE_SOURCE_HANDOFF_HELD");
    await rolledBack(f.admin, async db => {
      await db.query("SET LOCAL session_replication_role='replica'");
      await db.query("UPDATE app.job SET created_at=created_at+interval '1 microsecond' WHERE tenant_id=$1", [job.tenantId]);
      expect(await proofDifferences(db, before)).not.toEqual({ rows: [], types: [] });
    });
    expect(await proofDifferences(f.admin, before)).toEqual({ rows: [], types: [] });
  });
});
