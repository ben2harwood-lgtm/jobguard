// Rule 9: proves 0310 alone, then later migrations twice. Real PostgreSQL required.
import { readFile } from "node:fs/promises";
import { afterAll,beforeAll,expect,it } from "vitest";
import { MIGRATION_URLS,migrate } from "../src/migrate.js";
import { createLockFixture,closeLockFixture,seedAccount } from "./recovery-attribution-fixture.js";
import { proofBefore,proofColumns,proofDifferences,rolledBack,scratchReplaceFunction } from "./upgrade-proof-utils.js";
import { installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
const own="0310_money_trail_reconciliation.sql";
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
it("[MT-19] adds only the exact new availability routine, preserving populated predecessors",async()=>{
 const pos=MIGRATION_URLS.findIndex(u=>u.pathname.endsWith('/'+own));expect(pos).toBeGreaterThan(0);
 await f.admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
 for(const url of MIGRATION_URLS.slice(0,pos)){await f.admin.query(await readFile(url,"utf8"));await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)",[url.pathname.split('/').at(-1)]);}
 await installLegacySyntheticPartyFixtures(f.admin);const p=await seedAccount(f.admin);
 const named=async()=>(await f.admin.query("SELECT j.tenant_id,j.id,j.title,j.status,j.practice_session_digest,q.id quote_id,q.content_hash,q.net_value_pence FROM app.job j JOIN app.quote_version q ON(q.tenant_id,q.job_id)=(j.tenant_id,j.id) WHERE j.tenant_id=$1 AND j.id=$2",[p.tenantId,p.jobId])).rows;
 const values=await named(),before=await catalogue();
 const oldTables=(await f.admin.query(`SELECT schemaname,tablename,
 EXISTS(SELECT 1 FROM pg_index i WHERE i.indrelid=format('%I.%I',schemaname,tablename)::regclass AND i.indisprimary) has_pk
 FROM pg_tables WHERE schemaname IN('app','identity','control_plane','audit_control') ORDER BY 1,2`)).rows;
 const proof=await proofBefore(f.admin,oldTables.filter(r=>r.has_pk).map(r=>`${r.schemaname}.${r.tablename}`));
 const ident=(name:string)=>`"${name.replaceAll('"','""')}"`;
 // Keyless tables need a multiset of full rows: do not collapse duplicate rows into a keyed object.
 const fullRows=async(table:string,names:string[])=>(await f.admin.query(`SELECT row_to_json(s)::text bytes FROM
 (SELECT ${names.map(ident).join(',')} FROM ${table.split('.').map(ident).join('.')}) s`)).rows.map(r=>r.bytes as string);
 const keyless:{table:string;columns:Awaited<ReturnType<typeof proofColumns>>;rows:string[]}[]=[];
 for(const r of oldTables.filter(r=>!r.has_pk)){
  const table=`${r.schemaname}.${r.tablename}`,columns=await proofColumns(f.admin,table);
  keyless.push({table,columns,rows:await fullRows(table,columns.map(c=>c.name))});
 }
 const compareKeyless=async()=>{
  for(const was of keyless){
   const columns=await proofColumns(f.admin,was.table);
   expect(columns.filter(c=>was.columns.some(old=>old.name===c.name)),was.table).toEqual(was.columns);
   const live=await fullRows(was.table,was.columns.map(c=>c.name));
   // Later migrations may add rows/columns; each original full row, including duplicates, must survive.
   for(const row of was.rows){const index=live.indexOf(row);expect(index,`${was.table}: missing or changed row`).toBeGreaterThanOrEqual(0);live.splice(index,1);}
  }
 };
 const subject=await proofBefore(f.admin,['app.job']);
 await rolledBack(f.admin,async db=>{await db.query("UPDATE app.job SET title='control mutation' WHERE id=$1",[p.jobId]);expect((await proofDifferences(db,subject)).rows.some(x=>x.endsWith(': changed'))).toBe(true);});
 // A standalone populated row provides deletion/type/added-column controls without disabling domain FKs.
 await f.admin.query("CREATE TABLE public.mt_upgrade_control(id integer PRIMARY KEY,value integer); INSERT INTO public.mt_upgrade_control VALUES(1,2)");
 const control=await proofBefore(f.admin,['public.mt_upgrade_control']);
 await rolledBack(f.admin,async db=>{await db.query('DELETE FROM public.mt_upgrade_control');expect((await proofDifferences(db,control)).rows).toHaveLength(1);});
 await rolledBack(f.admin,async db=>{await db.query('ALTER TABLE public.mt_upgrade_control ALTER COLUMN value TYPE bigint');expect((await proofDifferences(db,control)).types).toHaveLength(1);});
 await rolledBack(f.admin,async db=>{await db.query('ALTER TABLE public.mt_upgrade_control ADD COLUMN permitted text');await db.query('INSERT INTO public.mt_upgrade_control(id,value) VALUES(2,3)');expect(await scratchReplaceFunction(db,'app.read_success_fee_v3(uuid,text)')).toBe(true);expect(await proofDifferences(db,control)).toEqual({rows:[],types:[]});expect(await proofDifferences(db,subject)).toEqual({rows:[],types:[]});});
 expect(await proofDifferences(f.admin,control)).toEqual({rows:[],types:[]});await f.admin.query('DROP TABLE public.mt_upgrade_control');
 await f.admin.query(await readFile(MIGRATION_URLS[pos]!,"utf8"));await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)",[own]);
 const after=await catalogue();expect(after.relations).toEqual(before.relations);expect(after.policies).toEqual(before.policies);
 const added=after.routines.filter(r=>!before.routines.some(b=>b.nspname===r.nspname&&b.proname===r.proname&&b.args===r.args));
 expect(added.map(r=>[r.nspname,r.proname,r.args])).toEqual([
  ['app','read_money_trail_availability','p_job uuid, p_session text'],
 ]);
 expect(after.routines.filter(r=>!added.includes(r))).toEqual(before.routines);expect(await named()).toEqual(values);expect(await proofDifferences(f.admin,proof)).toEqual({rows:[],types:[]});await compareKeyless();
 for(let n=0;n<2;n++){await migrate(f.admin);expect(await named()).toEqual(values);expect(await proofDifferences(f.admin,proof)).toEqual({rows:[],types:[]});await compareKeyless();}
 expect((await f.admin.query("SELECT count(*)::int n FROM public.jobguard_schema_migration WHERE migration_name=$1",[own])).rows).toEqual([{n:1}]);
},120000);
