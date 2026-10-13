import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createWorkFixture, closeWorkFixture, seedWorkJob, insertPhoto, workEvents, workTenant, CH4_HASH, type WorkFixture } from "./job-work-state-fixtures.js";

describe("CH-4 existing source storage",()=>{
 let f:WorkFixture;
 beforeAll(async()=>{f=await createWorkFixture()},60000);afterAll(async()=>closeWorkFixture(f));
 it("CH4-A02 CH4-A11 only qualifying site sources create first site evidence; late processing preserves original server time",async()=>{
  const a=await seedWorkJob(f),id=await insertPhoto(f,a);
  const events=await workEvents(f,a);expect(events).toHaveLength(1);expect(events[0]).toMatchObject({kind:"first_site_evidence",fact_at:"2026-10-13T10:00:00.000001Z"});
  const source=await workTenant(f.runtime,a.tenantId,async db=>(await db.query("SELECT evidence_id,source_kind,object_version_id,source_hash FROM app.job_site_source_receipt WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId])).rows);
  expect(source).toHaveLength(1);expect(source[0]).toMatchObject({evidence_id:id,source_kind:"photo",source_hash:CH4_HASH});expect(source[0].object_version_id).toBeTruthy();
  await insertPhoto(f,a,"2026-10-13T10:00:00.000000Z","unknown_photo_label");expect(await workEvents(f,a)).toEqual(events);
 });
 it("CH4-A02 ready delivery note qualifies but supplier invoice and held delivery do not",async()=>{
  const a=await seedWorkJob(f);
  for(const [kind,status] of [["invoice","ready"],["delivery","held"],["delivery","ready"]]){
   await workTenant(f.runtime,a.tenantId,async db=>{
    const d=randomUUID();await db.query("INSERT INTO app.supplier_document(id,tenant_id,job_id,supplier_context,document_type,content_hash,status) VALUES($1,$2,$3,'fictional-'||$6,$4,$5,$6)",[d,a.tenantId,a.jobId,kind,CH4_HASH,status]);
    await db.query("INSERT INTO app.supplier_document_version(id,tenant_id,job_id,document_id,version,media_type,byte_length,content_hash,page_count) VALUES($1,$2,$3,$4,1,'text/plain',80,$5,1)",[randomUUID(),a.tenantId,a.jobId,d,CH4_HASH]);
   });
  }expect(await workEvents(f,a)).toHaveLength(1);
 });
 it("CH4-A03 delivery and receipt deduplicate their shared source",async()=>{
  const a=await seedWorkJob(f),d=randomUUID(),order=randomUUID();
  await workTenant(f.admin,a.tenantId,async db=>{
   await db.query("INSERT INTO app.supplier_document(id,tenant_id,job_id,supplier_context,document_type,content_hash,status) VALUES($1,$2,$3,'fictional','delivery',$4,'ready')",[d,a.tenantId,a.jobId,CH4_HASH]);
   await db.query("INSERT INTO app.supplier_document_version(id,tenant_id,job_id,document_id,version,media_type,byte_length,content_hash,page_count) VALUES($1,$2,$3,$4,1,'text/plain',80,$5,1)",[randomUUID(),a.tenantId,a.jobId,d,CH4_HASH]);
   // Goods FK setup is labelled boundary state; normal order admission is owned by the merged repository.
   await db.query("SET LOCAL session_replication_role='replica'");
   await db.query("INSERT INTO app.purchase_order_draft(id,tenant_id,job_id,requirement_id) VALUES($1,$2,$3,$4)",[order,a.tenantId,a.jobId,randomUUID()]);
   await db.query("SET LOCAL session_replication_role='origin'");
   await db.query("INSERT INTO app.goods_receipt(id,tenant_id,job_id,order_draft_id,document_id,revision,ordered_quantity,delivered_quantity,accepted_quantity,rejected_quantity,missing_quantity,unit) VALUES($1,$2,$3,$4,$5,1,1,1,1,0,0,'each')",[randomUUID(),a.tenantId,a.jobId,order,d]);
  });expect(await workEvents(f,a)).toHaveLength(1);
 });
});

describe("CH-4 existing builder capture command",()=>{
 let f:WorkFixture;beforeAll(async()=>{f=await createWorkFixture()},60000);afterAll(async()=>closeWorkFixture(f));
 it("CH4-A04 CH4-A10 capture activity follows command origin rather than variation writes and exact replay has one effect",async()=>{
  const {VariationRepository}=await import("../src/variation-repository.js"),a=await seedWorkJob(f),repo=new VariationRepository(f.runtime);
  const input={version:"log-builder-extra.v1",actorMembershipId:a.actorId,deviceId:null,deviceCapturedAt:null,price:null,proposal:{version:"variation-proposal.v1",id:randomUUID(),jobId:a.jobId,scopeItemId:randomUUID(),existingScopeItemId:null,lineageParentScopeItemId:null,captureKind:"text",captureText:"Fictional extra",description:"Fictional extra",suggestion:null}};
  const result=await repo.logBuilderExtra(a.context,input),events=await workEvents(f,a);expect(events).toHaveLength(1);expect(events[0].kind).toBe("site_activity");
  expect(await repo.logBuilderExtra(a.context,input)).toEqual(result);expect(await workEvents(f,a)).toEqual(events);
  await expect(repo.logBuilderExtra(a.context,{...input,proposal:{...input.proposal,description:"Changed description"}})).rejects.toThrow("COMMAND_CONFLICT");
  await repo.recordWithdrawal(a.context,{version:"variation-withdrawal.v1",reasonCode:"builder_withdrawn",id:randomUUID(),jobId:a.jobId,variationId:input.proposal.id,actorMembershipId:a.actorId});expect(await workEvents(f,a)).toEqual(events);
 });
});

describe("CH-4 verified proof and stage command sources",()=>{
 let f:WorkFixture;beforeAll(async()=>{f=await createWorkFixture()},60000);afterAll(async()=>closeWorkFixture(f));
 it("CH4-A02 CH4-A05 stage completion is activity and planning is not (real existing proof commands, storage fake)",async()=>{
  const {generatePracticePng}=await import("../../../apps/api/src/proof/proof.application.js"),{createHash}=await import("node:crypto");
  const {EvidenceService}=await import("../src/evidence.js"),{ProofCommandService}=await import("../src/proof-repository.js");
  const a=await seedWorkJob(f),bytes=generatePracticePng(),hash=createHash("sha256").update(bytes).digest("hex"),version=randomUUID();let storedKey="";
  const storage={createUploadUrl:async({key}:{key:string})=>{storedKey=key;return "synthetic.invalid/upload"},createDownloadUrl:async()=>"synthetic.invalid/download",readExactVersion:async(key:string,v:string)=>{if(key!==storedKey||v!==version)throw new Error("missing version");return {key,versionId:version,bytes,byteLength:bytes.length,contentType:"image/png"}},deleteExactVersion:async()=>{throw new Error("immutable")}};
  await workTenant(f.admin,a.tenantId,db=>db.query("INSERT INTO app.scope_progress(tenant_id,job_id,scope_item_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",[a.tenantId,a.jobId,a.scopeId]));
  const evidence=new EvidenceService(f.runtime,storage),upload=await evidence.beginUpload(a.context,{jobId:a.jobId,scopeItemId:a.scopeId,expectedSha256:hash,contentType:"image/png",maximumBytes:bytes.length,expiresAt:new Date(Date.now()+3600000)});
  expect(await workEvents(f,a)).toEqual([]);
  await evidence.finalize(a.context,{uploadId:upload.id,objectVersionId:version,evidenceType:"electrical_certificate"});expect(await workEvents(f,a)).toHaveLength(1);
  const command={version:"proof.complete.v1",commandId:randomUUID(),actorMembershipId:a.actorId,jobId:a.jobId,scopeItemId:a.scopeId,stage:"electrical-stage",evidenceId:upload.id,requiredEvidenceType:"electrical_certificate",decisionId:null};
  const proof=new ProofCommandService(f.runtime,storage),result=await proof.complete(a.context,command),events=await workEvents(f,a);
  expect(events.map(e=>e.kind)).toEqual(["first_site_evidence","site_activity"]);expect(await proof.complete(a.context,command)).toEqual(result);expect(await workEvents(f,a)).toEqual(events);
 });
});
