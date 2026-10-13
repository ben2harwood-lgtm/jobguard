import {createHash,randomUUID} from "node:crypto";
import { createWorkFixture,closeWorkFixture,seedWorkPractice,workTenant } from "./job-work-state-fixtures.js";
import {JobSourceRepository} from "../src/job-source-repository.js";
export {createWorkFixture,closeWorkFixture,workTenant};
export async function sourcesFixture(){const f=await createWorkFixture(),practice=await seedWorkPractice(f);return {...f,practice,repository:new JobSourceRepository(f.runtime)}}
export type SourceFixture=Awaited<ReturnType<typeof sourcesFixture>>;
/** Labelled migration-role fixture ONLY. No runtime source creation is authorized by this setup. */
export async function seedSource(f:SourceFixture,kind:"diary"|"customer_message"="diary",text="Fitted outside tap.",fixtureRef:string|null="job-source:outside-tap.v1",entryMode:"typed"|"dictated_text"="typed"){
 const id=randomUUID(),evidenceId=randomUUID(),commandId=randomUUID(),version=randomUUID(),bytes=Buffer.from(text,"utf8"),hash=createHash("sha256").update(bytes).digest("hex"),at="2026-10-13T10:00:00.000001Z",key=`synthetic/job-sources/${id}`;
 const {context,membershipId}=f.practice.auth,jobId=f.practice.jobId;
 await workTenant(f.admin,context.tenantId,async db=>{
  await db.query(`INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,actor_membership_id,result,completed_at) VALUES($1,$2,'sv7a.labelled_fixture',$2::text,$3,'succeeded',$4,'{}',clock_timestamp())`,[context.tenantId,commandId,hash,membershipId]);
  await db.query(`INSERT INTO app.evidence_upload(id,tenant_id,job_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,expires_at,state,object_version_id,server_received_at,server_verified_at) VALUES($1,$2,$3,$4,$5,'text/plain; charset=utf-8',32000,'standard_evidence',clock_timestamp()+interval '1 day','verified',$6,$7,clock_timestamp())`,[evidenceId,context.tenantId,jobId,key,hash,version,at]);
  await db.query(`INSERT INTO app.evidence_object(id,tenant_id,upload_id,job_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at) VALUES($1,$2,$1,$3,'original',$4,$5,$6,$7,$8,'text/plain; charset=utf-8','standard_evidence',$9,clock_timestamp())`,[evidenceId,context.tenantId,jobId,kind==="diary"?"job_diary_text":"customer_message_text",key,version,hash,bytes.length,at]);
  await db.query(`INSERT INTO app.job_source_original(tenant_id,job_id,evidence_id,source_kind,source_id,object_key,object_version_id,bytes,sha256,byte_length,source_received_at,verified_at,synthetic_fixture_ref) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,clock_timestamp(),$12)`,[context.tenantId,jobId,evidenceId,kind,id,key,version,bytes,hash,bytes.length,at,fixtureRef]);
  if(kind==="diary")await db.query(`INSERT INTO app.job_diary_entry(tenant_id,job_id,id,command_id,actor_membership_id,entry_mode,on_site,evidence_id,object_version_id,sha256,source_received_at) VALUES($1,$2,$3,$4,$5,$10,false,$6,$7,$8,$9)`,[context.tenantId,jobId,id,commandId,membershipId,evidenceId,version,hash,at,entryMode]);
  else await db.query(`INSERT INTO app.customer_message_source(tenant_id,job_id,id,command_id,actor_membership_id,fictional_role_name,evidence_id,object_version_id,sha256,source_received_at) VALUES($1,$2,$3,$4,$5,'Fictional Alex',$6,$7,$8,$9)`,[context.tenantId,jobId,id,commandId,membershipId,evidenceId,version,hash,at]);
 });return {id,evidenceId,commandId,version,hash,at,text,bytes,kind,jobId,tenantId:context.tenantId};
}
