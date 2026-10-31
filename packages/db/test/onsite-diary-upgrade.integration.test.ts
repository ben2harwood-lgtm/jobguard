import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, expect, it } from "vitest";
import { MIGRATION_URLS, migrate } from "../src/migrate.js";
import { JobSourceRepository } from "../src/job-source-repository.js";
import { closeWorkFixture, createWorkFixture, seedWorkJob, type WorkFixture } from "./job-work-state-fixtures.js";
import { installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
import { proofBefore, proofDifferences } from "./upgrade-proof-utils.js";
let f: WorkFixture;
beforeAll(async () => { f = await createWorkFixture(false); }, 60000);
afterAll(async () => closeWorkFixture(f));
it("0505 preserves off-site receipts, all predecessor privileges, rows and unrelated routine definitions on upgrade/replay", async () => {
 const name = "0505_onsite_diary_admission.sql", position = MIGRATION_URLS.findIndex(url => url.pathname.endsWith(`/${name}`)); expect(position).toBeGreaterThan(0);
 await f.admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
 for (const url of MIGRATION_URLS.slice(0, position)) {
  await f.admin.query(await readFile(url, "utf8"));
  await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [url.pathname.split("/").at(-1)]);
 }
 await installLegacySyntheticPartyFixtures(f.admin);
 const a = await seedWorkJob(f), repo = new JobSourceRepository(f.admin);
 const input = { version: "job-diary-input.v1", commandId: randomUUID(), entryMode: "typed", onSite: false, text: "Historical fictional note." };
 const saved = await repo.intake(a.context, a.jobId, a.actorId, "diary", input);
 const before = await proofBefore(f.admin, ["app.job", "app.job_diary_entry", "app.job_source_original", "app.evidence_object", "app.command_receipt", "app.audit_event"]);
 const catalogue = async () => ({
  routines: (await f.admin.query("SELECT oid,proname,proowner,proacl::text,prosecdef,proconfig,prosrc FROM pg_proc WHERE pronamespace='app'::regnamespace ORDER BY oid")).rows,
  tables: (await f.admin.query("SELECT oid,relacl::text,relowner,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relnamespace='app'::regnamespace AND relkind='r' ORDER BY oid")).rows,
  policies: (await f.admin.query("SELECT * FROM pg_policies WHERE schemaname='app' ORDER BY tablename,policyname")).rows,
 });
 const prior = await catalogue();
 // Prove 0505's own exact catalogue delta before later LP migrations add their
 // separately asserted owner, registry, grants and completion machinery.
 for (let repeat = 0; repeat < 2; repeat++) {
  if (!(await f.admin.query("SELECT 1 FROM public.jobguard_schema_migration WHERE migration_name=$1", [name])).rowCount) {
   await f.admin.query(await readFile(MIGRATION_URLS[position]!, "utf8"));
   await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [name]);
  }
 }
 expect(await proofDifferences(f.admin, before)).toEqual({ rows: [], types: [] });
 const after = await catalogue(); expect(after.tables).toEqual(prior.tables); expect(after.policies).toEqual(prior.policies);
 expect(after.routines).toHaveLength(prior.routines.length);
 const changed = ["sv7a_intake_job_source", "ch4_capture_site_source", "ch4_receipt_integrity"];
 for (let i = 0; i < after.routines.length; i++) {
  const was = prior.routines[i]!, now = after.routines[i]!;
  if (changed.includes(now.proname)) { expect(now.prosrc).not.toBe(was.prosrc); expect({ ...now, prosrc: was.prosrc }).toEqual(was); }
  else expect(now).toEqual(was);
 }
 // Compare the same complete migration set across replay, including later objects.
 await migrate(f.admin);
 expect(await proofDifferences(f.admin, before)).toEqual({ rows: [], types: [] });
 const upgradedCatalogue = await catalogue();
 const upgradedRows = await proofBefore(f.admin, Object.keys(before));
 await migrate(f.admin);
 expect(await proofDifferences(f.admin, upgradedRows)).toEqual({ rows: [], types: [] });
 expect(await catalogue()).toEqual(upgradedCatalogue);
 expect(await repo.intake(a.context, a.jobId, a.actorId, "diary", input)).toEqual(saved);
 expect((await f.admin.query("SELECT count(*)::int n FROM public.jobguard_schema_migration WHERE migration_name=$1", [name])).rows[0].n).toBe(1);
 // The successor installs above preserve the old receipt; 0536 keeps
 // 0505's admission while taking over checked completion.
 expect(await proofDifferences(f.admin, before)).toEqual({ rows: [], types: [] });
 expect(await repo.intake(a.context, a.jobId, a.actorId, "diary", input)).toEqual(saved);
 expect((await f.admin.query("SELECT count(*)::int n FROM app.command_lifecycle_claim WHERE command_id=$1", [input.commandId])).rows[0].n).toBe(0);
});
