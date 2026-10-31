import { randomUUID } from "node:crypto";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { projectMeterFixture } from "../src/meter-persistence.js";
import { closeWorkFixture,createWorkFixture,workTenant,type WorkFixture } from "./job-work-state-fixtures.js";
import {meterCompany,meterInput,storeMeter,refreshMeter,readMeter} from "./meter-persistence-fixtures.js";

describe("MON-1B real PostgreSQL synthetic persistence",()=>{
 let f:WorkFixture;beforeAll(async()=>{f=await createWorkFixture()},60000);afterAll(async()=>closeWorkFixture(f));
 it("MON1-A07 MON1-A08 MON1-A21 MON1-A24 projections equal parent fixtures and survive a new connection",async()=>{
  for(const [plan,n,amount] of [["Solo",5,4900],["Solo",6,4900],["Builder",8,8900],["Builder",12,16900]] as const){
   const a=await meterCompany(f),input=meterInput(a.tenantId,n);input.days.forEach(day=>day.plan=plan);
   const source=await storeMeter(f,a,input),id=await refreshMeter(f,a),read=await readMeter(f,a,id);
   expect(read.result).toEqual(projectMeterFixture(a.tenantId,input).result);expect(read.result.principal.pence).toBe(amount);expect(read.sourceId).toBe(source);
   expect((await f.admin.query("SELECT count(*)::int n FROM app.meter_day_ledger WHERE tenant_id=$1 AND computation_id=$2",[a.tenantId,id])).rows[0].n).toBe(30);
   expect(read.sourceHash).toMatch(/^[a-f0-9]{64}$/u);expect(read.resultHash).toMatch(/^[a-f0-9]{64}$/u);
  }
 });
 it("MON1-A08 MON1-A14 MON1-A21 MON1-A22 daily small allowances, 15/30 and 1/31 extras, annual/trial flags match the parent",async()=>{
  for(const scenario of ["half","one31","small4","small7","annual","trial"]){
   const a=await meterCompany(f),input=meterInput(a.tenantId,scenario==="small4"?5:8,scenario==="one31"?"2026-10":"2026-09",scenario==="one31"?31:30);
   if(scenario==="half")input.days.slice(15).forEach(day=>day.jobs=day.jobs.slice(0,7));
   if(scenario==="one31")input.days.slice(1).forEach(day=>day.jobs=day.jobs.slice(0,7));
   if(scenario.startsWith("small"))input.days.forEach(day=>{day.plan=scenario==="small4"?"Solo":"Builder";day.jobs.forEach(job=>job.small=true)});
   if(scenario==="annual")input.days.forEach(day=>day.annualPrepaid=true);
   if(scenario==="trial")input.days.forEach(day=>day.trial=true);
   await storeMeter(f,a,input);const read=await readMeter(f,a,await refreshMeter(f,a,input.startDate));
   expect(read.result).toEqual(projectMeterFixture(a.tenantId,input).result);
   expect(read.result.principal.pence).toBe({half:7900,one31:6965,small4:2900,small7:6900,annual:2000,trial:0}[scenario]);
  }
 });
 it("MON1-A17 MON1-A31 same source replays and concurrent rebuilds have one durable result",async()=>{
  const a=await meterCompany(f),input=meterInput(a.tenantId),source=await storeMeter(f,a,input);
  await storeMeter(f,a,input,source);
  const ids=await Promise.all([refreshMeter(f,a),refreshMeter(f,a)]);expect(ids[0]).toBe(ids[1]);
  await expect(storeMeter(f,a,{...input,environment:"pilot_no_charge"},source)).rejects.toThrow();
  expect((await f.admin.query("SELECT count(*)::int n FROM app.meter_computation WHERE tenant_id=$1",[a.tenantId])).rows[0].n).toBe(1);
 });
 it("MON1-A23 a tampered day cache cannot set principal and raises one durable alert",async()=>{
  const a=await meterCompany(f);await storeMeter(f,a,meterInput(a.tenantId));const id=await refreshMeter(f,a);
  await f.admin.query("ALTER TABLE app.meter_day_ledger DISABLE TRIGGER immutable");
  try {await f.admin.query("UPDATE app.meter_day_ledger SET day=jsonb_set(day,'{countedPlaces}','0') WHERE tenant_id=$1",[a.tenantId]);}
  finally {await f.admin.query("ALTER TABLE app.meter_day_ledger ENABLE TRIGGER immutable");}
  expect(await refreshMeter(f,a)).toBe(id);expect(await refreshMeter(f,a)).toBe(id);
  expect((await readMeter(f,a,id)).result.principal.pence).toBe(8900);
  expect((await f.admin.query("SELECT count(*)::int n FROM app.meter_projection_alert WHERE tenant_id=$1",[a.tenantId])).rows[0].n).toBe(1);
 });
 it("MON1-A25 MON1-A26 late supplied facts preserve closed rows and correct only the next period incrementally",async()=>{
  const a=await meterCompany(f),input=meterInput(a.tenantId,7);await storeMeter(f,a,input);const original=await refreshMeter(f,a);
  const bytes=await f.admin.query("SELECT row_to_json(c)::text bytes FROM app.meter_computation c WHERE tenant_id=$1 AND id=$2",[a.tenantId,original]);
  const extra={tenantId:a.tenantId,jobId:randomUUID(),customerId:randomUUID(),siteId:randomUUID(),small:false};input.days.forEach(day=>day.jobs.push(extra));
  await storeMeter(f,a,input);await refreshMeter(f,a);await refreshMeter(f,a);
  input.days.forEach(day=>day.jobs.pop());await storeMeter(f,a,input);await refreshMeter(f,a);
  expect((await f.admin.query("SELECT delta_pence::int,apply_start::text FROM app.meter_correction WHERE tenant_id=$1 ORDER BY created_at,id",[a.tenantId])).rows).toEqual([{delta_pence:2000,apply_start:"2026-10-01"},{delta_pence:-2000,apply_start:"2026-10-01"}]);
  expect((await f.admin.query("SELECT row_to_json(c)::text bytes FROM app.meter_computation c WHERE tenant_id=$1 AND id=$2",[a.tenantId,original])).rows).toEqual(bytes.rows);
 });
 it("MON1-A23 MON1-A25 a changed baseline cache cannot affect a late correction; a closed next period refuses further correction",async()=>{
  const a=await meterCompany(f),input=meterInput(a.tenantId,7);await storeMeter(f,a,input);const baseline=await refreshMeter(f,a);
  await f.admin.query("ALTER TABLE app.meter_computation DISABLE TRIGGER immutable");
  try{await f.admin.query("UPDATE app.meter_computation SET principal_pence=1 WHERE tenant_id=$1 AND id=$2",[a.tenantId,baseline]);}
  finally{await f.admin.query("ALTER TABLE app.meter_computation ENABLE TRIGGER immutable");}
  input.days.forEach(day=>day.jobs.push({tenantId:a.tenantId,jobId:randomUUID(),customerId:randomUUID(),siteId:randomUUID(),small:false}));
  await storeMeter(f,a,input);await refreshMeter(f,a);
  expect((await f.admin.query("SELECT delta_pence::int FROM app.meter_correction WHERE tenant_id=$1",[a.tenantId])).rows).toEqual([{delta_pence:2000}]);
  expect((await readMeter(f,a,baseline)).alerts).toEqual(["METER_CACHE_MISMATCH"]);
  await storeMeter(f,a,meterInput(a.tenantId,8,"2026-10",31));const next=await refreshMeter(f,a,"2026-10-01");
  expect((await readMeter(f,a,next)).corrections[0].delta.pence).toBe(2000);
  input.days.forEach(day=>day.jobs.pop());await storeMeter(f,a,input);
  await expect(refreshMeter(f,a)).rejects.toThrow("METER_CORRECTION_PERIOD_CLOSED");
  expect((await f.admin.query("SELECT count(*)::int n FROM app.meter_correction WHERE tenant_id=$1",[a.tenantId])).rows[0].n).toBe(1);
 });
 it("MON1-A07 closed historical identity bindings cannot be regrouped retrospectively",async()=>{
  const a=await meterCompany(f),input=meterInput(a.tenantId);await storeMeter(f,a,input);await refreshMeter(f,a);
  const changed={...input,days:input.days.map(day=>({...day,jobs:day.jobs.map(job=>({...job,customerId:randomUUID()}))}))};
  await expect(storeMeter(f,a,changed)).rejects.toThrow("METER_IDENTITY_CORRECTION_REQUIRES_FUTURE_PERIOD");
  expect((await f.admin.query("SELECT count(*)::int n FROM app.meter_input_event WHERE tenant_id=$1",[a.tenantId])).rows[0].n).toBe(1);
 });
 it("MON1-A27 source query paths cannot reach shadow inputs, and no computation creates commercial facts",async()=>{
  const a=await meterCompany(f);
  // Compare actual existing money/send tables, without assuming optional names.
  const present=(await f.admin.query("SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app' AND c.relkind='r' AND (c.relname LIKE '%journal%' OR c.relname LIKE '%obligation%' OR c.relname='action_outbox') ORDER BY relname")).rows.map(row=>row.relname as string);
  expect(present.length).toBeGreaterThan(0);
  const counts=async()=>Promise.all(present.map(async table=>(await f.admin.query(`SELECT count(*)::int n FROM app.${table} WHERE tenant_id=$1`,[a.tenantId])).rows[0].n));
  const before=await counts();await storeMeter(f,a,meterInput(a.tenantId));await refreshMeter(f,a);expect(await counts()).toEqual(before);
  const sources=(await f.admin.query("SELECT prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='app' AND proname LIKE 'mon1_%'")).rows;
  for(const row of sources)expect(row.prosrc).not.toMatch(/\b(?:shadow_[a-z_]+|finding|recovery_[a-z_]+)\b/iu);
 });
 it("MON1-A29 MON1-A30 owner/admin only, expiry, malformed context, shared practice and pooled reuse fail closed",async()=>{
  const a=await meterCompany(f);await storeMeter(f,a,meterInput(a.tenantId));const id=await refreshMeter(f,a);
  for(const role of ["admin","read_only"]){
   await f.admin.query("UPDATE app.membership SET role=$1 WHERE tenant_id=$2 AND id=$3",[role,a.tenantId,a.actorId]);
   if(role==="admin")expect((await readMeter(f,a,id)).computationId).toBe(id);else await expect(readMeter(f,a,id)).rejects.toThrow("METER_FORBIDDEN");
  }
  await f.admin.query("UPDATE app.membership SET role='owner',expires_at=clock_timestamp()-interval '1 second' WHERE tenant_id=$1 AND id=$2",[a.tenantId,a.actorId]);
  await expect(readMeter(f,a,id)).rejects.toThrow("METER_FORBIDDEN");
  await expect(workTenant(f.runtime,"invalid",db=>db.query("SELECT app.mon1_read($1,$2,$3)",[a.tenantId,a.digest,id]))).rejects.toThrow();
  const shared={...a,tenantId:"11111111-1111-4111-8111-111111111111"};await expect(readMeter(f,shared,id)).rejects.toThrow("METER_FORBIDDEN");
  expect((await f.runtime.query("SELECT nullif(current_setting('app.tenant_id',true),'') tenant")).rows[0].tenant).toBeNull();
 });
 it("MON1-A29 MON1-A30 MON1-A33 authority is checked before lookup and before replay",async()=>{
  const a=await meterCompany(f),b=await meterCompany(f);await storeMeter(f,a,meterInput(a.tenantId));const id=await refreshMeter(f,a);
  for(const target of [id,randomUUID()])await expect(readMeter(f,b,target)).rejects.toThrow("METER_FORBIDDEN");
  await f.admin.query("UPDATE identity.session SET revoked_at=clock_timestamp() WHERE id=$1",[a.sessionId]);
  await expect(refreshMeter(f,a)).rejects.toThrow("METER_FORBIDDEN");await expect(readMeter(f,a,id)).rejects.toThrow("METER_FORBIDDEN");
  for(const table of ["meter_input_event","meter_computation","meter_day_ledger","meter_correction","meter_projection_alert"]){
   expect((await workTenant(f.runtime,a.tenantId,db=>db.query(`SELECT * FROM app.${table}`))).rows).toEqual([]);
   await expect(workTenant(f.runtime,a.tenantId,db=>db.query(`DELETE FROM app.${table}`))).rejects.toMatchObject({code:"42501"});
  }
 });
 it("MON1-A28 MON1-A29 meter roles retain safe posture and cannot access shadow data; runtime cannot assume them or load fixture facts",async()=>{
  for(const table of ["meter_input_event","meter_computation","meter_day_ledger","meter_correction","meter_projection_alert"]){
   expect((await f.admin.query("SELECT has_table_privilege('jobguard_runtime',$1,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') allowed",[`app.${table}`])).rows[0].allowed).toBe(false);
   expect((await f.admin.query("SELECT relrowsecurity AND relforcerowsecurity guarded FROM pg_class WHERE oid=$1::regclass",[`app.${table}`])).rows[0].guarded).toBe(true);
  }
  expect((await f.admin.query("SELECT has_function_privilege('jobguard_runtime','app.mon1_store_fixture(uuid,text,uuid,jsonb)','EXECUTE') allowed")).rows[0].allowed).toBe(false);
  const owner=(await f.admin.query("SELECT current_user")).rows[0].current_user;
  for(const role of ["jobguard_meter","jobguard_meter_owner"]){
   expect((await f.admin.query(`SELECT rolcanlogin,rolinherit,rolbypassrls,rolsuper,rolcreatedb,rolcreaterole,rolreplication,
    EXISTS(SELECT 1 FROM pg_auth_members WHERE member=pg_roles.oid) AS member
    FROM pg_roles WHERE rolname=$1`,[role])).rows).toEqual([{rolcanlogin:false,rolinherit:false,rolbypassrls:false,rolsuper:false,rolcreatedb:false,rolcreaterole:false,rolreplication:false,member:false}]);
   // Match bootstrap: PostgreSQL 16 may retain only its creator's ADMIN-only membership, with no INHERIT or SET.
   const holders=(await f.admin.query(`SELECT pg_get_userbyid(m.member) AS member,m.admin_option,m.inherit_option,m.set_option
    FROM pg_auth_members m WHERE m.roleid=(SELECT oid FROM pg_roles WHERE rolname=$1)`,[role])).rows;
   for(const holder of holders)expect(holder).toEqual({member:owner,admin_option:true,inherit_option:false,set_option:false});
   expect((await f.admin.query("SELECT pg_has_role('jobguard_runtime',$1,'USAGE') AS usage,pg_has_role('jobguard_runtime',$1,'SET') AS set",[role])).rows).toEqual([{usage:false,set:false}]);
   expect((await f.admin.query(`SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='app' AND c.relname LIKE 'shadow_%' AND c.relkind IN ('r','p','v','m','f','S')
    AND CASE WHEN c.relkind='S' THEN has_sequence_privilege($1,c.oid,'USAGE,SELECT,UPDATE')
     ELSE has_table_privilege($1,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      OR has_any_column_privilege($1,c.oid,'SELECT,INSERT,UPDATE,REFERENCES') END`,[role])).rows).toEqual([]);
  }
  const shadow=(await f.admin.query("SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app' AND c.relname LIKE 'shadow_%' AND c.relkind='r'")).rows;
  expect(shadow.length).toBeGreaterThan(0);for(const row of shadow)expect((await f.admin.query("SELECT has_table_privilege('jobguard_runtime',$1::oid,'SELECT,INSERT,UPDATE,DELETE') allowed",[row.oid])).rows[0].allowed).toBe(false);
 });

it('SB-17: A cached or mutated count changes a charge', async () => {
 const a=await meterCompany(f), input=meterInput(a.tenantId,7);
 await storeMeter(f,a,input);const id=await refreshMeter(f,a);
 expect((await readMeter(f,a,id)).result.principal.pence).toBe(6900);
 await f.admin.query('ALTER TABLE app.meter_day_ledger DISABLE TRIGGER immutable');
 try { await f.admin.query("UPDATE app.meter_day_ledger SET day=jsonb_set(day,'{countedPlaces}','99') WHERE tenant_id=$1",[a.tenantId]); }
 finally { await f.admin.query('ALTER TABLE app.meter_day_ledger ENABLE TRIGGER immutable'); }
 expect(await refreshMeter(f,a)).toBe(id);
 expect((await readMeter(f,a,id)).result.principal.pence).toBe(6900);
 expect((await f.admin.query('SELECT count(*)::int n FROM app.meter_projection_alert WHERE tenant_id=$1',[a.tenantId])).rows[0].n).toBe(1);
 // A genuine late source change is recorded as a later correction, never an edited bill.
 input.days.forEach(day=>day.jobs.push({tenantId:a.tenantId,jobId:randomUUID(),customerId:randomUUID(),siteId:randomUUID(),small:false}));
 await storeMeter(f,a,input);await refreshMeter(f,a);
 expect((await f.admin.query('SELECT delta_pence::int,apply_start::text FROM app.meter_correction WHERE tenant_id=$1',[a.tenantId])).rows).toEqual([{delta_pence:2000,apply_start:'2026-10-01'}]);
 expect((await readMeter(f,a,id)).result.principal.pence).toBe(6900);
});
});
