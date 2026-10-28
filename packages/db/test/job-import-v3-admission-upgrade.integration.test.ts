import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, expect, it } from "vitest";
import { MIGRATION_URLS, migrate } from "../src/migrate.js";
import { createWorkFixture, closeWorkFixture, seedWorkPractice, type WorkFixture } from "./job-work-state-fixtures.js";
import { installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
import { JobImportV3Repository } from "../src/job-import-v3-repository.js";
import { freshIntent } from "./job-import-v3-fixtures.js";
import { proofBefore, proofDifferences } from "./upgrade-proof-utils.js";
let f: WorkFixture;
beforeAll(async () => { f = await createWorkFixture(false); }, 60000);
afterAll(async () => closeWorkFixture(f));
it("0328 preserves stored invoiced imports, policies, owners and grants on upgrade and repeat", async () => {
 const own = "0328_import_work_admission.sql", index = MIGRATION_URLS.findIndex(u => u.pathname.endsWith(own));
 expect(index).toBeGreaterThan(0);
 await f.admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
 for (const url of MIGRATION_URLS.slice(0, index)) {
  await f.admin.query(await readFile(url, "utf8"));
  await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [url.pathname.split("/").at(-1)]);
 }
 await installLegacySyntheticPartyFixtures(f.admin);
 const practice = await seedWorkPractice(f), repo = new JobImportV3Repository(f.runtime), { auth } = practice;
 const binding = (await f.admin.query("SELECT binding_id FROM app.job_party_current WHERE tenant_id=$1 AND job_id=$2", [auth.context.tenantId, practice.jobId])).rows[0].binding_id;
 const preview = await repo.preview(auth.context, auth.digest, practice.jobId, { version: "job-import-preview.v3", expectedBindingId: binding, fixtureId: "fictional-extension-v3", lifecyclePoint: "invoiced" });
 const input = freshIntent(binding, preview.previewHash, "invoiced");
 const imported = await repo.adopt(auth.context, auth.digest, practice.jobId, input);
 const before = await proofBefore(f.admin, ["app.job", "app.job_import_v3", "app.imported_job_baseline", "app.command_receipt", "app.audit_event"]);
 const sql = "SELECT oid,relowner,relacl::text,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relnamespace='app'::regnamespace AND relkind='r' ORDER BY oid";
 const security = (await f.admin.query(sql)).rows;
 await migrate(f.admin); await migrate(f.admin);
 expect(await proofDifferences(f.admin, before)).toEqual({ rows: [], types: [] });
 expect((await f.admin.query(sql)).rows).toEqual(security);
 expect(await repo.adopt(auth.context, auth.digest, practice.jobId, input)).toEqual(imported);
 expect((await repo.read(auth.context, auth.digest, String(imported.jobId))).meter).toEqual({ countedPlaces: 0, reason: "imported_at_invoiced_stage" });
});
