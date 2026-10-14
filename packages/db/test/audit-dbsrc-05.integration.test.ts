import { testTenantContext } from "./tenant-context-test-utils.js";
import { importWatchdogFixtureJob } from "./watchdog-fixtures.js";
import { closeTestPools, freePort, installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrivateVersionedStorage, StoredObject } from "@jobguard/storage";
import { EvidenceError, EvidenceService, migrate, withTenant } from "../src/index.js";

const TENANT="71000000-0000-4000-8000-000000000001", OTHER="71000000-0000-4000-8000-000000000002";
const MEMBER="74000000-0000-4000-8000-000000000001";
const JOB="72000000-0000-4000-8000-000000000001", SCOPE="73000000-0000-4000-8000-000000000001";
const context=testTenantContext(TENANT), otherContext=testTenantContext(OTHER);
const hash=(bytes:Uint8Array)=>createHash("sha256").update(bytes).digest("hex");

class MemoryVersionedStorage implements PrivateVersionedStorage {
  versions=new Map<string,StoredObject>(); deleted:string[]=[];
  put(key:string,versionId:string,bytes:Uint8Array,contentType="image/png"){this.versions.set(`${key}:${versionId}`,{key,versionId,bytes,byteLength:bytes.length,contentType});}
  async createUploadUrl({key,expiresInSeconds}:{key:string;contentType:string;expiresInSeconds:number}){return `memory://put/${key}?expires=${expiresInSeconds}`;}
  async createDownloadUrl({key,versionId,expiresInSeconds}:{key:string;versionId:string;expiresInSeconds:number}){return `memory://get/${key}?version=${versionId}&expires=${expiresInSeconds}`;}
  async readExactVersion(key:string,versionId:string){const value=this.versions.get(`${key}:${versionId}`);if(!value)throw new Error("not found");return value;}
  async deleteExactVersion(key:string,versionId:string){this.deleted.push(`${key}:${versionId}`);this.versions.delete(`${key}:${versionId}`);}
}
let postgres:EmbeddedPostgres,admin:Pool,runtime:Pool,dir:string;const storage=new MemoryVersionedStorage();let service:EvidenceService;
beforeAll(async()=>{dir=await mkdtemp(join(tmpdir(),"jobguard-audit-dbsrc-05-pg16-"));const port=await freePort(56500,300);postgres=new EmbeddedPostgres({databaseDir:dir,port,user:"postgres",password:"synthetic-test-only",persistent:false,createPostgresUser:process.getuid?.()===0,initdbFlags:["--lc-messages=C","--encoding=UTF8"],onLog:()=>undefined});await postgres.initialise();await postgres.start();admin=new Pool({host:"127.0.0.1",port,database:"postgres",user:"postgres",password:"synthetic-test-only"});await migrate(admin);await installLegacySyntheticPartyFixtures(admin);await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1),($2)",[TENANT,OTHER]);await admin.query("INSERT INTO identity.identity_user(id) VALUES('75000000-0000-4000-8000-000000000001')");await admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES('76000000-0000-4000-8000-000000000001',$1,'Synthetic')",[TENANT]);await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($2,$1,'76000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000001','owner')",[TENANT,MEMBER]);await importWatchdogFixtureJob(admin,TENANT,JOB,"Synthetic stage");await admin.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($3,$1,$2,'confirmed')",[TENANT,JOB,SCOPE]);await admin.query("INSERT INTO app.scope_progress(tenant_id,job_id,scope_item_id,stage) VALUES($1,$2,$3,'in_progress')",[TENANT,JOB,SCOPE]);await admin.query(`CREATE ROLE audit_dbsrc_05_login LOGIN PASSWORD 'synthetic-runtime-only' NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOBYPASSRLS`);await admin.query("GRANT jobguard_runtime TO audit_dbsrc_05_login");runtime=new Pool({host:"127.0.0.1",port,database:"postgres",user:"audit_dbsrc_05_login",password:"synthetic-runtime-only"});service=new EvidenceService(runtime,storage);},60_000);
afterAll(async()=>{await closeTestPools(runtime,admin);await postgres?.stop();await rm(dir,{recursive:true,force:true});});

async function begin(bytes:Uint8Array,overrides:Record<string,unknown>={}){return service.beginUpload(context,{jobId:JOB,scopeItemId:SCOPE,expectedSha256:hash(bytes),contentType:"image/png",maximumBytes:100,expiresAt:new Date(Date.now()+60_000),...overrides});}

describe("AUDIT-FIX-DBSRC-05 authoritative image evidence", () => {
  it.each([
    { name: "marker-only JPEG", bytes: Buffer.from([0xff, 0xd8, 0, 0, 0xff, 0xd9]), contentType: "image/jpeg" },
    { name: "header-only WebP", bytes: Buffer.from("RIFF0000WEBPx"), contentType: "image/webp" },
  ])("rejects $name before registering proof", async ({ bytes, contentType }) => {
    const upload = await begin(bytes, { contentType });
    storage.put(upload.objectKey, "bad-v1", bytes, contentType);
    await expect(service.finalize(context, { uploadId: upload.id, objectVersionId: "bad-v1", evidenceType: "site_photo" }))
      .rejects.toMatchObject({ code: "OBJECT_INVALID", message: "corrupt_image" });
    await withTenant(runtime, context, async db => {
      expect((await db.$client.query("SELECT id FROM app.evidence_object WHERE tenant_id=$1 AND upload_id=$2", [TENANT, upload.id])).rows).toEqual([]);
      expect((await db.$client.query("SELECT state,rejection_code FROM app.evidence_upload WHERE tenant_id=$1 AND id=$2", [TENANT, upload.id])).rows)
        .toEqual([{ state: "rejected", rejection_code: "corrupt_image" }]);
    });
    await expect(service.linkAndAssertProof(context, { id: randomUUID(), evidenceId: upload.id, jobId: JOB, scopeItemId: SCOPE, requiredEvidenceType: "site_photo" }))
      .rejects.toBeInstanceOf(EvidenceError);
  });

  it.each(["jpeg", "webp"] as const)("registers valid synthetic %s and links its exact original as proof", async format => {
    const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: "#102030" } }).toFormat(format).toBuffer();
    const contentType = `image/${format}`;
    const upload = await begin(bytes, { contentType, maximumBytes: 5000 });
    storage.put(upload.objectKey, "valid-v1", bytes, contentType);
    const evidence = await service.finalize(context, { uploadId: upload.id, objectVersionId: "valid-v1", evidenceType: "site_photo" });
    expect(evidence.object_version_id).toBe("valid-v1");
    expect(evidence.sha256.trim()).toBe(hash(bytes));
    expect((await storage.readExactVersion(upload.objectKey, "valid-v1")).bytes).toEqual(bytes);
    await expect(service.linkAndAssertProof(context, { id: randomUUID(), evidenceId: upload.id, jobId: JOB, scopeItemId: SCOPE, requiredEvidenceType: "site_photo" }))
      .resolves.toMatchObject({ evidence_id: upload.id });
  });
});
