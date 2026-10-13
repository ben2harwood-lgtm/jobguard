import {readFile} from "node:fs/promises";
import {randomUUID} from "node:crypto";
import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {migrate,MIGRATION_URLS} from "../src/migrate.js";
import {proofBefore,proofDifferences,rolledBack,scratchReplaceFunction} from "./upgrade-proof-utils.js";
import {seedEvidencePackFixture} from "./evidence-pack-fixture.js";
import {installLegacySyntheticPartyFixtures} from "./pool-test-utils.js";
import {createWorkFixture,closeWorkFixture,type WorkFixture} from "./job-work-state-fixtures.js";
/* An upgrade proof proves ITS OWN migration only: install everything before N, snapshot, apply N alone, compare; then apply everything after N and require success twice. Compare existing rows by named pre-existing columns after all migrations. Never assert that later migrations add no column or replace no function; the fingerprinted-table guard owns 'may never gain a column'. */
describe("SV-7A own-step migration proof",()=>{
 let f:WorkFixture;beforeAll(async()=>{f=await createWorkFixture(false)},60000);afterAll(async()=>closeWorkFixture(f));
 it("SV7A-25 preserves named earlier rows/full types/identities/grants; later migrations twice; comparator controls",async()=>{
  const n=MIGRATION_URLS.findIndex(u=>u.pathname.endsWith("0149_job_sources.sql"));expect(n).toBeGreaterThan(0);
  await f.admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
  for(const url of MIGRATION_URLS.slice(0,n)){await f.admin.query(await readFile(url,"utf8"));await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)",[url.pathname.split("/").at(-1)])}
  await installLegacySyntheticPartyFixtures(f.admin);const seeded=await seedEvidencePackFixture(f.admin,{withVariation:true});
  // Add receipt/audit fixtures through the existing real terms command before the snapshot.
  await f.admin.query("SELECT set_config('app.tenant_id',$1,false)",[seeded.tenantId]);
  await f.admin.query("SELECT app.accept_final_check_terms($1,$2,$3,$4)",[seeded.tenantId,seeded.memberId,randomUUID(),"synthetic_final_check_terms.v1"]);
  const tables=["app.job","app.quote_document_version","app.quote_acceptance","app.evidence_object","app.supplier_document","app.customer_invoice","app.command_receipt","app.audit_event"];
  const before=await proofBefore(f.admin,tables);for(const [table,s]of Object.entries(before))expect(Object.keys(s.rows).length,`${table}: pre-existing rows`).toBeGreaterThan(0);
  const acl=async()=>(await f.admin.query("SELECT oid::text,relacl::text FROM pg_class WHERE relnamespace='app'::regnamespace ORDER BY oid")).rows;
  const routines=async()=>(await f.admin.query("SELECT oid::text,proacl::text,pg_get_functiondef(oid) definition FROM pg_proc WHERE pronamespace='app'::regnamespace ORDER BY oid")).rows;
  const permissions=await acl(),routineBefore=await routines();
  await f.admin.query(await readFile(MIGRATION_URLS[n]!,"utf8"));await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES('0149_job_sources.sql')");
  expect(await proofDifferences(f.admin,before)).toEqual({rows:[],types:[]});expect((await acl()).filter(r=>permissions.some(p=>p.oid===r.oid))).toEqual(permissions);expect((await routines()).filter(r=>routineBefore.some(p=>p.oid===r.oid))).toEqual(routineBefore);
  await migrate(f.admin);await migrate(f.admin);expect(await proofDifferences(f.admin,before)).toEqual({rows:[],types:[]});
  await rolledBack(f.admin,async db=>{await db.query("SET LOCAL session_replication_role='replica'");await db.query("UPDATE app.evidence_object SET server_received_at=server_received_at+interval '1 microsecond'");expect((await proofDifferences(db,before)).rows.length).toBeGreaterThan(0)});
  await rolledBack(f.admin,async db=>{await db.query("ALTER TABLE app.job ALTER COLUMN title TYPE text");expect((await proofDifferences(db,before)).types.length).toBeGreaterThan(0)});
  await rolledBack(f.admin,async db=>{await db.query("ALTER TABLE app.job ADD COLUMN sv7a_later_nullable text");await scratchReplaceFunction(db,"app.read_job_sources(uuid,uuid,text,text)");expect(await proofDifferences(db,before)).toEqual({rows:[],types:[]});await db.query("INSERT INTO app.job(id,tenant_id,title) VALUES($1,$2,'Fictional later row')",[randomUUID(),seeded.tenantId]);expect(await proofDifferences(db,before)).toEqual({rows:[],types:[]})});
 });
});
