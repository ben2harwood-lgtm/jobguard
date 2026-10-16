import { randomUUID, createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type QuoteLine, quoteDocumentV1, renderQuotePdf } from "@jobguard/core";
import { migrate, withTenant, QuoteRepository, QuoteDeliveryRepository, QuoteDocumentRepository, QuoteAcceptanceRepository, DEMO_TENANT_ID as T, DEMO_MEMBERSHIP_ID as M } from "../src/index.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { closeTestPools, freePort, installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";

const context = testTenantContext(T), original = process.env.JOBGUARD_ENV;
let pg: EmbeddedPostgres | undefined, admin: Pool, runtime: Pool, dir: string;
beforeAll(async () => {
  process.env.JOBGUARD_ENV = "synthetic_demo";
  dir = await mkdtemp(join(tmpdir(), "serious-b3-quotes-"));
  const port = await freePort(57500,200);
  pg = new EmbeddedPostgres({databaseDir:dir,port,user:"postgres",password:"synthetic",persistent:false,createPostgresUser:process.getuid?.()===0,initdbFlags:["--lc-messages=C","--encoding=UTF8"],onLog:()=>undefined});
  await pg.initialise(); await pg.start();
  admin = new Pool({host:"127.0.0.1",port,user:"postgres",password:"synthetic"});
  await migrate(admin); await installLegacySyntheticPartyFixtures(admin);
  const user = randomUUID(), account = randomUUID();
  await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)",[T]);
  await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)",[user]);
  await admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Synthetic Builder')",[account,T]);
  await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')",[M,T,account,user]);
  await admin.query("CREATE ROLE serious_b3_login LOGIN PASSWORD 'synthetic' NOSUPERUSER NOBYPASSRLS; GRANT jobguard_runtime TO serious_b3_login");
  runtime = new Pool({host:"127.0.0.1",port,database:"postgres",user:"serious_b3_login",password:"synthetic",max:4});
},90_000);
afterAll(async () => {
  await closeTestPools(runtime,admin); await pg?.stop(); if(dir) await rm(dir,{recursive:true,force:true});
  if(original===undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV=original;
});
async function fixture(count=1) {
  const jobId=randomUUID(), draftId=randomUUID(), lines:QuoteLine[]=[];
  await withTenant(runtime,context,async db => {
    await db.$client.query("INSERT INTO app.job(id,tenant_id,title,status) VALUES($1,$2,'Synthetic quote','quoting')",[jobId,T]);
    for(let index=0;index<count;index++) {
      const scopeItemId=randomUUID(),scopeRevisionId=randomUUID();
      await db.$client.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')",[scopeItemId,T,jobId]);
      await db.$client.query("INSERT INTO app.scope_revision(id,tenant_id,job_id,scope_item_id,revision,description,quantity_decimal,unit,unit_price_pence,total_pence) VALUES($1,$2,$3,$4,1,$5,'1','item',10000,10000)",[scopeRevisionId,T,jobId,scopeItemId,`Synthetic work ${index+1}`]);
      lines.push({id:randomUUID(),scopeItemId,scopeRevisionId,description:`Synthetic work ${index+1}`,origin:"captured",included:true,exclusionReason:null,quantity:"1",unit:"item",unitRatePence:10000,discountPercent:"0",taxTreatment:"standard_rate_20",rateProvenance:"entered",category:null,region:null});
    }
  });
  const quotes=new QuoteRepository(runtime),delivery=new QuoteDeliveryRepository(runtime),acceptance=new QuoteAcceptanceRepository(runtime);
  const save=(submitted:QuoteLine[],expectedRevision=0)=>quotes.saveDraft(context,{jobId,draftId,expectedRevision,currency:"GBP",taxPolicyVersion:"candidate_m1_standard_v1",lines:submitted,effectiveAt:new Date("2026-10-16T10:00:00Z")});
  return {jobId,draftId,lines,quotes,delivery,acceptance,save};
}
// Seed the predecessor's persisted A-only/issuable=true state while A+B are confirmed.
// Do not use saveDraft or preview: those boundaries must now refuse this state.
async function preFixDraft(f:Awaited<ReturnType<typeof fixture>>,withPreview=false){
  const revisionId=randomUUID(),documentId=randomUUID(),line=f.lines[0]!;
  return withTenant(runtime,context,async db=>{
    await db.$client.query("INSERT INTO app.quote_draft(id,tenant_id,job_id) VALUES($1,$2,$3)",[f.draftId,T,f.jobId]);
    await db.$client.query(`INSERT INTO app.quote_revision(id,tenant_id,job_id,quote_draft_id,revision,currency,tax_policy_version,subtotal_pence,discount_pence,net_pence,tax_pence,total_pence,issuable,blockers) VALUES($1,$2,$3,$4,1,'GBP','candidate_m1_standard_v1',10000,0,10000,2000,12000,true,'[]')`,[revisionId,T,f.jobId,f.draftId]);
    await db.$client.query(`INSERT INTO app.quote_line(id,tenant_id,job_id,quote_revision_id,scope_item_id,scope_revision_id,origin,description,included,quantity_decimal,unit,unit_rate_pence,discount_decimal,tax_treatment,rate_provenance,ordinal) VALUES($1,$2,$3,$4,$5,$6,'captured',$7,true,'1','item',10000,'0','standard_rate_20','entered',1)`,[randomUUID(),T,f.jobId,revisionId,line.scopeItemId,line.scopeRevisionId,line.description]);
    await db.$client.query("UPDATE app.quote_draft SET current_revision_id=$1,revision=1 WHERE tenant_id=$2 AND id=$3",[revisionId,T,f.draftId]);
    if(!withPreview)return null;
    const parties=(await db.$client.query("SELECT app.require_current_job_parties($1,$2) AS snapshot",[T,f.jobId])).rows[0]!.snapshot;
    const document=quoteDocumentV1.parse({schemaVersion:"quote-document.v1",jobParties:parties,documentVersion:1,reference:"Q-0001",quoteRevisionId:revisionId,currency:"GBP",issuer:{name:"Synthetic Builder",address:["Fictional Road"],email:"builder@example.invalid"},customer:{name:parties.customer.name,address:[...parties.site.addressLines,parties.site.town,parties.site.postcode],email:"a@example.invalid"},lines:[{scopeItemId:line.scopeItemId,description:line.description,quantity:"1",unit:"item",netPence:10000}],exclusions:[],qualifications:[],subtotalPence:10000,discountPence:0,netPence:10000,taxPence:2000,totalPence:12000});
    const pdf=renderQuotePdf(document),hash=createHash("sha256").update(pdf).digest("hex");
    await db.$client.query(`INSERT INTO app.quote_document_version(id,tenant_id,job_id,quote_revision_id,document_version,reference,content_hash,object_key,object_version_id,pdf_byte_length,issuer,customer,snapshot) VALUES($1,$2,$3,$4,1,'Q-0001',$5,$6,$5,$7,$8,$9,$10)`,[documentId,T,f.jobId,revisionId,hash,`synthetic/${documentId}.pdf`,pdf.byteLength,JSON.stringify(document.issuer),JSON.stringify(document.customer),JSON.stringify(document)]);
    return {documentId,hash,pdf,document};
  });
}
describe("SERIOUS-B3 quote regressions (real PostgreSQL required)",()=>{
  it("S07 preview freezes calculated discounted line nets and agrees with the header and PDF",async()=>{
    const f=await fixture(2);
    await f.save([{...f.lines[0]!,quantity:"2",discountPercent:"5"},{...f.lines[1]!,quantity:"1.5",unitRatePence:2000}]);
    const preview=await f.delivery.preview(context,f.jobId,"a@example.invalid");
    expect(preview.document.lines.map(l=>l.netPence)).toEqual([19000,3000]);
    expect(preview.document.lines.reduce((sum,l)=>sum+l.netPence,0)).toBe(preview.document.netPence);
    expect(new TextDecoder().decode(preview.pdf)).toContain("2 item | GBP 190.00");
    expect((await f.delivery.pdf(context,f.jobId,preview.documentId)).pdf).toEqual(preview.pdf);
  });
  it("S07 replaces an old contradictory preview with a new version and preserves its original bytes",async()=>{
    const f=await fixture(), saved=await f.save([{...f.lines[0]!,quantity:"2"}]), oldId=randomUUID();
    const old=await new QuoteDocumentRepository(runtime).create(context,{jobId:f.jobId,documentId:oldId,quoteRevisionId:saved.id,objectVersionId:"synthetic-old-version",document:{schemaVersion:"quote-document.v1",documentVersion:1,reference:"Q-0001",quoteRevisionId:saved.id,currency:"GBP",issuer:{name:"Synthetic Builder",address:["Fictional Road"],email:"builder@example.invalid"},customer:{name:"Synthetic Customer",address:["Fictional Street"],email:"a@example.invalid"},lines:[{scopeItemId:f.lines[0]!.scopeItemId,description:f.lines[0]!.description,quantity:"2",unit:"item",netPence:10000}],exclusions:[],qualifications:[],subtotalPence:20000,discountPence:0,netPence:20000,taxPence:4000,totalPence:24000}});
    const corrected=await f.delivery.preview(context,f.jobId,"a@example.invalid");
    expect(corrected.documentId).not.toBe(oldId);
    expect(corrected.document.documentVersion).toBe(2);
    expect(corrected.document.lines[0]?.netPence).toBe(20000);
    expect((await f.delivery.pdf(context,f.jobId,oldId)).pdf).toEqual(old.pdf);
  });
  it("S08 omitted confirmed scope blocks issue until it is included or explicitly excluded",async()=>{
    const f=await fixture(2), omitted=f.lines[1]!;
    const first=await f.save([f.lines[0]!]);
    expect(first.issuable).toBe(false);
    expect(first.blockers).toContainEqual(expect.objectContaining({scopeItemId:omitted.scopeItemId}));
    await expect(f.delivery.preview(context,f.jobId,"a@example.invalid")).rejects.toThrow("QUOTE_NOT_ISSUABLE");
    const second=await f.save([f.lines[0]!,{...omitted,included:false,exclusionReason:"Customer doing it"}],1);
    expect(second.issuable).toBe(true);
    expect(second.coverage.excluded).toContainEqual({scopeItemId:omitted.scopeItemId,description:omitted.description,reason:"Customer doing it"});
    const stored=await f.quotes.readWorkspace(context,f.jobId);
    expect(stored.revisions[0]?.issuable).toBe(false);
    expect(stored.revisions[1]?.lines.find((l:QuoteLine)=>l.scopeItemId===omitted.scopeItemId)?.exclusionReason).toBe("Customer doing it");
  });
  it("S08 r1 preview refuses a pre-fix A-only draft with persisted issuable=true until B is covered",async()=>{
    for(const excluded of [false,true]){
      const f=await fixture(2);
      await preFixDraft(f);
      const before=(await admin.query("SELECT row_to_json(r)::text bytes FROM app.quote_revision r WHERE job_id=$1",[f.jobId])).rows;
      await expect(f.delivery.preview(context,f.jobId,"a@example.invalid")).rejects.toMatchObject({message:"QUOTE_NOT_ISSUABLE",blockers:[{code:"missing_scope",scopeItemId:f.lines[1]!.scopeItemId}]});
      expect((await admin.query("SELECT count(*)::int n FROM app.quote_document_version WHERE job_id=$1",[f.jobId])).rows[0].n).toBe(0);
      expect((await admin.query("SELECT row_to_json(r)::text bytes FROM app.quote_revision r WHERE job_id=$1",[f.jobId])).rows).toEqual(before);
      const covered=excluded?[f.lines[0]!,{...f.lines[1]!,included:false,exclusionReason:"Customer doing it"}]:f.lines;
      await f.save(covered,1);
      const preview=await f.delivery.preview(context,f.jobId,"a@example.invalid");
      expect(preview.document.lines.map(line=>line.scopeItemId)).toEqual(covered.filter(line=>line.included).map(line=>line.scopeItemId));
      await expect(f.delivery.issue(context,f.jobId,{documentId:preview.documentId,contentHash:preview.hash,recipient:"a@example.invalid",commandId:randomUUID()})).resolves.toMatchObject({status:"queued"});
    }
  });
  it("S08 r1 refuses creation, reuse and issue of a pre-fix unissued A-only preview without effects",async()=>{
    const f=await fixture(2),old=(await preFixDraft(f,true))!;
    const revisionId=(await admin.query("SELECT current_revision_id FROM app.quote_draft WHERE id=$1",[f.draftId])).rows[0].current_revision_id;
    const before=(await admin.query("SELECT row_to_json(d)::text bytes FROM app.quote_document_version d WHERE id=$1",[old.documentId])).rows;
    const effects=async()=> (await admin.query(`SELECT (SELECT count(*) FROM app.quote_send WHERE job_id=$1) sends,(SELECT count(*) FROM app.command_receipt WHERE tenant_id=$2) commands,(SELECT count(*) FROM app.action_authorization WHERE tenant_id=$2) approvals,(SELECT count(*) FROM app.action_outbox WHERE tenant_id=$2) actions,(SELECT count(*) FROM app.audit_event WHERE tenant_id=$2) audits`,[f.jobId,T])).rows;
    const beforeEffects=await effects();
    await expect(f.delivery.preview(context,f.jobId,"a@example.invalid")).rejects.toMatchObject({message:"QUOTE_NOT_ISSUABLE",blockers:[{code:"missing_scope",scopeItemId:f.lines[1]!.scopeItemId}]});
    await expect(new QuoteDocumentRepository(runtime).create(context,{jobId:f.jobId,documentId:randomUUID(),quoteRevisionId:revisionId,objectVersionId:"synthetic-r1",document:old.document})).rejects.toMatchObject({message:"QUOTE_NOT_ISSUABLE",blockers:[{code:"missing_scope",scopeItemId:f.lines[1]!.scopeItemId}]});
    await expect(f.delivery.issue(context,f.jobId,{documentId:old.documentId,contentHash:old.hash,recipient:"a@example.invalid",commandId:randomUUID()})).rejects.toMatchObject({message:"QUOTE_NOT_ISSUABLE",blockers:[{code:"missing_scope",scopeItemId:f.lines[1]!.scopeItemId}]});
    expect(await effects()).toEqual(beforeEffects);
    expect((await admin.query("SELECT row_to_json(d)::text bytes FROM app.quote_document_version d WHERE id=$1",[old.documentId])).rows).toEqual(before);
    expect((await f.delivery.pdf(context,f.jobId,old.documentId)).pdf).toEqual(old.pdf);
  });
  it("S08 r1 issue rechecks new confirmed scope against the named document rather than a newer complete draft",async()=>{
    const f=await fixture();await f.save(f.lines);
    const old=await f.delivery.preview(context,f.jobId,"a@example.invalid"),scopeItemId=randomUUID(),scopeRevisionId=randomUUID();
    await withTenant(runtime,context,async db=>{
      await db.$client.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')",[scopeItemId,T,f.jobId]);
      await db.$client.query("INSERT INTO app.scope_revision(id,tenant_id,job_id,scope_item_id,revision,description,quantity_decimal,unit,unit_price_pence,total_pence) VALUES($1,$2,$3,$4,1,'Synthetic new work','1','item',10000,10000)",[scopeRevisionId,T,f.jobId,scopeItemId]);
    });
    await expect(f.delivery.preview(context,f.jobId,"a@example.invalid")).rejects.toMatchObject({message:"QUOTE_NOT_ISSUABLE",blockers:[{code:"missing_scope",scopeItemId}]});
    await f.save([...f.lines,{...f.lines[0]!,id:randomUUID(),scopeItemId,scopeRevisionId,description:"Synthetic new work"}],1);
    await expect(f.delivery.issue(context,f.jobId,{documentId:old.documentId,contentHash:old.hash,recipient:"a@example.invalid",commandId:randomUUID()})).rejects.toMatchObject({message:"QUOTE_NOT_ISSUABLE",blockers:[{code:"missing_scope",scopeItemId}]});
    expect((await f.delivery.pdf(context,f.jobId,old.documentId)).pdf).toEqual(old.pdf);
  });
  it("S09 rejects another item's source revision without draft, line, observation or audit effects",async()=>{
    const f=await fixture(2);
    const counts=async()=> (await admin.query(`SELECT (SELECT count(*)::int FROM app.quote_draft WHERE job_id=$1) drafts,(SELECT count(*)::int FROM app.quote_revision WHERE job_id=$1) revisions,(SELECT count(*)::int FROM app.quote_line WHERE job_id=$1) lines,(SELECT count(*)::int FROM app.rate_book_observation WHERE job_id=$1) observations,(SELECT count(*)::int FROM app.audit_event WHERE tenant_id=$2) audits`,[f.jobId,T])).rows[0];
    const before=await counts();
    await expect(f.save([{...f.lines[0]!,scopeRevisionId:f.lines[1]!.scopeRevisionId},f.lines[1]!])).rejects.toThrow("QUOTE_SCOPE_REVISION_MISMATCH");
    expect(await counts()).toEqual(before);
    await expect(f.save(f.lines)).resolves.toMatchObject({issuable:true,revision:1});
  });
  it("S09 rejects a real revision from another job or tenant",async()=>{
    const f=await fixture(), other=await fixture();
    await expect(f.save([{...f.lines[0]!,scopeRevisionId:other.lines[0]!.scopeRevisionId}])).rejects.toThrow("QUOTE_SCOPE_REVISION_MISMATCH");
    const anotherTenant=randomUUID(),job=randomUUID(),item=randomUUID(),source=randomUUID();
    await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)",[anotherTenant]);
    await withTenant(admin,testTenantContext(anotherTenant),async db=>{
      await db.$client.query("INSERT INTO app.job(id,tenant_id,title,status) VALUES($1,$2,'Synthetic other tenant','quoting')",[job,anotherTenant]);
      await db.$client.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')",[item,anotherTenant,job]);
      await db.$client.query("INSERT INTO app.scope_revision(id,tenant_id,job_id,scope_item_id,revision,description,quantity_decimal,unit) VALUES($1,$2,$3,$4,1,'Synthetic other source','1','item')",[source,anotherTenant,job,item]);
    });
    await expect(f.save([{...f.lines[0]!,scopeRevisionId:source}])).rejects.toThrow("QUOTE_SCOPE_REVISION_MISMATCH");
    expect((await admin.query("SELECT count(*)::int n FROM app.quote_draft WHERE job_id=$1",[f.jobId])).rows[0].n).toBe(0);
  });
  it("S09 runtime SQL cannot bypass item/revision ownership for lines or rate observations",async()=>{
    const f=await fixture(2), saved=await f.save(f.lines), next=randomUUID();
    await withTenant(runtime,context,db=>db.$client.query(`INSERT INTO app.quote_revision(id,tenant_id,job_id,quote_draft_id,revision,previous_revision_id,currency,tax_policy_version,subtotal_pence,discount_pence,net_pence,tax_pence,total_pence,issuable,blockers) SELECT $1,tenant_id,job_id,quote_draft_id,2,id,currency,tax_policy_version,subtotal_pence,discount_pence,net_pence,tax_pence,total_pence,issuable,blockers FROM app.quote_revision WHERE id=$2`,[next,saved.id]));
    await expect(withTenant(runtime,context,db=>db.$client.query(`INSERT INTO app.quote_line(id,tenant_id,job_id,quote_revision_id,scope_item_id,scope_revision_id,origin,description,included,exclusion_reason,quantity_decimal,unit,unit_rate_pence,discount_decimal,tax_treatment,rate_provenance,category,region,ordinal) SELECT $1,tenant_id,job_id,$2,scope_item_id,$3,origin,description,included,exclusion_reason,quantity_decimal,unit,unit_rate_pence,discount_decimal,tax_treatment,rate_provenance,category,region,ordinal FROM app.quote_line WHERE quote_revision_id=$4 AND scope_item_id=$5`,[randomUUID(),next,f.lines[1]!.scopeRevisionId,saved.id,f.lines[0]!.scopeItemId]))).rejects.toMatchObject({code:"23503"});
    await expect(withTenant(runtime,context,db=>db.$client.query(`INSERT INTO app.rate_book_observation(id,tenant_id,job_id,scope_item_id,source_scope_revision_id,unit,rate_principal_pence,currency,tax_basis,effective_at,provenance) VALUES($1,$2,$3,$4,$5,'different-unit',10000,'GBP','standard_rate_20',transaction_timestamp(),'entered')`,[randomUUID(),T,f.jobId,f.lines[0]!.scopeItemId,f.lines[1]!.scopeRevisionId]))).rejects.toMatchObject({code:"23503"});
    expect((await admin.query("SELECT count(*)::int n FROM app.quote_line WHERE quote_revision_id=$1",[next])).rows[0].n).toBe(0);
  });
  it("S10 named delivery view binds reused A to A's bytes after an A-B-A preview sequence",async()=>{
    const f=await fixture();await f.save(f.lines);
    const a=await f.delivery.preview(context,f.jobId,"a@example.invalid");
    await f.delivery.preview(context,f.jobId,"b@example.invalid");
    const again=await f.delivery.preview(context,f.jobId,"a@example.invalid");
    expect(again.documentId).toBe(a.documentId);
    // Extra JS argument deliberately exercises today's API before the optional named lookup exists.
    const view=await Reflect.apply(f.delivery.view,f.delivery,[context,f.jobId,again.documentId]);
    const artifact=await f.delivery.pdf(context,f.jobId,view.documentId);
    expect(artifact.pdf).toEqual(renderQuotePdf(again.document));
    expect(createHash("sha256").update(artifact.pdf).digest("hex")).toBe(view.contentHash);
    expect(view).toMatchObject({documentId:a.documentId,recipient:again.document.customer.email,documentVersion:again.document.documentVersion});
    const sent=await f.delivery.issue(context,f.jobId,{documentId:a.documentId,contentHash:a.hash,recipient:"a@example.invalid",commandId:randomUUID()});
    expect(sent).toMatchObject({documentId:a.documentId,recipient:"a@example.invalid",status:"queued"});
    expect(await f.delivery.execute(context,f.jobId,a.documentId,"success")).toMatchObject({documentId:a.documentId,recipient:"a@example.invalid",status:"simulated_delivery"});
  });
  it("S11 a newer preview does not restore authority for an explicitly superseded issued document",async()=>{
    const f=await fixture();await f.save(f.lines);
    const issued=await f.delivery.preview(context,f.jobId,"a@example.invalid");
    await f.delivery.issue(context,f.jobId,{commandId:randomUUID(),documentId:issued.documentId,contentHash:issued.hash,recipient:"a@example.invalid"});
    await f.acceptance.disposition(context,f.jobId,{commandId:randomUUID(),documentId:issued.documentId,documentHash:issued.hash,documentVersion:issued.document.documentVersion,kind:"superseded",occurredAt:"2026-10-16T10:30:00.000Z"});
    await f.delivery.preview(context,f.jobId,"b@example.invalid");
    await expect(f.acceptance.accept(context,f.jobId,{commandId:randomUUID(),documentId:issued.documentId,documentHash:issued.hash,documentVersion:issued.document.documentVersion,statedCustomerName:"Synthetic Customer",statedMethod:"email",acceptedAt:"2026-10-16T11:00:00.000Z"})).rejects.toMatchObject({code:"22023"});
    expect((await admin.query("SELECT count(*)::int n FROM app.quote_acceptance WHERE job_id=$1",[f.jobId])).rows[0].n).toBe(0);
  });
  it("S11 accepts the named unsuperseded issued quote after a newer unissued preview",async()=>{
    const f=await fixture();await f.save(f.lines);
    const issued=await f.delivery.preview(context,f.jobId,"a@example.invalid");
    await f.delivery.issue(context,f.jobId,{commandId:randomUUID(),documentId:issued.documentId,contentHash:issued.hash,recipient:"a@example.invalid"});
    await f.save([{...f.lines[0]!,unitRatePence:20000}],1);
    const unissued=await f.delivery.preview(context,f.jobId,"b@example.invalid");
    const accept=(doc:typeof issued)=>f.acceptance.accept(context,f.jobId,{commandId:randomUUID(),documentId:doc.documentId,documentHash:doc.hash,documentVersion:doc.document.documentVersion,statedCustomerName:"Synthetic Customer",statedMethod:"email",acceptedAt:"2026-10-16T11:00:00.000Z"});
    await expect(accept(unissued)).rejects.toThrow();
    const view=await accept(issued);
    expect(view.jobStatus).toBe("accepted");
    expect(view.activeAcceptance).toMatchObject({documentId:issued.documentId,documentHash:issued.hash,totalPence:12000});
    expect((await admin.query("SELECT document_id FROM app.quote_send WHERE job_id=$1",[f.jobId])).rows).toEqual([{document_id:issued.documentId}]);
    expect((await admin.query("SELECT document_id,kind FROM app.acceptance_event WHERE job_id=$1",[f.jobId])).rows).toEqual([{document_id:issued.documentId,kind:"accepted"}]);
  });
});
