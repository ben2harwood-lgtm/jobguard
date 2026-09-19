import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrivateVersionedStorage, StoredObject } from "@jobguard/storage";
import { EvidenceService, ProofCommandService, migrate, withTenant, type VerifiedTenantContext } from "../src/index.js";
import { listConfirmedPracticeScopes } from "../src/practice-scope.js";
import { closeTestPools } from "./pool-test-utils.js";

const tenant="a1000000-0000-4000-8000-000000000001", otherTenant="a1000000-0000-4000-8000-000000000002";
const job="a2000000-0000-4000-8000-000000000001",otherJob="a2000000-0000-4000-8000-000000000002",emptyJob="a2000000-0000-4000-8000-000000000003",foreignJob="a2000000-0000-4000-8000-000000000004";
const member="a3000000-0000-4000-8000-000000000001",retired="00000000-0000-4000-8000-000000000001",proposed="00000000-0000-4000-8000-000000000002",first="b0000000-0000-4000-8000-000000000001",second="b0000000-0000-4000-8000-000000000002";
const context={tenantId:tenant} as VerifiedTenantContext,foreignContext={tenantId:otherTenant} as VerifiedTenantContext;
let postgres:EmbeddedPostgres,admin:Pool,runtime:Pool,directory:string;
beforeAll(async()=>{
 directory=await mkdtemp(join(tmpdir(),"jobguard-practice-scope-"));const port=59000+Math.floor(Math.random()*300);
 postgres=new EmbeddedPostgres({databaseDir:directory,port,user:"postgres",password:"synthetic",persistent:false,createPostgresUser:process.getuid?.()===0,initdbFlags:["--lc-messages=C"],onLog:()=>undefined});await postgres.initialise();await postgres.start();
 admin=new Pool({host:"127.0.0.1",port,user:"postgres",password:"synthetic",database:"postgres"});await migrate(admin);
 await admin.query(`INSERT INTO control_plane.tenant(id) VALUES('${tenant}'),('${otherTenant}');
 INSERT INTO identity.identity_user(id) VALUES('a4000000-0000-4000-8000-000000000001');
 INSERT INTO app.account(id,tenant_id,name) VALUES('a5000000-0000-4000-8000-000000000001','${tenant}','Synthetic proof regression');
 INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES('${member}','${tenant}','a5000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000001','owner');
 INSERT INTO app.job(id,tenant_id,title,status) VALUES('${job}','${tenant}','Synthetic dismissed-first regression','live'),('${otherJob}','${tenant}','Other synthetic job','live'),('${emptyJob}','${tenant}','No confirmed scope','live'),('${foreignJob}','${otherTenant}','Foreign synthetic job','live');
 INSERT INTO app.scope_identity(id,tenant_id,job_id,state,created_at) VALUES
 ('${retired}','${tenant}','${job}','retired','2026-01-01T00:00:00Z'),('${proposed}','${tenant}','${job}','proposed','2026-01-01T00:00:00Z'),
 ('${first}','${tenant}','${job}','confirmed','2026-01-02T00:00:00Z'),('${second}','${tenant}','${job}','confirmed','2026-01-02T00:00:00Z'),
 ('c0000000-0000-4000-8000-000000000001','${tenant}','${otherJob}','confirmed','2025-01-01T00:00:00Z'),('c0000000-0000-4000-8000-000000000002','${tenant}','${emptyJob}','retired','2025-01-01T00:00:00Z'),('c0000000-0000-4000-8000-000000000003','${otherTenant}','${foreignJob}','confirmed','2025-01-01T00:00:00Z');
 INSERT INTO app.scope_progress(tenant_id,job_id,scope_item_id) VALUES('${tenant}','${job}','${first}'),('${tenant}','${job}','${second}');
 CREATE ROLE practice_scope_login LOGIN PASSWORD 'synthetic' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;GRANT jobguard_runtime TO practice_scope_login;`);
 runtime=new Pool({host:"127.0.0.1",port,user:"practice_scope_login",password:"synthetic",database:"postgres"});
},60_000);
afterAll(async()=>{await closeTestPools(runtime,admin);await postgres?.stop();if(directory)await rm(directory,{recursive:true,force:true})});
const select=(jobId=job,requestedTenant=tenant,ctx=context,limit:1|2=1)=>withTenant(runtime,ctx,db=>listConfirmedPracticeScopes(db,requestedTenant,jobId,limit));
describe("shared practice proof/Decision/final-account subject",()=>{
 it("reproduces old dismissed-first selection and selects confirmed work instead",async()=>{
 const legacy=await withTenant(runtime,context,db=>db.$client.query<{id:string}>("SELECT id FROM app.scope_identity WHERE tenant_id=$1 AND job_id=$2 ORDER BY created_at,id LIMIT 1",[tenant,job]));expect(legacy.rows).toEqual([{id:retired}]);
 const missing=await withTenant(runtime,context,db=>db.$client.query("SELECT 1 FROM app.scope_progress WHERE tenant_id=$1 AND job_id=$2 AND scope_item_id=$3",[tenant,job,retired]));expect(missing.rows).toEqual([]);expect(await select()).toEqual([{id:first}]);});
 it("uses the same stable first subject for one-item and two-item consumers",async()=>{expect(await select(job,tenant,context,2)).toEqual([{id:first},{id:second}]);expect(await select()).toEqual([{id:first}])});
 it("never borrows an older scope from another job",async()=>{expect(await select(otherJob)).toEqual([{id:"c0000000-0000-4000-8000-000000000001"}]);expect(await select(randomUUID())).toEqual([])});
 it("does not fall back to retired work when confirmed scope is empty",async()=>{expect(await select(emptyJob)).toEqual([])});
 it("enforces real runtime RLS even with another requested tenant",async()=>{expect(await select(foreignJob,otherTenant)).toEqual([]);expect(await select(job,tenant,foreignContext)).toEqual([]);expect(await select(foreignJob,otherTenant,foreignContext)).toEqual([{id:"c0000000-0000-4000-8000-000000000003"}])});
 it("finalizes and completes the selected operational scope without timeout retries",async()=>{
 const selected=await select();expect(selected).toHaveLength(1);const scopeItemId=selected[0]!.id,bytes=png(),objects=new Map<string,StoredObject>();
 const storage:PrivateVersionedStorage={async createUploadUrl(){return "https://synthetic.invalid/upload"},async createDownloadUrl(){return "https://synthetic.invalid/download"},async readExactVersion(key,versionId){const object=objects.get(`${key}:${versionId}`);if(!object)throw new Error("Missing synthetic version");return object},async deleteExactVersion(){throw new Error("Synthetic originals remain immutable")}};
 const evidence=new EvidenceService(runtime,storage),upload=await evidence.beginUpload(context,{jobId:job,scopeItemId,expectedSha256:createHash("sha256").update(bytes).digest("hex"),contentType:"image/png",maximumBytes:bytes.length,expiresAt:new Date(Date.now()+60_000)});
 objects.set(`${upload.objectKey}:synthetic-v1`,{key:upload.objectKey,versionId:"synthetic-v1",bytes,byteLength:bytes.length,contentType:"image/png"});
 const original=await evidence.finalize(context,{uploadId:upload.id,objectVersionId:"synthetic-v1",evidenceType:"electrical_certificate"}),proof=new ProofCommandService(runtime,storage);
 const command={version:"proof.complete.v1",commandId:randomUUID(),actorMembershipId:member,jobId:job,scopeItemId,stage:"electrical-stage",evidenceId:original.id,requiredEvidenceType:"electrical_certificate",decisionId:null};
 const result=await proof.complete(context,command);expect(result).toMatchObject({state:"complete",evidenceId:original.id});expect(await proof.complete(context,command)).toEqual(result);
 const completed=await withTenant(runtime,context,db=>db.$client.query("SELECT scope_item_id FROM app.stage_completion WHERE tenant_id=$1 AND job_id=$2",[tenant,job]));expect(completed.rows).toEqual([{scope_item_id:first}]);expect(await select()).toEqual([{id:first}]);
 });
});
// Only external object storage is faked; all database/authorization work is real PostgreSQL.
function png():Buffer{const crc=(bytes:Buffer)=>{let value=0xffffffff;for(const byte of bytes){value^=byte;for(let i=0;i<8;i++)value=(value>>>1)^((value&1)?0xedb88320:0)}return(value^0xffffffff)>>>0};const chunk=(type:string,data:Buffer)=>{const name=Buffer.from(type),out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);name.copy(out,4);data.copy(out,8);out.writeUInt32BE(crc(Buffer.concat([name,data])),8+data.length);return out};const header=Buffer.alloc(13);header.writeUInt32BE(1,0);header.writeUInt32BE(1,4);header[8]=8;header[9]=2;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",header),chunk("IDAT",deflateSync(Buffer.from([0,20,30,40]))),chunk("IEND",Buffer.alloc(0))])}
