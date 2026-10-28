import { finalizeMeterLifecycleOwnership } from "../src/demo-bootstrap.js";
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll,beforeAll,describe,expect,it } from 'vitest';
import { MIGRATION_URLS,migrate } from '../src/migrate.js';
import { createWorkFixture,closeWorkFixture,seedWorkJob,type WorkFixture } from './job-work-state-fixtures.js';
import { installLegacySyntheticPartyFixtures } from './pool-test-utils.js';
import { proofBefore,proofDifferences,rolledBack } from './upgrade-proof-utils.js';
describe('MON1-S own-0239 predecessor upgrade, CI PostgreSQL only',()=>{
 let f:WorkFixture;beforeAll(async()=>{f=await createWorkFixture(false)},60000);afterAll(async()=>closeWorkFixture(f));
 it('M1S-10 installs after 0208, preserves populated old rows/ACL/policies and runs successors twice',async()=>{
  const own='0239_meter_lifecycle_source.sql',n=MIGRATION_URLS.findIndex(url=>url.pathname.endsWith(own));
  expect(n).toBeGreaterThan(0);expect(MIGRATION_URLS.slice(0,n).some(url=>url.pathname.endsWith("0208_meter_small_trip.sql"))).toBe(true);
  await f.admin.query('CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())');
  for(const url of MIGRATION_URLS.slice(0,n)){
   await f.admin.query(await readFile(url,'utf8'));
   await f.admin.query('INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)',[url.pathname.split('/').at(-1)]);
  }
  await installLegacySyntheticPartyFixtures(f.admin);const a=await seedWorkJob(f);
  const before=await proofBefore(f.admin,['app.account','app.membership','app.job','app.scope_identity','app.job_party_binding']);
  for(const table of Object.values(before))expect(Object.keys(table.rows).length).toBeGreaterThan(0);
  const acl=(await f.admin.query("SELECT oid,ARRAY(SELECT a::text FROM unnest(coalesce(relacl, acldefault('r', relowner))) a WHERE a::text NOT LIKE 'jobguard_meter_owner=%')::text AS relacl FROM pg_class WHERE relnamespace='app'::regnamespace AND relkind='r' ORDER BY oid")).rows;
  const policies=(await f.admin.query("SELECT schemaname,tablename,policyname,permissive,roles::text[],cmd,qual,with_check FROM pg_policies WHERE schemaname='app' ORDER BY tablename,policyname")).rows;
  await f.admin.query(await readFile(MIGRATION_URLS[n]!,'utf8'));
  await f.admin.query('INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)',[own]);
  expect((await f.admin.query("SELECT pg_get_userbyid(proowner) owner,prosecdef FROM pg_proc WHERE pronamespace='app'::regnamespace AND proname LIKE 'mon1_lifecycle_%'")).rows).toEqual(Array.from({length:4},()=>({owner:'jobguard_migration',prosecdef:false})));
  expect(await proofDifferences(f.admin,before)).toEqual({rows:[],types:[]});
  expect((await f.admin.query("SELECT oid,ARRAY(SELECT a::text FROM unnest(coalesce(relacl, acldefault('r', relowner))) a WHERE a::text NOT LIKE 'jobguard_meter_owner=%')::text AS relacl FROM pg_class WHERE oid=ANY($1::oid[]) ORDER BY oid",[acl.map(row=>row.oid)])).rows).toEqual(acl);
  expect((await f.admin.query("SELECT schemaname,tablename,policyname,permissive,roles::text[],cmd,qual,with_check FROM pg_policies WHERE schemaname='app' AND policyname<>'meter_lifecycle_source_read' AND tablename=ANY($1::text[]) ORDER BY tablename,policyname",[[...new Set(policies.map(row=>row.tablename))]])).rows).toEqual(policies);
  await f.admin.query("INSERT INTO app.meter_lifecycle_scope(tenant_id,id,kind) VALUES($1,$2,'normal_company')",[a.tenantId,randomUUID()]);
  const added=await proofBefore(f.admin,['app.meter_lifecycle_scope']);
  await migrate(f.admin);await migrate(f.admin);
  const bootstrap=await f.admin.connect();try{await finalizeMeterLifecycleOwnership(bootstrap)}finally{bootstrap.release()}
  expect(await proofDifferences(f.admin,before)).toEqual({rows:[],types:[]});expect(await proofDifferences(f.admin,added)).toEqual({rows:[],types:[]});
  await rolledBack(f.admin,async db=>{
   await db.query("SET LOCAL session_replication_role='replica'");
   await db.query("UPDATE app.job SET created_at=created_at+interval '1 microsecond' WHERE tenant_id=$1",[a.tenantId]);
   expect(await proofDifferences(db,before)).not.toEqual({rows:[],types:[]});
  });
 });
 it('M1S-10 migrates a second database in the same cluster with the meter role already present',async()=>{
  const name=`mon1s_${randomUUID().replaceAll('-','')}`;
  await f.admin.query(`CREATE DATABASE ${name}`);
  const second=new Pool({...f.admin.options,password:f.admin.options.password,database:name});
  try {
   await migrate(second);
   const bootstrap=await second.connect();try{await finalizeMeterLifecycleOwnership(bootstrap)}finally{bootstrap.release()}
   await migrate(second);
   expect((await second.query('SELECT count(*)::int n FROM public.jobguard_schema_migration')).rows[0].n).toBe(MIGRATION_URLS.length);
   expect((await second.query("SELECT pg_get_userbyid(proowner) owner,prosecdef,proconfig FROM pg_proc WHERE oid='app.mon1_lifecycle_capture(uuid,text,uuid,date,integer)'::regprocedure")).rows).toEqual([
    {owner:'jobguard_meter_owner',prosecdef:true,proconfig:['search_path=pg_catalog']}
   ]);
  } finally { await second.end(); }
 },60000);

});
