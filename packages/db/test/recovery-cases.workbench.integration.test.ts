import{createHash,randomUUID}from"node:crypto";import{mkdtemp,rm,readFile}from"node:fs/promises";import{tmpdir}from"node:os";import{join}from"node:path";import EmbeddedPostgres from"embedded-postgres";import{Pool}from"pg";import{afterAll,beforeAll,describe,expect,it,vi}from"vitest";import{migrate,MIGRATION_URLS,RecoveryCaseRepository,withTenant,type VerifiedTenantContext}from"../src/index.js";import{closeTestPools}from"./pool-test-utils.js";import{recoveryCaseCommandV1,recoveryEligibilityCommandV1}from"@jobguard/core";
const member=()=>({membershipId:randomUUID(),identityUserId:randomUUID()}),owner=member(),owner2=member(),owner3=member(),ref=(m:{membershipId:string})=>`membership:${m.membershipId}`;
let pg:EmbeddedPostgres,admin:Pool,runtime:Pool,dir:string;const tenant=randomUUID(),other=randomUUID(),job=randomUUID(),wrongJob=randomUUID(),ctx={tenantId:tenant}as VerifiedTenantContext;const command=(extra:Record<string,unknown>)=>({version:"recovery-case-command.v1",commandId:randomUUID(),reviewerRef:"reviewer:owner",...extra});
beforeAll(async()=>{dir=await mkdtemp(join(tmpdir(),"jg-recovery-cases-"));const port=60000+Math.floor(Math.random()*200);pg=new EmbeddedPostgres({databaseDir:dir,port,user:"postgres",password:"synthetic",persistent:false,createPostgresUser:process.getuid?.()===0,initdbFlags:["--lc-messages=C"],onLog:()=>undefined});await pg.initialise();await pg.start();admin=new Pool({host:"127.0.0.1",port,database:"postgres",user:"postgres",password:"synthetic"});// Install the preceding schema, seed its immutable history, then upgrade in place.
await admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
for(const url of MIGRATION_URLS.slice(0,MIGRATION_URLS.findIndex(url=>url.pathname.endsWith("0097_recovery_case_current.sql")))){await admin.query(await readFile(url,"utf8"));await admin.query("INSERT INTO public.jobguard_schema_migration(migration_name)VALUES($1)",[url.pathname.split("/").at(-1)]);}
await admin.query("INSERT INTO control_plane.tenant(id)VALUES($1),($2)",[tenant,other]);await admin.query("INSERT INTO app.account(id,tenant_id,name)VALUES($1,$2,'Synthetic account')",[tenant,tenant]);for(const m of [owner,owner2,owner3]){await admin.query("INSERT INTO identity.identity_user(id)VALUES($1)",[m.identityUserId]);await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role)VALUES($1,$2,$2,$3,'owner')",[m.membershipId,tenant,m.identityUserId]);}await admin.query("INSERT INTO app.job(id,tenant_id,title)VALUES($1,$3,'Recovery fixture'),($2,$3,'Wrong job')",[job,wrongJob,tenant]);const upgradeCase=randomUUID();
await admin.query("INSERT INTO app.recovery_case(id,tenant_id,job_id,claim_pence,currency,state,revision,synthetic)VALUES($1,$2,$3,250000,'GBP','identified',0,true)",[upgradeCase,tenant,job]);
await admin.query("INSERT INTO app.recovery_claim_revision(id,tenant_id,job_id,case_id,revision,claimed_net_pence,currency,reviewer_ref,subject_hash)VALUES($1,$2,$3,$4,1,32000,'GBP','upgrade-reviewer',$5)",[randomUUID(),tenant,job,upgradeCase,"a".repeat(64)]);
await admin.query("INSERT INTO app.recovery_case_event(id,tenant_id,job_id,case_id,sequence,event_type,to_state,reviewer_ref,command_id,payload_hash)VALUES($1,$2,$3,$4,1,'prevent','prevented','upgrade-reviewer',$5,$6)",[randomUUID(),tenant,job,upgradeCase,randomUUID(),"b".repeat(64)]);
await migrate(admin);await migrate(admin);
expect((await admin.query("SELECT state,claim_pence,revision FROM app.recovery_case_current WHERE id=$1",[upgradeCase])).rows).toEqual([{state:"prevented",claim_pence:"32000",revision:2}]);
await admin.query("CREATE ROLE recovery_case_login LOGIN PASSWORD 'synthetic' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;GRANT jobguard_runtime TO recovery_case_login");runtime=new Pool({host:"127.0.0.1",port,database:"postgres",user:"recovery_case_login",password:"synthetic"})},60000);afterAll(async()=>{await closeTestPools(runtime,admin);await pg.stop();await rm(dir,{recursive:true,force:true})});
describe("recovery cases",()=>{it("records direct receipt, partial landing, write-off and immutable actual reviewer",async()=>{const repo=reviewedRepo();let x=await repo.command(ctx,job,command({action:"open",caseType:"withheld_customer_payment",claimedNetPence:250000,counterparty:"Fictional Customer",book:"builder_customer",sourceType:"customer_invoice",sourceRefs:["Generated customer invoice INV-18800"],expectedRevision:0}));x=await repo.command(ctx,job,command({action:"transition",caseId:x.id,eventType:"assemble_evidence",expectedRevision:x.revision}));x=await repo.command(ctx,job,command({action:"transition",caseId:x.id,eventType:"record_landing",amountPence:100000,expectedRevision:x.revision}));expect(x).toMatchObject({landedNetPence:100000,outstandingNetPence:150000,state:"partially_landed",reviewerRef:ref(owner)});x=await repo.command(ctx,job,command({action:"transition",caseId:x.id,eventType:"write_off",expectedRevision:x.revision}));expect(x).toMatchObject({landedNetPence:100000,writtenOffPence:150000,outstandingNetPence:0,state:"closed_no_recovery"});expect(Number((await admin.query("SELECT count(*) n FROM app.recovery_claim_revision WHERE tenant_id=$1 AND case_id=$2",[tenant,x.id])).rows[0].n)).toBe(1)});it("is replay-safe and gives concurrent stale revisions exactly one effect",async()=>{const repo=reviewedRepo(),open=command({action:"open",caseType:"merchant_overcharge",claimedNetPence:32000,counterparty:"Merchant",book:"supplier_cost",sourceType:"supplier_documents",sourceRefs:["Supplier agreement AG-320","Delivery note DN-320","Supplier invoice INV-320"],expectedRevision:0}),x=await repo.command(ctx,job,open);expect((await repo.command(ctx,job,open)).id).toBe(x.id);const a=command({action:"transition",caseId:x.id,eventType:"assemble_evidence",expectedRevision:x.revision}),b=command({action:"transition",caseId:x.id,eventType:"assemble_evidence",expectedRevision:x.revision}),settled=await Promise.allSettled([repo.command(ctx,job,a),repo.command(ctx,job,b)]);expect(settled.filter(y=>y.status==="fulfilled")).toHaveLength(1);expect(settled.filter(y=>y.status==="rejected")).toHaveLength(1)});it("enforces RLS, job-qualified links, ownership and append-only runtime grants",async()=>{const catalog=await admin.query("SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,r.rolname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.oid=c.relowner WHERE n.nspname='app' AND c.relname IN('recovery_case','recovery_claim_revision','recovery_case_event','recovery_eligibility_revision')");expect(catalog.rows).toHaveLength(4);expect(catalog.rows.every(x=>x.relrowsecurity&&x.relforcerowsecurity&&x.rolname==='jobguard_migration')).toBe(true);for(const sql of["UPDATE app.recovery_case SET counterparty='x'","DELETE FROM app.recovery_case","TRUNCATE app.recovery_case","UPDATE app.recovery_eligibility_revision SET status='approved'","DELETE FROM app.recovery_eligibility_revision","TRUNCATE app.recovery_eligibility_revision"])await expect(withTenant(runtime,ctx,db=>db.$client.query(sql))).rejects.toMatchObject({code:"42501"});await expect(withTenant(runtime,ctx,db=>db.$client.query("INSERT INTO app.recovery_case(id,tenant_id,job_id,case_type,counterparty,book,source_type,source_refs)VALUES($1,$2,$3,'merchant_overcharge','x','supplier_cost','supplier_documents','[]')",[randomUUID(),other,job]))).rejects.toMatchObject({code:"42501"});await expect(reviewedRepo().command(ctx,wrongJob,command({action:"transition",caseId:randomUUID(),eventType:"assemble_evidence",expectedRevision:1}))).rejects.toThrow("RECOVERY_CASE_NOT_FOUND")});it("binds eligibility and rejects stale, forged and wrong-job commands",async()=>{const repo=reviewedRepo();let x=await repo.command(ctx,job,command({action:"open",caseType:"withheld_customer_payment",claimedNetPence:32000,counterparty:"Customer",book:"builder_customer",sourceType:"customer_invoice",sourceRefs:["Generated customer invoice INV-18800"],expectedRevision:0}));await expect(repo.eligibilityCommand(ctx,job,{version:"recovery-eligibility-command.v1",action:"review",commandId:randomUUID(),caseId:x.id,scenario:"pending_money",eligible:true,expectedCaseRevision:x.revision,evidenceRevision:1,policyVersion:"reference-d03.v1",policyRevision:1},owner)).rejects.toThrow();await expect(repo.eligibilityCommand(ctx,wrongJob,{version:"recovery-eligibility-command.v1",action:"review",commandId:randomUUID(),caseId:x.id,scenario:"pending_money",expectedCaseRevision:x.revision,evidenceRevision:1,policyVersion:"reference-d03.v1",policyRevision:1},owner)).rejects.toThrow("RECOVERY_CASE_NOT_FOUND");x=await repo.eligibilityCommand(ctx,job,{version:"recovery-eligibility-command.v1",action:"review",commandId:randomUUID(),caseId:x.id,scenario:"evidence_backed_withheld_payment",expectedCaseRevision:x.revision,evidenceRevision:1,policyVersion:"reference-d03.v1",policyRevision:1},owner);expect(x).toMatchObject({landedNetPence:0,eligibility:{eligibleNetPence:32000,status:"reviewed",reviewerRef:`membership:${owner.membershipId}`}});const old=x.eligibility!;x=await repo.eligibilityCommand(ctx,job,{version:"recovery-eligibility-command.v1",action:"supersede",commandId:randomUUID(),caseId:x.id,expectedCaseRevision:x.revision,subject:"evidence"},owner);await expect(repo.eligibilityCommand(ctx,job,{version:"recovery-eligibility-command.v1",action:"approve",commandId:randomUUID(),caseId:x.id,expectedCaseRevision:x.revision,expectedEvidenceRevision:old.evidenceRevision,expectedPolicyRevision:1,expectedReviewRevision:old.revision},owner)).rejects.toThrow("ELIGIBILITY_STALE_REVISION");expect(x.landedNetPence).toBe(0)});});

function reviewedRepo() {
 const repository = new RecoveryCaseRepository(runtime);
 return {command:(context:VerifiedTenantContext,jobId:string,input:unknown)=>repository.command(context,jobId,input,owner),eligibilityCommand:repository.eligibilityCommand.bind(repository)};
}
const openCase = () => command({action:"open",caseType:"withheld_customer_payment",claimedNetPence:250000,counterparty:"Customer",book:"builder_customer",sourceType:"customer_invoice",sourceRefs:["Generated customer invoice INV-18800"],expectedRevision:0});
describe("M4-1-S HOLD regressions", () => {
 it("uses one live state, claim and revision projection while preserving the legacy snapshot", async () => {
  const repo = new RecoveryCaseRepository(runtime);
  let x = await repo.command(ctx,job,openCase(),owner);
  x = await repo.command(ctx,job,command({action:"amend_claim",caseId:x.id,claimedNetPence:32000,expectedRevision:x.revision}),owner);
  x = await repo.command(ctx,job,command({action:"transition",caseId:x.id,eventType:"prevent",expectedRevision:x.revision}),owner);
  const current = await withTenant(runtime,ctx,db => db.$client.query("SELECT state,claim_pence,revision FROM app.recovery_case_current WHERE id=$1",[x.id]));
  expect(current.rows).toEqual([{state:"prevented",claim_pence:"32000",revision:x.revision}]);
  const base = await admin.query("SELECT state,claim_pence,revision FROM app.recovery_case WHERE id=$1",[x.id]);
  expect(base.rows).toEqual([{state:"identified",claim_pence:"250000",revision:0}]);
  await expect(withTenant(runtime,ctx,db => db.$client.query("SELECT app.approve_synthetic_landing($1::jsonb)",[{version:"recovery.landing.approve.v1",policyVersion:"reference_fee_policy_v1",jobId:job,caseId:x.id,expectedCaseRevision:0}]))).rejects.toThrow("eligible current synthetic case required");
  expect((await withTenant(runtime,{tenantId:other} as VerifiedTenantContext,db => db.$client.query("SELECT * FROM app.recovery_case_current WHERE id=$1",[x.id]))).rows).toEqual([]);
  // The projection is a read-only contract: it is not an auto-updatable view (PostgreSQL 55000) and
  // the runtime role holds no write privilege on it at all.
  await expect(withTenant(runtime,ctx,db=>db.$client.query("UPDATE app.recovery_case_current SET state='landed'"))).rejects.toMatchObject({code:"55000"});
  expect((await admin.query("SELECT p AS privilege,has_table_privilege('jobguard_runtime','app.recovery_case_current',p) AS granted FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']) p ORDER BY p")).rows).toEqual([{privilege:"DELETE",granted:false},{privilege:"INSERT",granted:false},{privilege:"SELECT",granted:true},{privilege:"TRUNCATE",granted:false},{privilege:"UPDATE",granted:false}]);
 });
 it("ignores forged reviewers in claim, event and audit records, including amendments and transitions", async () => {
  const repo = new RecoveryCaseRepository(runtime);
  let x = await repo.command(ctx,job,{...openCase(),reviewerRef:"forged"},owner);
  x = await repo.command(ctx,job,command({action:"amend_claim",caseId:x.id,claimedNetPence:32000,expectedRevision:x.revision}),owner2);
  x = await repo.command(ctx,job,command({action:"transition",caseId:x.id,eventType:"assemble_evidence",expectedRevision:x.revision}),owner3);
  expect(x.reviewerRef).toBe(ref(owner3));
  expect((await admin.query("SELECT reviewer_ref FROM app.recovery_claim_revision WHERE case_id=$1 ORDER BY revision",[x.id])).rows.map(r=>r.reviewer_ref)).toEqual([ref(owner),ref(owner2)]);
  expect((await admin.query("SELECT reviewer_ref FROM app.recovery_case_event WHERE case_id=$1 ORDER BY sequence",[x.id])).rows.map(r=>r.reviewer_ref)).toEqual([ref(owner),ref(owner2),ref(owner3)]);
  expect((await admin.query("SELECT actor_ref FROM app.audit_event WHERE subject_ref=$1 ORDER BY sequence",[x.id])).rows.map(r=>r.actor_ref)).toEqual([ref(owner),ref(owner2),ref(owner3)]);
 });
 it("keeps write-off accounting exact across reversal, re-landing and claim amendment (HOLD finding 5)", async () => {
  const repo = new RecoveryCaseRepository(runtime), who = owner;
  const step = (x:{id:string;revision:number}, extra:Record<string,unknown>) => repo.command(ctx,job,command({action:"transition",caseId:x.id,expectedRevision:x.revision,...extra}),who);
  let x = await repo.command(ctx,job,openCase(),who);
  x = await step(x,{eventType:"assemble_evidence"});
  x = await step(x,{eventType:"record_landing",amountPence:100000});
  x = await step(x,{eventType:"write_off"});
  expect(x).toMatchObject({state:"closed_no_recovery",landedNetPence:100000,writtenOffPence:150000,outstandingNetPence:0});
  x = await step(x,{eventType:"reverse_landing",amountPence:100000});
  expect(x).toMatchObject({state:"evidence_assembled",landedNetPence:0,writtenOffPence:150000,outstandingNetPence:100000});
  // Only the reversed 1,000.00 is outstanding again; the written-off 1,500.00 cannot be re-landed.
  await expect(step(x,{eventType:"record_landing",amountPence:100001})).rejects.toThrow(/is not allowed/);
  x = await step(x,{eventType:"record_landing",amountPence:100000});
  expect(x).toMatchObject({landedNetPence:100000,writtenOffPence:150000,outstandingNetPence:0});
  await expect(step(x,{eventType:"write_off"})).rejects.toThrow(/is not allowed/);
  await expect(repo.command(ctx,job,command({action:"amend_claim",caseId:x.id,claimedNetPence:249999,expectedRevision:x.revision}),who)).rejects.toThrow("RECOVERY_CLAIM_BELOW_SETTLED");
  // A partial reversal leaves 400.00 outstanding; writing it off records only that increment.
  x = await step(x,{eventType:"reverse_landing",amountPence:40000});
  expect(x).toMatchObject({state:"partially_landed",landedNetPence:60000,writtenOffPence:150000,outstandingNetPence:40000});
  x = await step(x,{eventType:"write_off"});
  expect(x).toMatchObject({state:"closed_no_recovery",landedNetPence:60000,writtenOffPence:190000,outstandingNetPence:0});
  expect((await admin.query("SELECT event_type,amount_pence FROM app.recovery_case_event WHERE case_id=$1 AND event_type='write_off' ORDER BY sequence",[x.id])).rows).toEqual([{event_type:"write_off",amount_pence:"150000"},{event_type:"write_off",amount_pence:"40000"}]);
  expect(x.landedNetPence + x.writtenOffPence + x.outstandingNetPence).toBe(x.claimedNetPence);
 });
 it("refuses a case whose sources are invented labels or cross the supplier/customer split (HOLD finding 6)", async () => {
  const repo = new RecoveryCaseRepository(runtime), before = Number((await admin.query("SELECT count(*) n FROM app.recovery_case WHERE tenant_id=$1",[tenant])).rows[0].n);
  await expect(repo.command(ctx,job,{...openCase(),sourceRefs:["A contract I just made up"]},owner)).rejects.toThrow("RECOVERY_SOURCE_NOT_RECOGNISED");
  await expect(repo.command(ctx,job,{...openCase(),caseType:"merchant_overcharge",book:"supplier_cost",sourceType:"supplier_documents"},owner)).rejects.toThrow("RECOVERY_SOURCE_NOT_RECOGNISED");
  expect(Number((await admin.query("SELECT count(*) n FROM app.recovery_case WHERE tenant_id=$1",[tenant])).rows[0].n)).toBe(before);
 });
 it("binds replay to the target job: the same command id and body against another job is a typed conflict (Sol P2)", async () => {
  const repo = new RecoveryCaseRepository(runtime), who = owner, opened = openCase();
  const a = await repo.command(ctx,job,opened,who);
  expect((await repo.command(ctx,job,opened,who)).id).toBe(a.id); // a legitimate replay on the same job still works
  await expect(repo.command(ctx,wrongJob,opened,who)).rejects.toThrow("IDEMPOTENCY_PAYLOAD_CONFLICT");
  const assemble = command({action:"transition",caseId:a.id,eventType:"assemble_evidence",expectedRevision:a.revision});
  const b = await repo.command(ctx,job,assemble,who);
  expect((await repo.command(ctx,job,assemble,who)).revision).toBe(b.revision);
  await expect(repo.command(ctx,wrongJob,assemble,who)).rejects.toThrow("IDEMPOTENCY_PAYLOAD_CONFLICT");
  const review = {version:"recovery-eligibility-command.v1",action:"review",commandId:randomUUID(),caseId:a.id,scenario:"evidence_backed_withheld_payment",expectedCaseRevision:b.revision,evidenceRevision:1,policyVersion:"reference-d03.v1",policyRevision:1};
  await repo.eligibilityCommand(ctx,job,review,owner);
  await repo.eligibilityCommand(ctx,job,review,owner); // same job: replay is a no-op
  await expect(repo.eligibilityCommand(ctx,wrongJob,review,owner)).rejects.toThrow("IDEMPOTENCY_PAYLOAD_CONFLICT");
  expect(Number((await admin.query("SELECT (SELECT count(*) FROM app.recovery_case_event WHERE job_id=$1)+(SELECT count(*) FROM app.recovery_eligibility_revision WHERE job_id=$1)+(SELECT count(*) FROM app.recovery_case WHERE job_id=$1) n",[wrongJob])).rows[0].n)).toBe(0);
 });
 it("lets a landed payment be reversed after a dispute, with exact accounting (Sol P2)", async () => {
  const repo = new RecoveryCaseRepository(runtime), who = owner;
  const step = (x:{id:string;revision:number},extra:Record<string,unknown>) => repo.command(ctx,job,command({action:"transition",caseId:x.id,expectedRevision:x.revision,...extra}),who);
  let x = await repo.command(ctx,job,openCase(),who);
  x = await step(x,{eventType:"assemble_evidence"});
  x = await step(x,{eventType:"record_landing",amountPence:250000});
  expect(x.state).toBe("landed");
  x = await step(x,{eventType:"dispute"});
  expect(x).toMatchObject({state:"negotiating",landedNetPence:250000,outstandingNetPence:0});
  x = await step(x,{eventType:"reverse_landing",amountPence:100000});
  expect(x).toMatchObject({state:"partially_landed",landedNetPence:150000,outstandingNetPence:100000,writtenOffPence:0});
  await expect(step(x,{eventType:"reverse_landing",amountPence:150001})).rejects.toThrow(/is not allowed/);
  x = await step(x,{eventType:"dispute"});
  x = await step(x,{eventType:"reverse_landing",amountPence:150000});
  expect(x).toMatchObject({state:"evidence_assembled",landedNetPence:0,outstandingNetPence:250000});
 });
 describe("recorded sources (Opus P1: must still admit what M4-3-S-R records)", () => {
  const sql = (statement:string) => admin.query(`SET session_replication_role=replica;${statement};SET session_replication_role=origin`);
  const ids = {invoice:randomUUID(),otherJobInvoice:randomUUID(),otherTenantInvoice:randomUUID(),supplierInvoiceDoc:randomUUID(),supplierInvoiceVersion:randomUUID(),deliveryDoc:randomUUID(),deliveryVersion:randomUUID(),heldDoc:randomUUID(),heldVersion:randomUUID(),creditDoc:randomUUID(),creditVersion:randomUUID(),merchant:randomUUID(),sku:randomUUID(),otherSku:randomUUID(),usedRate:randomUUID(),unusedRate:randomUUID()};
  const invoice = (id:string,tenantId:string,jobId:string,number:string) => `INSERT INTO app.customer_invoice(id,tenant_id,job_id,final_account_revision_id,authorization_id,invoice_number,issued_on,issuer_details,tax_policy_version,currency,net_pence,tax_pence,total_pence,source_hash,pdf_sha256,pdf_bytes,synthetic,watermark)VALUES('${id}','${tenantId}','${jobId}','${randomUUID()}','${randomUUID()}','${number}','2026-10-01','{}','candidate_m1_standard_v1','GBP',100,20,120,repeat('a',64),repeat('b',64),'\\x00'::bytea,true,'SYNTHETIC - NOT A REAL INVOICE')`;
  const supplierDocument = (doc:string,version:string,type:string,status:string,number:string,hash="c") => `INSERT INTO app.supplier_document(id,tenant_id,job_id,supplier_context,document_type,document_number,content_hash,status)VALUES('${doc}','${tenant}','${job}','Fictional Builders Merchant','${type}','${number}',repeat('${hash}',64),'${status}');INSERT INTO app.supplier_document_version(id,tenant_id,job_id,document_id,version,media_type,byte_length,content_hash,page_count)VALUES('${version}','${tenant}','${job}','${doc}',1,'text/plain',10,repeat('${hash}',64),1)`;
  beforeAll(async () => {
   await sql(`${invoice(ids.invoice,tenant,job,"INV-R3-1")};${invoice(ids.otherJobInvoice,tenant,wrongJob,"INV-R3-2")};${invoice(ids.otherTenantInvoice,other,randomUUID(),"INV-R3-3")}`);
   await sql(`${supplierDocument(ids.supplierInvoiceDoc,ids.supplierInvoiceVersion,"invoice","ready","SI-R3-1","1")};${supplierDocument(ids.deliveryDoc,ids.deliveryVersion,"delivery","ready","DN-R3-1","2")};${supplierDocument(ids.heldDoc,ids.heldVersion,"invoice","held","SI-R3-HELD","3")};${supplierDocument(ids.creditDoc,ids.creditVersion,"credit","ready","CR-R3-1","4")}`);
   await sql(`INSERT INTO app.merchant(id,tenant_id,name)VALUES('${ids.merchant}','${tenant}','Fictional Builders Merchant');INSERT INTO app.merchant_sku(id,tenant_id,merchant_id,sku,description,base_unit)VALUES('${ids.sku}','${tenant}','${ids.merchant}','SYN-R3-A','Used paint','each'),('${ids.otherSku}','${tenant}','${ids.merchant}','SYN-R3-B','Unused paint','each');INSERT INTO app.material_rate_revision(id,tenant_id,merchant_id,sku_id,version,price_pence,currency,price_unit,tax_basis,effective_from,source_label)VALUES('${ids.usedRate}','${tenant}','${ids.merchant}','${ids.sku}',1,2000,'GBP','each','net','2026-10-01','Agreement AG-R3-A'),('${ids.unusedRate}','${tenant}','${ids.merchant}','${ids.otherSku}',1,2000,'GBP','each','net','2026-10-01','Agreement AG-R3-B');INSERT INTO app.material_requirement(id,tenant_id,job_id,scope_item_id,sku_id,quantity_decimal,unit,revision)VALUES('${randomUUID()}','${tenant}','${job}','${randomUUID()}','${ids.sku}','40','each',1)`);
  });
  const customer = (sourceRefs:string[]) => ({...openCase(),sourceRefs});
  const supplier = (sourceRefs:string[]) => ({...openCase(),caseType:"merchant_overcharge",claimedNetPence:32000,counterparty:"Fictional Builders Merchant",book:"supplier_cost",sourceType:"supplier_documents",sourceRefs});
  it("accepts recorded customer-invoice ids and names them from the stored record", async () => {
   const repo = new RecoveryCaseRepository(runtime);
   const x = await repo.command(ctx,job,customer([ids.invoice]),owner);
   expect(x.sources).toEqual([{ref:ids.invoice,kind:"Customer invoice",label:"Customer invoice INV-R3-1",recorded:true}]);
   const mixed = await repo.command(ctx,job,customer([ids.invoice,"Generated customer invoice INV-18800"]),owner);
   expect(mixed.sources.map(source=>source.recorded)).toEqual([true,false]);
  });
  it("accepts a recorded supplier agreement rate used on the job and ready supplier documents (by version id or document id)", async () => {
   const repo = new RecoveryCaseRepository(runtime);
   const x = await repo.command(ctx,job,supplier([ids.usedRate,ids.supplierInvoiceVersion,ids.deliveryDoc]),owner);
   expect(x.sources).toEqual([
    {ref:ids.usedRate,kind:"Supplier agreement",label:"Supplier agreement Agreement AG-R3-A",recorded:true},
    {ref:ids.supplierInvoiceVersion,kind:"Supplier invoice",label:"Supplier invoice SI-R3-1",recorded:true},
    {ref:ids.deliveryDoc,kind:"Delivery note",label:"Delivery note DN-R3-1",recorded:true},
   ]);
  });
  it("refuses unknown ids, other jobs, other tenants, wrong kinds, held or credit documents and unused rates, writing nothing", async () => {
   const repo = new RecoveryCaseRepository(runtime), before = Number((await admin.query("SELECT count(*) n FROM app.recovery_case WHERE tenant_id=$1",[tenant])).rows[0].n);
   for (const refs of [[randomUUID()],[ids.otherJobInvoice],[ids.otherTenantInvoice],[ids.supplierInvoiceVersion],[ids.usedRate],[ids.invoice,ids.invoice]])
    await expect(repo.command(ctx,job,customer(refs),owner)).rejects.toThrow("RECOVERY_SOURCE_NOT_RECOGNISED");
   for (const refs of [[ids.invoice],[ids.heldVersion],[ids.heldDoc],[ids.creditVersion],[ids.unusedRate],[ids.usedRate,randomUUID()]])
    await expect(repo.command(ctx,job,supplier(refs),owner)).rejects.toThrow("RECOVERY_SOURCE_NOT_RECOGNISED");
   expect(Number((await admin.query("SELECT count(*) n FROM app.recovery_case WHERE tenant_id=$1",[tenant])).rows[0].n)).toBe(before);
  });
 });
 describe("the case command rechecks the reviewer's membership inside its own transaction (Sol P2)", () => {
  const seed = async (change = "") => { const m = member(); await admin.query("INSERT INTO identity.identity_user(id)VALUES($1)",[m.identityUserId]); await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role)VALUES($1,$2,$2,$3,'owner')",[m.membershipId,tenant,m.identityUserId]); if (change) await admin.query(`UPDATE app.membership SET ${change} WHERE tenant_id=$1 AND id=$2`,[tenant,m.membershipId]); return m; };
  const counts = async () => (await admin.query("SELECT (SELECT count(*) FROM app.recovery_case WHERE tenant_id=$1)::int cases,(SELECT count(*) FROM app.recovery_claim_revision WHERE tenant_id=$1)::int claims,(SELECT count(*) FROM app.recovery_case_event WHERE tenant_id=$1)::int events,(SELECT count(*) FROM app.audit_event WHERE tenant_id=$1)::int audit",[tenant])).rows[0];
  it("refuses a revoked owner before replay or any mutation, and writes nothing", async () => {
   const repo = new RecoveryCaseRepository(runtime), m = await seed(), opened = openCase();
   const first = await repo.command(ctx,job,opened,m);
   expect(first.reviewerRef).toBe(ref(m));
   const before = await counts();
   await admin.query("UPDATE app.membership SET revoked_at=now() WHERE tenant_id=$1 AND id=$2",[tenant,m.membershipId]);
   await expect(repo.command(ctx,job,opened,m)).rejects.toThrow("RECOVERY_REVIEWER_FORBIDDEN"); // a replay is not a way around revocation
   await expect(repo.command(ctx,job,openCase(),m)).rejects.toThrow("RECOVERY_REVIEWER_FORBIDDEN");
   await expect(repo.command(ctx,job,command({action:"transition",caseId:first.id,eventType:"assemble_evidence",expectedRevision:first.revision}),m)).rejects.toThrow("RECOVERY_REVIEWER_FORBIDDEN");
   expect(await counts()).toEqual(before);
  });
  it("the member-facing read rechecks the membership and job inside the read's own transaction (Codex P2)", async () => {
   const repo = new RecoveryCaseRepository(runtime), m = await seed();
   await repo.command(ctx,job,openCase(),m);
   expect((await repo.listForMember(ctx,job,m)).length).toBeGreaterThan(0);
   await expect(repo.listForMember(ctx,randomUUID(),m)).rejects.toThrow("JOB_NOT_FOUND");
   await expect(repo.listForMember(ctx,job,{...m,identityUserId:randomUUID()})).rejects.toThrow("MEMBERSHIP_FORBIDDEN");
   await admin.query("UPDATE app.membership SET revoked_at=now() WHERE tenant_id=$1 AND id=$2",[tenant,m.membershipId]);
   await expect(repo.listForMember(ctx,job,m)).rejects.toThrow("MEMBERSHIP_FORBIDDEN");
  });
  it("a member read waits for an in-flight revocation and then refuses, never listing on a stale membership (Codex P2)", async () => {
   const repo = new RecoveryCaseRepository(runtime), m = await seed();
   await repo.command(ctx,job,openCase(),m);
   const holder = await admin.connect();
   try {
    await holder.query("BEGIN");
    await holder.query("UPDATE app.membership SET revoked_at=now() WHERE tenant_id=$1 AND id=$2",[tenant,m.membershipId]);
    const read = repo.listForMember(ctx,job,m).then(()=>"listed",(error:Error)=>error.message);
    await new Promise(resolve=>setTimeout(resolve,500)); // an unlocked check would already have listed here
    await holder.query("COMMIT");
    expect(await read).toBe("MEMBERSHIP_FORBIDDEN");
   } finally { holder.release(); }
  });
  it("refuses a non-owner role, an expired membership, another identity and another tenant, writing nothing", async () => {
   const repo = new RecoveryCaseRepository(runtime), before = await counts();
   for (const change of ["role='viewer'","expires_at=now()-interval '1 second'"]) await expect(repo.command(ctx,job,openCase(),await seed(change))).rejects.toThrow("RECOVERY_REVIEWER_FORBIDDEN");
   const active = await seed();
   await expect(repo.command(ctx,job,openCase(),{...active,identityUserId:randomUUID()})).rejects.toThrow("RECOVERY_REVIEWER_FORBIDDEN");
   await expect(repo.command({tenantId:other} as VerifiedTenantContext,job,openCase(),active)).rejects.toThrow("RECOVERY_REVIEWER_FORBIDDEN");
   expect(await counts()).toEqual(before);
  });
  it("catches a revocation that is still in flight: the command waits on the membership lock and is then refused", async () => {
   const repo = new RecoveryCaseRepository(runtime), m = await seed(), before = await counts();
   const holder = await admin.connect();
   try {
    await holder.query("BEGIN");
    await holder.query("UPDATE app.membership SET revoked_at=now() WHERE tenant_id=$1 AND id=$2",[tenant,m.membershipId]); // uncommitted revocation
    const attempt = repo.command(ctx,job,openCase(),m).then(() => "written", (failure: Error) => failure.message);
    // Deterministic: wait until a backend is blocked on a row lock rather than sleeping for a guessed time.
    for (let i = 0; i < 200; i++) { if (Number((await admin.query("SELECT count(*) n FROM pg_stat_activity WHERE wait_event_type='Lock'")).rows[0].n) > 0) break; await new Promise(resolve => setTimeout(resolve, 25)); }
    expect(Number((await admin.query("SELECT count(*) n FROM pg_stat_activity WHERE wait_event_type='Lock'")).rows[0].n)).toBeGreaterThan(0);
    await holder.query("COMMIT");
    expect(await attempt).toBe("RECOVERY_REVIEWER_FORBIDDEN");
   } finally { holder.release(); }
   expect(await counts()).toEqual(before);
  });
 });
 describe("claim amendment can not create a false 'Closed — recovered' case (Sol P2)", () => {
  const stepFor = (repo: RecoveryCaseRepository) => (x:{id:string;revision:number},extra:Record<string,unknown>) => repo.command(ctx,job,command({action:"transition",caseId:x.id,expectedRevision:x.revision,...extra}),owner);
  const amend = (repo: RecoveryCaseRepository, x:{id:string;revision:number}, claimedNetPence:number, extra:Record<string,unknown>={}) => repo.command(ctx,job,command({action:"amend_claim",caseId:x.id,claimedNetPence,expectedRevision:x.revision,...extra}),owner);
  const footprint = async (caseId:string) => (await admin.query("SELECT (SELECT count(*) FROM app.recovery_claim_revision WHERE case_id=$1)::int claims,(SELECT count(*) FROM app.recovery_case_event WHERE case_id=$1)::int events,(SELECT count(*) FROM app.audit_event WHERE subject_ref=$1::text)::int audit",[caseId])).rows[0];
  it("rejects an upward amendment of a fully received case, with replay and stale-revision behaviour, and nothing changes", async () => {
   const repo = new RecoveryCaseRepository(runtime), step = stepFor(repo);
   let x = await repo.command(ctx,job,openCase(),owner);
   x = await step(x,{eventType:"assemble_evidence"});
   x = await step(x,{eventType:"record_landing",amountPence:250000});
   expect(x).toMatchObject({state:"landed",landedNetPence:250000,outstandingNetPence:0});
   const before = await footprint(x.id), upward = {commandId:randomUUID()};
   await expect(amend(repo,x,300000,upward)).rejects.toThrow("RECOVERY_CLAIM_AMENDMENT_ON_CLOSED_CASE");
   await expect(amend(repo,x,300000,upward)).rejects.toThrow("RECOVERY_CLAIM_AMENDMENT_ON_CLOSED_CASE"); // a replay of the refused command is refused the same way and recorded nowhere
   expect(await footprint(x.id)).toEqual(before);
   // A stale revision is still reported as stale, never as a closed-case problem.
   await expect(amend(repo,{...x,revision:x.revision-1},300000)).rejects.toThrow("RECOVERY_STALE_REVISION");
   const same = await repo.list(ctx,job);
   expect(same.find(c=>c.id===x.id)).toMatchObject({state:"landed",claimedNetPence:250000,outstandingNetPence:0,revision:x.revision});
  });
  it("the Sol sequence cannot end in closed_recovered with money outstanding; a legitimate closure is replay-safe", async () => {
   const repo = new RecoveryCaseRepository(runtime), step = stepFor(repo);
   let x = await repo.command(ctx,job,openCase(),owner);
   x = await step(x,{eventType:"assemble_evidence"});
   x = await step(x,{eventType:"record_landing",amountPence:250000});
   await expect(amend(repo,x,300000)).rejects.toThrow("RECOVERY_CLAIM_AMENDMENT_ON_CLOSED_CASE");
   const close = command({action:"transition",caseId:x.id,eventType:"close_recovered",expectedRevision:x.revision});
   const closed = await repo.command(ctx,job,close,owner);
   expect(closed).toMatchObject({state:"closed_recovered",claimedNetPence:250000,landedNetPence:250000,outstandingNetPence:0});
   expect((await repo.command(ctx,job,close,owner)).revision).toBe(closed.revision); // replay is a no-op
   await expect(amend(repo,closed,250001)).rejects.toThrow("RECOVERY_CLAIM_AMENDMENT_ON_CLOSED_CASE");
   expect((await repo.list(ctx,job)).find(c=>c.id===x.id)).toMatchObject({state:"closed_recovered",outstandingNetPence:0});
  });
  it("the explicit reopen: dispute first, then the claim may rise, the rest must be received, and only then may it close as recovered", async () => {
   const repo = new RecoveryCaseRepository(runtime), step = stepFor(repo);
   let x = await repo.command(ctx,job,openCase(),owner);
   x = await step(x,{eventType:"assemble_evidence"});
   x = await step(x,{eventType:"record_landing",amountPence:250000});
   x = await step(x,{eventType:"close_recovered"});
   x = await step(x,{eventType:"dispute"});
   expect(x.state).toBe("negotiating");
   x = await amend(repo,x,300000);
   expect(x).toMatchObject({state:"negotiating",claimedNetPence:300000,landedNetPence:250000,outstandingNetPence:50000});
   await expect(step(x,{eventType:"close_recovered"})).rejects.toThrow(/is not allowed/);
   x = await step(x,{eventType:"record_landing",amountPence:50000});
   expect(x).toMatchObject({state:"landed",outstandingNetPence:0});
   x = await step(x,{eventType:"close_recovered"});
   expect(x).toMatchObject({state:"closed_recovered",claimedNetPence:300000,landedNetPence:300000,outstandingNetPence:0});
  });
  it("also protects a written-off closed case", async () => {
   const repo = new RecoveryCaseRepository(runtime), step = stepFor(repo);
   let x = await repo.command(ctx,job,openCase(),owner);
   x = await step(x,{eventType:"assemble_evidence"});
   x = await step(x,{eventType:"record_landing",amountPence:100000});
   x = await step(x,{eventType:"write_off"});
   expect(x.state).toBe("closed_no_recovery");
   const before = await footprint(x.id);
   await expect(amend(repo,x,250001)).rejects.toThrow("RECOVERY_CLAIM_AMENDMENT_ON_CLOSED_CASE");
   expect(await footprint(x.id)).toEqual(before);
  });
 });
 describe("a downward amendment can not strand a fully received claim (M4-1-S-R repair 10, Sol P2)", () => {
  const stepFor = (repo: RecoveryCaseRepository) => (x:{id:string;revision:number},extra:Record<string,unknown>) => repo.command(ctx,job,command({action:"transition",caseId:x.id,expectedRevision:x.revision,...extra}),owner);
  const amendTo = (repo: RecoveryCaseRepository, x:{id:string;revision:number}, claimedNetPence:number, extra:Record<string,unknown>={}) => repo.command(ctx,job,command({action:"amend_claim",caseId:x.id,claimedNetPence,expectedRevision:x.revision,...extra}),owner);
  const history = async (caseId:string) => (await admin.query("SELECT sequence,event_type,from_state,to_state FROM app.recovery_case_event WHERE case_id=$1 ORDER BY sequence",[caseId])).rows;
  it("claim 2,500.00, receive 1,000.00, amend to 1,000.00: the case is received in full, closes as recovered, and every step replays safely", async () => {
   const repo = new RecoveryCaseRepository(runtime), step = stepFor(repo);
   let x = await repo.command(ctx,job,openCase(),owner);
   x = await step(x,{eventType:"assemble_evidence"});
   x = await step(x,{eventType:"record_landing",amountPence:100000});
   expect(x).toMatchObject({state:"partially_landed",claimedNetPence:250000,landedNetPence:100000,outstandingNetPence:150000});
   const amendment = command({action:"amend_claim",caseId:x.id,claimedNetPence:100000,expectedRevision:x.revision});
   const amended = await repo.command(ctx,job,amendment,owner);
   expect(amended).toMatchObject({state:"landed",claimedNetPence:100000,landedNetPence:100000,outstandingNetPence:0,writtenOffPence:0,revision:x.revision+2});
   // Immutable history: the claim revisions keep both claims, and the amendment event records the state change from partially_landed to landed.
   expect((await admin.query("SELECT revision,claimed_net_pence FROM app.recovery_claim_revision WHERE case_id=$1 ORDER BY revision",[x.id])).rows).toEqual([{revision:1,claimed_net_pence:"250000"},{revision:2,claimed_net_pence:"100000"}]);
   expect((await history(x.id)).filter(e=>e.event_type==="claim_amended")).toEqual([{sequence:4,event_type:"claim_amended",from_state:"partially_landed",to_state:"landed"}]);
   // Replay of the amendment is a no-op: same revision, no extra claim revision, event or audit row.
   const footprint = async () => (await admin.query("SELECT (SELECT count(*) FROM app.recovery_claim_revision WHERE case_id=$1)::int claims,(SELECT count(*) FROM app.recovery_case_event WHERE case_id=$1)::int events,(SELECT count(*) FROM app.audit_event WHERE subject_ref=$1::text)::int audit",[x.id])).rows[0];
   const before = await footprint();
   expect((await repo.command(ctx,job,amendment,owner)).revision).toBe(amended.revision);
   expect(await footprint()).toEqual(before);
   // The case can now close as recovered, and replay of the closure is a no-op.
   const close = command({action:"transition",caseId:x.id,eventType:"close_recovered",expectedRevision:amended.revision});
   const closed = await repo.command(ctx,job,close,owner);
   expect(closed).toMatchObject({state:"closed_recovered",claimedNetPence:100000,landedNetPence:100000,outstandingNetPence:0});
   expect((await repo.command(ctx,job,close,owner)).revision).toBe(closed.revision);
   expect((await history(x.id)).map(e=>e.to_state)).toEqual(["identified","evidence_assembled","partially_landed","landed","closed_recovered"]);
   // The closure invariants still hold: nothing more can be received, and a later upward amendment is still refused.
   await expect(step(closed,{eventType:"record_landing",amountPence:1})).rejects.toThrow(/is not allowed/);
   await expect(amendTo(repo,closed,100001)).rejects.toThrow("RECOVERY_CLAIM_AMENDMENT_ON_CLOSED_CASE");
   expect(closed.landedNetPence+closed.writtenOffPence+closed.outstandingNetPence).toBe(closed.claimedNetPence);
  });
  it("an amendment that still leaves principal outstanding keeps the previous state, and a reduction to received plus written-off records the written-off closure", async () => {
   const repo = new RecoveryCaseRepository(runtime), step = stepFor(repo);
   let x = await repo.command(ctx,job,openCase(),owner);
   x = await step(x,{eventType:"assemble_evidence"});
   x = await step(x,{eventType:"record_landing",amountPence:100000});
   x = await amendTo(repo,x,150000);
   expect(x).toMatchObject({state:"partially_landed",claimedNetPence:150000,landedNetPence:100000,outstandingNetPence:50000});
   // Write off the rest, reverse the receipt (reopening), then shrink the claim to exactly the written-off principal.
   x = await step(x,{eventType:"write_off"});
   expect(x).toMatchObject({state:"closed_no_recovery",writtenOffPence:50000});
   x = await step(x,{eventType:"reverse_landing",amountPence:100000});
   expect(x).toMatchObject({state:"evidence_assembled",landedNetPence:0,writtenOffPence:50000,outstandingNetPence:100000});
   x = await amendTo(repo,x,50000);
   expect(x).toMatchObject({state:"closed_no_recovery",claimedNetPence:50000,landedNetPence:0,writtenOffPence:50000,outstandingNetPence:0});
  });
 });
 describe("case ids are matched in their canonical lower-case spelling (M4-1-S-R repair 10, Sol P3)", () => {
  it("an upper-case case id commits, returns the case and replays as the same command in either spelling", async () => {
   const repo = new RecoveryCaseRepository(runtime);
   let x = await repo.command(ctx,job,openCase(),owner);
   const upper = (id:string) => id.toUpperCase(), commandId = randomUUID();
   const assemble = command({action:"transition",caseId:upper(x.id),eventType:"assemble_evidence",expectedRevision:x.revision,commandId});
   const done = await repo.command(ctx,job,assemble,owner);
   expect(done).toMatchObject({id:x.id,state:"evidence_assembled",revision:x.revision+1});
   // Replay: same spelling, the lower-case spelling, and an upper-case command id are all the same command, not a conflict.
   expect((await repo.command(ctx,job,assemble,owner)).revision).toBe(done.revision);
   expect((await repo.command(ctx,job,{...assemble,caseId:x.id},owner)).revision).toBe(done.revision);
   expect((await repo.command(ctx,job,{...assemble,commandId:upper(commandId)},owner)).revision).toBe(done.revision);
   expect((await admin.query("SELECT count(*)::int n FROM app.recovery_case_event WHERE case_id=$1 AND event_type='assemble_evidence'",[x.id])).rows[0].n).toBe(1);
   // Amendment and the eligibility command accept the upper-case spelling too.
   x = await repo.command(ctx,job,command({action:"amend_claim",caseId:upper(x.id),claimedNetPence:240000,expectedRevision:done.revision}),owner);
   expect(x).toMatchObject({claimedNetPence:240000,state:"evidence_assembled"});
   const review = {version:"recovery-eligibility-command.v1",action:"review",commandId:randomUUID(),caseId:upper(x.id),scenario:"evidence_backed_withheld_payment",expectedCaseRevision:x.revision,evidenceRevision:1,policyVersion:"reference-d03.v1",policyRevision:1};
   const reviewed = await repo.eligibilityCommand(ctx,job,review,owner);
   expect(reviewed).toMatchObject({id:x.id});
   await repo.eligibilityCommand(ctx,job,{...review,caseId:x.id},owner); // lower-case replay: no conflict
   expect((await admin.query("SELECT count(*)::int n FROM app.recovery_eligibility_revision WHERE case_id=$1",[x.id])).rows[0].n).toBe(1);
  });
 });
});

describe("M4-1-S-R repair 11 (Sol P2-2): receipt plus write-off that exhausts the claim keeps the written-off disposition", () => {
 const stepFor = (repo: RecoveryCaseRepository) => (x:{id:string;revision:number},extra:Record<string,unknown>) => repo.command(ctx,job,command({action:"transition",caseId:x.id,expectedRevision:x.revision,...extra}),owner);
 it("claim 2,500.00, receive 1,000.00, write off 1,500.00, reverse 1,000.00, receive 1,000.00 again ends closed (no further recovery), not stranded", async () => {
  const repo = new RecoveryCaseRepository(runtime), step = stepFor(repo);
  let x = await repo.command(ctx,job,openCase(),owner);
  x = await step(x,{eventType:"assemble_evidence"});
  x = await step(x,{eventType:"record_landing",amountPence:100000});
  x = await step(x,{eventType:"write_off"});
  x = await step(x,{eventType:"reverse_landing",amountPence:100000});
  expect(x).toMatchObject({state:"evidence_assembled",landedNetPence:0,writtenOffPence:150000,outstandingNetPence:100000});
  const relanding = command({action:"transition",caseId:x.id,eventType:"record_landing",amountPence:100000,expectedRevision:x.revision});
  const relanded = await repo.command(ctx,job,relanding,owner);
  expect(relanded).toMatchObject({state:"closed_no_recovery",claimedNetPence:250000,landedNetPence:100000,writtenOffPence:150000,outstandingNetPence:0});
  expect((await repo.command(ctx,job,relanding,owner)).revision).toBe(relanded.revision); // replay is a no-op
  expect((await admin.query("SELECT event_type,from_state,to_state FROM app.recovery_case_event WHERE case_id=$1 ORDER BY sequence DESC LIMIT 1",[x.id])).rows).toEqual([{event_type:"record_landing",from_state:"evidence_assembled",to_state:"closed_no_recovery"}]);
  // Nothing is outstanding: no further receipt, write-off or recovered closure; the explicit reopen paths still work.
  for (const extra of [{eventType:"record_landing",amountPence:1},{eventType:"write_off"},{eventType:"close_recovered"}]) await expect(step(relanded,extra)).rejects.toThrow(/is not allowed/);
  expect(relanded.landedNetPence+relanded.writtenOffPence+relanded.outstandingNetPence).toBe(relanded.claimedNetPence);
  const reopened = await step(relanded,{eventType:"reverse_landing",amountPence:40000});
  expect(reopened).toMatchObject({state:"partially_landed",landedNetPence:60000,writtenOffPence:150000,outstandingNetPence:40000});
  const again = await step(reopened,{eventType:"record_landing",amountPence:40000});
  expect(again).toMatchObject({state:"closed_no_recovery",landedNetPence:100000,outstandingNetPence:0});
  const disputed = await step(again,{eventType:"dispute"});
  expect(disputed).toMatchObject({state:"negotiating",outstandingNetPence:0});
 });
 it("a final receipt with nothing written off still records received in full", async () => {
  const repo = new RecoveryCaseRepository(runtime), step = stepFor(repo);
  let x = await repo.command(ctx,job,openCase(),owner);
  x = await step(x,{eventType:"assemble_evidence"});
  x = await step(x,{eventType:"record_landing",amountPence:100000});
  x = await step(x,{eventType:"record_landing",amountPence:150000});
  expect(x).toMatchObject({state:"landed",landedNetPence:250000,outstandingNetPence:0});
 });
});
describe("M4-1-S-R repair 11 (Sol P2-3): a fully received case closes as recovered again after a dispute", () => {
 const stepFor = (repo: RecoveryCaseRepository) => (x:{id:string;revision:number},extra:Record<string,unknown>) => repo.command(ctx,job,command({action:"transition",caseId:x.id,expectedRevision:x.revision,...extra}),owner);
 it.each(["landed","closed_recovered"] as const)("%s -> dispute -> close as recovered, with no new money event and a replay-safe closure", async from => {
  const repo = new RecoveryCaseRepository(runtime), step = stepFor(repo);
  let x = await repo.command(ctx,job,openCase(),owner);
  x = await step(x,{eventType:"assemble_evidence"});
  x = await step(x,{eventType:"record_landing",amountPence:250000});
  if (from === "closed_recovered") x = await step(x,{eventType:"close_recovered"});
  x = await step(x,{eventType:"dispute"});
  expect(x).toMatchObject({state:"negotiating",landedNetPence:250000,outstandingNetPence:0});
  const moneyEvents = async () => Number((await admin.query("SELECT count(*) n FROM app.recovery_case_event WHERE case_id=$1 AND event_type IN('record_landing','reverse_landing','write_off')",[x.id])).rows[0].n);
  const before = await moneyEvents();
  const close = command({action:"transition",caseId:x.id,eventType:"close_recovered",expectedRevision:x.revision});
  const closed = await repo.command(ctx,job,close,owner);
  expect(closed).toMatchObject({state:"closed_recovered",claimedNetPence:250000,landedNetPence:250000,outstandingNetPence:0});
  expect(await moneyEvents()).toBe(before);
  expect((await repo.command(ctx,job,close,owner)).revision).toBe(closed.revision);
  await expect(step(closed,{eventType:"close_recovered"})).rejects.toThrow(/is not allowed/);
 });
 it("closes again after the dispute was resolved by resuming the chase", async () => {
  const repo = new RecoveryCaseRepository(runtime), step = stepFor(repo);
  let x = await repo.command(ctx,job,openCase(),owner);
  x = await step(x,{eventType:"assemble_evidence"});
  x = await step(x,{eventType:"record_landing",amountPence:250000});
  x = await step(x,{eventType:"dispute"});
  x = await step(x,{eventType:"resume_pursuit"});
  expect(x).toMatchObject({state:"pursuing",landedNetPence:250000,outstandingNetPence:0});
  expect(await step(x,{eventType:"close_recovered"})).toMatchObject({state:"closed_recovered"});
 });
 it("still refuses a recovered closure while any principal is outstanding or written off", async () => {
  const repo = new RecoveryCaseRepository(runtime), step = stepFor(repo);
  let x = await repo.command(ctx,job,openCase(),owner);
  x = await step(x,{eventType:"assemble_evidence"});
  x = await step(x,{eventType:"record_landing",amountPence:100000});
  x = await step(x,{eventType:"dispute"});
  await expect(step(x,{eventType:"close_recovered"})).rejects.toThrow(/is not allowed/);
  x = await step(x,{eventType:"resume_pursuit"});
  await expect(step(x,{eventType:"close_recovered"})).rejects.toThrow(/is not allowed/);
  x = await step(x,{eventType:"write_off"});
  x = await step(x,{eventType:"dispute"});
  expect(x).toMatchObject({state:"negotiating",landedNetPence:100000,writtenOffPence:150000,outstandingNetPence:0});
  await expect(step(x,{eventType:"close_recovered"})).rejects.toThrow(/is not allowed/); // received plus written off is not received in full
  const upward = await repo.command(ctx,job,command({action:"amend_claim",caseId:x.id,claimedNetPence:260000,expectedRevision:x.revision}),owner);
  await expect(step(upward,{eventType:"close_recovered"})).rejects.toThrow(/is not allowed/);
 });
});
describe("M4-1-S-R repair 11 (Sol P2-4): commands recorded before this upgrade still replay", () => {
 // The code before this PR hashed the command exactly as the client sent it (reviewer included, ids as spelled) and stored the client's reviewer
 // string on the immutable rows. These helpers reproduce that algorithm and those rows, so the tests start from a real preceding-version history.
 const legacyDigest = (value:unknown) => createHash("sha256").update(JSON.stringify(value,Object.keys(value as object).sort())).digest("hex");
 const legacyReviewer = "practice-owner";
 const footprint = async (caseId:string) => (await admin.query("SELECT (SELECT count(*) FROM app.recovery_claim_revision WHERE case_id=$1)::int claims,(SELECT count(*) FROM app.recovery_case_event WHERE case_id=$1)::int events,(SELECT count(*) FROM app.audit_event WHERE subject_ref=$1::text)::int audits",[caseId])).rows[0];
 const legacyOpen = async (raw:Record<string,unknown>) => {
  const input = recoveryCaseCommandV1.parse(raw) as Extract<ReturnType<typeof recoveryCaseCommandV1.parse>,{action:"open"}>, hash = legacyDigest(input), caseId = randomUUID();
  await admin.query("INSERT INTO app.recovery_case(id,tenant_id,job_id,claim_pence,currency,state,revision,synthetic,case_type,counterparty,book,source_type,source_refs) VALUES($1,$2,$3,$4,'GBP','identified',0,true,$5,$6,$7,$8,$9)",[caseId,tenant,job,input.claimedNetPence,input.caseType,input.counterparty,input.book,input.sourceType,JSON.stringify(input.sourceRefs)]);
  await admin.query("INSERT INTO app.recovery_claim_revision(id,tenant_id,job_id,case_id,revision,claimed_net_pence,currency,reviewer_ref,subject_hash) VALUES($1,$2,$3,$4,1,$5,'GBP',$6,$7)",[randomUUID(),tenant,job,caseId,input.claimedNetPence,input.reviewerRef,legacyDigest({caseId,revision:1,claimedNetPence:input.claimedNetPence,reviewerRef:input.reviewerRef})]);
  await admin.query("INSERT INTO app.recovery_case_event(id,tenant_id,job_id,case_id,sequence,event_type,from_state,to_state,reviewer_ref,command_id,payload_hash) VALUES($1,$2,$3,$4,1,'opened',NULL,'identified',$5,$6,$7)",[randomUUID(),tenant,job,caseId,input.reviewerRef,input.commandId,hash]);
  return {caseId,hash};
 };
 const legacyEvent = async (raw:Record<string,unknown>,sequence:number,previousHash:string,eventType:string,from:string,to:string) => {
  const input = recoveryCaseCommandV1.parse(raw) as unknown as {commandId:string;caseId:string;reviewerRef:string}, hash = legacyDigest(input);
  await admin.query("INSERT INTO app.recovery_case_event(id,tenant_id,job_id,case_id,sequence,event_type,from_state,to_state,reviewer_ref,command_id,payload_hash,previous_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",[randomUUID(),tenant,job,input.caseId.toLowerCase(),sequence,eventType,from,to,input.reviewerRef,input.commandId,hash,previousHash]);
  return hash;
 };
 const legacyHistory = async (upperCase = false) => {
  const openBody = {...openCase(),reviewerRef:legacyReviewer}, opened = await legacyOpen(openBody);
  const id = upperCase ? opened.caseId.toUpperCase() : opened.caseId;
  const assembleBody = command({action:"transition",caseId:id,eventType:"assemble_evidence",expectedRevision:2,reviewerRef:legacyReviewer});
  const assembleHash = await legacyEvent(assembleBody,2,opened.hash,"assemble_evidence","identified","evidence_assembled");
  const amendBody = command({action:"amend_claim",caseId:id,claimedNetPence:200000,expectedRevision:3,reviewerRef:legacyReviewer});
  await admin.query("INSERT INTO app.recovery_claim_revision(id,tenant_id,job_id,case_id,revision,claimed_net_pence,currency,reviewer_ref,subject_hash,previous_hash) VALUES($1,$2,$3,$4,2,200000,'GBP',$5,$6,(SELECT subject_hash FROM app.recovery_claim_revision WHERE tenant_id=$2 AND case_id=$4 AND revision=1))",[randomUUID(),tenant,job,opened.caseId,legacyReviewer,legacyDigest(recoveryCaseCommandV1.parse(amendBody))]);
  await legacyEvent(amendBody,3,assembleHash,"claim_amended","evidence_assembled","evidence_assembled");
  return {caseId:opened.caseId,openBody,assembleBody,amendBody};
 };
 it.each([false,true])("an exact replay of a command the preceding version recorded (upper-case ids: %s) returns its case and writes nothing", async upperCase => {
  const repo = new RecoveryCaseRepository(runtime), h = await legacyHistory(upperCase), before = await footprint(h.caseId);
  const opened = await repo.command(ctx,job,h.openBody,owner);
  expect(opened).toMatchObject({id:h.caseId,state:"evidence_assembled",claimedNetPence:200000,revision:5});
  expect((await repo.command(ctx,job,h.assembleBody,owner)).id).toBe(h.caseId);
  expect((await repo.command(ctx,job,h.amendBody,owner)).revision).toBe(5);
  expect(await footprint(h.caseId)).toEqual(before);
  // The history stays immutable: the stored rows still carry the preceding version's reviewer string and hashes.
  expect((await admin.query("SELECT DISTINCT reviewer_ref FROM app.recovery_case_event WHERE case_id=$1",[h.caseId])).rows).toEqual([{reviewer_ref:legacyReviewer}]);
 });
 it("a changed payload under a historical command id is still a typed conflict, and so is the same command against another job", async () => {
  const repo = new RecoveryCaseRepository(runtime), h = await legacyHistory(), before = await footprint(h.caseId);
  await expect(repo.command(ctx,job,{...h.openBody,claimedNetPence:250001},owner)).rejects.toThrow("IDEMPOTENCY_PAYLOAD_CONFLICT");
  await expect(repo.command(ctx,job,{...h.openBody,counterparty:"Someone else"},owner)).rejects.toThrow("IDEMPOTENCY_PAYLOAD_CONFLICT");
  await expect(repo.command(ctx,job,{...h.assembleBody,eventType:"start_pursuit"},owner)).rejects.toThrow("IDEMPOTENCY_PAYLOAD_CONFLICT");
  await expect(repo.command(ctx,job,{...h.amendBody,claimedNetPence:200001},owner)).rejects.toThrow("IDEMPOTENCY_PAYLOAD_CONFLICT");
  await expect(repo.command(ctx,job,{...h.openBody,reviewerRef:"someone-else"},owner)).rejects.toThrow("IDEMPOTENCY_PAYLOAD_CONFLICT"); // the stored reviewer is part of what was recorded
  await expect(repo.command(ctx,wrongJob,h.openBody,owner)).rejects.toThrow("IDEMPOTENCY_PAYLOAD_CONFLICT");
  await expect(repo.command(ctx,wrongJob,h.assembleBody,owner)).rejects.toThrow("IDEMPOTENCY_PAYLOAD_CONFLICT");
  expect(await footprint(h.caseId)).toEqual(before);
 });
 it("still checks the membership first: a revoked owner cannot replay a historical command", async () => {
  const repo = new RecoveryCaseRepository(runtime), h = await legacyHistory(), m = member();
  await admin.query("INSERT INTO identity.identity_user(id)VALUES($1)",[m.identityUserId]);
  await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role,revoked_at)VALUES($1,$2,$2,$3,'owner',now())",[m.membershipId,tenant,m.identityUserId]);
  await expect(repo.command(ctx,job,h.openBody,m)).rejects.toThrow("RECOVERY_REVIEWER_FORBIDDEN");
 });
 it("new commands continue on a case whose history was written by the preceding version, and the new rows carry the verified reviewer", async () => {
  const repo = new RecoveryCaseRepository(runtime), h = await legacyHistory();
  const current = (await repo.list(ctx,job)).find(c=>c.id===h.caseId)!;
  const next = command({action:"transition",caseId:h.caseId,eventType:"record_landing",amountPence:50000,expectedRevision:current.revision});
  const landed = await repo.command(ctx,job,next,owner);
  expect(landed).toMatchObject({state:"partially_landed",landedNetPence:50000,reviewerRef:ref(owner)});
  expect((await repo.command(ctx,job,next,owner)).revision).toBe(landed.revision);
  expect((await repo.command(ctx,job,h.openBody,owner)).id).toBe(h.caseId); // the historical command still replays after new activity
 });
 it("an eligibility command recorded with an upper-case case id by the preceding version replays; a changed one conflicts", async () => {
  const repo = new RecoveryCaseRepository(runtime), h = await legacyHistory(), current = (await repo.list(ctx,job)).find(c=>c.id===h.caseId)!;
  const review = {version:"recovery-eligibility-command.v1",action:"review",commandId:randomUUID(),caseId:h.caseId.toUpperCase(),scenario:"evidence_backed_withheld_payment",expectedCaseRevision:current.revision,evidenceRevision:1,policyVersion:"reference-d03.v1",policyRevision:1};
  await admin.query("INSERT INTO app.recovery_eligibility_revision(id,tenant_id,job_id,case_id,revision,case_revision,evidence_revision,policy_version,policy_revision,scenario,classification,eligible_net_pence,currency,reason,citations,status,reviewer_ref,command_id,subject_hash,previous_hash)VALUES($1,$2,$3,$4,1,$5,1,'reference-d03.v1',1,'evidence_backed_withheld_payment','eligible_for_review',200000,'GBP','Recorded by the preceding version','[]'::jsonb,'reviewed',$6,$7,$8,NULL)",[randomUUID(),tenant,job,h.caseId,current.revision,legacyReviewer,review.commandId,legacyDigest(recoveryEligibilityCommandV1.parse(review))]);
  const before = (await admin.query("SELECT count(*)::int n FROM app.recovery_eligibility_revision WHERE case_id=$1",[h.caseId])).rows[0].n;
  expect((await repo.eligibilityCommand(ctx,job,review,owner)).id).toBe(h.caseId);
  await expect(repo.eligibilityCommand(ctx,job,{...review,scenario:"manual_payment"},owner)).rejects.toThrow("IDEMPOTENCY_PAYLOAD_CONFLICT");
  await expect(repo.eligibilityCommand(ctx,wrongJob,review,owner)).rejects.toThrow("IDEMPOTENCY_PAYLOAD_CONFLICT");
  expect((await admin.query("SELECT count(*)::int n FROM app.recovery_eligibility_revision WHERE case_id=$1",[h.caseId])).rows[0].n).toBe(before);
 });
});


// Repair 14: real PostgreSQL commits followed by injected answer-read faults.
it("a committed opening with a failed repository answer replays the same case exactly once", async () => {
 const repo=new RecoveryCaseRepository(runtime),body=openCase();
 const list=vi.spyOn(repo,"listForMember").mockRejectedValueOnce(new Error("RECOVERY_STALE_REVISION"));
 try {
  await expect(repo.command(ctx,job,body,owner)).rejects.toMatchObject({code:"RECOVERY_COMMAND_OUTCOME_UNKNOWN"});
  const stored=await admin.query("SELECT case_id FROM app.recovery_case_event WHERE tenant_id=$1 AND command_id=$2",[tenant,body.commandId]);
  expect(stored.rows).toHaveLength(1);
  const replay=await repo.command(ctx,job,body,owner);
  expect(replay.id).toBe(stored.rows[0].case_id);
  expect((await admin.query("SELECT count(*)::int n FROM app.recovery_case WHERE tenant_id=$1 AND id=$2",[tenant,replay.id])).rows[0].n).toBe(1);
  expect((await admin.query("SELECT count(*)::int n FROM app.recovery_case_event WHERE tenant_id=$1 AND command_id=$2",[tenant,body.commandId])).rows[0].n).toBe(1);
 } finally { list.mockRestore(); }
});
it("a committed eligibility revision with a failed repository answer replays exactly once", async () => {
 const repo=new RecoveryCaseRepository(runtime),opened=await repo.command(ctx,job,openCase(),owner);
 const body={version:"recovery-eligibility-command.v1",action:"review",commandId:randomUUID(),caseId:opened.id,expectedCaseRevision:opened.revision,evidenceRevision:1,policyVersion:"reference-d03.v1",policyRevision:1,scenario:"evidence_backed_withheld_payment"};
 const list=vi.spyOn(repo,"listForMember").mockRejectedValueOnce(new Error("ELIGIBILITY_STALE_REVISION"));
 try {
  await expect(repo.eligibilityCommand(ctx,job,body,owner)).rejects.toMatchObject({code:"RECOVERY_COMMAND_OUTCOME_UNKNOWN"});
  const replay=await repo.eligibilityCommand(ctx,job,body,owner);
  expect(replay.id).toBe(opened.id);
  expect(replay.eligibility?.revision).toBe(1);
  expect((await admin.query("SELECT count(*)::int n FROM app.recovery_eligibility_revision WHERE tenant_id=$1 AND command_id=$2",[tenant,body.commandId])).rows[0].n).toBe(1);
 } finally { list.mockRestore(); }
});

// Repair 15: durable replay survives loss, revocation before lookup, and restored access.
it("an opening commits, its answer is lost, a revoked retry writes nothing, and authorised replay returns the original case", async () => {
 const repo = new RecoveryCaseRepository(runtime), m = member(), input = openCase();
 await admin.query("INSERT INTO identity.identity_user(id)VALUES($1)",[m.identityUserId]);
 await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role)VALUES($1,$2,$2,$3,'owner')",[m.membershipId,tenant,m.identityUserId]);
 const read = vi.spyOn(repo,"listForMember").mockRejectedValueOnce(new Error("Simulated lost committed answer"));
 try {
  await expect(repo.command(ctx,job,input,m)).rejects.toMatchObject({code:"RECOVERY_COMMAND_OUTCOME_UNKNOWN"});
  const recorded = (await admin.query("SELECT case_id FROM app.recovery_case_event WHERE tenant_id=$1 AND command_id=$2",[tenant,input.commandId])).rows;
  expect(recorded).toHaveLength(1);
  const footprint = async () => (await admin.query("SELECT (SELECT count(*) FROM app.recovery_case_event WHERE case_id=$1)::int events,(SELECT count(*) FROM app.recovery_claim_revision WHERE case_id=$1)::int claims,(SELECT count(*) FROM app.audit_event WHERE subject_ref=$1::text)::int audit",[recorded[0].case_id])).rows[0];
  const before = await footprint();
  await admin.query("UPDATE app.membership SET revoked_at=now() WHERE id=$1",[m.membershipId]);
  await expect(repo.command(ctx,job,input,m)).rejects.toThrow("RECOVERY_REVIEWER_FORBIDDEN");
  expect(await footprint()).toEqual(before);
  await admin.query("UPDATE app.membership SET revoked_at=NULL WHERE id=$1",[m.membershipId]);
  expect(await repo.command(ctx,job,input,m)).toMatchObject({id:recorded[0].case_id,revision:2,claimedNetPence:250000});
  expect(await footprint()).toEqual(before);
 } finally {read.mockRestore()}
});

// Repair 19/20: real demo-tenant restrictive material RLS, proven on ../src only. The API application's
// wiring (it hands the authorised session digest to this repository) is proven in apps/api unit tests.
it("practice recovery cases open, list and review with their own session's supplier rate while strangers are refused", async () => {
 const { DEMO_TENANT_ID, DEMO_IDENTITY_USER_ID, DEMO_ACCOUNT_ID, DEMO_MEMBERSHIP_ID,
  issuePracticeSession, authenticatePracticeSession, authorizePracticeJob, practiceMaterialPool, MaterialRepository } = await import("../src/index.js");
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
 try {
  await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [DEMO_TENANT_ID]);
  await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [DEMO_IDENTITY_USER_ID]);
  await admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Fictional repair 19 builder')", [DEMO_ACCOUNT_ID,DEMO_TENANT_ID]);
  await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [DEMO_MEMBERSHIP_ID,DEMO_TENANT_ID,DEMO_ACCOUNT_ID,DEMO_IDENTITY_USER_ID]);
  const creator=await issuePracticeSession(runtime), stranger=await issuePracticeSession(runtime);
  const auth=await authenticatePracticeSession(runtime,creator), strangerAuth=await authenticatePracticeSession(runtime,stranger);
  const ownedJob=async(digest:string)=>(await admin.query("SELECT id FROM app.job WHERE tenant_id=$1 AND practice_session_digest=$2 AND status='live'",[DEMO_TENANT_ID,digest])).rows[0].id as string;
  const jobId=await ownedJob(auth.digest), strangerJobId=await ownedJob(strangerAuth.digest), nonexistentJobId=randomUUID(), scopeId=randomUUID();
  await expect(authorizePracticeJob(runtime,stranger,strangerJobId)).resolves.toMatchObject({digest:strangerAuth.digest});
  expect((await admin.query("SELECT id FROM app.job WHERE id=$1",[nonexistentJobId])).rows).toEqual([]);
  await admin.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')",[scopeId,DEMO_TENANT_ID,jobId]);
  const materials=new MaterialRepository(practiceMaterialPool(runtime,auth.digest));
  const rate=await materials.addRate(auth.context,{
   merchantName:"Fictional repair 19 merchant",sku:"REPAIR19-SESSION",description:"Synthetic repair material",pricePence:2000,
   priceUnit:"each",taxBasis:"net",effectiveFrom:"2026-09-01",sourceLabel:"Synthetic repair 19 agreement",expectedVersion:0,
  });
  await materials.addRequirement(auth.context,{jobId,scopeItemId:scopeId,skuId:rate.skuId,quantity:"40",unit:"each",expectedRevision:0});
  expect((await admin.query("SELECT practice_session_digest FROM app.material_rate_revision WHERE id=$1",[rate.id])).rows[0].practice_session_digest).toBe(auth.digest);
  const open=()=>({version:"recovery-case-command.v1",action:"open",commandId:randomUUID(),caseType:"merchant_overcharge",claimedNetPence:32000,
   counterparty:"Fictional merchant",book:"supplier_cost",sourceType:"supplier_documents",sourceRefs:[rate.id],expectedRevision:0});
  // A control proves this fixture actually exercises the restrictive policy.
  const reviewer={membershipId:auth.membershipId,identityUserId:auth.identityUserId};
  await expect(new RecoveryCaseRepository(runtime).command(auth.context,jobId,open(),reviewer)).rejects.toMatchObject({code:"RECOVERY_SOURCE_NOT_RECOGNISED"});
  // The repository on the session's own material scope (what the API application builds from the authorised digest) resolves the rate.
  const scoped=new RecoveryCaseRepository(practiceMaterialPool(runtime,auth.digest));
  const saved=await scoped.command(auth.context,jobId,open(),reviewer);
  const sources=[{ref:rate.id,kind:"Supplier agreement",label:"Supplier agreement Synthetic repair 19 agreement",recorded:true}];
  expect(saved).toMatchObject({jobId,sourceRefs:[rate.id],sources});
  expect((await scoped.listForMember(auth.context,jobId,reviewer)).find(c=>c.id===saved.id)?.sources).toEqual(sources);
  const reviewed=await scoped.eligibilityCommand(auth.context,jobId,{version:"recovery-eligibility-command.v1",action:"review",commandId:randomUUID(),caseId:saved.id,
   expectedCaseRevision:saved.revision,evidenceRevision:1,policyVersion:"reference-d03.v1",policyRevision:1,scenario:"unknown_basis"},reviewer);
  expect(reviewed).toMatchObject({id:saved.id,sources,eligibility:{status:"reviewed",classification:"pending_review"}});
  // Even bypassing job preflight cannot make a stranger's material digest resolve this rate.
  await expect(new RecoveryCaseRepository(practiceMaterialPool(runtime,strangerAuth.digest)).command(auth.context,jobId,open(),reviewer)).rejects.toMatchObject({code:"RECOVERY_SOURCE_NOT_RECOGNISED"});
  // A stranger's job authorisation answers the same NOT_FOUND for another session's job and for a job that does not exist.
  const refusals:unknown[]=[];
  for(const target of [jobId,nonexistentJobId]){
   let error:unknown;try{await authorizePracticeJob(runtime,stranger,target)}catch(cause){error=cause}
   expect(error).toMatchObject({code:"NOT_FOUND",message:"NOT_FOUND"});
   refusals.push({name:(error as Error).name,code:(error as {code:string}).code,message:(error as Error).message});
  }
  expect(refusals[0]).toEqual(refusals[1]);
  await expect(authorizePracticeJob(runtime,creator,jobId)).resolves.toMatchObject({digest:auth.digest});
 } finally {vi.unstubAllEnvs()}
});
