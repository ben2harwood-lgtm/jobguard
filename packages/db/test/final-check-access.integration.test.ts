import {afterAll,beforeAll,expect,it} from "vitest";
import {randomUUID} from "node:crypto";
import {createFinalCheckFixture,closeFinalCheckFixture,seedFinalCheckJob,availableFinalCheck,finalCheckTenant,type FinalCheckFixture} from "./final-check-fixture.js";
import {FinalCheckRepository} from "../src/final-check-repository.js";
let f:FinalCheckFixture;beforeAll(async()=>{f=await createFinalCheckFixture()},60000);afterAll(async()=>closeFinalCheckFixture(f));
const tables=['final_check_disposition_binding','final_check_manifest','final_check_manifest_source','final_check_reveal_proof','final_check_run_binding','final_check_source_attempt'];
it("SV5-23 actual catalogs prove ownership, FORCE RLS, qualified FKs and no runtime table/DML grants",async()=>{
 const rows=(await f.admin.query("SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner) owner,has_table_privilege('jobguard_runtime',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') runtime FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app' AND c.relname=ANY($1::text[]) ORDER BY c.relname",[tables])).rows;
 expect(rows).toHaveLength(tables.length);for(const row of rows)expect(row).toMatchObject({relrowsecurity:true,relforcerowsecurity:true,owner:'jobguard_migration',runtime:false});
 for(const table of tables){await expect(f.runtime.query(`SELECT * FROM app.${table}`)).rejects.toMatchObject({code:'42501'});}
 const grants=(await f.admin.query("SELECT p.proname,has_function_privilege('jobguard_runtime',p.oid,'EXECUTE') runtime,has_function_privilege('jobguard_shadow',p.oid,'EXECUTE') shadow FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='app' AND p.proname IN('begin_final_check','read_final_check_manifest','record_final_check_source_result','complete_final_check','read_final_check_reveal','record_final_check_disposition','read_final_check_disputes')")).rows;
 expect(grants).toHaveLength(7);for(const g of grants){const builder=['read_final_check_reveal','record_final_check_disposition','read_final_check_disputes'].includes(g.proname);expect(g.runtime).toBe(builder);expect(g.shadow).toBe(!builder);}
 const fks=(await f.admin.query("SELECT c.conname,ref.relname referenced,array(SELECT a.attname FROM unnest(c.conkey) WITH ORDINALITY k(num,ord) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.num ORDER BY k.ord) names FROM pg_constraint c JOIN pg_class owner ON owner.oid=c.conrelid JOIN pg_class ref ON ref.oid=c.confrelid WHERE c.contype='f' AND owner.relname=ANY($1::text[])",[tables])).rows;expect(fks.length).toBeGreaterThan(0);for(const fk of fks){expect(fk.names).toContain('tenant_id');if(!['audit_event','command_receipt','membership'].includes(fk.referenced))expect(fk.names).toContain('job_id');}
});
it("SV5-21 replay rechecks revocation/expiry and wrong session identity; SV5-22 unknown/foreign job refuses uniformly",async()=>{
 const a=await seedFinalCheckJob(f),r=await availableFinalCheck(f,a),repo=new FinalCheckRepository(f.runtime);await repo.disposition(a.context,a.jobId,a.digest,r.body);
 for(const job of [randomUUID(),a.jobId])await expect(repo.read(a.context,job,'b'.repeat(64))).rejects.toThrow('FINAL_CHECK_FORBIDDEN');
 await f.admin.query('UPDATE control_plane.practice_session SET revoked_at=clock_timestamp() WHERE token_digest=$1',[a.digest]);
 await expect(repo.disposition(a.context,a.jobId,a.digest,r.body)).rejects.toThrow('FINAL_CHECK_FORBIDDEN');
});
it("SV5-22 missing/malformed tenant fails closed and pooled transactions lose context",async()=>{
 await expect(f.shadow.query('SELECT app.read_final_check_manifest($1,$2,$3)',[randomUUID(),randomUUID(),randomUUID()])).rejects.toThrow('FINAL_CHECK_FORBIDDEN');
 await expect(finalCheckTenant(f.shadow,randomUUID(),async db=>{await db.query("SELECT set_config('app.tenant_id','invalid',true)");return db.query('SELECT app.begin_final_check($1,$2,$3,$4)',[randomUUID(),randomUUID(),'synthetic.v1','final-check.reconciliation.v1']);})).rejects.toThrow('FINAL_CHECK_FORBIDDEN');
 expect((await f.shadow.query("SELECT nullif(current_setting('app.tenant_id',true),'') context")).rows[0].context).toBeNull();
});
it("SV5-24 before lock zero/many signals yield identical controlled response",async()=>{
 const a=await seedFinalCheckJob(f),repo=new FinalCheckRepository(f.runtime),before=await repo.read(a.context,a.jobId,a.digest);
 await finalCheckTenant(f.shadow,a.tenantId,db=>db.query("INSERT INTO app.shadow_commercial_signal(tenant_id,job_id,id,work_id,signal_type,detector_kind,detector_version,evidence_cutoff_at,description,confidence_band) VALUES($1,$2,$3,$4,'possible_extra','deterministic','synthetic.v1',clock_timestamp(),'Synthetic hidden extra','low')",[a.tenantId,a.jobId,randomUUID(),randomUUID()]));
 expect(await repo.read(a.context,a.jobId,a.digest)).toEqual(before);expect(before).toEqual({state:'unlocked',items:[]});
});
it("SV5-22 own source integrity validator refuses an after-cutoff or same-tenant wrong-job source",async()=>{
 const a=await seedFinalCheckJob(f);await a.lock();const m=await new FinalCheckRepository(f.shadow).begin(a.context,a.jobId);
 await expect(finalCheckTenant(f.admin,a.tenantId,db=>db.query("INSERT INTO app.final_check_manifest_source(tenant_id,job_id,manifest_id,id,source_kind,source_ref,source_received_at,adapter_version,input_hash,processable,frozen_input) VALUES($1,$2,$3,$4,'pending_upload',$4,clock_timestamp()+interval '1 day','synthetic-observation.v1',$5,false,'{}')",[a.tenantId,a.jobId,m.id,randomUUID(),'a'.repeat(64)]))).rejects.toThrow('FINAL_CHECK_SOURCE_CHANGED');
});
it("SV5-24 before-lock disposition refuses before any hidden signal/proof lookup",async()=>{
 const a=await seedFinalCheckJob(f),id=randomUUID();await expect(new FinalCheckRepository(f.runtime).disposition(a.context,a.jobId,a.digest,{version:'final-check.disposition.v1',commandId:id,lockId:id,runId:id,signalId:id,expectedSignalRevision:0,answer:'not_completed',referenceId:null})).rejects.toThrow('FINAL_ACCOUNT_LOCK_REQUIRED');
});
it("SV5-21 expired session cannot execute or replay a disposition",async()=>{
 const a=await seedFinalCheckJob(f),r=await availableFinalCheck(f,a);await f.admin.query("UPDATE control_plane.practice_session SET expires_at=clock_timestamp()-interval '1 microsecond' WHERE token_digest=$1",[a.digest]);await expect(new FinalCheckRepository(f.runtime).disposition(a.context,a.jobId,a.digest,r.body)).rejects.toThrow('FINAL_CHECK_FORBIDDEN');
});
it("SV5-24 real builder requests preserve identical runtime statement sequence with zero/many pre-lock signals",async()=>{
 const {FinalCheckApplication}=await import('../../../apps/api/src/final-check.application.js');const {readFile}=await import('node:fs/promises');const a=await seedFinalCheckJob(f);
 process.env.JOBGUARD_ENV='synthetic_demo';const app=new FinalCheckApplication(f.runtime,a.sessionId);
 async function read(){const start=f.logs.length,out=[await app.get(a.jobId),await app.disputes(a.jobId)];await new Promise<void>(resolve=>setTimeout(resolve,25));const statements=f.logs.slice(start).filter(s=>s.includes(`SV5:${f.runtime.options.user}:`)&&/(?:statement|execute [^:]+):/u.test(s)).map(s=>s.replace(/^.*?(?:statement|execute [^:]+):/su,''));expect(statements.length).toBeGreaterThan(0);expect(statements.join('\n')).not.toMatch(/\bshadow_commercial_signal\b|\bshadow_signal_\w+\b/u);return {out,statements};}
 const zero=await read();await finalCheckTenant(f.shadow,a.tenantId,db=>db.query("INSERT INTO app.shadow_commercial_signal(tenant_id,job_id,id,work_id,signal_type,detector_kind,detector_version,evidence_cutoff_at,description,confidence_band) VALUES($1,$2,$3,$4,'possible_extra','deterministic','synthetic.v1',clock_timestamp(),'Synthetic hidden proposal','low')",[a.tenantId,a.jobId,randomUUID(),randomUUID()]));expect(await read()).toEqual(zero);
 // Inspect this piece's own routine branch as well: server log_statement shows outer calls, not nested PL/pgSQL reads.
 const sql=await readFile(new URL('../migrations/0145_final_check.sql',import.meta.url),'utf8'),routine=sql.slice(sql.indexOf('CREATE FUNCTION app.read_final_check_reveal'),sql.indexOf('CREATE FUNCTION app.record_final_check_disposition'));
 expect(routine.indexOf("IF NOT FOUND THEN RETURN jsonb_build_object('state','unlocked'")).toBeLessThan(routine.indexOf('app.shadow_commercial_signal'));
});
