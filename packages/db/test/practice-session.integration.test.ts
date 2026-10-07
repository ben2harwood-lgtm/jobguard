import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { seedSyntheticPartyFixture } from "../src/synthetic-party-fixture.js";
import { closeTestPools } from "./pool-test-utils.js";
import { appendAuditBatch, migrate, MIGRATION_URLS, DEMO_TENANT_ID, DEMO_IDENTITY_USER_ID, DEMO_ACCOUNT_ID, DEMO_MEMBERSHIP_ID, CaptureRepository, SandboxRepository, MaterialRepository, listDecisionInbox, withTenant, issuePracticeSession, authenticatePracticeSession, authorizePracticeJob } from "../src/index.js";
const priorEnvironment=process.env.JOBGUARD_ENV;
const ownershipMigrationIndex = MIGRATION_URLS.findIndex(url => url.pathname.split("/").at(-1) === "0094_practice_session_ownership.sql");
if (ownershipMigrationIndex < 0) throw new Error("Practice ownership migration missing from migration list");
const precedingMigrations = MIGRATION_URLS.slice(0, ownershipMigrationIndex);
let pg: EmbeddedPostgres, admin: Pool, runtime: Pool, dir: string;
beforeAll(async () => {
 dir = await mkdtemp(join(tmpdir(), "sbox-session-pg-")); const port=57000+Math.floor(Math.random()*500);
 pg=new EmbeddedPostgres({databaseDir:dir,port,user:"postgres",password:"synthetic",persistent:false,createPostgresUser:process.getuid?.()===0,initdbFlags:["--lc-messages=C","--encoding=UTF8"],onLog:()=>undefined});
 await pg.initialise(); await pg.start(); admin=new Pool({host:"127.0.0.1",port,user:"postgres",password:"synthetic"});
 // Upgrade from the immediately preceding supported schema with an unbound legacy job.
 for (const url of precedingMigrations) await admin.query(await (await import("node:fs/promises")).readFile(url,"utf8"));
 await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)",[DEMO_TENANT_ID]);
 await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)",[DEMO_IDENTITY_USER_ID]);
 await admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Fictional builder')",[DEMO_ACCOUNT_ID,DEMO_TENANT_ID]);
 await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')",[DEMO_MEMBERSHIP_ID,DEMO_TENANT_ID,DEMO_ACCOUNT_ID,DEMO_IDENTITY_USER_ID]);
 await admin.query("INSERT INTO app.job(id,tenant_id,title) VALUES($1,$2,'Unbound legacy')",[legacyJob,DEMO_TENANT_ID]);
 await admin.query("INSERT INTO app.merchant(id,tenant_id,name) VALUES($1,$2,'Legacy fictional merchant')",[legacyMerchant,DEMO_TENANT_ID]);
 await admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
 for(const url of precedingMigrations)await admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)",[url.pathname.split("/").at(-1)]);
 await migrate(admin);
 await admin.query("CREATE ROLE sbox_login LOGIN PASSWORD 'synthetic' NOSUPERUSER NOBYPASSRLS; GRANT jobguard_runtime TO sbox_login");
 runtime=new Pool({host:"127.0.0.1",port,database:"postgres",user:"sbox_login",password:"synthetic"});
 process.env.JOBGUARD_ENV="synthetic_demo";
},60000);
afterAll(async()=>{if(priorEnvironment===undefined)delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=priorEnvironment;await closeTestPools(runtime,admin);await pg?.stop();if(dir)await rm(dir,{recursive:true,force:true});});
const legacyJob=randomUUID(),legacyMerchant=randomUUID();
async function captured(){
 const creator=await issuePracticeSession(runtime), stranger=await issuePracticeSession(runtime);
 const auth=await authenticatePracticeSession(runtime,creator),captureId=randomUUID();
 const provenance={kind:"extracted" as const,span:{sourceId:captureId,sourceVersion:1 as const,start:5,end:12}};
 const input={captureId,text:"JOB: Fictional\nITEM: Paint",proposal:{title:{value:"Fictional",provenance},lines:[{description:{value:"Paint",provenance},quantity:{value:null,provenance:{kind:"defaulted" as const,note:"unknown"}},unit:{value:null,provenance:{kind:"defaulted" as const,note:"unknown"}},unitPricePence:{value:null,provenance:{kind:"defaulted" as const,note:"unknown"}}}],materials:[],questions:[]},promptVersion:"fixture",schemaVersion:"fixture",model:"fixture",practiceSessionDigest:auth.digest};
 const saved=await new CaptureRepository(runtime).persist(auth.context,input);
 return {creator,stranger,auth,input,jobId:saved.job_id};
}
it("stranger first GET and POST authorization fail before any first-touch effect; creator and replay work",async()=>{
 const x=await captured();
 for(let attempt=0;attempt<2;attempt++)await expect(authorizePracticeJob(runtime,x.stranger,x.jobId)).rejects.toThrow("NOT_FOUND");
 const [owner,other]=await Promise.allSettled([authorizePracticeJob(runtime,x.creator,x.jobId),authorizePracticeJob(runtime,x.stranger,x.jobId)]);
 expect(owner.status).toBe("fulfilled");expect(other.status).toBe("rejected");
 expect((await new CaptureRepository(runtime).persist(x.auth.context,x.input)).job_id).toBe(x.jobId);
 const strangerAuth=await authenticatePracticeSession(runtime,x.stranger);
 await expect(new CaptureRepository(runtime).persist(strangerAuth.context,{...x.input,practiceSessionDigest:strangerAuth.digest})).rejects.toThrow("NOT_FOUND");
 expect((await admin.query("SELECT count(*)::int n FROM app.command_receipt WHERE tenant_id=$1",[DEMO_TENANT_ID])).rows[0].n).toBe(0);
});
it("unknown, missing, expired and revoked sessions fail closed; legacy jobs cannot be claimed",async()=>{
 for(const token of [undefined,randomUUID()])await expect(authorizePracticeJob(runtime,token,legacyJob)).rejects.toThrow("UNAUTHENTICATED");
 const token=await issuePracticeSession(runtime);await expect(authorizePracticeJob(runtime,token,legacyJob)).rejects.toThrow("NOT_FOUND");
 const auth=await authenticatePracticeSession(runtime,token);
 await admin.query("UPDATE control_plane.practice_session SET revoked_at=clock_timestamp() WHERE token_digest=$1",[auth.digest]);
 await expect(authenticatePracticeSession(runtime,token)).rejects.toThrow("UNAUTHENTICATED");
 const expired=await issuePracticeSession(runtime),e=await authenticatePracticeSession(runtime,expired);
 await admin.query("UPDATE control_plane.practice_session SET expires_at=clock_timestamp()-interval '1 second' WHERE token_digest=$1",[e.digest]);
 await expect(authenticatePracticeSession(runtime,expired)).rejects.toThrow("UNAUTHENTICATED");
});
it("raw runtime SQL cannot transfer or backfill ownership even with forged session settings",async()=>{
 const x=await captured(), stranger=await authenticatePracticeSession(runtime,x.stranger);
 for(const jobId of [x.jobId,legacyJob])await expect(withTenant(runtime,stranger.context,async db=>{
  await appendAuditBatch(db,[{id:randomUUID(),version:"audit.v1",actorRef:`membership:${stranger.membershipId}`,eventType:"practice.owner.claim_attempt",subjectType:"job",subjectRef:jobId,payload:{references:{jobId},classifications:{claim:"operational"}}}]);
  await db.$client.query("SELECT set_config('app.practice_feed_session',$1,true)",[x.stranger]);
  await db.$client.query("UPDATE app.job SET practice_session_digest=$1 WHERE tenant_id=$2 AND id=$3",[stranger.digest,DEMO_TENANT_ID,jobId]);
 })).rejects.toMatchObject({code:"42501"});
 expect((await admin.query("SELECT count(*)::int n FROM app.audit_event WHERE event_type='practice.owner.claim_attempt'")).rows[0].n).toBe(0);
 await expect(runtime.query("SELECT * FROM control_plane.practice_session")).rejects.toMatchObject({code:"42501"});
 const tables=await admin.query("SELECT relforcerowsecurity,relrowsecurity FROM pg_class WHERE oid='app.job'::regclass");
 expect(tables.rows[0]).toMatchObject({relforcerowsecurity:true,relrowsecurity:true});
 const role=await admin.query("SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname='sbox_login'");expect(role.rows[0]).toEqual({rolsuper:false,rolbypassrls:false});
});

it("rechecks current owner role, identity, membership expiry and revocation",async()=>{
 const token=await issuePracticeSession(runtime);
 for(const [column,value] of [["revoked_at",new Date()],["expires_at",new Date(0)],["role","member"]] as const){
  try{
   await admin.query(`UPDATE app.membership SET ${column}=$1 WHERE tenant_id=$2 AND id=$3`,[value,DEMO_TENANT_ID,DEMO_MEMBERSHIP_ID]);
   await expect(authenticatePracticeSession(runtime,token)).rejects.toThrow("UNAUTHENTICATED");
  }finally{
   await admin.query("UPDATE app.membership SET revoked_at=NULL,expires_at=NULL,role='owner' WHERE tenant_id=$1 AND id=$2",[DEMO_TENANT_ID,DEMO_MEMBERSHIP_ID]);
  }
 }
 expect((await authenticatePracticeSession(runtime,token)).membershipId).toBe(DEMO_MEMBERSHIP_ID);
});
it("migration-owner writes cannot reinterpret an unbound legacy creator",async()=>{
 const auth=await authenticatePracticeSession(runtime,await issuePracticeSession(runtime));
 const client=await admin.connect();try{
  await client.query("BEGIN");await client.query("SET LOCAL ROLE jobguard_migration");
  await client.query("SELECT set_config('app.tenant_id',$1,true)",[DEMO_TENANT_ID]);
  await expect(client.query("UPDATE app.job SET practice_session_digest=$1,practice_scenario='capture' WHERE tenant_id=$2 AND id=$3",[auth.digest,DEMO_TENANT_ID,legacyJob])).rejects.toThrow("PRACTICE_OWNER_IMMUTABLE");
 }finally{await client.query("ROLLBACK");client.release();}
});

it("the unscoped decision inbox selects only creation-owned jobs in SQL",async()=>{
 const a=await captured(),b=await captured();
 for(const x of [a,b]){
  const decision=randomUUID();
  await admin.query("INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type) VALUES($1,$2,'finding',$3,'check')",[decision,DEMO_TENANT_ID,x.jobId]);
  await admin.query("INSERT INTO app.job_finding(id,tenant_id,job_id,decision_id,fingerprint,kind,classification,title,detail,subject_ref,action_type,snapshot_revision) VALUES($1,$2,$3,$4,$5,'unresolved_question','mandatory','Fictional question','Fictional only',$6,'check',0)",[randomUUID(),DEMO_TENANT_ID,x.jobId,decision,randomUUID().replaceAll('-','').repeat(2),x.jobId]);
 }
 for(const x of [a,b]){
  const rows=await withTenant(runtime,x.auth.context,db=>listDecisionInbox(db,undefined,x.auth.digest));
  expect(rows.map((row:any)=>row.job_id)).toEqual([x.jobId]);
 }
});

it("sandbox runs bind at creation and store no bearer token in run/audit references",async()=>{
 const creator=await issuePracticeSession(runtime),stranger=await issuePracticeSession(runtime);
 const run=await new SandboxRepository(runtime).create(creator,randomUUID());
 await expect(authorizePracticeJob(runtime,stranger,run.jobId)).rejects.toThrow("NOT_FOUND");
 await expect(new SandboxRepository(runtime).read(stranger,run.id)).rejects.toMatchObject({code:"NOT_FOUND"});
 expect((await authorizePracticeJob(runtime,creator,run.jobId)).membershipId).toBe(DEMO_MEMBERSHIP_ID);
 const stored=(await admin.query("SELECT session_id::text FROM app.sandbox_run WHERE id=$1",[run.id])).rows[0];expect(stored.session_id).not.toBe(creator);
 expect((await admin.query("SELECT actor_ref FROM app.audit_event WHERE subject_ref=$1",[run.id])).rows.every((row:any)=>!row.actor_ref.includes(creator))).toBe(true);
});

it("two practice material catalogues never share versions, descriptions, rates or requirements",async()=>{
 expect((await admin.query("SELECT practice_session_digest FROM app.merchant WHERE id=$1",[legacyMerchant])).rows[0].practice_session_digest).toBeNull();
 const a=await captured(),b=await captured();
 const {practiceMaterialPool}=await import("../src/practice-session.js");
 const repoA=new MaterialRepository(practiceMaterialPool(runtime,a.auth.digest));
 const repoB=new MaterialRepository(practiceMaterialPool(runtime,b.auth.digest));
 const scopeA=randomUUID(),scopeB=randomUUID();
 for(const [x,scope] of [[a,scopeA],[b,scopeB]] as const)await admin.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')",[scope,DEMO_TENANT_ID,x.jobId]);
 const rate={merchantName:"M",sku:"S",description:"A's fictional description",pricePence:2000,priceUnit:"box" as const,packEachQuantity:"10",taxBasis:"net" as const,effectiveFrom:"2026-10-01",sourceLabel:"A fixture",expectedVersion:0};
 const firstA=await repoA.addRate(a.auth.context,rate);
 // B repeats the same name/SKU and expected version, with its own description.
 const firstB=await repoB.addRate(b.auth.context,{...rate,description:"B's fictional description",pricePence:3000,sourceLabel:"B fixture"});
 expect(firstA.version).toBe(1);expect(firstB.version).toBe(1);
 expect(firstB.merchantId).not.toBe(firstA.merchantId);expect(firstB.skuId).not.toBe(firstA.skuId);
 await repoA.addRequirement(a.auth.context,{jobId:a.jobId,scopeItemId:scopeA,skuId:firstA.skuId,quantity:"2",unit:"each",expectedRevision:0});
 await repoB.addRequirement(b.auth.context,{jobId:b.jobId,scopeItemId:scopeB,skuId:firstB.skuId,quantity:"2",unit:"each",expectedRevision:0});
 const before=await repoB.view(b.auth.context,b.jobId,"2026-10-07");
 expect(before).toMatchObject([{description:"B's fictional description",rateVersion:1,status:"applicable",eachPence:300,netPence:600,sourceLabel:"B fixture"}]);
 // Neither the guessed version nor the other session's SKU permits shared editing.
 await expect(repoB.addRate(b.auth.context,{...rate,expectedVersion:2})).rejects.toThrow("STALE_MATERIAL_RATE_REVISION");
 await expect(repoB.addRequirement(b.auth.context,{jobId:b.jobId,scopeItemId:scopeB,skuId:firstA.skuId,quantity:"2",unit:"each",expectedRevision:1})).rejects.toMatchObject({code:"42501"});
 await repoA.addRate(a.auth.context,{...rate,expectedVersion:1,pricePence:9000,packEachQuantity:"5",effectiveFrom:"2026-10-02"});
 expect(await repoB.view(b.auth.context,b.jobId,"2026-10-07")).toEqual(before);
 expect(await repoA.view(a.auth.context,b.jobId,"2026-10-07")).toEqual([]);
 const secondB=await repoB.addRate(b.auth.context,{...rate,description:"Ignored edit",expectedVersion:1,pricePence:4000,effectiveFrom:"2026-10-08",sourceLabel:"B future"});
 expect(secondB.version).toBe(2);expect(secondB.skuId).toBe(firstB.skuId);
 expect(await repoB.view(b.auth.context,b.jobId,"2026-10-07")).toEqual(before);
 for(const [table,id,digest] of [["merchant",firstA.merchantId,a.auth.digest],["merchant_sku",firstA.skuId,a.auth.digest],["material_rate_revision",firstA.id,a.auth.digest],["merchant",firstB.merchantId,b.auth.digest],["merchant_sku",firstB.skuId,b.auth.digest],["material_rate_revision",firstB.id,b.auth.digest]]){
  expect((await admin.query(`SELECT practice_session_digest FROM app.${table} WHERE id=$1`,[id])).rows[0].practice_session_digest).toBe(digest);
  await expect(admin.query(`UPDATE app.${table} SET practice_session_digest=$1 WHERE id=$2`,[digest===a.auth.digest?b.auth.digest:a.auth.digest,id])).rejects.toMatchObject({code:"42501"});
  await expect(withTenant(runtime,b.auth.context,db=>db.$client.query(`UPDATE app.${table} SET practice_session_digest=$1 WHERE id=$2`,[b.auth.digest,id]))).rejects.toMatchObject({code:"42501"});
 }
 // The pooled unscoped connection must not retain the preceding session digest.
 expect(await new MaterialRepository(runtime).view(b.auth.context,b.jobId,"2026-10-07")).toEqual([]);
 const catalogs=await admin.query("SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,r.rolname,has_table_privilege('jobguard_runtime',c.oid,'SELECT') can_read,has_table_privilege('jobguard_runtime',c.oid,'INSERT') can_insert,has_table_privilege('jobguard_runtime',c.oid,'UPDATE,DELETE,TRUNCATE') can_mutate FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner WHERE c.oid IN('app.merchant'::regclass,'app.merchant_sku'::regclass,'app.material_rate_revision'::regclass,'app.material_pack_conversion'::regclass,'app.merchant_sku_alias'::regclass,'app.material_requirement'::regclass)");
 expect(catalogs.rows).toHaveLength(6);
 for(const row of catalogs.rows)expect(row).toMatchObject({relrowsecurity:true,relforcerowsecurity:true,rolname:"jobguard_migration",can_read:true,can_insert:true,can_mutate:false});
});


it("the non-practice material path retains tenant-wide revisions and descriptions",async()=>{
 const tenant=randomUUID(),jobId=randomUUID(),scopeItemId=randomUUID();
 await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)",[tenant]);
 await admin.query("INSERT INTO app.job(id,tenant_id,title) VALUES($1,$2,'Fictional real-tenant path')",[jobId,tenant]);
 await admin.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')",[scopeItemId,tenant,jobId]);
 const context={tenantId:tenant} as import("../src/tenant-context.js").VerifiedTenantContext;
 const repo=new MaterialRepository(runtime);
 const input={merchantName:"M",sku:"S",description:"Original tenant description",pricePence:2000,priceUnit:"each" as const,taxBasis:"net" as const,effectiveFrom:"2026-10-01",sourceLabel:"synthetic fixture",expectedVersion:0};
 const first=await repo.addRate(context,input);
 await repo.addRequirement(context,{jobId,scopeItemId,skuId:first.skuId,quantity:"2",unit:"each",expectedRevision:0});
 await expect(repo.addRate(context,input)).rejects.toThrow("STALE_MATERIAL_RATE_REVISION");
 const next=await repo.addRate(context,{...input,description:"Later description",pricePence:3000,effectiveFrom:"2026-10-08",expectedVersion:1});
 expect(next).toMatchObject({version:2,merchantId:first.merchantId,skuId:first.skuId});
 expect(await repo.view(context,jobId,"2026-10-07")).toMatchObject([{description:input.description,rateVersion:1,status:"applicable",netPence:4000}]);
 expect((await admin.query("SELECT practice_session_digest FROM app.material_rate_revision WHERE id=$1",[next.id])).rows[0].practice_session_digest).toBeNull();
});


it("practice merchant evidence packs approve with session-scoped rates and still deny strangers", async () => {
 const { EvidencePackApplication } = await import("../../../apps/api/src/evidence-pack.application.js");
 const { RecoveryCaseApplication } = await import("../../../apps/api/src/recovery-case.application.js");
 const { practiceMaterialPool } = await import("../src/practice-session.js");
 const x = await captured(), tenantId = DEMO_TENANT_ID, jobId = x.jobId, memberId = DEMO_MEMBERSHIP_ID;
 const scopeId = randomUUID(), quoteId = randomUUID(), quoteDraftId = randomUUID(), quoteRevisionId = randomUUID(), acceptanceId = randomUUID();
 const proofId = randomUUID(), uploadId = randomUUID();
 const hash = (text: string) => createHash("sha256").update(text).digest("hex");
 const proofBytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aNioAAAAASUVORK5CYII=", "base64");
 const proofHash = createHash("sha256").update(proofBytes).digest("hex");
 const db = await admin.connect();
 try {
  await db.query("BEGIN");
    // This pre-CH-3a test assembles a quote directly; supply its fictional parties
    // explicitly rather than bypassing the document guard. Capture itself remains unbound.
    await db.query("SELECT set_config('app.tenant_id',$1,true)", [tenantId]);
    await seedSyntheticPartyFixture(db, tenantId, jobId);
    await db.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')", [scopeId, tenantId, jobId]);
    await db.query("INSERT INTO app.quote_draft(id,tenant_id,job_id) VALUES($1,$2,$3)", [quoteDraftId, tenantId, jobId]);
    await db.query("INSERT INTO app.quote_revision(id,tenant_id,job_id,quote_draft_id,revision,currency,tax_policy_version,subtotal_pence,discount_pence,net_pence,tax_pence,total_pence,issuable,blockers) VALUES($1,$2,$3,$4,1,'GBP','candidate_m1_standard_v1',1880000,0,1880000,376000,2256000,true,'[]')", [quoteRevisionId, tenantId, jobId, quoteDraftId]);
    await db.query("INSERT INTO app.quote_document_version(id,tenant_id,job_id,quote_revision_id,document_version,reference,content_hash,object_key,object_version_id,pdf_byte_length,issuer,customer,snapshot) VALUES($1,$2,$3,$4,1,'FIXTURE-QUOTE-1',$5,'fixture/quote','quote-object-v1',1,'{}','{}',$6)", [quoteId, tenantId, jobId, quoteRevisionId, hash("quote immutable fixture"), {netPence:1880000,taxPence:376000,totalPence:2256000}]);
    await db.query("INSERT INTO app.quote_version(id,tenant_id,job_id,version,content_hash,net_value_pence,status) VALUES($1,$2,$3,1,$4,1880000,'accepted')", [quoteId, tenantId, jobId, hash("quote immutable fixture")]);
    await db.query("UPDATE app.job SET accepted_quote_version_id=$1,status='accepted' WHERE tenant_id=$2 AND id=$3", [quoteId,tenantId,jobId]);
    await db.query("INSERT INTO app.quote_acceptance(id,tenant_id,job_id,document_id,document_version,document_hash,accepted_total_pence,currency,acceptance_kind,actor_membership_id,stated_customer_name,stated_method,accepted_at) VALUES($1,$2,$3,$4,1,$5,2256000,'GBP','builder_attestation',$6,'Fictional Customer','verbal','2026-09-20T12:00:00Z')", [acceptanceId, tenantId, jobId, quoteId, hash("quote immutable fixture"), memberId]);
    await db.query("INSERT INTO app.evidence_upload(id,tenant_id,job_id,scope_item_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,state,object_version_id,server_verified_at,expires_at) VALUES($1,$2,$3,$4,'fixture/proof',$5,'image/png',$6,'standard_evidence','verified','proof-object-v1',now(),now()+interval '1 hour')", [uploadId, tenantId, jobId, scopeId, proofHash, proofBytes.length]);
    await db.query("INSERT INTO app.synthetic_evidence_original(tenant_id,upload_id,job_id,scope_item_id,object_key,object_version_id,environment,content_type,bytes) VALUES($1,$2,$3,$4,'fixture/proof','proof-object-v1','synthetic_demo','image/png',$5)", [tenantId, uploadId, jobId, scopeId, proofBytes]);
    await db.query("INSERT INTO app.evidence_object(id,tenant_id,upload_id,job_id,scope_item_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at) VALUES($1,$2,$3,$4,$5,'original','site_photo','fixture/proof','proof-object-v1',$6,$7,'image/png','standard_evidence',now(),now())", [proofId, tenantId, uploadId, jobId, scopeId, proofHash, proofBytes.length]);

  await db.query("COMMIT");
 } catch (error) { await db.query("ROLLBACK"); throw error; } finally { db.release(); }
 const rate = await new MaterialRepository(practiceMaterialPool(runtime, x.auth.digest)).addRate(x.auth.context, {
  merchantName: "Fictional pack merchant", sku: "PACK-SESSION", description: "Synthetic pack material", pricePence: 2000,
  priceUnit: "each", taxBasis: "net", effectiveFrom: "2026-09-01", sourceLabel: "Synthetic agreement", expectedVersion: 0,
 });
 await new MaterialRepository(practiceMaterialPool(runtime, x.auth.digest)).addRequirement(x.auth.context, {
  jobId, scopeItemId: scopeId, skuId: rate.skuId, quantity: "40", unit: "each", expectedRevision: 0,
 });
 expect((await admin.query("SELECT practice_session_digest FROM app.material_rate_revision WHERE id=$1", [rate.id])).rows[0].practice_session_digest).toBe(x.auth.digest);
 const supplierIds = [randomUUID(), randomUUID()];
 for (const [id, type] of [[supplierIds[0], "invoice"], [supplierIds[1], "delivery"]] as const) {
  await admin.query("INSERT INTO app.supplier_document(id,tenant_id,job_id,supplier_context,document_type,document_number,content_hash,status) VALUES($1,$2,$3,'fictional-merchant',$4,$5,$6,'ready')", [id, tenantId, jobId, type, `SYNTHETIC-${type}`, hash(type)]);
  await admin.query("INSERT INTO app.supplier_document_version(id,tenant_id,job_id,document_id,version,media_type,byte_length,content_hash,page_count) VALUES($1,$2,$3,$4,1,'text/plain',1,$5,1)", [randomUUID(), tenantId, jobId, id, hash(type)]);
 }
 const opened = await new RecoveryCaseApplication(runtime, x.creator).command(jobId, {
  version: "recovery-case-command.v1", action: "open", commandId: randomUUID(), caseType: "merchant_overcharge",
  claimedNetPence: 32000, counterparty: "Fictional merchant", book: "supplier_cost", sourceType: "supplier_documents",
  sourceRefs: [rate.id, ...supplierIds], reviewerRef: "practice-owner", expectedRevision: 0,
 });
 const caseId = opened.cases.at(-1)!.id, app = new EvidencePackApplication(runtime);
 const generated = await app.generate(x.creator, caseId, { version: "evidence-pack-command.v1", commandId: randomUUID() });
 const pack = generated.packs.at(-1)!;
 expect(pack.omissions).toEqual([]);
 expect(pack.sources.some(source => source.sourceId === `material_rate_revision:${rate.id}`)).toBe(true);
 const approval = { version: "evidence-pack-attachment-approval.v1", commandId: randomUUID(), expectedManifestHash: pack.manifestHash, expectedContentHash: pack.contentHash };
 const approved = await app.approveAttachment(x.creator, caseId, pack.id, approval);
 expect(approved.packs.at(-1)).toMatchObject({ id: pack.id, attachmentApprovalRecorded: true, attachmentApprovalValid: true });
 expect((await app.list(x.creator, caseId)).packs.at(-1)).toMatchObject({ attachmentApprovalRecorded: true, attachmentApprovalValid: true });
 expect(createHash("sha256").update(await app.download(x.creator, caseId, pack.id)).digest("hex")).toBe(pack.contentHash);
 expect(await app.inspect(x.creator, caseId, pack.id)).toMatchObject({ contentMatches: true });
 for (const denied of [
  () => app.list(x.stranger, caseId), () => app.generate(x.stranger, caseId, { version: "evidence-pack-command.v1", commandId: randomUUID() }),
  () => app.approveAttachment(x.stranger, caseId, pack.id, { ...approval, commandId: randomUUID() }),
  () => app.inspect(x.stranger, caseId, pack.id), () => app.download(x.stranger, caseId, pack.id),
 ]) await expect(denied()).rejects.toMatchObject({ code: "NOT_FOUND" });
 expect((await app.list(x.creator, caseId)).packs).toEqual(approved.packs);
});
