import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, expect, it } from "vitest";
import { JobImportV3Repository } from "../src/job-import-v3-repository.js";
import { MIGRATION_URLS, migrate } from "../src/migrate.js";
import { createWorkFixture, closeWorkFixture, seedWorkPractice, type WorkFixture } from "./job-work-state-fixtures.js";
import { installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
import { freshIntent } from "./job-import-v3-fixtures.js";
import { proofBefore, proofDifferences } from "./upgrade-proof-utils.js";

let f: WorkFixture;
beforeAll(async () => { f = await createWorkFixture(false); }, 60000);
afterAll(async () => { await closeWorkFixture(f); });
it("CH-5 0566 preserves imported receipts, exclusion identities, replay and writer privileges on upgrade", async () => {
  const index = MIGRATION_URLS.findIndex(url => url.pathname.endsWith("0532_job_import_v3_original_source.sql"));
  expect(index).toBeGreaterThan(0);
  await f.admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
  for (const url of MIGRATION_URLS.slice(0, index)) {
    await f.admin.query(await readFile(url, "utf8"));
    await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [url.pathname.split("/").at(-1)]);
  }
  await installLegacySyntheticPartyFixtures(f.admin);
  const source = await seedWorkPractice(f), { auth } = source, repo = new JobImportV3Repository(f.runtime);
  const binding = (await f.admin.query("SELECT binding_id FROM app.job_party_current WHERE tenant_id=$1 AND job_id=$2",
    [auth.context.tenantId, source.jobId])).rows[0].binding_id;
  const p = await repo.preview(auth.context, auth.digest, source.jobId, { version: "job-import-preview.v3",
    expectedBindingId: binding, fixtureId: "fictional-extension-v3", lifecyclePoint: "invoiced" });
  const input = freshIntent(binding, p.previewHash, "invoiced");
  const result = await repo.adopt(auth.context, auth.digest, source.jobId, input);
  const before = await proofBefore(f.admin, ["app.job", "app.job_import_v3", "app.command_receipt", "app.audit_event"]);
  const signature = "app.adopt_invoiced_job_v3(uuid,uuid,text,uuid,uuid,jsonb,text)";
  const posture = async () => (await f.admin.query(`SELECT pg_get_userbyid(proowner) owner,prosecdef,proconfig,proacl::text
    FROM pg_proc WHERE oid=$1::regprocedure`, [signature])).rows[0];
  const previousPosture = await posture();
  await migrate(f.admin); await migrate(f.admin);
  expect(await proofDifferences(f.admin, before)).toEqual({ rows: [], types: [] });
  expect(await posture()).toEqual(previousPosture);
  expect(await repo.adopt(auth.context, auth.digest, source.jobId, input)).toEqual(result);
  expect((await repo.read(auth.context, auth.digest, String(result.jobId))).result).toEqual(result);
});
