// CI: real PostgreSQL, genuine writers; only evidence/classifier inputs are fixtures.
import {beforeAll,afterAll,expect,it} from "vitest";
import {ReceiptCaseAllocationApplication} from "../../../apps/api/src/receipt-case-allocation.application.js";
import {RecoveryAttributionRepository} from "../src/recovery-attribution-repository.js";
// Fake source documents only. All constraints/triggers stay enabled; quote,
// activation, variation, final account, invoice, feed and receipt use writers.
import {createHash,randomUUID} from "node:crypto";
import {priceVariation,parseExactPence,serializeExactPence,sumExactPence} from "@jobguard/core";
import {prepareActivationFixtureV3,DEMO_TENANT_ID,DEMO_MEMBERSHIP_ID,DEMO_IDENTITY_USER_ID} from "../src/demo-seed.js";
import {issuePracticeSession,authenticatePracticeSession,practiceMaterialPool} from "../src/practice-session.js";
import {PracticeActivationRepository} from "../src/activation-repository.js";
import {FinalAccountCommandService} from "../src/final-account-repository.js";
import {FinalAccountLockRepository} from "../src/final-account-lock-repository.js";
import {FinalCheckCompletionRepository} from "../src/shadow-detection-repository.js";
import {FinalCheckRepository,type FinalCheckClassification} from "../src/final-check-repository.js";
import {VariationRepository,insertPricedVariation,approvePricedVariation} from "../src/variation-repository.js";
import {PracticeFeedRepository} from "../src/practice-feed-repository.js";
import {PracticeInvoiceRepository} from "../src/practice-invoice-repository.js";
import {withTenant} from "../src/tenant-context.js";
import {testTenantContext} from "./tenant-context-test-utils.js";
import {createFinalCheckFixture,closeFinalCheckFixture,finalCheckTenant,type FinalCheckFixture} from "./final-check-fixture.js";
import {pngBytes} from "./site-extra-evidence-fixtures.js";
const hash="a".repeat(64);
async function combinedReceiptFixture(f:FinalCheckFixture){
 const baselineNetPence=3000000;
 process.env.JOBGUARD_ENV="synthetic_demo";
 await f.admin.query("INSERT INTO control_plane.tenant(id) VALUES($1) ON CONFLICT DO NOTHING",[DEMO_TENANT_ID]);
 await f.admin.query("INSERT INTO identity.identity_user(id) VALUES($1) ON CONFLICT DO NOTHING",[DEMO_IDENTITY_USER_ID]);
 const account=randomUUID();
 await finalCheckTenant(f.admin,DEMO_TENANT_ID,async db=>{
  await db.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Fictional allocator builder')",[account,DEMO_TENANT_ID]);
  await db.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner') ON CONFLICT DO NOTHING",[DEMO_MEMBERSHIP_ID,DEMO_TENANT_ID,account,DEMO_IDENTITY_USER_ID]);
 });
 const session=await issuePracticeSession(f.runtime),auth=await authenticatePracticeSession(f.runtime,session),context=testTenantContext(DEMO_TENANT_ID),actor={membershipId:DEMO_MEMBERSHIP_ID,identityUserId:DEMO_IDENTITY_USER_ID};
 const scoped=practiceMaterialPool(f.runtime,auth.digest),jobId=await prepareActivationFixtureV3(f.admin,context,"shadow-30000",baselineNetPence,scoped,baselineNetPence,auth.digest);
 await new PracticeActivationRepository(scoped).start(context,jobId,{commandId:randomUUID(),scenario:"no_charge"});
 const scope=(await f.admin.query("SELECT id FROM app.scope_identity WHERE tenant_id=$1 AND job_id=$2 AND state='confirmed' ORDER BY created_at,id LIMIT 1",[DEMO_TENANT_ID,jobId])).rows[0].id as string;
 // Synthetic certificate image using the existing valid PNG fixture helper.
 // Genuine finalized source recipe before lock. No accounting or allocation rows
 // are seeded. Completion remains a normal evidence-link/stage input to assembly.
 const evidence=randomUUID(),upload=randomUUID(),link=randomUUID(),bytes=Buffer.from(pngBytes(23)),sha=createHash("sha256").update(bytes).digest("hex"),objectKey=`synthetic/allocator/${upload}`;
 await finalCheckTenant(f.admin,DEMO_TENANT_ID,async db=>{
  await db.query(`INSERT INTO app.evidence_upload(id,tenant_id,job_id,scope_item_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,expires_at,state,object_version_id,server_verified_at)
   VALUES($1,$2,$3,$4,$5,$6,'image/png',1000,'standard_evidence',clock_timestamp()+interval '1 day','verified','allocator-v1',clock_timestamp())`,[upload,DEMO_TENANT_ID,jobId,scope,objectKey,sha]);
  await db.query(`INSERT INTO app.synthetic_evidence_original(tenant_id,upload_id,job_id,scope_item_id,object_key,object_version_id,environment,content_type,bytes)
   VALUES($1,$2,$3,$4,$5,'allocator-v1','synthetic_demo','image/png',$6)`,[DEMO_TENANT_ID,upload,jobId,scope,objectKey,bytes]);
  await db.query(`INSERT INTO app.evidence_object(id,tenant_id,upload_id,job_id,scope_item_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at)
   VALUES($1,$2,$3,$4,$5,'original','electrical_certificate',$6,'allocator-v1',$7,$8,'image/png','standard_evidence',clock_timestamp(),clock_timestamp())`,[evidence,DEMO_TENANT_ID,upload,jobId,scope,objectKey,sha,bytes.length]);
  await db.query("INSERT INTO app.evidence_link(id,tenant_id,evidence_id,job_id,scope_item_id,required_evidence_type) VALUES($1,$2,$3,$4,$5,'electrical_certificate')",[link,DEMO_TENANT_ID,evidence,jobId,scope]);
  await db.query("INSERT INTO app.stage_completion(id,tenant_id,job_id,scope_item_id,stage,evidence_link_id,command_id) VALUES($1,$2,$3,$4,'electrical_complete',$5,$6)",[randomUUID(),DEMO_TENANT_ID,jobId,scope,link,randomUUID()]);
 });
 const feed=new PracticeFeedRepository(f.runtime,"synthetic_demo");
 let feedRevision=(await feed.command(context,actor,auth.digest,jobId,{version:"practice-feed-command.v1",action:"connect",commandId:randomUUID(),expectedRevision:0})).revision;
 const assembly=new FinalAccountCommandService(scoped),locks=new FinalAccountLockRepository(scoped),variations=new VariationRepository(scoped);
 const workIds=[randomUUID(),randomUUID()];
 const price=async(id:string,description:string,amount:number)=>{
  const v=(await f.admin.query("SELECT scope_item_id FROM app.variation WHERE tenant_id=$1 AND id=$2",[DEMO_TENANT_ID,id])).rows[0];
  const proposal={version:"variation-proposal.v1" as const,id,jobId,scopeItemId:v.scope_item_id as string,existingScopeItemId:null,lineageParentScopeItemId:null,captureKind:"text" as const,captureText:description,description,suggestion:null};
  const priced=priceVariation({id:randomUUID(),variationId:id,previous:null,proposal,description,contentHash:hash,confirmed:{quantity:"1",unit:"item",unitRatePence:amount,direction:"addition",confirmedByMembershipId:actor.membershipId,rateProvenance:{kind:"human_entered",sourceRef:"synthetic-builder-price",sourceHash:hash,rateVersion:"synthetic.v1"}}});
  await withTenant(scoped,context,db=>insertPricedVariation(db,DEMO_TENANT_ID,priced));
  await withTenant(scoped,context,db=>approvePricedVariation(db,DEMO_TENANT_ID,id,{id:randomUUID(),revisionId:priced.id,revision:priced.revision,contentHash:priced.contentHash,signedDeltaPence:priced.signedDeltaPence,method:"builder_attestation",actorMembershipId:actor.membershipId,evidenceId:null,approvedAt:new Date()}));
  return priced;
 };
 // The builder's own £3,200 plus £400 captures are never catches.
 for(const amount of [320000,40000]){
  const id=randomUUID();
  await variations.logBuilderExtra(context,{version:"log-builder-extra.v1",proposal:{version:"variation-proposal.v1",id,jobId,scopeItemId:randomUUID(),existingScopeItemId:null,lineageParentScopeItemId:null,captureKind:"text",captureText:"Fictional builder capture",description:"Fictional builder capture",suggestion:null},actorMembershipId:actor.membershipId,price:null,deviceId:null,deviceCapturedAt:null});
  await price(id,"Fictional builder capture",amount);
 }
 let drafted=await assembly.assemble(context,{version:"final-account.assemble.v1",commandId:randomUUID(),jobId,actorMembershipId:actor.membershipId});
 await locks.acceptTerms(context,{actorMembershipId:actor.membershipId,commandId:randomUUID(),termsVersion:"synthetic_final_check_terms.v1"});
 await locks.disposition(context,{jobId,actorMembershipId:actor.membershipId,commandId:randomUUID(),scopeItemId:scope,disposition:"done"});
 const signals=[randomUUID(),randomUUID()];
 for(const [index,signalId] of signals.entries())await finalCheckTenant(f.shadow,DEMO_TENANT_ID,async db=>{
  await db.query("INSERT INTO app.shadow_commercial_signal(tenant_id,job_id,id,work_id,signal_type,detector_kind,detector_version,evidence_cutoff_at,description,confidence_band,state) VALUES($1,$2,$3,$4,'possible_extra','deterministic','synthetic.v1',clock_timestamp(),$5,'low','held_for_final_check')",[DEMO_TENANT_ID,jobId,signalId,workIds[index],"Fictional catch"]);
  const e=(await f.admin.query("SELECT object_version_id,sha256,server_received_at::text received FROM app.evidence_object WHERE tenant_id=$1 AND id=$2",[DEMO_TENANT_ID,evidence])).rows[0];
  await db.query("INSERT INTO app.shadow_signal_evidence(tenant_id,job_id,signal_id,evidence_id,object_version_id,sha256,source_received_at) VALUES($1,$2,$3,$4,$5,$6,$7::timestamptz)",[DEMO_TENANT_ID,jobId,signalId,evidence,e.object_version_id,e.sha256,e.received]);
 });
 const lock=await locks.lock(context,{jobId,actorMembershipId:actor.membershipId,commandId:randomUUID(),finalAccountRevisionId:drafted.id,expectedRevision:drafted.revision,declarationVersion:"final_account_declaration.v1"});
 const worker=new FinalCheckRepository(f.shadow),manifest=await worker.begin(context,jobId);
 for(const s of manifest.sources){if(s.sourceKind==="builder_capture_not_scanned"&&!s.processable)continue;await worker.record(context,jobId,manifest.id,s.id,randomUUID(),{version:"final-check.source-result.v1",inputHash:s.inputHash,status:s.evidenceId===evidence?"detected":"zero_result",failureCode:null,signalIds:s.evidenceId===evidence?signals:[]});}
 const classifications:FinalCheckClassification[]=signals.map(signalId=>({signalId,expectedRevision:0,outcome:"reveal",references:[],comparisons:{baselineItemIds:[scope],captureIds:manifest.comparisons.captures.map(c=>(c as {id:string}).id),lockedLineIds:manifest.comparisons.lines.map(l=>l.id)}}));
 const run=await worker.reconcile(context,jobId,manifest.id,classifications) as {runId:string;lockId:string};
 // Reconciliation makes the result available; publication authorizes invoicing.
 await new FinalCheckCompletionRepository(f.shadow).publish(context,{version:"final-check-publication.v1",jobId,runId:run.runId,checkId:randomUUID()});
 const catches=[];
 for(const [index,signalId] of signals.entries()){
  const confirm=await new FinalCheckRepository(scoped).confirmCatch(context,jobId,auth.digest,{version:"final-check.catch.v1",commandId:randomUUID(),lockId:run.lockId,runId:run.runId,signalId,expectedSignalRevision:1}) as {variationId:string};
  const priced=await price(confirm.variationId,"Fictional catch",index===0?50000:30000);
  const caseId=(await f.admin.query("SELECT id FROM app.recovery_case WHERE tenant_id=$1 AND job_id=$2 AND case_type='missed_variation_final_account' AND source_refs ? $3",[DEMO_TENANT_ID,jobId,'variation:'+confirm.variationId])).rows[0].id as string;
  catches.push({caseId,workId:workIds[index]!,commercialRevisionId:priced.id});
 }
 drafted=await assembly.assemble(context,{version:"final-account.assemble.v1",commandId:randomUUID(),jobId,actorMembershipId:actor.membershipId,expectedRevision:drafted.revision});
 const issue={jobId,actorMembershipId:actor.membershipId,commandId:randomUUID(),finalAccountRevisionId:drafted.id,expectedSourceHash:drafted.sourceHash,invoiceKind:"final" as const,recipient:"practice-customer@example.invalid",issuedOn:"2026-10-28"};
 const invoice=await locks.issueInvoice(context,issue);
 expect(invoice).toMatchObject({netPence:3440000,totalPence:4128000});
 expect(await locks.issueInvoice(context,issue)).toEqual(invoice);
 const invoices=new PracticeInvoiceRepository(scoped);
 const payment=await invoices.recordReceipt(context,{jobId,invoiceId:invoice.invoiceId,actorMembershipId:actor.membershipId,commandId:randomUUID(),paidOn:"2026-10-28",amountPence:4128000,method:"bank_transfer",reference:"Fictional combined receipt"});
 for(const action of ["advance","match_receipt"] as const){
  const view=await feed.command(context,actor,auth.digest,jobId,{version:"practice-feed-command.v1",action,commandId:randomUUID(),expectedRevision:feedRevision,movement:"receipt-41280",...(action==="advance"?{step:"settled"}:{paymentId:payment.paymentId})});
  feedRevision=view.revision;
 }
 return {context,actor,auth,session,jobId,lock,invoice,paymentId:payment.paymentId,invoices,catches,locks,scoped,drafted};
}
let f:FinalCheckFixture;const environment=process.env.JOBGUARD_ENV;
beforeAll(async()=>{f=await createFinalCheckFixture();},120000);
afterAll(async()=>{await closeFinalCheckFixture(f);if(environment===undefined)delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=environment;});
type Combined=Awaited<ReturnType<typeof combinedReceiptFixture>>;
const app=(x:Combined)=>new ReceiptCaseAllocationApplication(f.runtime,x.session);
const envelope=(target:"receipt_lines"|"case",command:unknown)=>({version:"receipt-case-allocation-command.v1",target,command});
async function produce(x:Combined){
 const application=app(x),snapshot=await application.view(x.jobId);
 const review=await application.command(x.jobId,envelope("receipt_lines",{version:"receipt-line-facts-command.v1",commandId:randomUUID(),action:"review",paymentId:x.paymentId,expectedSourceRevision:snapshot.revision}));
 if(!("sourceRevision" in review))throw new Error("Expected receipt review");
 const approval=envelope("receipt_lines",{version:"receipt-line-facts-command.v1",action:"approve",commandId:randomUUID(),reviewId:review.reviewId,approvalHash:review.approvalHash,expectedSourceRevision:review.sourceRevision});
 await expect(application.command(x.jobId,{...approval,command:{...approval.command as object,approvalHash:"b".repeat(64)}})).rejects.toThrow("RECEIPT_LINE_APPROVAL_CHANGED");
 const saved=await application.command(x.jobId,approval);
 expect(await application.command(x.jobId,approval)).toEqual({...saved,replayed:true});
 return saved;
}
async function allocate(x:Combined,catchIndex:number,factLineId:string){
 const c=x.catches[catchIndex]!;
 const expectedCaseRevision=(await f.admin.query("SELECT revision FROM app.recovery_case_current WHERE tenant_id=$1 AND id=$2",[x.context.tenantId,c.caseId])).rows[0].revision as number;
 const command={version:"stored-receipt-case-command.v1",action:"review",commandId:randomUUID(),factLineId,caseId:c.caseId,workId:c.workId,expectedCaseRevision};
 const application=app(x),review=await application.command(x.jobId,envelope("case",command));
 const approval=envelope("case",{...command,action:"approve",commandId:randomUUID(),reviewId:review.reviewId,approvalHash:review.approvalHash});
 await expect(application.command(x.jobId,{...approval,command:{...approval.command as object,approvalHash:"b".repeat(64)}})).rejects.toThrow("STORED_RECEIPT_APPROVAL_CHANGED");
 const saved=await application.command(x.jobId,approval);
 expect(await application.command(x.jobId,approval)).toEqual({...saved,replayed:true});
 return saved;
}
async function assess(x:Combined,index:number,lineId:string,expectedAttributionRevision=0){
 const c=x.catches[index]!;
 const expectedCaseRevision=(await f.admin.query("SELECT revision FROM app.recovery_case_current WHERE tenant_id=$1 AND id=$2",[x.context.tenantId,c.caseId])).rows[0].revision as number;
 const command={version:"recovery-attribution-command.v1",action:"assess",commandId:randomUUID(),caseId:c.caseId,workId:c.workId,lineId,lockId:x.lock.id,expectedCaseRevision,expectedAttributionRevision};
 const repository=new RecoveryAttributionRepository(f.runtime),saved=await repository.assess(x.context,x.jobId,x.auth.digest,command);
 expect(await repository.assess(x.context,x.jobId,x.auth.digest,command)).toEqual(saved);
 return saved;
}
it("one £41,280 receipt qualifies exactly £500 + £300, replays, refuses stale authority/foreign sessions, and appends a reversal revision",async()=>{
 const x=await combinedReceiptFixture(f);const produced=await produce(x);
 if(!("allocationRevisionId" in produced)||!produced.allocationRevisionId)throw new Error("Expected saved receipt revision");
 expect((await f.admin.query("SELECT count(*)::int n FROM app.customer_invoice WHERE tenant_id=$1 AND job_id=$2",[x.context.tenantId,x.jobId])).rows).toEqual([{n:1}]);
 const snapshot=await app(x).view(x.jobId);
 const assessments:Awaited<ReturnType<typeof assess>>[]=[];
 for(const [index,c] of x.catches.entries()){
  const line=snapshot.rows.find(row=>row.commercialRevisionId===c.commercialRevisionId)!;
  expect(line.net).toEqual({numerator:index===0?"50000":"30000",denominator:"1"});
  await allocate(x,index,line.lineAllocationId);
  const assessment=await assess(x,index,line.lineId);assessments.push(assessment);
  expect(assessment.assessmentOutcome).toBe("eligible_for_review");
  expect(assessment.remainingPrincipal).toEqual(line.net);
 }
 const {attributionValueReceipt}=await import("../../../apps/api/src/recovery-attribution-value.js");
 expect(serializeExactPence(sumExactPence(assessments.map(a=>parseExactPence(a.remainingPrincipal))))).toEqual({numerator:"80000",denominator:"1"});
 expect(assessments.map(a=>attributionValueReceipt(a).fee.pence)).toEqual([5000,3000]);
 expect(serializeExactPence(sumExactPence(assessments.map(a=>parseExactPence(attributionValueReceipt(a).yoursBeforeVatAndTax))))).toEqual({numerator:"72000",denominator:"1"});
 const foreign=await issuePracticeSession(f.runtime);
 await expect(new ReceiptCaseAllocationApplication(f.runtime,foreign).view(x.jobId)).rejects.toMatchObject({code:"NOT_FOUND"});
 const {StoredReceiptCaseAllocationRepository}=await import("../src/stored-receipt-case-allocation-repository.js");
 await expect(new StoredReceiptCaseAllocationRepository(f.runtime,"synthetic_demo").command(testTenantContext(randomUUID()),x.jobId,x.auth.digest,{version:"stored-receipt-case-command.v1",action:"review",commandId:randomUUID(),factLineId:snapshot.rows[0]!.lineAllocationId,caseId:x.catches[0]!.caseId,workId:x.catches[0]!.workId,expectedCaseRevision:1})).rejects.toThrow();
 // Original locked baseline cannot borrow a catch's recovery case.
 const baseline=snapshot.rows.find(row=>!x.catches.some(c=>c.commercialRevisionId===row.commercialRevisionId))!;
 await expect(allocate(x,0,baseline.lineAllocationId)).rejects.toThrow("STORED_RECEIPT_CASE_SOURCE_REQUIRED");
 await x.invoices.reverseReceipt(x.context,{jobId:x.jobId,invoiceId:x.invoice.invoiceId,paymentId:x.paymentId,actorMembershipId:x.actor.membershipId,commandId:randomUUID(),reason:"Fictional full reversal"});
 const reversalSourceId=(await f.admin.query("SELECT id FROM app.customer_payment_reversal WHERE tenant_id=$1 AND payment_id=$2",[x.context.tenantId,x.paymentId])).rows[0].id as string;
 const beforeReverse=await app(x).view(x.jobId);
 const reverseReview=await app(x).command(x.jobId,envelope("receipt_lines",{version:"receipt-line-facts-command.v1",action:"review_reverse",commandId:randomUUID(),allocationRevisionId:produced.allocationRevisionId,reversalSource:{kind:"payment_reversal",sourceId:reversalSourceId},expectedSourceRevision:beforeReverse.revision}));
 if(!("sourceRevision" in reverseReview))throw new Error("Expected reversal review");
 const reverseCommand=envelope("receipt_lines",{version:"receipt-line-facts-command.v1",action:"reverse",commandId:randomUUID(),reviewId:reverseReview.reviewId,approvalHash:reverseReview.approvalHash,expectedSourceRevision:reverseReview.sourceRevision});
 const reversed=await app(x).command(x.jobId,reverseCommand);
 expect(await app(x).command(x.jobId,reverseCommand)).toEqual({...reversed,replayed:true});
 const negativeSnapshot=await app(x).view(x.jobId);
 expect(negativeSnapshot.revision).toBeGreaterThan(snapshot.revision);
 for(const [index,c] of x.catches.entries()){
  const line=snapshot.rows.find(row=>row.commercialRevisionId===c.commercialRevisionId)!;
  const negative=negativeSnapshot.rows.find(row=>row.lineId===line.lineId&&row.direction==="reversal")!;
  expect(negative.net).toEqual({numerator:index===0?"-50000":"-30000",denominator:"1"});
  await allocate(x,index,negative.lineAllocationId);
  const next=await assess(x,index,line.lineId,1);
  expect(next.previousAssessmentId).toBe(assessments[index]!.assessmentId);expect(next.assessmentOutcome).toBe("excluded");
  expect(attributionValueReceipt(next).fee.pence).toBe(0);
  expect((await new RecoveryAttributionRepository(f.runtime).history(x.context,x.jobId,x.auth.digest)).find(a=>a.assessmentId===assessments[index]!.assessmentId)).toEqual(assessments[index]);
 }
});
it("combined helper stays private and requires a lock descendant; supplementary regression stays supported",async()=>{
 expect((await f.admin.query("SELECT has_function_privilege('jobguard_runtime','app.j3_require_combined_revision(uuid,uuid,uuid,uuid)','EXECUTE') allowed")).rows).toEqual([{allowed:false}]);
 const x=await combinedReceiptFixture(f);
 // An unchanged identity with a changed amount must never enter the combined bill.
 await expect(finalCheckTenant(f.admin,x.context.tenantId,async db=>{
  await db.query("ALTER TABLE app.final_account_line DISABLE TRIGGER USER");
  await db.query("UPDATE app.final_account_line SET net_pence=net_pence+1 WHERE tenant_id=$1 AND job_id=$2 AND final_account_revision_id=$3 AND line_kind='baseline'",[x.context.tenantId,x.jobId,x.drafted.id]);
  await db.query("ALTER TABLE app.final_account_line ENABLE TRIGGER USER");
  return db.query("SELECT app.j3_require_combined_revision($1,$2,$3,$4)",[x.context.tenantId,x.jobId,x.drafted.id,x.lock.id]);
 })).rejects.toThrow("INVOICE_SOURCE_CORRECTION_REQUIRED");
 await expect(finalCheckTenant(f.admin,x.context.tenantId,db=>db.query("SELECT app.j3_require_combined_revision($1,$2,$3,$4)",[x.context.tenantId,x.jobId,x.lock.finalAccountRevisionId,x.lock.id]))).rejects.toThrow("FINAL_INVOICE_REVISION_MISMATCH");
 // Existing fixture exercises the unchanged original + supplementary path.
 const {shadowPackCatch}=await import("./evidence-pack-v3-catch-fixture.js");
 const old=await shadowPackCatch(f);expect(old.attribution.assessmentOutcome).toBe("eligible_for_review");
});
it("upgrades populated predecessors without changing stored rows, then retains the old settled-catch assessment",async()=>{
 const {readFile}=await import("node:fs/promises");
 const {MIGRATION_URLS,migrate}=await import("../src/migrate.js");
 const {installLegacySyntheticPartyFixtures}=await import("./pool-test-utils.js");
 const {proofBefore,proofDifferences}=await import("./upgrade-proof-utils.js");
 const {shadowPackCatch}=await import("./evidence-pack-v3-catch-fixture.js");
 const upgrade=await createFinalCheckFixture(false);
 try{
  const own=MIGRATION_URLS.findIndex(url=>url.pathname.endsWith("0411_j3_combined_invoice.sql"));expect(own).toBeGreaterThan(0);
  await upgrade.admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
  for(const url of MIGRATION_URLS.slice(0,own)){
   const name=url.pathname.split("/").at(-1)!,sql=await readFile(url,"utf8");
   await upgrade.admin.query(name.startsWith("0095_")?sql.replace("BEGIN;","BEGIN; SELECT set_config('app.deployment_mode','details_needed',true);"):sql);
   await upgrade.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)",[name]);
  }
  for(const [pool,role] of [[upgrade.runtime,"jobguard_runtime"],[upgrade.shadow,"jobguard_shadow"]] as const){
   const grant=(await upgrade.admin.query("SELECT format('GRANT %I TO %I',$1::text,$2::text) sql",[role,pool.options.user])).rows[0].sql as string;
   await upgrade.admin.query(grant);
  }
  await installLegacySyntheticPartyFixtures(upgrade.admin);
  const original=await shadowPackCatch(upgrade);
  const tables=(await upgrade.admin.query("SELECT schemaname||'.'||tablename name FROM pg_tables WHERE schemaname='app' ORDER BY tablename")).rows.map(row=>row.name as string);
  const before=await proofBefore(upgrade.admin,tables);
  await upgrade.admin.query(await readFile(MIGRATION_URLS[own]!,"utf8"));
  await upgrade.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES('0411_j3_combined_invoice.sql')");
  expect(await proofDifferences(upgrade.admin,before)).toEqual({rows:[],types:[]});
  expect((await new RecoveryAttributionRepository(upgrade.runtime).history(original.context,original.jobId,original.auth.digest))[0]).toEqual(original.attribution);
  await migrate(upgrade.admin);await migrate(upgrade.admin);
  expect(await proofDifferences(upgrade.admin,before)).toEqual({rows:[],types:[]});
 }finally{await closeFinalCheckFixture(upgrade);}
},240000);
