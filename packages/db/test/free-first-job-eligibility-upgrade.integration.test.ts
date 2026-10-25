import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MIGRATION_URLS, migrate } from "../src/migrate.js";
import { createWorkFixture, closeWorkFixture, meterCompany, verifyBusiness, requestCard, recordCard, resultFixture, type WorkFixture } from "./free-first-job-admission-fixtures.js";
import { keyParent, snapshot, store } from "./free-first-job-keys-fixtures.js";
import { installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
import { proofBefore, proofDifferences, rolledBack, scratchReplaceFunction } from "./upgrade-proof-utils.js";
const own = "0236_free_first_job_eligibility.sql";
// Include original ACL/owner/definition state; successors may add routines, but
// an own-step read migration must not alter any predecessor grant or routine.
const catalogue = async (f: WorkFixture) => (await f.admin.query(`SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args,p.proowner,p.proacl,p.prosecdef,p.proconfig,pg_get_functiondef(p.oid) definition
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('app','identity','control_plane','audit_control') ORDER BY 1,2,3`)).rows;
describe("MON-3C ELIG-11 own-step additive upgrade", () => {
 let f: WorkFixture;
 beforeAll(async () => { f = await createWorkFixture(false); }, 60000);
 afterAll(async () => closeWorkFixture(f));
 it("preserves populated predecessor values/types/identities and grants; detects damage; permits additive successors", async () => {
  const index = MIGRATION_URLS.findIndex(url => url.pathname.endsWith(own)); expect(index).toBeGreaterThan(0);
  await f.admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
  for (const url of MIGRATION_URLS.slice(0, index)) {
   await f.admin.query(await readFile(url, "utf8"));
   await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [url.pathname.split("/").at(-1)]);
  }
  await installLegacySyntheticPartyFixtures(f.admin);
  const parent = await keyParent(f); await store(f, snapshot(parent));
  const a = await meterCompany(f); await verifyBusiness(f, a);
  const attempt = await requestCard(f, a); await recordCard(f, a, resultFixture(attempt.attemptId));
  const before = await proofBefore(f.admin, ["app.account", "app.membership", "app.job", "app.job_activation", "app.trial_identity_snapshot", "app.trial_identity_key_claim", "app.trial_business_verification", "app.trial_card_attempt", "app.trial_card_result", "app.command_receipt", "app.audit_event"]);
  for (const proof of Object.values(before)) expect(Object.keys(proof.rows).length).toBeGreaterThan(0);
  const prior = await catalogue(f);
  await f.admin.query(await readFile(MIGRATION_URLS[index]!, "utf8"));
  await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [own]);
  expect(await proofDifferences(f.admin, before)).toEqual({ rows: [], types: [] });
  const after = await catalogue(f);
  expect(after.filter(row => !(row.nspname === "app" && row.proname === "mon3_read_eligibility"))).toEqual(prior);
  expect(after.filter(row => row.nspname === "app" && row.proname === "mon3_read_eligibility")).toHaveLength(1);
  await migrate(f.admin); await migrate(f.admin);
  expect(await proofDifferences(f.admin, before)).toEqual({ rows: [], types: [] });
  for (const sql of ["UPDATE app.trial_business_verification SET verified_at=verified_at+interval '1 microsecond'", "ALTER TABLE app.trial_business_verification ALTER COLUMN verified_at TYPE timestamp", "DELETE FROM app.trial_card_result"]) {
   await rolledBack(f.admin, async db => { await db.query("SET LOCAL session_replication_role='replica'"); await db.query(sql); expect(await proofDifferences(db, before)).not.toEqual({ rows: [], types: [] }); });
  }
  await rolledBack(f.admin, async db => { await db.query("ALTER TABLE app.job ADD COLUMN mon3elig_future text"); expect(await proofDifferences(db, before)).toEqual({ rows: [], types: [] }); });
  await rolledBack(f.admin, async db => { await db.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Later fictional insertion')",[randomUUID(),a.tenantId]); expect(await proofDifferences(db,before)).toEqual({rows:[],types:[]}); });
  await rolledBack(f.admin, async db => { await db.query("GRANT EXECUTE ON FUNCTION app.mon3_owner(uuid,text) TO jobguard_infrastructure"); const changed=(await db.query("SELECT proacl FROM pg_proc WHERE oid='app.mon3_owner(uuid,text)'::regprocedure")).rows[0].proacl; expect(changed).not.toEqual(prior.find(row=>row.nspname==='app'&&row.proname==='mon3_owner')!.proacl); });
  await rolledBack(f.admin, async db => { expect(await scratchReplaceFunction(db, "app.mon3_read_eligibility(uuid,text,uuid)")).toBe(true); expect(await proofDifferences(db, before)).toEqual({ rows: [], types: [] }); });
  await rolledBack(f.admin, async db => { await db.query("GRANT EXECUTE ON FUNCTION app.mon3_read_eligibility(uuid,text,uuid) TO jobguard_infrastructure"); const allowed=(await db.query("SELECT has_function_privilege('jobguard_infrastructure','app.mon3_read_eligibility(uuid,text,uuid)','EXECUTE') allowed")).rows[0].allowed;expect(()=>expect(allowed).toBe(false)).toThrow(); });
 });
});
