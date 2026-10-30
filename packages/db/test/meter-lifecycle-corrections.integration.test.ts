import { finalizeMeterLifecycleOwnership } from "../src/demo-bootstrap.js";
import { randomUUID } from 'node:crypto';
import { afterAll,beforeAll,describe,expect,it } from 'vitest';
import { closeWorkFixture,createWorkFixture,workTenant,type WorkFixture } from './job-work-state-fixtures.js';
import { meterCompany } from './meter-persistence-fixtures.js';
describe('MON1-S correction hold, CI PostgreSQL only',()=>{
 let f:WorkFixture;beforeAll(async()=>{f=await createWorkFixture();const admin=await f.admin.connect();try{await finalizeMeterLifecycleOwnership(admin)}finally{admin.release()}},60000);afterAll(async()=>closeWorkFixture(f));
 it('M1S-05 held clock cannot produce a correction, money or refund through the meter role',async()=>{
  const columns=(await f.admin.query("SELECT column_name FROM information_schema.columns WHERE table_schema='app' AND table_name='meter_lifecycle_correction' ORDER BY ordinal_position")).rows.map(row=>row.column_name);
  expect(columns).toEqual(['tenant_id','scope_id','source_id','baseline_source_id','hold']);
  expect((await f.admin.query("SELECT has_table_privilege('jobguard_meter','app.meter_lifecycle_correction','INSERT,UPDATE,DELETE,TRUNCATE') writable")).rows[0].writable).toBe(false);
  const a=await meterCompany(f);
  await expect(workTenant(f.runtime,a.tenantId,db=>db.query("INSERT INTO app.meter_lifecycle_correction(tenant_id,scope_id,source_id,baseline_source_id,hold) VALUES($1,$2,$3,$4,'H-METER-CLOCK')",[a.tenantId,randomUUID(),randomUUID(),randomUUID()]))).rejects.toThrow('permission denied');
  expect((await f.admin.query('SELECT count(*)::int n FROM app.meter_lifecycle_correction')).rows[0].n).toBe(0);
 });
 it('M1S-06 source snapshots/closed-binding reservations are append-only; no mutator grants',async()=>{
  for(const table of ['meter_lifecycle_source','meter_lifecycle_source_ref','meter_lifecycle_computation','meter_lifecycle_place_binding']){
   expect((await f.admin.query("SELECT has_table_privilege('jobguard_meter',$1,'UPDATE,DELETE,TRUNCATE') writable",[`app.${table}`])).rows[0].writable).toBe(false);
   expect((await f.admin.query("SELECT count(*)::int n FROM pg_trigger WHERE tgrelid=$1::regclass AND tgname='immutable' AND NOT tgisinternal",[`app.${table}`])).rows[0].n).toBe(1);
  }
 });
});
