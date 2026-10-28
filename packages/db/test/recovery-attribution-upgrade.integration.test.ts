// Real PostgreSQL upgrade proof. Must run in reviewer/CI; no SQLite/mock substitute.
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, expect, it } from "vitest";
import { migrate, MIGRATION_URLS } from "../src/migrate.js";
import { createLockFixture, closeLockFixture, seedAccount, type LockFixture } from "./recovery-attribution-fixture.js";
import { installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
const own="0268_recovery_attribution.sql";
const tables=["recovery_attribution_revision","recovery_attribution_command","recovery_attribution_reassessment"];
const indexes=["recovery_attribution_revision_pkey","ra_revision_subject_revision","ra_revision_subject_id","recovery_attribution_command_pkey","recovery_attribution_reassessment_pkey"];
const routines=["recovery_attribution_immutable","append_recovery_attribution","assess_recovery_attribution"];
let f:LockFixture;
let historical:{tenantId:string;jobId:string};
async function namedOldValues(client: Pick<LockFixture['admin'],'query'>,tenantId:string,jobId:string){
 return (await client.query(`SELECT j.id,j.title,j.status,q.id quote_id,q.content_hash,q.net_value_pence,
 (SELECT jsonb_agg(jsonb_build_object('id',a.id,'name',a.name) ORDER BY a.id) FROM app.account a WHERE a.tenant_id=j.tenant_id) accounts
 FROM app.job j JOIN app.quote_version q ON(q.tenant_id,q.job_id)=(j.tenant_id,j.id) WHERE j.tenant_id=$1 AND j.id=$2`,[tenantId,jobId])).rows;
}
async function security(){
 return (await f.admin.query(`SELECT c.relname,pg_get_userbyid(c.relowner) owner,c.relrowsecurity,c.relforcerowsecurity,
 has_table_privilege('jobguard_runtime',c.oid,'SELECT') can_read,
 has_table_privilege('jobguard_runtime',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') can_write
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app' AND c.relname=ANY($1) ORDER BY c.relname`,[tables])).rows;
}
beforeAll(async()=>{f=await createLockFixture(false);},90000);
afterAll(async()=>{if(f)await closeLockFixture(f);});
const ident=(s:string)=>`"${s.replaceAll('"','""')}"`;
async function snapshot(){
 const names=(await f.admin.query("SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN('app','identity','control_plane','audit_control') ORDER BY 1,2")).rows;
 const rows:Record<string,unknown>={};
 for(const n of names) rows[`${n.schemaname}.${n.tablename}`]=(await f.admin.query(`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]') data FROM ${ident(n.schemaname)}.${ident(n.tablename)} t`)).rows[0].data;
 return {rows,
 relations:(await f.admin.query("SELECT n.nspname,c.relname,pg_get_userbyid(c.relowner) owner,c.relacl,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('app','identity','control_plane','audit_control') ORDER BY 1,2")).rows,
 routines:(await f.admin.query("SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args,pg_get_functiondef(p.oid) definition,pg_get_userbyid(p.proowner) owner,p.proacl,p.prosecdef,p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('app','identity','control_plane','audit_control') AND p.prokind='f' ORDER BY 1,2,3")).rows,
 policies:(await f.admin.query("SELECT * FROM pg_policies WHERE schemaname IN('app','identity','control_plane','audit_control') ORDER BY schemaname,tablename,policyname")).rows};
}
it("SV6-27 migration proves its own step and preserves preceding data",async()=>{
 const pos=MIGRATION_URLS.findIndex(u=>u.pathname.endsWith('/'+own));expect(pos).toBeGreaterThan(0);
 await f.admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
 for(const u of MIGRATION_URLS.slice(0,pos)){
  await f.admin.query(await readFile(u,"utf8"));
  await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)",[u.pathname.split('/').at(-1)]);
 }
 await installLegacySyntheticPartyFixtures(f.admin);
 const p=await seedAccount(f.admin);historical=p;
 const before=await snapshot();
 await f.admin.query(await readFile(MIGRATION_URLS[pos]!,"utf8"));
 await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)",[own]);
 const after=await snapshot();
 expect(Object.keys(after.rows).filter(k=>!(k in before.rows)).sort()).toEqual(tables.map(t=>'app.'+t).sort());
 for(const [name,rows] of Object.entries(before.rows))expect(after.rows[name]).toEqual(rows);
 expect(after.relations.filter(r=>!before.relations.some(b=>b.nspname===r.nspname&&b.relname===r.relname)).map(r=>r.nspname+'.'+r.relname).sort()).toEqual([...tables,...indexes].map(t=>'app.'+t).sort());
 expect(after.routines.filter(r=>!before.routines.some(b=>b.nspname===r.nspname&&b.proname===r.proname&&b.args===r.args)).map(r=>r.nspname+'.'+r.proname).sort()).toEqual(routines.map(t=>'app.'+t).sort());
 expect(after.relations.filter(r=>!(r.nspname==='app'&&[...tables,...indexes].includes(r.relname)))).toEqual(before.relations);
 expect(after.routines.filter(r=>!(r.nspname==='app'&&routines.includes(r.proname)))).toEqual(before.routines);
 expect(after.policies.filter(r=>!(r.schemaname==='app'&&tables.includes(r.tablename)))).toEqual(before.policies);
 expect(after.policies.filter(r=>r.schemaname==='app'&&tables.includes(r.tablename)).map(r=>[r.tablename,r.policyname]).sort()).toEqual(tables.flatMap(t=>[[t,'tenant_isolation'],[t,'attribution_read']]).sort());
 // Later migrations may extend old row shapes/routines. Freeze named old values, not later schemas.
 const named=()=>namedOldValues(f.admin,p.tenantId,p.jobId);
 const old=await named();
 // Prove immutability immediately after N alone, before later-schema allowances.
 for(const table of tables)for(const statement of [`UPDATE app.${table} SET tenant_id=tenant_id WHERE false`,`DELETE FROM app.${table} WHERE false`,`TRUNCATE app.${table} CASCADE`])await expect(f.admin.query(statement)).rejects.toThrow("IMMUTABLE");
 const expectedSecurity=tables.toSorted().map(relname=>({relname,owner:"jobguard_migration",relrowsecurity:true,relforcerowsecurity:true,can_read:true,can_write:false}));
 expect(await security()).toEqual(expectedSecurity);
 await migrate(f.admin);expect(await named()).toEqual(old);expect(await security()).toEqual(expectedSecurity);
 await migrate(f.admin);expect(await named()).toEqual(old);expect(await security()).toEqual(expectedSecurity);
 expect((await f.admin.query("SELECT count(*)::int n FROM public.jobguard_schema_migration WHERE migration_name=$1",[own])).rows).toEqual([{n:1}]);
},120000);
it("SV6-28 upgrade proof controls distinguish additions from corruption",async()=>{
 // Separate rollback probes exercise the old-row comparator without altering committed fixture values.
 const before=await snapshot();const db=await f.admin.connect();
 try{
  await db.query("BEGIN");
  await db.query("ALTER TABLE app.account ADD COLUMN sv6_later_probe text");
  const baseline=await namedOldValues(db,historical.tenantId,historical.jobId);
  // Same named-value projection used by SV6-27 after later migrations.
  await db.query("ALTER TABLE app.job ADD COLUMN sv6_later_job_probe text");
  expect(await namedOldValues(db,historical.tenantId,historical.jobId)).toEqual(baseline);
  await db.query("UPDATE app.account SET name=$1 WHERE tenant_id=$2",['corruption:'+randomUUID(),historical.tenantId]);
  expect(await namedOldValues(db,historical.tenantId,historical.jobId)).not.toEqual(baseline);
 }finally{await db.query("ROLLBACK");db.release();}
 expect(await snapshot()).toEqual(before);
});
