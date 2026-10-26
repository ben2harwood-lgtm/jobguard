import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { MIGRATION_URLS,migrate } from "../src/migrate.js";
import { createWorkFixture,closeWorkFixture,keyParent,snapshot,store,type WorkFixture } from "./free-first-job-keys-fixtures.js";
import { installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
import { proofBefore,proofDifferences,rolledBack,scratchReplaceFunction } from "./upgrade-proof-utils.js";
import { meterCompany,verifyBusiness,requestCard,recordCard,resultFixture } from "./free-first-job-admission-fixtures.js";
const own='0240_free_first_job_admission.sql';
describe("MON3 B UPGRADE-01 own migration only",()=>{
 let f:WorkFixture;beforeAll(async()=>{f=await createWorkFixture(false);},60000);afterAll(async()=>closeWorkFixture(f));
 it("preserves populated named columns/types/PK identities and tolerates later additive work",async()=>{
  const n=MIGRATION_URLS.findIndex(url=>url.pathname.endsWith(own));expect(n).toBeGreaterThan(0);
  await f.admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
  for(const url of MIGRATION_URLS.slice(0,n)){await f.admin.query(await readFile(url,'utf8'));await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)",[url.pathname.split('/').at(-1)]);}
  await installLegacySyntheticPartyFixtures(f.admin);const parent=await keyParent(f);await store(f,snapshot(parent));
  const before=await proofBefore(f.admin,['app.account','app.membership','app.job','app.job_activation','app.trial_identity_snapshot','app.trial_identity_key_claim']);
  for(const value of Object.values(before))expect(Object.keys(value.rows).length).toBeGreaterThan(0);
  await f.admin.query(await readFile(MIGRATION_URLS[n]!,'utf8'));await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)",[own]);
  expect(await proofDifferences(f.admin,before)).toEqual({rows:[],types:[]});
  const company=await meterCompany(f);await verifyBusiness(f,company);const attempt=await requestCard(f,company);await recordCard(f,company,resultFixture(attempt.attemptId));
  const ownRows=await proofBefore(f.admin,['app.trial_business_verification','app.trial_card_attempt','app.trial_card_result']);
  for(const value of Object.values(ownRows))expect(Object.keys(value.rows).length).toBeGreaterThan(0);
  await migrate(f.admin);await migrate(f.admin);
  expect(await proofDifferences(f.admin,ownRows)).toEqual({rows:[],types:[]});
  expect(await proofDifferences(f.admin,before)).toEqual({rows:[],types:[]});
  for(const sql of ["UPDATE app.trial_identity_snapshot SET verified_at=verified_at+interval '1 microsecond'","ALTER TABLE app.trial_identity_snapshot ALTER COLUMN verified_at TYPE timestamp"]){
   await rolledBack(f.admin,async db=>{await db.query("SET LOCAL session_replication_role='replica'");await db.query(sql);expect(await proofDifferences(db,before)).not.toEqual({rows:[],types:[]});});
  }
  await rolledBack(f.admin,async db=>{await db.query("ALTER TABLE app.job ADD COLUMN mon3pb_future text");expect(await proofDifferences(db,before)).toEqual({rows:[],types:[]});});
  await rolledBack(f.admin,async db=>{expect(await scratchReplaceFunction(db,'app.mon3_admit(uuid,text,uuid,jsonb)')).toBe(true);expect(await proofDifferences(db,before)).toEqual({rows:[],types:[]});});
  await rolledBack(f.admin,async db=>{await db.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Fictional later insertion')",[randomUUID(),parent.tenantId]);expect(await proofDifferences(db,before)).toEqual({rows:[],types:[]});});
 });
});
