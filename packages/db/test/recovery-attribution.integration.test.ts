// PostgreSQL only. Private synthetic storage tests; not upstream source/command acceptance.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { attributionPredicates, recoveryAttributionRevisionV1 } from "@jobguard/core";
import { createLockFixture, closeLockFixture, asFixtureTenant, storedAttributionFixture, LOCK_OWNER, type LockFixture } from "./recovery-attribution-fixture.js";
let f: LockFixture;
beforeAll(async()=>{f=await createLockFixture();},90000);
afterAll(async()=>{if(f)await closeLockFixture(f);});
const tables = ["recovery_attribution_revision","recovery_attribution_command","recovery_attribution_reassessment"];

it("private storage preserves every true and false conjunct and immutable first result",async()=>{
 const {p,document,command}=await storedAttributionFixture(f);
 const append=async(d:unknown,c:unknown,cause:string|null=null,source:string|null=null)=>asFixtureTenant(f.owner,p.tenantId,db=>db.query("SELECT app.append_recovery_attribution($1,$2,$3,$4,$5) result",[d,LOCK_OWNER,c,cause,source]));
 const first=(await append(document,command)).rows[0].result;
 const changed=structuredClone(document) as any;
 changed.assessmentId=randomUUID();changed.revision=2;changed.previousAssessmentId=document.assessmentId;
 changed.facts.revisionId=changed.assessmentId;
 changed.facts.facts.evidence_received_before_lock.holds=false;
 changed.assessmentOutcome="excluded";changed.reasonCodes=["evidence_invalidated"];
 recoveryAttributionRevisionV1.parse(changed);
 await append(changed,null,"evidence_invalidated","synthetic:invalidation");
 expect((await append(document,command)).rows[0].result).toEqual(first);
 const rows=await asFixtureTenant(f.owner,p.tenantId,db=>db.query("SELECT document FROM app.recovery_attribution_revision WHERE tenant_id=$1 AND case_id=$2 ORDER BY revision",[p.tenantId,p.caseId]));
 expect(rows.rows.map(r=>r.document.facts.facts.evidence_received_before_lock.holds)).toEqual([true,false]);
 expect(rows.rows[0].document).toEqual(document);
 await expect(append(document,{...command,expectedCaseRevision:2})).rejects.toThrow("IDEMPOTENCY_CONFLICT");
 await expect(append({...changed,assessmentId:randomUUID()},null,"source_changed","synthetic:source")).rejects.toThrow("STALE");
});
it("SV6-21 runtime cannot bypass the checked attribution writer",async()=>{
 const rows=(await f.admin.query(`SELECT c.relname,pg_get_userbyid(c.relowner) owner,c.relrowsecurity,c.relforcerowsecurity,
 has_table_privilege('jobguard_runtime',c.oid,'SELECT') can_read,
 has_table_privilege('jobguard_runtime',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') can_write
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app' AND c.relname=ANY($1) ORDER BY c.relname`,[tables])).rows;
 expect(rows).toEqual([...tables].sort().map(relname=>({relname,owner:"jobguard_migration",relrowsecurity:true,relforcerowsecurity:true,can_read:true,can_write:false})));
 expect((await f.admin.query(`SELECT has_function_privilege('jobguard_runtime','app.append_recovery_attribution(jsonb,uuid,jsonb,text,text)','EXECUTE') private,
 has_function_privilege('jobguard_runtime','app.assess_recovery_attribution(uuid,text,jsonb)','EXECUTE') entry`)).rows).toEqual([{private:false,entry:true}]);
 for(const table of tables)for(const sql of [`INSERT INTO app.${table} DEFAULT VALUES`,`UPDATE app.${table} SET tenant_id=tenant_id`,`DELETE FROM app.${table}`,`TRUNCATE app.${table}`]) await expect(f.runtime.query(sql)).rejects.toThrow(/permission denied/u);
 await expect(f.runtime.query("SET ROLE jobguard_migration")).rejects.toThrow(/permission denied/u);
 await expect(f.runtime.query("SELECT app.append_recovery_attribution('{}',null,null,null,null)")).rejects.toThrow(/permission denied/u);
 await expect(f.runtime.query("SELECT app.assess_recovery_attribution($1,'forged',$2)",[randomUUID(),{tenantId:randomUUID(),fee:8000}])).rejects.toThrow("DEPENDENCY_BOUND");
});
it("storage mutation controls reject owner changes and detect removal of each immutability trigger",async()=>{
 const {p,document,command}=await storedAttributionFixture(f);
 await asFixtureTenant(f.owner,p.tenantId,db=>db.query("SELECT app.append_recovery_attribution($1,$2,$3,null,null)",[document,LOCK_OWNER,command]));
 for(const table of tables){
  for(const sql of [`UPDATE app.${table} SET tenant_id=tenant_id`,`DELETE FROM app.${table}`,`TRUNCATE app.${table} CASCADE`]) await expect(asFixtureTenant(f.owner,p.tenantId,db=>db.query(sql))).rejects.toThrow("IMMUTABLE");
  const db=await f.admin.connect();
  try{await db.query("BEGIN");await db.query(`ALTER TABLE app.${table} DISABLE TRIGGER attribution_immutable`);await expect(db.query(`DELETE FROM app.${table} WHERE false`)).resolves.toBeDefined();}
  finally{await db.query("ROLLBACK");db.release();}
 }
});

it("catalogue controls detect RLS and privilege mutations without weakening the freeze",async()=>{
 for(const table of tables){
  const db=await f.admin.connect();
  try{
   await db.query("BEGIN");
   await db.query(`ALTER TABLE app.${table} NO FORCE ROW LEVEL SECURITY`);
   expect((await db.query("SELECT relforcerowsecurity FROM pg_class WHERE oid=$1::regclass",['app.'+table])).rows).toEqual([{relforcerowsecurity:false}]);
   await db.query(`GRANT INSERT ON app.${table} TO jobguard_runtime`);
   expect((await db.query("SELECT has_table_privilege('jobguard_runtime',$1,'INSERT') widened",['app.'+table])).rows).toEqual([{widened:true}]);
  }finally{await db.query("ROLLBACK");db.release();}
 }
 const db=await f.admin.connect();
 try{
  await db.query("BEGIN");
  await db.query("GRANT EXECUTE ON FUNCTION app.append_recovery_attribution(jsonb,uuid,jsonb,text,text) TO jobguard_runtime");
  expect((await db.query("SELECT has_function_privilege('jobguard_runtime','app.append_recovery_attribution(jsonb,uuid,jsonb,text,text)','EXECUTE') widened")).rows).toEqual([{widened:true}]);
 }finally{await db.query("ROLLBACK");db.release();}
});
it("private storage refuses non synthetic envelopes, missing context and cross job subject links",async()=>{
 const {p,document,command}=await storedAttributionFixture(f);
 const other=await storedAttributionFixture(f,p.tenantId);
 const append=(d:unknown)=>asFixtureTenant(f.owner,p.tenantId,db=>db.query("SELECT app.append_recovery_attribution($1,$2,$3,null,null)",[d,LOCK_OWNER,command]));
 for(const [key,value] of Object.entries({version:"forged.v1",environment:"production",productionEnabled:true,realExternalActions:1,attributionPolicyVersion:"forged",eligibilityPolicyVersion:"forged",tenantId:randomUUID()})){
  await expect(append({...document,[key]:value})).rejects.toThrow("FORBIDDEN");
 }
 await expect(f.owner.query("SELECT app.append_recovery_attribution($1,$2,$3,null,null)",[document,LOCK_OWNER,command])).rejects.toThrow("FORBIDDEN");
 for(const key of ["caseId","lineId","lockId"] as const){
  const forged={...document,[key]:other.document[key]};
  const forgedCommand={...command,[key]:other.document[key]};
  await expect(asFixtureTenant(f.owner,p.tenantId,db=>db.query("SELECT app.append_recovery_attribution($1,$2,$3,null,null)",[forged,LOCK_OWNER,forgedCommand]))).rejects.toThrow(/foreign key constraint/u);
 }
});

it.each(attributionPredicates)("private storage retains the false conjunct %s without promoting it",async predicate=>{
 const {p,document,command}=await storedAttributionFixture(f);
 const raw=structuredClone(document) as any;
 raw.facts.facts[predicate].holds=false;
 raw.assessmentOutcome="excluded";raw.reasonCodes=[predicate];
 const excluded=recoveryAttributionRevisionV1.parse(raw);
 await asFixtureTenant(f.owner,p.tenantId,db=>db.query("SELECT app.append_recovery_attribution($1,$2,$3,null,null)",[excluded,LOCK_OWNER,command]));
 const row=(await asFixtureTenant(f.owner,p.tenantId,db=>db.query("SELECT document FROM app.recovery_attribution_revision WHERE tenant_id=$1 AND id=$2",[p.tenantId,excluded.assessmentId]))).rows[0];
 expect(row.document).toEqual(excluded);
 expect(row.document.facts.facts[predicate].holds).toBe(false);
 expect(Object.keys(row.document.facts.facts)).toHaveLength(10);
});
