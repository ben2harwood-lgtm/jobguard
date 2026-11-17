import { randomUUID } from "node:crypto";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { boundaryLock,createWorkFixture,closeWorkFixture,seedWorkJob,fixtureLifecycle,insertPhoto,workEvents,workTenant,CH4_HASH,type WorkFixture } from "./job-work-state-fixtures.js";
describe("CH-4 post-lock database boundary",()=>{
 let f:WorkFixture;beforeAll(async()=>{f=await createWorkFixture()},60000);afterAll(async()=>closeWorkFixture(f));
 it("CH4-A13 new site work is refused after lock before source effects (raw progress photo and supplier invoice)",async()=>{
  const a=await seedWorkJob(f);await boundaryLock(f,a);const before=await workEvents(f,a);
  await expect(insertPhoto(f,a)).rejects.toThrow("POST_LOCK_WORK_REQUIRES_LINKED_JOB");
  await expect(workTenant(f.runtime,a.tenantId,db=>db.query("INSERT INTO app.supplier_document(id,tenant_id,job_id,supplier_context,document_type,content_hash,status) VALUES($1,$2,$3,'fictional','invoice',$4,'ready')",[randomUUID(),a.tenantId,a.jobId,CH4_HASH]))).rejects.toThrow("POST_LOCK_WORK_REQUIRES_LINKED_JOB");
  expect(await workEvents(f,a)).toEqual(before);expect((await f.admin.query("SELECT count(*)::int n FROM app.evidence_upload WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId])).rows[0].n).toBe(0);
 });
 it("CH4-A08 closed jobs refuse final-check admission (fixture close, new insert only)",async()=>{
  const a=await seedWorkJob(f);await fixtureLifecycle(f,a,"closed");
  // New admission is refused before validating unrelated FK parents, with no effect.
  await expect(workTenant(f.admin,a.tenantId,db=>db.query(`INSERT INTO app.final_account_lock_check(tenant_id,job_id,id,lock_id,evidence_cutoff_at,status) VALUES($1,$2,$3,$4,clock_timestamp(),'pending')`,[a.tenantId,a.jobId,randomUUID(),randomUUID()]))).rejects.toThrow("JOB_WORK_CLOSED");
 });
 it("CH4-A14 billing boundary classes are excluded structurally (new snagging admission held)",async()=>{
  const a=await seedWorkJob(f);await boundaryLock(f,a);
  expect(await workEvents(f,a)).toEqual([]);
  const triggers=(await f.admin.query("SELECT c.relname FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_proc p ON p.oid=t.tgfoid WHERE p.proname='ch4_capture_site_source'")).rows.map(r=>r.relname);
  for(const table of ["customer_invoice","customer_payment_receipt","customer_credit_note","shadow_signal","shadow_reveal"])expect(triggers).not.toContain(table);
 });
});

describe("CH-4 existing source replay after lock",()=>{
 let f:WorkFixture;beforeAll(async()=>{f=await createWorkFixture()},60000);afterAll(async()=>closeWorkFixture(f));
 it("CH4-A13 CH4-A15 exact pre-lock builder capture replays; new identity and changed request cannot pass",async()=>{
  const {VariationRepository}=await import("../src/variation-repository.js"),a=await seedWorkJob(f),repo=new VariationRepository(f.runtime);
  const input={version:"log-builder-extra.v1",actorMembershipId:a.actorId,deviceId:null,deviceCapturedAt:null,price:null,proposal:{version:"variation-proposal.v1",id:randomUUID(),jobId:a.jobId,scopeItemId:randomUUID(),existingScopeItemId:null,lineageParentScopeItemId:null,captureKind:"text",captureText:"Fictional extra",description:"Fictional extra",suggestion:null}};
  const result=await repo.logBuilderExtra(a.context,input),events=await workEvents(f,a);await boundaryLock(f,a);
  expect(await repo.logBuilderExtra(a.context,input)).toEqual(result);expect(await workEvents(f,a)).toEqual(events);
  await expect(repo.logBuilderExtra(a.context,{...input,proposal:{...input.proposal,description:"Changed"}})).rejects.toThrow("COMMAND_CONFLICT");
  await expect(repo.logBuilderExtra(a.context,{...input,proposal:{...input.proposal,id:randomUUID(),scopeItemId:randomUUID()}})).rejects.toThrow("POST_LOCK_WORK_REQUIRES_LINKED_JOB");
  expect(await workEvents(f,a)).toEqual(events);
 });
 it("CH4-A13 locked invoiced job receives the linked refusal through an existing supplier repository",async()=>{
  const a=await seedWorkJob(f);await boundaryLock(f,a);await workTenant(f.admin,a.tenantId,async db=>{await db.query("SET LOCAL session_replication_role='replica'");await db.query("UPDATE app.job SET status='invoiced' WHERE tenant_id=$1 AND id=$2",[a.tenantId,a.jobId])});
  const {SupplierDocumentRepository}=await import("../src/supplier-document-repository.js");
  await expect(new SupplierDocumentRepository(f.runtime).intake(a.context,a.jobId,{version:"supplier-document-intake.v1",fixtureId:"materials-B-invoice",channel:"picker",expectedRevision:0})).rejects.toThrow("POST_LOCK_WORK_REQUIRES_LINKED_JOB");
  expect(await workEvents(f,a)).toEqual([]);
 });
});

describe("CH-4 excluded billing evidence lock boundary",()=>{
 let f:WorkFixture;beforeAll(async()=>{f=await createWorkFixture()},60000);afterAll(async()=>closeWorkFixture(f));
 it("CH4-A14 CH4-A17 bank-receipt boundary facts never enter the site-source business-lock helper",async()=>{
  const a=await seedWorkJob(f),original=(await f.admin.query("SELECT pg_get_functiondef('app.ch4_source_job(uuid,uuid)'::regprocedure) body")).rows[0].body as string;
  await f.admin.query(`CREATE OR REPLACE FUNCTION app.ch4_source_job(t uuid,j uuid) RETURNS boolean LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN RAISE EXCEPTION 'CH4_FIXTURE_SOURCE_LOCK'; END $$`);
  try{
   await expect(insertPhoto(f,a)).rejects.toThrow("CH4_FIXTURE_SOURCE_LOCK");
   await workTenant(f.admin,a.tenantId,async db=>{
    await db.query("SET LOCAL ROLE jobguard_migration");await db.query("SELECT * FROM app.lock_audit_head()");const id=randomUUID(),key=`synthetic/recovery/${id}`;
    // Labelled stored-fact boundary only: it is never qualifying settlement proof.
    await db.query("INSERT INTO app.evidence_upload(id,tenant_id,job_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,expires_at,state,object_version_id,server_verified_at) VALUES($1,$2,$3,$4,$5,'application/pdf',100,'standard_evidence',clock_timestamp()+interval '1 day','verified','boundary-v1',clock_timestamp())",[id,a.tenantId,a.jobId,key,CH4_HASH]);
    await db.query("INSERT INTO app.evidence_object(id,tenant_id,upload_id,job_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at) VALUES($1,$2,$1,$3,'original','synthetic_bank_receipt',$4,'boundary-v1',$5,1,'application/pdf','standard_evidence',clock_timestamp(),clock_timestamp())",[id,a.tenantId,a.jobId,key,CH4_HASH]);
   });expect(await workEvents(f,a)).toEqual([]);
  }finally{await f.admin.query(original)}
 });
});

describe("CH-4 held-close admission boundary through the existing lock command",()=>{
 let f:WorkFixture;beforeAll(async()=>{f=await createWorkFixture()},60000);afterAll(async()=>closeWorkFixture(f));
 it("CH4-A08 CH4-A17 closed storage refuses the existing lock routine atomically",async()=>{
  const {prepareWorkAccount}=await import("./job-work-state-fixtures.js"),{FinalAccountLockRepository}=await import("../src/final-account-lock-repository.js"),a=await seedWorkJob(f),account=await prepareWorkAccount(f,a),repo=new FinalAccountLockRepository(f.runtime);
  await repo.acceptTerms(a.context,{actorMembershipId:a.actorId,commandId:randomUUID(),termsVersion:"synthetic_final_check_terms.v1"});
  await repo.disposition(a.context,{jobId:a.jobId,actorMembershipId:a.actorId,commandId:randomUUID(),scopeItemId:a.scopeId,disposition:"done"});await fixtureLifecycle(f,a,"closed");
  const before=(await f.admin.query("SELECT row_to_json(t)::text row FROM app.audit_event t WHERE tenant_id=$1 ORDER BY sequence",[a.tenantId])).rows;
  await expect(repo.lock(a.context,{jobId:a.jobId,actorMembershipId:a.actorId,commandId:randomUUID(),finalAccountRevisionId:account.revisionId,expectedRevision:1,declarationVersion:"final_account_declaration.v1"})).rejects.toThrow("JOB_WORK_CLOSED");
  expect((await f.admin.query("SELECT row_to_json(t)::text row FROM app.audit_event t WHERE tenant_id=$1 ORDER BY sequence",[a.tenantId])).rows).toEqual(before);expect((await f.admin.query("SELECT 1 FROM app.final_account_lock WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId])).rows).toEqual([]);
 });
});

describe("CH-4 raw new-work guard matrix",()=>{
 // This suite has its own harness so the r8 recipe is booted before use.
 const sourceHarness=createWatchdogHarness("ch4-po-noop",59600);
 beforeAll(()=>sourceHarness.boot(),120000);afterAll(()=>sourceHarness.stop());
 let f:WorkFixture;beforeAll(async()=>{f=await createWorkFixture()},60000);afterAll(async()=>closeWorkFixture(f));
 it("CH4-A13 every raw new-work family is refused before its row constraints or effects",async()=>{
  const a=await seedWorkJob(f);
  await workTenant(f.admin,a.tenantId,db=>db.query("INSERT INTO app.scope_progress(tenant_id,job_id,scope_item_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",[a.tenantId,a.jobId,a.scopeId]));
  await boundaryLock(f,a);
  // Skeletal rows deliberately test guard priority before missing required commercial/source fields.
  for(const table of ["purchase_order_draft","purchase_order_revision","purchase_order_placement","stage_completion","evidence_link","variation"]){
   await expect(workTenant(f.runtime,a.tenantId,db=>db.query(`INSERT INTO app.${table}(id,tenant_id,job_id) VALUES($1,$2,$3)`,[randomUUID(),a.tenantId,a.jobId]))).rejects.toThrow("POST_LOCK_WORK_REQUIRES_LINKED_JOB");
   expect((await f.admin.query(`SELECT count(*)::int n FROM app.${table} WHERE tenant_id=$1 AND job_id=$2`,[a.tenantId,a.jobId])).rows[0].n).toBe(0);
  }
  await expect(workTenant(f.runtime,a.tenantId,db=>db.query("SELECT app.transition_scope_progress($1,$2,$3,0,'in_progress','start')",[a.tenantId,a.jobId,a.scopeId]))).rejects.toThrow("POST_LOCK_WORK_REQUIRES_LINKED_JOB");
  expect((await f.admin.query("SELECT stage FROM app.scope_progress WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId])).rows[0].stage).toBe("not_started");
 });
 it("r8 a successful pre-lock PO semantic no-op keeps its own replay identity after lock",async()=>{
  const entry=sourceHarness.cases.find(c=>c.key==="purchase-order-repository.ts#place")!,jobId=await sourceHarness.live();
  await entry.prepare(jobId);await entry.run(jobId,randomUUID(),"same");
  const noopId=randomUUID(),first=sourceHarness.norm(await entry.noop!(jobId,noopId,"same"));
  await boundaryLock({admin:sourceHarness.admin} as WorkFixture,{tenantId:sourceHarness.tenant,jobId,actorId:sourceHarness.member} as Awaited<ReturnType<typeof seedWorkJob>>);
  expect(sourceHarness.norm(await entry.noop!(jobId,noopId,"same"))).toEqual(first);
  await expect(entry.noop!(jobId,noopId,"changed")).rejects.toThrow(/CONFLICT/u);
  await expect(entry.noop!(jobId,randomUUID(),"same")).rejects.toThrow("POST_LOCK_WORK_REQUIRES_LINKED_JOB");
 });
});

// Read-only reuse of the merged repository recipes; no registry/harness change.
import { createWatchdogHarness } from "./watchdog-command-harness.js";
import { withTenant } from "../src/tenant-context.js";
const sourceHarness=createWatchdogHarness("ch4-existing-source",59600);
describe("CH-4 actual existing repository replay/refusal matrix",()=>{
 beforeAll(()=>sourceHarness.boot(),120000);afterAll(()=>sourceHarness.stop());
 for(const key of ["purchase-order-repository.ts#revise","purchase-order-repository.ts#place","supplier-document-repository.ts#intake","evidence.ts#beginUpload","evidence.ts#finalize","proof-repository.ts#complete"]){
  it(`CH4-A13 CH4-A15 ${key}: genuine pre-lock replay is unchanged and a new identity cannot use its allowance`,async()=>{
   const entry=sourceHarness.cases.find(c=>c.key===key);expect(entry,`${key} recipe exists`).toBeTruthy();
   const jobId=await sourceHarness.live();await entry!.prepare(jobId);const command=randomUUID(),first=sourceHarness.norm(await entry!.run(jobId,command,"same"));
   const receipts=await withTenant(sourceHarness.runtime,sourceHarness.ctx,db=>db.$client.query("SELECT count(*)::int n FROM app.job_site_source_receipt WHERE tenant_id=$1 AND job_id=$2",[sourceHarness.tenant,jobId]));
   await boundaryLock({admin:sourceHarness.admin} as WorkFixture,{tenantId:sourceHarness.tenant,jobId,actorId:sourceHarness.member} as Awaited<ReturnType<typeof seedWorkJob>>);
   expect(sourceHarness.norm(await entry!.run(jobId,command,"same"))).toEqual(first);
   await expect(entry!.run(jobId,command,"changed")).rejects.toThrow(/CONFLICT/u);
   await expect(entry!.run(jobId,randomUUID(),"same")).rejects.toThrow(/POST_LOCK_WORK_REQUIRES_LINKED_JOB|CONFLICT|STALE_DOCUMENT_INTAKE/u);
   const after=await withTenant(sourceHarness.runtime,sourceHarness.ctx,db=>db.$client.query("SELECT count(*)::int n FROM app.job_site_source_receipt WHERE tenant_id=$1 AND job_id=$2",[sourceHarness.tenant,jobId]));expect(after.rows).toEqual(receipts.rows);
  });
 }
});

// r10: scripted statement regressions only. These do not replace the real
// PostgreSQL replay/trigger suites above or prove RLS and SQL execution.
describe("r10 scripted source projections",()=>{
 function script(jobId:string,tenantId:string,offer:unknown,notLive=false){
  const calls:string[]=[],valuesSeen:unknown[][]=[];
  let connections=0;
  const client={release(){},async query(sql:string,values:unknown[]=[]){
   calls.push(sql);valuesSeen.push(values);
   const rows=(items:unknown[]=[])=>({rows:items,rowCount:items.length});
   if((sql.startsWith("SELECT role FROM app.membership") || sql.startsWith("SELECT 1 FROM app.membership")))return rows([{role:"owner"}]);
   if(sql.includes("require_watchdog_live")&&notLive)throw new Error("JOB_NOT_LIVE");
   if (sql === "SELECT name FROM unnest(ARRAY['app.job_diary_entry','app.customer_message_source']) AS source(name) WHERE pg_catalog.to_regclass(name) IS NOT NULL") return rows([{ name: "app.job_diary_entry" }, { name: "app.customer_message_source" }]);
   if (sql === "SELECT 'JobSource.diary' AS kind, job_id FROM app.job_diary_entry WHERE tenant_id=$1 AND command_id=$2" ||
     sql === "SELECT 'JobSource.customer_message' AS kind, job_id FROM app.customer_message_source WHERE tenant_id=$1 AND command_id=$2") return rows([]);
   if(sql.startsWith("INSERT INTO app.watchdog_command_identity"))return rows([{command_id:values[1]}]);
   if(sql.includes("ch4_locked_offer")){
    if(sql.startsWith("SELECT request_hash,status,result"))return rows([{status:"ch4_locked",result:offer}]);
    if(sql.includes("JOIN app.merchant_sku"))return rows([{id:randomUUID(),price_pence:2000,price_unit:"each",ch4_locked_offer:offer}]);
    if(sql.startsWith("SELECT count(*) n"))return rows([{n:0,ch4_locked_offer:offer}]);
   }
   if(sql.startsWith("SELECT j.id job_id"))return rows(offer?[{job_id:jobId,customer_id:(offer as any).customerId,site_id:(offer as any).siteId}]:[]);
   if(/^(BEGIN|COMMIT|ROLLBACK|SELECT set_config|SELECT pg_advisory_xact_lock|SELECT app\.)/u.test(sql)||sql.includes("UNION ALL")||sql.startsWith("SELECT 1 FROM app.command_receipt c"))return rows();
   throw new Error(`Unexpected r10 scripted SQL: ${sql}`);
  }};
  const pool={connect:async()=>{connections++;return client}} as unknown as import("pg").Pool;
  return{pool,calls,valuesSeen,connections:()=>connections};
 }
 function setup(){
  const tenantId=randomUUID(),jobId=randomUUID(),actor=randomUUID();
  const offer={version:"job-linked-offer.v1",code:"POST_LOCK_WORK_REQUIRES_LINKED_JOB",message:"Start a linked job for this customer and site",jobId,customerId:randomUUID(),siteId:randomUUID()};
  return{tenantId,jobId,actor,offer,context:testTenantContext(tenantId)};
 }
 it("refuses a fresh PO identity before a semantic receipt or authorization can be reused",async()=>{
  const {PurchaseOrderRepository}=await import("../src/purchase-order-repository.js"),f=setup(),db=script(f.jobId,f.tenantId,f.offer);
  const command={version:"command.v1" as const,commandId:randomUUID(),commandType:"purchase_order.place",semanticKey:"previous-placement",actorMembershipId:f.actor,subjectType:"purchase_order",subjectRef:randomUUID(),action:{actionType:"purchase_order.simulate",recipient:"orders@fictional.invalid",contentHash:CH4_HASH,aggregateRevision:1,amountPence:20000,currency:"GBP",policyVersion:"synthetic-po.v1",expiresAt:new Date("2099-01-01T00:00:00Z")}};
  await expect(new PurchaseOrderRepository(db.pool).place(f.context,f.jobId,command as import("../src/commands.js").ConsequentialCommand)).rejects.toMatchObject({code:f.offer.code,offer:f.offer});
  expect(db.calls.some(sql=>sql.startsWith("INSERT INTO app.command_receipt")||sql.includes("app.action_authorization")||sql.includes("app.action_outbox"))).toBe(false);
  expect(db.calls.at(-1)).toBe("ROLLBACK");
  expect(db.valuesSeen[db.calls.findIndex(sql=>sql.includes("ch4_locked_offer"))]).toEqual([f.tenantId,command.commandId,f.jobId]);
 });
 it("refuses a locked PO revision from its existing rate-read statement before writes",async()=>{
  const {PurchaseOrderRepository}=await import("../src/purchase-order-repository.js"),f=setup(),db=script(f.jobId,f.tenantId,f.offer);
  await expect(new PurchaseOrderRepository(db.pool).revise(f.context,f.jobId,{version:"purchase-order-draft.v1",commandId:randomUUID(),requirementId:randomUUID(),quantity:"10",unitPricePence:2000,recipient:"orders@fictional.invalid",requiredDate:"2030-01-01",expectedRevision:0})).rejects.toMatchObject({code:f.offer.code,offer:f.offer});
  expect(db.calls.filter(sql=>sql.includes("ch4_locked_offer"))).toHaveLength(1);
  expect(db.calls.some(sql=>sql.startsWith("INSERT INTO app.purchase_order")||sql.startsWith("INSERT INTO app.watchdog_command_result"))).toBe(false);
  expect(db.calls.at(-1)).toBe("ROLLBACK");
 });
 it("refuses a locked invoice from the existing count statement without intake or audit",async()=>{
  const {SupplierDocumentRepository}=await import("../src/supplier-document-repository.js"),f=setup(),db=script(f.jobId,f.tenantId,f.offer);
  await expect(new SupplierDocumentRepository(db.pool).intake(f.context,f.jobId,{version:"supplier-document-intake.v1",commandId:randomUUID(),fixtureId:"materials-B-invoice",channel:"picker",expectedRevision:0})).rejects.toMatchObject({code:f.offer.code,offer:f.offer});
  expect(db.calls.filter(sql=>sql.includes("ch4_locked_offer"))).toHaveLength(1);
  expect(db.calls.some(sql=>sql.startsWith("INSERT INTO app.supplier_document")||(sql.startsWith("INSERT INTO app.audit_event")||sql.includes("FROM app.append_audit(")))).toBe(false);
  expect(db.calls.at(-1)).toBe("ROLLBACK");
 });
 it.each([true,false])("reads a non-live linked offer only after rollback in a fresh transaction: locked=%s",async locked=>{
  const {SupplierDocumentRepository}=await import("../src/supplier-document-repository.js"),f=setup(),db=script(f.jobId,f.tenantId,locked?f.offer:null,true);
  await expect(new SupplierDocumentRepository(db.pool).intake(f.context,f.jobId,{version:"supplier-document-intake.v1",fixtureId:"materials-B-invoice",channel:"picker",expectedRevision:0})).rejects.toMatchObject(locked?{code:f.offer.code,offer:f.offer}:{code:"JOB_NOT_LIVE"});
  const rolledBack=db.calls.indexOf("ROLLBACK"),lookup=db.calls.findIndex(sql=>sql.startsWith("SELECT j.id job_id"));
  expect(rolledBack).toBeGreaterThan(-1);expect(lookup).toBeGreaterThan(rolledBack);
  expect(db.calls.slice(rolledBack+1,lookup)).toContain("BEGIN");expect(db.connections()).toBe(2);
  expect(db.calls.some(sql=>sql.startsWith("INSERT INTO"))).toBe(false);
 });
});

import { testTenantContext } from "./tenant-context-test-utils.js";
