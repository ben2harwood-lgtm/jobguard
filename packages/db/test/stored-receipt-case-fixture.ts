// Fake source documents only. All constraints/triggers stay enabled; quote,
// activation, variation, final account, invoice, feed and receipt use writers.
import {createHash,randomUUID} from "node:crypto";
import {priceVariation} from "@jobguard/core";
import {prepareActivationFixtureV3,DEMO_TENANT_ID,DEMO_MEMBERSHIP_ID,DEMO_IDENTITY_USER_ID} from "../src/demo-seed.js";
import {issuePracticeSession,authenticatePracticeSession,practiceMaterialPool} from "../src/practice-session.js";
import {PracticeActivationRepository} from "../src/activation-repository.js";
import {FinalAccountCommandService} from "../src/final-account-repository.js";
import {FinalAccountLockRepository} from "../src/final-account-lock-repository.js";
import {FinalCheckRepository,type FinalCheckClassification} from "../src/final-check-repository.js";
import {VariationRepository,insertPricedVariation,approvePricedVariation} from "../src/variation-repository.js";
import {PracticeFeedRepository} from "../src/practice-feed-repository.js";
import {PracticeInvoiceRepository} from "../src/practice-invoice-repository.js";
import {RecoveryCaseRepository} from "../src/recovery-case-repository.js";
import {RecoveryLineAllocationRepository} from "../src/receipt-line-allocation-repository.js";
import {withTenant} from "../src/tenant-context.js";
import {testTenantContext} from "./tenant-context-test-utils.js";
import {finalCheckTenant,type FinalCheckFixture} from "./final-check-fixture.js";
const hash="a".repeat(64);
export async function realReceiptFixture(f:FinalCheckFixture,kind:"F5"|"F7"="F7", baselineNetPence=3360000, mixedFinalCheck=false){
 process.env.JOBGUARD_ENV="synthetic_demo";
 await f.admin.query("INSERT INTO control_plane.tenant(id) VALUES($1) ON CONFLICT DO NOTHING",[DEMO_TENANT_ID]);
 await f.admin.query("INSERT INTO identity.identity_user(id) VALUES($1) ON CONFLICT DO NOTHING",[DEMO_IDENTITY_USER_ID]);
 const account=randomUUID();
 await finalCheckTenant(f.admin,DEMO_TENANT_ID,async db=>{
  await db.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Fictional allocator builder')",[account,DEMO_TENANT_ID]);
  await db.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner') ON CONFLICT DO NOTHING",[DEMO_MEMBERSHIP_ID,DEMO_TENANT_ID,account,DEMO_IDENTITY_USER_ID]);
 });
 const session=await issuePracticeSession(f.runtime),auth=await authenticatePracticeSession(f.runtime,session),context=testTenantContext(DEMO_TENANT_ID),actor={membershipId:DEMO_MEMBERSHIP_ID,identityUserId:DEMO_IDENTITY_USER_ID};
 const scoped=practiceMaterialPool(f.runtime,auth.digest),jobId=await prepareActivationFixtureV3(f.admin,context,baselineNetPence===3000000?"shadow-30000":"Fictional receipt allocation",baselineNetPence,scoped,baselineNetPence,auth.digest);
 await new PracticeActivationRepository(scoped).start(context,jobId,{commandId:randomUUID(),scenario:"no_charge"});
 const scope=(await f.admin.query("SELECT id FROM app.scope_identity WHERE tenant_id=$1 AND job_id=$2 AND state='confirmed' ORDER BY created_at,id LIMIT 1",[DEMO_TENANT_ID,jobId])).rows[0].id as string;
 // Genuine finalized source recipe before lock. No accounting or allocation rows
 // are seeded. Completion remains a normal evidence-link/stage input to assembly.
 const evidence=randomUUID(),upload=randomUUID(),link=randomUUID(),bytes=Buffer.from("%PDF-1.4\nFictional completion certificate\n%%EOF"),sha=createHash("sha256").update(bytes).digest("hex"),objectKey=`synthetic/allocator/${upload}`;
 await finalCheckTenant(f.admin,DEMO_TENANT_ID,async db=>{
  await db.query(`INSERT INTO app.evidence_upload(id,tenant_id,job_id,scope_item_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,expires_at,state,object_version_id,server_verified_at)
   VALUES($1,$2,$3,$4,$5,$6,'application/pdf',1000,'standard_evidence',clock_timestamp()+interval '1 day','verified','allocator-v1',clock_timestamp())`,[upload,DEMO_TENANT_ID,jobId,scope,objectKey,sha]);
  await db.query(`INSERT INTO app.synthetic_evidence_original(tenant_id,upload_id,job_id,scope_item_id,object_key,object_version_id,environment,content_type,bytes)
   VALUES($1,$2,$3,$4,$5,'allocator-v1','synthetic_demo','application/pdf',$6)`,[DEMO_TENANT_ID,upload,jobId,scope,objectKey,bytes]);
  await db.query(`INSERT INTO app.evidence_object(id,tenant_id,upload_id,job_id,scope_item_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at)
   VALUES($1,$2,$3,$4,$5,'original','electrical_certificate',$6,'allocator-v1',$7,$8,'application/pdf','standard_evidence',clock_timestamp(),clock_timestamp())`,[evidence,DEMO_TENANT_ID,upload,jobId,scope,objectKey,sha,bytes.length]);
  await db.query("INSERT INTO app.evidence_link(id,tenant_id,evidence_id,job_id,scope_item_id,required_evidence_type) VALUES($1,$2,$3,$4,$5,'electrical_certificate')",[link,DEMO_TENANT_ID,evidence,jobId,scope]);
  await db.query("INSERT INTO app.stage_completion(id,tenant_id,job_id,scope_item_id,stage,evidence_link_id,command_id) VALUES($1,$2,$3,$4,'electrical_complete',$5,$6)",[randomUUID(),DEMO_TENANT_ID,jobId,scope,link,randomUUID()]);
 });
 const feed=new PracticeFeedRepository(f.runtime,"synthetic_demo");let feedView=await feed.command(context,actor,auth.digest,jobId,{version:"practice-feed-command.v1",action:"connect",commandId:randomUUID(),expectedRevision:0});
 const advance=async(movement:"receipt-12000"|"receipt-14640"|"receipt-960")=>{feedView=await feed.command(context,actor,auth.digest,jobId,{version:"practice-feed-command.v1",action:"advance",commandId:randomUUID(),expectedRevision:feedView.revision,movement,step:"settled"});};
 if(kind==="F5")await advance("receipt-12000");
 const assembly=new FinalAccountCommandService(scoped),locks=new FinalAccountLockRepository(scoped),variations=new VariationRepository(scoped);
 let variationId:string=randomUUID();const variationScope=randomUUID(),workId=randomUUID();
 const price=async(id:string,description:string)=>{
  const v=(await f.admin.query("SELECT scope_item_id FROM app.variation WHERE tenant_id=$1 AND id=$2",[DEMO_TENANT_ID,id])).rows[0];
  const proposal={version:"variation-proposal.v1" as const,id,jobId,scopeItemId:v.scope_item_id as string,existingScopeItemId:null,lineageParentScopeItemId:null,captureKind:"text" as const,captureText:description,description,suggestion:null};
  const priced=priceVariation({id:randomUUID(),variationId:id,previous:null,proposal,description,contentHash:hash,confirmed:{quantity:"1",unit:"item",unitRatePence:80000,direction:"addition",confirmedByMembershipId:actor.membershipId,rateProvenance:{kind:"human_entered",sourceRef:"synthetic-builder-price",sourceHash:hash,rateVersion:"synthetic.v1"}}});
  await withTenant(scoped,context,db=>insertPricedVariation(db,DEMO_TENANT_ID,priced));
  await withTenant(scoped,context,db=>approvePricedVariation(db,DEMO_TENANT_ID,id,{id:randomUUID(),revisionId:priced.id,revision:priced.revision,contentHash:priced.contentHash,signedDeltaPence:priced.signedDeltaPence,method:"builder_attestation",actorMembershipId:actor.membershipId,evidenceId:null,approvedAt:new Date()}));
  return priced;
 };
 if(kind==="F5"){
  await variations.logBuilderExtra(context,{version:"log-builder-extra.v1",proposal:{version:"variation-proposal.v1",id:variationId,jobId,scopeItemId:variationScope,existingScopeItemId:null,lineageParentScopeItemId:null,captureKind:"text",captureText:"Fictional later extra",description:"Fictional later extra",suggestion:null},actorMembershipId:actor.membershipId,price:null,deviceId:null,deviceCapturedAt:null});
  await price(variationId,"Fictional later extra");
 }
 let drafted=await assembly.assemble(context,{version:"final-account.assemble.v1",commandId:randomUUID(),jobId,actorMembershipId:actor.membershipId});
 await locks.acceptTerms(context,{actorMembershipId:actor.membershipId,commandId:randomUUID(),termsVersion:"synthetic_final_check_terms.v1"});
 await locks.disposition(context,{jobId,actorMembershipId:actor.membershipId,commandId:randomUUID(),scopeItemId:scope,disposition:"done"});
 const signal=randomUUID(), hiddenSignal=randomUUID(), otherCatchSignal=randomUUID();
 const signals=mixedFinalCheck?[signal,hiddenSignal,otherCatchSignal]:[signal];
 if(kind==="F7")for(const signalId of signals)await finalCheckTenant(f.shadow,DEMO_TENANT_ID,async db=>{
  await db.query("INSERT INTO app.shadow_commercial_signal(tenant_id,job_id,id,work_id,signal_type,detector_kind,detector_version,evidence_cutoff_at,description,confidence_band,state) VALUES($1,$2,$3,$4,'possible_extra','deterministic','synthetic.v1',clock_timestamp(),$5,'low','held_for_final_check')",[DEMO_TENANT_ID,jobId,signalId,signalId===signal?workId:randomUUID(),signalId===hiddenSignal?'CH8-R1 unrevealed description':signalId===otherCatchSignal?'CH8-R1 other catch proof':'Fictional catch']);
  const e=(await f.admin.query("SELECT object_version_id,sha256,server_received_at::text received FROM app.evidence_object WHERE tenant_id=$1 AND id=$2",[DEMO_TENANT_ID,evidence])).rows[0];
  await db.query("INSERT INTO app.shadow_signal_evidence(tenant_id,job_id,signal_id,evidence_id,object_version_id,sha256,source_received_at) VALUES($1,$2,$3,$4,$5,$6,$7::timestamptz)",[DEMO_TENANT_ID,jobId,signalId,evidence,e.object_version_id,e.sha256,e.received]);
 });
 const lock=await locks.lock(context,{jobId,actorMembershipId:actor.membershipId,commandId:randomUUID(),finalAccountRevisionId:drafted.id,expectedRevision:drafted.revision,declarationVersion:"final_account_declaration.v1"});
 const worker=new FinalCheckRepository(f.shadow),manifest=await worker.begin(context,jobId);
 for(const s of manifest.sources){if(s.sourceKind==="builder_capture_not_scanned"&&!s.processable)continue;await worker.record(context,jobId,manifest.id,s.id,randomUUID(),{version:"final-check.source-result.v1",inputHash:s.inputHash,status:kind==="F7"&&s.evidenceId===evidence?"detected":"zero_result",failureCode:null,signalIds:kind==="F7"&&s.evidenceId===evidence?signals:[]});}
 const classifications:FinalCheckClassification[]=kind==="F7"?signals.map(signalId=>({signalId,expectedRevision:0,outcome:signalId===hiddenSignal?"not_enough_evidence" as const:"reveal" as const,references:[],comparisons:{baselineItemIds:[scope],captureIds:[],lockedLineIds:manifest.comparisons.lines.map(l=>l.id)}})):[];
 const run=await worker.reconcile(context,jobId,manifest.id,classifications) as {runId:string;lockId:string};
 const issue=async(invoiceKind:"final"|"supplementary")=>locks.issueInvoice(context,{jobId,actorMembershipId:actor.membershipId,commandId:randomUUID(),finalAccountRevisionId:drafted.id,expectedSourceHash:drafted.sourceHash,invoiceKind,recipient:"practice-customer@example.invalid",issuedOn:"2026-10-28"});
 const main=await issue("final");let invoiceId=main.invoiceId;
 if(kind==="F7"){
  const confirm=await new FinalCheckRepository(scoped).confirmCatch(context,jobId,auth.digest,{version:"final-check.catch.v1",commandId:randomUUID(),lockId:run.lockId,runId:run.runId,signalId:signal,expectedSignalRevision:1}) as {variationId:string};
  variationId=confirm.variationId;await price(variationId,"Fictional catch");drafted=await assembly.assemble(context,{version:"final-account.assemble.v1",commandId:randomUUID(),jobId,actorMembershipId:actor.membershipId,expectedRevision:drafted.revision});
  invoiceId=(await issue("supplementary")).invoiceId;
  if(mixedFinalCheck){
   const other=await new FinalCheckRepository(scoped).confirmCatch(context,jobId,auth.digest,{version:"final-check.catch.v1",commandId:randomUUID(),lockId:run.lockId,runId:run.runId,signalId:otherCatchSignal,expectedSignalRevision:1}) as {variationId:string};
   await price(other.variationId,"Fictional second confirmed catch");
  }
 }
 const line=(await f.admin.query("SELECT id FROM app.final_account_line WHERE tenant_id=$1 AND job_id=$2 AND final_account_revision_id=$3 AND line_kind='variation'",[DEMO_TENANT_ID,jobId,drafted.id])).rows[0].id as string;
 const invoices=new PracticeInvoiceRepository(scoped);
 const receipt=async(amountPence:number,movement:"receipt-12000"|"receipt-14640"|"receipt-960",alreadySettled=false)=>{
  const payment=await invoices.recordReceipt(context,{jobId,invoiceId,actorMembershipId:actor.membershipId,commandId:randomUUID(),paidOn:"2026-10-28",amountPence,method:"bank_transfer",reference:"Fictional matched receipt"});
  if(!alreadySettled)await advance(movement);
  feedView=await feed.command(context,actor,auth.digest,jobId,{version:"practice-feed-command.v1",action:"match_receipt",commandId:randomUUID(),expectedRevision:feedView.revision,movement,paymentId:payment.paymentId});return payment.paymentId;
 };
 const producer=new RecoveryLineAllocationRepository(f.runtime,"synthetic_demo");
 const produce=async(paymentId:string)=>{
  const snapshot=await producer.readCurrent(context,actor,auth.digest,{jobId});
  const review=await producer.command(context,actor,auth.digest,jobId,{version:"receipt-line-facts-command.v1",commandId:randomUUID(),action:"review",paymentId,expectedSourceRevision:snapshot.revision});
  return producer.command(context,actor,auth.digest,jobId,{version:"receipt-line-facts-command.v1",commandId:randomUUID(),action:"approve",reviewId:review.reviewId,approvalHash:review.approvalHash,expectedSourceRevision:review.sourceRevision});
 };
 let deposit:string|null=null;
 if(kind==="F5"){deposit=await receipt(1200000,"receipt-12000",true);await produce(deposit);}
 const paymentId=await receipt(kind==="F5"?1464000:96000,kind==="F5"?"receipt-14640":"receipt-960"),produced=await produce(paymentId);
 let caseId:string;
 if(kind==="F7")caseId=(await f.admin.query("SELECT id FROM app.recovery_case WHERE tenant_id=$1 AND job_id=$2 AND case_type='missed_variation_final_account' AND source_refs ? $3",[DEMO_TENANT_ID,jobId,'variation:'+variationId])).rows[0].id;
 else caseId=(await new RecoveryCaseRepository(scoped).command(context,jobId,{version:"recovery-case-command.v1",action:"open",commandId:randomUUID(),caseType:"withheld_customer_payment",expectedRevision:0,counterparty:"Fictional payer",book:"builder_customer",sourceType:"customer_invoice",sourceRefs:[invoiceId],claimedNetPence:80000,reviewerRef:`membership:${actor.membershipId}`},actor)).id;
 const snapshot=await producer.readCurrent(context,actor,auth.digest,{jobId}),fact=snapshot.rows.find(r=>r.paymentId===paymentId&&r.lineId===line)!;
 return {f,context,actor,auth,session,jobId,scope,evidence,lock,main,invoiceId,line,caseId,workId,producer,produced,paymentId,deposit,scoped,invoices,produce,fact,signal,hiddenSignal,otherCatchSignal,run};
}
