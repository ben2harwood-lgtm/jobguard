// Rule 9: proves 0218 alone, then later migrations twice. Real PostgreSQL required.
import { readFile } from "node:fs/promises";
import { afterAll,beforeAll,expect,it } from "vitest";
import { MIGRATION_URLS,migrate } from "../src/migrate.js";
import { createLockFixture,closeLockFixture,seedAccount } from "./recovery-attribution-fixture.js";
import { proofBefore,proofDifferences } from "./upgrade-proof-utils.js";
import { installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
const own="0218_success_fee_v3.sql";
let f:Awaited<ReturnType<typeof createLockFixture>>;
beforeAll(async()=>{f=await createLockFixture(false);},120000);
afterAll(async()=>{if(f)await closeLockFixture(f);});
async function catalogue(){
 return {
  relations:(await f.admin.query("SELECT n.nspname,c.relname,c.relowner,c.relacl,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('app','identity','control_plane','audit_control') ORDER BY 1,2")).rows,
  routines:(await f.admin.query("SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args,pg_get_functiondef(p.oid) definition,p.proowner,p.proacl,p.prosecdef,p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('app','identity','control_plane','audit_control') AND p.prokind='f' ORDER BY 1,2,3")).rows,
  policies:(await f.admin.query("SELECT * FROM pg_policies WHERE schemaname IN('app','identity','control_plane','audit_control') ORDER BY schemaname,tablename,policyname")).rows,
 };
}
it("SF-23 adds only the exact new routine overloads, preserving populated predecessors",async()=>{
 const pos=MIGRATION_URLS.findIndex(u=>u.pathname.endsWith('/'+own));expect(pos).toBeGreaterThan(0);
 await f.admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
 for(const url of MIGRATION_URLS.slice(0,pos)){await f.admin.query(await readFile(url,"utf8"));await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)",[url.pathname.split('/').at(-1)]);}
 await installLegacySyntheticPartyFixtures(f.admin);const p=await seedAccount(f.admin);
 const named=async()=>(await f.admin.query("SELECT j.tenant_id,j.id,j.title,j.status,j.practice_session_digest,q.id quote_id,q.content_hash,q.net_value_pence FROM app.job j JOIN app.quote_version q ON(q.tenant_id,q.job_id)=(j.tenant_id,j.id) WHERE j.tenant_id=$1 AND j.id=$2",[p.tenantId,p.jobId])).rows;
 const values=await named(),before=await catalogue();
 const oldTables=(await f.admin.query("SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN('app','identity','control_plane','audit_control') ORDER BY 1,2")).rows.map(r=>`${r.schemaname}.${r.tablename}`);
 const proof=await proofBefore(f.admin,oldTables);
 await f.admin.query(await readFile(MIGRATION_URLS[pos]!,"utf8"));await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)",[own]);
 const after=await catalogue();expect(after.relations).toEqual(before.relations);expect(after.policies).toEqual(before.policies);
 const added=after.routines.filter(r=>!before.routines.some(b=>b.nspname===r.nspname&&b.proname===r.proname&&b.args===r.args));
 expect(added.map(r=>[r.nspname,r.proname,r.args])).toEqual([
  ['app','read_success_fee_v3','p_job uuid, p_session text'],
  ['app','write_success_fee_v3','p_job uuid, p_session text, p_command jsonb, p_artifact jsonb'],
 ]);
 expect(after.routines.filter(r=>!added.includes(r))).toEqual(before.routines);expect(await named()).toEqual(values);expect(await proofDifferences(f.admin,proof)).toEqual({rows:[],types:[]});
 for(let n=0;n<2;n++){await migrate(f.admin);expect(await named()).toEqual(values);expect(await proofDifferences(f.admin,proof)).toEqual({rows:[],types:[]});}
 expect((await f.admin.query("SELECT count(*)::int n FROM public.jobguard_schema_migration WHERE migration_name=$1",[own])).rows).toEqual([{n:1}]);
},120000);
