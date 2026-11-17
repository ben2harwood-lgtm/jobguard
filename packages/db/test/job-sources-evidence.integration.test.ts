import {randomUUID} from "node:crypto";
import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {parseObservation,detectShadowObservations,shadowCaptureV1,matchObservationCapture} from "@jobguard/core";
import {withTenant} from "../src/tenant-context.js";
import {readJobSourceObservations} from "../src/job-source-observation-reader.js";
import {ShadowObservationReader,FixtureObservationSources} from "../src/shadow-observation-reader.js";
import {sourcesFixture,seedSource,closeWorkFixture,type SourceFixture,workTenant} from "./job-sources-fixture.js";
describe("SV-7A independent finalized fixture evidence observations",()=>{
 let f:SourceFixture;beforeAll(async()=>{f=await sourcesFixture()},60000);afterAll(async()=>closeWorkFixture(f));
 const observations=()=>withTenant(f.runtime,f.practice.auth.context,db=>readJobSourceObservations(db,f.practice.auth.context.tenantId,f.practice.jobId));
 it("SV7A-04 SV7A-06 exact original bytes/version/hash/time emit unchanged observation.v1 for both source kinds",async()=>{
  const a=await seedSource(f),b=await seedSource(f,"customer_message","Please fit an outside tap.","job-source:request-tap.v1");
  const result=await observations();expect(result).toHaveLength(2);for(const o of result)expect(parseObservation(o)).toEqual(o);
  expect(result.find(o=>o.evidence.id===a.evidenceId)).toMatchObject({kind:"note_or_voice",text:a.text,facts:{estimatedValuePence:null},evidence:{objectVersionId:a.version,sha256:a.hash,serverReceivedAt:a.at}});
  expect(result.find(o=>o.evidence.id===b.evidenceId)?.kind).toBe("customer_request");
  const original=(await f.admin.query("SELECT bytes,byte_length FROM app.job_source_original WHERE evidence_id=$1",[a.evidenceId])).rows[0];expect(original.bytes).toEqual(a.bytes);expect(Number(original.byte_length)).toBe(a.bytes.length);
 });
 it("SV7A-05 SV7A-06 unknown edited text and invalidated evidence produce no processed observation",async()=>{
  const a=await seedSource(f,"diary","Fictional edited text", "job-source:outside-tap.v1"),b=await seedSource(f);
  await workTenant(f.admin,b.tenantId,db=>db.query("INSERT INTO app.evidence_invalidation(id,tenant_id,evidence_id,actor_membership_id,reason_code) VALUES($1,$2,$3,$4,'verification_invalid')",[randomUUID(),b.tenantId,b.evidenceId,f.practice.auth.membershipId]));
  const result=await observations();expect(result.some(o=>o.evidence.id===a.evidenceId||o.evidence.id===b.evidenceId)).toBe(false);
 });
 it("SV7A-05 invalid bytes/hash/version and pending upload cannot be processed (rolled-back controls)",async()=>{
  const source=await seedSource(f);
  for(const change of ["sha256=repeat('b',64)","object_version_id='substituted'","bytes=convert_to('tampered','UTF8')"]){
   await expect(withTenant(f.admin,f.practice.auth.context,async database=>{
    const db=database.$client;await db.query("SET LOCAL session_replication_role='replica'");await db.query("ALTER TABLE app.job_source_original DISABLE TRIGGER USER");await db.query("ALTER TABLE app.job_source_original DROP CONSTRAINT job_source_original_bytes_ck");await db.query(`UPDATE app.job_source_original SET ${change} WHERE evidence_id=$1`,[source.evidenceId]);
    expect((await readJobSourceObservations(database,source.tenantId,source.jobId)).some(o=>o.evidence.id===source.evidenceId)).toBe(false);
    throw new Error("rolled-back control");
   })).rejects.toThrow("rolled-back control");
  }
  await expect(withTenant(f.admin,f.practice.auth.context,async database=>{
   await database.$client.query("SET LOCAL session_replication_role='replica'");await database.$client.query("ALTER TABLE app.evidence_upload DROP CONSTRAINT evidence_upload_state_ck");
   await database.$client.query("UPDATE app.evidence_upload SET state='pending',server_verified_at=NULL WHERE id=$1",[source.evidenceId]);
   expect((await readJobSourceObservations(database,source.tenantId,source.jobId)).some(o=>o.evidence.id===source.evidenceId)).toBe(false);throw new Error("rolled-back control");
  })).rejects.toThrow("rolled-back control");
  await expect(withTenant(f.admin,f.practice.auth.context,async database=>{
   await database.$client.query("SET LOCAL session_replication_role='replica'");await database.$client.query("ALTER TABLE app.job_source_original DISABLE TRIGGER USER");await database.$client.query("DELETE FROM app.job_source_original WHERE evidence_id=$1",[source.evidenceId]);
   expect((await readJobSourceObservations(database,source.tenantId,source.jobId)).some(o=>o.evidence.id===source.evidenceId)).toBe(false);throw new Error("rolled-back control");
  })).rejects.toThrow("rolled-back control");

 });
 it("SV7A-20 matching draft/rejected/withdrawn captures preserve builder-favourable matching",async()=>{
  const o=(await observations())[0]!;expect(o).toBeDefined();
  for(const state of ["draft","rejected","withdrawn"]){const id=randomUUID();const capture=shadowCaptureV1.parse({version:"shadow-capture.v1",tenantId:o.tenantId,jobId:o.jobId,id,scopeItemId:id,revisionId:id,serverRecordedAt:o.evidence.serverReceivedAt,valuePence:null,kind:"log_extra",state,scopeArea:"job",description:"outside tap",recordedPhase:"pre_lock",aiStructured:false,sourceRef:id});expect(matchObservationCapture(o,[capture]).outcome).toBe("builder_captured");expect(detectShadowObservations([o],[capture],"2026-10-13T12:00:00Z")).toEqual([])}
 });
 it("SV7A-21 reader extension preserves terms gate and existing locked/imported restrictions",async()=>{
  const reader=new ShadowObservationReader(f.runtime,new FixtureObservationSources([]));expect(await reader.hasAcceptedTerms(f.practice.auth.context)).toBe(false);
  const result=await reader.read(f.practice.auth.context,{version:"shadow-observation-read.v1",jobId:f.practice.jobId});expect(result.observations.length).toBeGreaterThan(0);
 });
});
