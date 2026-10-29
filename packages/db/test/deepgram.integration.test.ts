import { importWatchdogFixtureJob } from "./watchdog-fixtures.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { closeTestPools, freePort, installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
import { createHash, randomUUID } from "node:crypto";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { syntheticSpeechAudio } from "@jobguard/core";
import type { PrivateVersionedStorage, StoredObject } from "@jobguard/storage";
import { CaptureRepository, EvidenceService, FixtureSpeechAudioReader, migrate, withTenant } from "../src/index.js";
import { MIGRATION_URLS } from "../src/migrate.js";

const tenant="10000000-0000-4000-8000-000000000001",other="10000000-0000-4000-8000-000000000002";
const context=testTenantContext(tenant),foreign=testTenantContext(other);
const own="0437_deepgram_fixture_transcripts.sql";
const bytes=syntheticSpeechAudio(),hash=createHash("sha256").update(bytes).digest("hex");
const objects=new Map<string,StoredObject>();
const storage:PrivateVersionedStorage={
  createUploadUrl:async()=>"fixture.invalid/upload",createDownloadUrl:async()=>"fixture.invalid/download",
  readExactVersion:async(key,version)=>{const item=objects.get(`${key}:${version}`);if(!item)throw new Error("missing");return item},
  deleteExactVersion:async()=>{throw new Error("immutable fixture")},
};
let pg:EmbeddedPostgres,admin:Pool,runtime:Pool,dir:string;
beforeAll(async()=>{
  dir=await mkdtemp(join(tmpdir(),"deepgram-pg-"));const port=await freePort(56000,500);
  pg=new EmbeddedPostgres({databaseDir:dir,port,user:"postgres",password:"synthetic-test-only",persistent:false,
    createPostgresUser:process.getuid?.()===0,initdbFlags:["--lc-messages=C"],onLog:()=>undefined});
  await pg.initialise();await pg.start();admin=new Pool({host:"127.0.0.1",port,user:"postgres",password:"synthetic-test-only"});
  // Upgrade from every predecessor, retaining a real legacy source row.
  await admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
  for(const url of MIGRATION_URLS){const name=url.pathname.split("/").at(-1)!;if(name===own)break;
    await admin.query(await readFile(url,"utf8"));await admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)",[name]);}
  await installLegacySyntheticPartyFixtures(admin);
  await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1),($2)",[tenant,other]);
  await admin.query("INSERT INTO app.capture_source(id,tenant_id,kind,content_bytes,content_text,sha256) VALUES($1,$2,'text',$3,'Legacy',$4)",
    [randomUUID(),tenant,Buffer.from("Legacy"),createHash("sha256").update("Legacy").digest("hex")]);
  const before=(await admin.query("SELECT * FROM app.capture_source")).rows;
  const authority=(await admin.query("SELECT relname,relowner,relacl,relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=ANY(ARRAY['app.capture_source'::regclass,'app.synthetic_evidence_original'::regclass]) ORDER BY relname")).rows;
  await migrate(admin);await migrate(admin);
  expect((await admin.query("SELECT * FROM app.capture_source")).rows).toEqual(before);
  expect((await admin.query("SELECT relname,relowner,relacl,relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=ANY(ARRAY['app.capture_source'::regclass,'app.synthetic_evidence_original'::regclass]) ORDER BY relname")).rows).toEqual(authority);
  await admin.query("CREATE ROLE speech_login LOGIN PASSWORD 'synthetic' NOSUPERUSER NOBYPASSRLS; GRANT jobguard_runtime TO speech_login");
  runtime=new Pool({host:"127.0.0.1",port,user:"speech_login",password:"synthetic"});
},120_000);
afterAll(async()=>{await closeTestPools(runtime,admin);await pg?.stop();if(dir)await rm(dir,{recursive:true,force:true})});
async function prepare(){
  const jobId=randomUUID(),scopeId=randomUUID();
  await importWatchdogFixtureJob(admin,tenant,jobId,"Generated speech fixture");
  await admin.query("INSERT INTO app.scope_identity(id,tenant_id,job_id) VALUES($1,$2,$3)",[scopeId,tenant,jobId]);
  const service=new EvidenceService(runtime,storage);
  const upload=await service.beginUpload(context,{jobId,scopeItemId:scopeId,contentType:"audio/wav",syntheticAudioFixture:true,
    maximumBytes:46,expectedSha256:hash,expiresAt:new Date(Date.now()+60_000)}, async (db,object) => {
      await db.$client.query(`INSERT INTO app.synthetic_evidence_original
        (tenant_id,upload_id,job_id,scope_item_id,object_key,object_version_id,environment,content_type,bytes)
        VALUES($1,$2,$3,$4,$5,'v1','synthetic_demo','audio/wav',$6)`,[tenant,object.id,jobId,scopeId,object.objectKey,Buffer.from(bytes)]);
    });
  objects.set(`${upload.objectKey}:v1`,{key:upload.objectKey,versionId:"v1",contentType:"audio/wav",byteLength:46,bytes});
  return{jobId,scopeId,service,upload};
}
function input(captureId:string,jobId:string,evidenceId:string){
  return{captureId,text:"Shelf",sourceKind:"deepgram_transcript" as const,
    acquisition:{contractVersion:"deepgram_fixture_transcript_v1",environment:"synthetic_demo",provider:"deepgram_fixture",
      deployment:"deepgram-fixture.invalid",model:"fixture-stt-v1",
      schemaVersion:"deepgram_fixture_response_v1",evaluationVersion:"deepgram-fixture-contract-v1",fixtureId:"shelf",evidenceId,evidenceJobId:jobId,
      objectVersionId:"v1",sourceSha256:hash,audioByteLength:46,originalText:"Original typed input",rawTranscript:"Shelf",status:"complete",humanEdited:false}};
}

describe("dark speech registration and persistence (real PostgreSQL)",()=>{
  it("requires verified exact-version evidence, keeps the job identity, and deduplicates concurrent replays",async()=>{
    const {jobId,service,upload}=await prepare();const reader=new FixtureSpeechAudioReader(runtime,storage,context);
    await expect(reader.read(tenant,jobId,upload.id)).rejects.toThrow("AUDIO_NOT_VERIFIED");
    const repo=new CaptureRepository(runtime),request=input(randomUUID(),jobId,upload.id);
    const counts = async () => withTenant(runtime,context,async db => ({
      proposals:(await db.$client.query("SELECT count(*)::int n FROM app.job_record_proposal WHERE job_id=$1",[jobId])).rows[0].n,
      outbox:(await db.$client.query("SELECT count(*)::int n FROM app.action_outbox")).rows[0].n,
    }));
    const beforeCounts = await counts();
    await expect(repo.persistSpeechFixtureSource(context,request.captureId,{kind:request.sourceKind,text:request.text,acquisition:request.acquisition})).rejects.toThrow("AUDIO_NOT_VERIFIED");
    const first=await service.finalize(context,{uploadId:upload.id,objectVersionId:"v1",evidenceType:"synthetic_speech_audio"});
    expect((await service.finalize(context,{uploadId:upload.id,objectVersionId:"v1",evidenceType:"synthetic_speech_audio"})).id).toBe(first.id);
    expect(await reader.read(tenant,jobId,upload.id)).toMatchObject({state:"verified",byteLength:46,sha256:hash});
    const [a,b]=await Promise.all([repo.persistSpeechFixtureSource(context,request.captureId,{kind:request.sourceKind,text:request.text,acquisition:request.acquisition}),repo.persistSpeechFixtureSource(context,request.captureId,{kind:request.sourceKind,text:request.text,acquisition:request.acquisition})]);
    expect(a.jobId).toBe(jobId);expect(b.jobId).toBe(jobId);
    const row=await withTenant(runtime,context,async db=>(await db.$client.query("SELECT kind AS source_kind,audio_byte_length,acquisition_metadata FROM app.capture_source WHERE id=$1",[request.captureId])).rows[0]);
    expect(row).toMatchObject({source_kind:"deepgram_transcript",audio_byte_length:46,acquisition_metadata:{originalText:"Original typed input"}});
    await expect(repo.persistSpeechFixtureSource(context,request.captureId,{kind:request.sourceKind,text:"Changed",acquisition:request.acquisition})).rejects.toMatchObject({code:"CAPTURE_ID_REUSED"});
    await expect(repo.persistSpeechFixtureSource(context,request.captureId,{kind:request.sourceKind,text:request.text,acquisition:{...request.acquisition,originalText:"Changed"}})).rejects.toMatchObject({code:"CAPTURE_ID_REUSED"});
    await expect(repo.persistSpeechFixtureSource(foreign,request.captureId,{kind:request.sourceKind,text:request.text,acquisition:request.acquisition})).rejects.toThrow("AUDIO_NOT_VERIFIED");
    await expect(reader.read(other,jobId,upload.id)).rejects.toThrow("AUDIO_NOT_VERIFIED");
    await expect(reader.read(tenant,randomUUID(),upload.id)).rejects.toThrow("AUDIO_NOT_VERIFIED");
    const key=`${upload.objectKey}:v1`,stored=objects.get(key)!;
    objects.set(key,{...stored,versionId:"wrong"});await expect(reader.read(tenant,jobId,upload.id)).rejects.toThrow("AUDIO_NOT_VERIFIED");objects.set(key,stored);
    expect(await counts()).toEqual(beforeCounts);
    await withTenant(runtime,context,async db=>{
      await expect(db.$client.query("UPDATE app.evidence_object SET byte_length=0 WHERE id=$1",[upload.id])).rejects.toBeTruthy();
    });
  });
  it("rejects arbitrary audio, missing fixture consent, wrong proof type and non-fixture original bytes",async()=>{
    const {jobId,scopeId,service,upload}=await prepare();
    for(const extra of [{expectedSha256:"0".repeat(64)},{maximumBytes:47},{syntheticAudioFixture:undefined}])
      await expect(service.beginUpload(context,{jobId,contentType:"audio/wav",syntheticAudioFixture:true,maximumBytes:46,
        expectedSha256:hash,expiresAt:new Date(Date.now()+60_000),...extra})).rejects.toThrow("synthetic_audio_only");
    await expect(service.finalize(context,{uploadId:upload.id,objectVersionId:"v1",evidenceType:"site_photo"})).rejects.toThrow("synthetic_audio_only");
    await expect(withTenant(runtime,context,db=>db.$client.query(`INSERT INTO app.synthetic_evidence_original
      (tenant_id,upload_id,job_id,scope_item_id,object_key,object_version_id,environment,content_type,bytes)
      VALUES($1,$2,$3,$4,$5,'v1','synthetic_demo','audio/wav',$6)`,[tenant,upload.id,jobId,scopeId,upload.objectKey,Buffer.from([1,2])]))).rejects.toMatchObject({code:"23514"});
  });
  it("keeps old zero-byte kinds and rejects unlabelled or incorrectly sized Deepgram sources",async()=>{
    const {jobId,service,upload}=await prepare();await service.finalize(context,{uploadId:upload.id,objectVersionId:"v1",evidenceType:"synthetic_speech_audio"});
    const acquisition=input(randomUUID(),jobId,upload.id).acquisition;
    for(const [kind,length,meta] of [["text",46,null],["browser_local_transcript",46,null],["deepgram_transcript",0,acquisition],["deepgram_transcript",46,null],["deepgram_transcript",46,{...acquisition,environment:"production"}]]){
      await expect(withTenant(runtime,context,db=>db.$client.query(`INSERT INTO app.capture_source
        (id,tenant_id,kind,content_bytes,content_text,sha256,acquisition_metadata,audio_byte_length) VALUES($1,$2,$3,$4,'Shelf',$5,$6,$7)`,
        [randomUUID(),tenant,kind,Buffer.from("Shelf"),hash,meta,length]))).rejects.toMatchObject({code:"23514"});
    }
  });
});
