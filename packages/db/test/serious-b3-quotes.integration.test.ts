import { randomUUID, createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type QuoteLine, renderQuotePdf } from "@jobguard/core";
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
      await db.$client.query("INSERT INTO app.scope_revision(id,tenant_id,job_id,scope_item_id,revision,description) VALUES($1,$2,$3,$4,1,'Synthetic other source')",[source,anotherTenant,job,item]);
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
