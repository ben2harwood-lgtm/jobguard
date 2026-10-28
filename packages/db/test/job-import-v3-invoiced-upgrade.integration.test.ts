import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, expect, it } from "vitest";
import { MIGRATION_URLS, migrate } from "../src/migrate.js";
import { createWorkFixture, closeWorkFixture, seedWorkPractice, workTenant, type WorkFixture } from "./job-work-state-fixtures.js";
import { installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
import { proofBefore, proofDifferences } from "./upgrade-proof-utils.js";

let f: WorkFixture;
beforeAll(async () => { f = await createWorkFixture(false); }, 60000);
afterAll(async () => { await closeWorkFixture(f); });
it("CH-5 0324 preserves existing job rows and v1 baseline fields, then repeats migrate safely", async () => {
  const index = MIGRATION_URLS.findIndex(url => url.pathname.endsWith("0324_job_import_v3_invoiced.sql"));
  expect(index).toBeGreaterThan(0);
  await f.admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
  for (const url of MIGRATION_URLS.slice(0, index)) {
    await f.admin.query(await readFile(url, "utf8"));
    await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [url.pathname.split("/").at(-1)]);
  }
  await installLegacySyntheticPartyFixtures(f.admin);
  const practice = await seedWorkPractice(f);
  // 0109 already permits capped imported v3 rows. An additive writer must not
  // invalidate those historical rows or the recovery terms/review fixtures.
  const legacyV3 = randomUUID();
  await workTenant(f.admin, practice.auth.context.tenantId, async db => {
    await db.query("SELECT set_config('app.import_command','enabled',true)");
    await db.query(`INSERT INTO app.job(id,tenant_id,title,status,provenance,accepted_net_value_pence,fee_policy_version,recovery_cap_pence)
      VALUES($1,$2,'Fictional historical capped v3 import','live','imported',100000,'reference_fee_policy_v3',1500)`, [legacyV3, practice.auth.context.tenantId]);
  });
  const before = await proofBefore(f.admin, ["app.job", "app.imported_job_baseline", "app.job_party_binding", "app.command_receipt"]);
  await migrate(f.admin); await migrate(f.admin);
  expect(await proofDifferences(f.admin, before)).toEqual({ rows: [], types: [] });
  // The new cap-free shape remains restricted to invoiced jobs; historical
  // cap compatibility must not make a live cap-free imported baseline valid.
  await expect(f.admin.query("UPDATE app.job SET recovery_cap_pence=NULL WHERE id=$1", [legacyV3])).rejects.toThrow("job_baseline_shape");
  expect(await proofDifferences(f.admin, before)).toEqual({ rows: [], types: [] });
  const posture = (await f.admin.query(`SELECT relrowsecurity,relforcerowsecurity,
    has_table_privilege('jobguard_runtime',oid,'SELECT') readable,
    has_table_privilege('jobguard_runtime',oid,'INSERT') insertable,
    has_table_privilege('jobguard_runtime',oid,'UPDATE') writable,
    has_table_privilege('jobguard_runtime',oid,'DELETE') deletable
    FROM pg_class WHERE oid='app.job_import_v3'::regclass`)).rows[0];
  expect(posture).toEqual({ relrowsecurity: true, relforcerowsecurity: true, readable: true, insertable: false, writable: false, deletable: false });
});
