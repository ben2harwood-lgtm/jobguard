import { randomUUID } from "node:crypto";
import { beforeAll,afterAll,it,expect } from "vitest";
import { actor,tenant,member,createIntegrityFixture,seedIntegrityJob,reviewFor,transaction,type IntegrityFixture } from "./commercial-integrity-v3-fixtures.js";
let f:IntegrityFixture;beforeAll(async()=>{f=await createIntegrityFixture();},120000);afterAll(async()=>{await f?.close();});
const insert=`INSERT INTO app.command_receipt(command_id,tenant_id,command_type,semantic_key,request_hash,status,result,actor_membership_id,completed_at) VALUES($1,$2,$3,$1::uuid::text,repeat('a',64),'succeeded','{}',$4,clock_timestamp())`;
it("CI-P08 runtime cannot forge v3 even with spoofed role GUC, while unrelated/v1 insertion and updates survive",async()=>{
 for(const kind of ["commercial_integrity.review","unrelated.ch6.fixture"]){const id=randomUUID();await transaction(f.runtime,async db=>{await db.query(insert,[id,tenant,kind,member]);await db.query("UPDATE app.command_receipt SET result='{}' WHERE tenant_id=$1 AND command_id=$2",[tenant,id]);});}
 await expect(transaction(f.runtime,async db=>{await db.query("SELECT set_config('app.execution_role','jobguard_migration',true)");await db.query(insert,[randomUUID(),tenant,"commercial_integrity.review.v3",member]);})).rejects.toThrow("INTEGRITY_RECEIPT_CONTROLLED");
 await expect(transaction(f.runtime,db=>db.query("TRUNCATE app.command_receipt"))).rejects.toThrow();
});
it("CI-P08 result, status, completion, deletion and conversion are independently protected",async()=>{
 const {job}=await seedIntegrityJob(f),review=await reviewFor(f,job);await f.repo.review(f.auth.context,actor,f.auth.digest,job,review);
 for(const sql of ["UPDATE app.command_receipt SET result='{}'","UPDATE app.command_receipt SET completed_at=clock_timestamp()","UPDATE app.command_receipt SET status='processing',result=NULL,completed_at=NULL","DELETE FROM app.command_receipt"])
  await expect(transaction(f.admin,db=>db.query(`${sql} WHERE tenant_id=$1 AND command_id=$2`,[tenant,review.commandId]))).rejects.toThrow("INTEGRITY_RECEIPT_IMMUTABLE");
 await expect(transaction(f.admin,db=>db.query("UPDATE app.command_receipt SET command_type='unrelated' WHERE tenant_id=$1 AND command_id=$2",[tenant,review.commandId]))).rejects.toThrow("INTEGRITY_RECEIPT_IMMUTABLE");
 const id=randomUUID();await transaction(f.runtime,db=>db.query(insert,[id,tenant,"unrelated.ch6.fixture",member]));
 await expect(transaction(f.admin,db=>db.query("UPDATE app.command_receipt SET command_type='commercial_integrity.review.v3' WHERE tenant_id=$1 AND command_id=$2",[tenant,id]))).rejects.toThrow("INTEGRITY_RECEIPT_IMMUTABLE");
});
it("CI-P08 private helpers inaccessible, exact definer posture and only checked writer/source reader executable",async()=>{
 const rows=(await f.admin.query(`SELECT p.proname,pg_get_userbyid(p.proowner) owner,p.prosecdef,p.proconfig,
 has_function_privilege('jobguard_runtime',p.oid,'EXECUTE') runtime,has_function_privilege('jobguard_shadow',p.oid,'EXECUTE') shadow,
 has_function_privilege('jobguard_infrastructure',p.oid,'EXECUTE') infrastructure,
 EXISTS(SELECT 1 FROM aclexplode(p.proacl) x WHERE x.grantee=0 AND x.privilege_type='EXECUTE') public
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='app' AND p.proname LIKE 'ch6_%'`)).rows;
 expect(rows).toHaveLength(11);for(const r of rows){expect(r.owner).toBe("jobguard_migration");expect(r.proconfig).toEqual(["search_path=pg_catalog"]);expect(r.runtime).toBe(["ch6_record_integrity_review","ch6_integrity_sources"].includes(r.proname));expect(r.prosecdef).toBe(["ch6_record_integrity_review","ch6_integrity_sources"].includes(r.proname));expect([r.shadow,r.infrastructure,r.public]).toEqual([false,false,false]);}
 await expect(transaction(f.runtime,db=>db.query("SELECT app.ch6_integrity_source_fingerprint($1,$2,$3,'{}')",[tenant,randomUUID(),f.auth.digest]))).rejects.toThrow("permission denied");
});
it("guard removal control demonstrates the INSERT denial is enforced by this trigger, rolled back",async()=>{
 const db=await f.admin.connect();try{
  await db.query("BEGIN");await db.query("DROP TRIGGER ch6_integrity_review_receipt_guard ON app.command_receipt");
  await db.query("SET LOCAL ROLE jobguard_runtime");await db.query("SELECT set_config('app.tenant_id',$1,true)",[tenant]);
  await expect(db.query(insert,[randomUUID(),tenant,"commercial_integrity.review.v3",member])).resolves.toBeDefined();
 }finally{await db.query("ROLLBACK");db.release();}
 await expect(transaction(f.runtime,db=>db.query(insert,[randomUUID(),tenant,"commercial_integrity.review.v3",member]))).rejects.toThrow("INTEGRITY_RECEIPT_CONTROLLED");
});
