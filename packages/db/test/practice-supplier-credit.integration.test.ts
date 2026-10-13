import { createHash, randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { evaluateRecoveryEligibilityV3 } from "@jobguard/core";
import { migrate, issuePracticeSession, authenticatePracticeSession, practiceMaterialPool, RecoveryCaseRepository, RecoveryEligibilityV3Repository, PracticeFeedRepository, SupplierDocumentRepository, QuoteRepository, QuoteDocumentRepository, IssueQuoteMutation, RecordBuilderAcceptanceMutation, SwitchJobLiveV3Mutation, UserCommandDispatcher, withTenant, appendAuditBatch } from "../src/index.js";
import { DEMO_TENANT_ID as T, DEMO_ACCOUNT_ID as A, DEMO_MEMBERSHIP_ID as M, DEMO_IDENTITY_USER_ID as U } from "../src/demo-seed.js";
import { closeTestPools, freePort, installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { rolledBack } from "./upgrade-proof-utils.js";
let postgres:EmbeddedPostgres,admin:Pool,runtime:Pool;
const previousEnvironment=process.env.JOBGUARD_ENV;
beforeAll(async()=>{
  process.env.JOBGUARD_ENV='synthetic_demo';
  const directory=await mkdtemp(join(tmpdir(),'jg-pf1b-')),port=await freePort(61700,100),value=randomUUID();
  const options={databaseDir:directory,port,user:'postgres',persistent:true,createPostgresUser:process.getuid?.()===0,initdbFlags:['--lc-messages=C','--encoding=UTF8'],onLog:()=>undefined};
  postgres=new EmbeddedPostgres({...options,password:value}); await postgres.initialise(); await postgres.start();
  admin=new Pool({host:'127.0.0.1',port,database:'postgres',user:'postgres',password:value});
  await migrate(admin); await seedIdentity(admin);
  // PostgreSQL quotes the generated value as a string. It is generated here, never committed.
  await admin.query(`CREATE ROLE pf1b_login LOGIN PASSWORD '${value}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`);
  await admin.query('GRANT jobguard_runtime TO pf1b_login');
  runtime=new Pool({host:'127.0.0.1',port,database:'postgres',user:'pf1b_login',password:value,max:4});
});
afterAll(async()=>{await closeTestPools(runtime,admin);if(postgres)await postgres.stop();if(previousEnvironment===undefined)delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=previousEnvironment;});
// Administrative setup supplies identity, parties and captured scope only. Commercial lifecycle
// uses the real quote, acceptance and no-charge switch-live command implementations.
const context = testTenantContext(T), actor = {membershipId:M,identityUserId:U};
async function seedIdentity(pool: Pool) {
  await pool.query("INSERT INTO control_plane.tenant(id) VALUES($1)",[T]);
  await pool.query("INSERT INTO identity.identity_user(id) VALUES($1)",[U]);
  await pool.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Fictional PF1B builder')",[A,T]);
  await pool.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')",[M,T,A,U]);
  await installLegacySyntheticPartyFixtures(pool);
}
async function liveJob(admin:Pool,runtime:Pool,live=true) {
  const session = await issuePracticeSession(runtime), auth = await authenticatePracticeSession(runtime,session);
  const jobId = randomUUID(),scopeId=randomUUID(),scopeRevisionId=randomUUID();
  await admin.query("INSERT INTO app.job(id,tenant_id,title,practice_session_digest,practice_scenario) VALUES($1,$2,'Fictional INTERIM credit example',$3,'capture')",[jobId,T,auth.digest]);
  const scoped=practiceMaterialPool(runtime,auth.digest);
  if(live) {
    await withTenant(admin,context,async db=>{
      await db.$client.query("SELECT app.transition_job($1,$2,0,'quoting','start_quote')",[T,jobId]);
      await db.$client.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')",[scopeId,T,jobId]);
      await db.$client.query("INSERT INTO app.scope_revision(id,tenant_id,job_id,scope_item_id,revision,description,quantity_decimal,unit,unit_price_pence,total_pence) VALUES($1,$2,$3,$4,1,'Fictional baseline','1','item',100000,100000)",[scopeRevisionId,T,jobId,scopeId]);
    });
    const quote=await new QuoteRepository(scoped).saveDraft(context,{jobId,draftId:randomUUID(),expectedRevision:0,currency:'GBP',taxPolicyVersion:'candidate_m1_standard_v1',effectiveAt:new Date(),lines:[{id:randomUUID(),scopeItemId:scopeId,scopeRevisionId,description:'Fictional baseline',origin:'captured',included:true,exclusionReason:null,quantity:'1',unit:'item',unitRatePence:100000,discountPercent:'0',taxTreatment:'standard_rate_20',rateProvenance:'entered',category:'General',region:'London'}]});
    const documentId=randomUUID(), artifact=await new QuoteDocumentRepository(scoped).create(context,{jobId,documentId,quoteRevisionId:quote.id,objectVersionId:randomUUID(),document:{schemaVersion:'quote-document.v1',documentVersion:1,reference:'Q-PF1B',quoteRevisionId:quote.id,currency:'GBP',issuer:{name:'Fictional Builder',address:['1 Fictional Street'],email:'builder@example.invalid'},customer:{name:'Practice Customer',address:['14 Fictional Street'],email:'customer@example.invalid'},lines:[{scopeItemId:scopeId,description:'Fictional baseline',quantity:'1',unit:'item',netPence:100000}],exclusions:[],qualifications:['Synthetic only'],subtotalPence:100000,discountPence:0,netPence:100000,taxPence:20000,totalPence:120000}});
    const dispatcher=new UserCommandDispatcher(scoped),expiresAt=new Date(Date.now()+60000);
    await dispatcher.dispatch(context,{version:'command.v1',commandId:randomUUID(),commandType:'quote.issue',semanticKey:`issue:${documentId}`,actorMembershipId:M,subjectType:'quote_document',subjectRef:documentId,authorizationId:randomUUID(),action:{actionType:'quote.send',recipient:JSON.stringify(['customer@example.invalid']),contentHash:artifact.content_hash,aggregateRevision:1,amountPence:null,currency:null,policyVersion:'free-quote-send.v1',expiresAt}},new IssueQuoteMutation({tenantId:T,jobId,documentId,outboxActionId:randomUUID(),recipients:['customer@example.invalid'],immutableContent:new TextDecoder().decode(artifact.pdf)}));
    await dispatcher.dispatch(context,{version:'command.v1',commandId:randomUUID(),commandType:'quote.acceptance.attest',semanticKey:`accept:${documentId}`,actorMembershipId:M,subjectType:'quote_document',subjectRef:documentId,action:{actionType:'quote.acceptance.attest',recipient:'Practice Customer',contentHash:artifact.content_hash,aggregateRevision:1,amountPence:120000,currency:'GBP',policyVersion:'builder-attestation.v1',expiresAt}},new RecordBuilderAcceptanceMutation(T,{version:'quote-acceptance.v1',acceptanceId:randomUUID(),jobId,documentId,documentVersion:1,documentHash:artifact.content_hash,expectedJobRevision:1,acceptedTotalPence:120000,acceptedAt:new Date(),statedCustomerName:'Practice Customer',statedMethod:'email',evidenceId:null}));
    await dispatcher.dispatch(context,{version:'command.v1',commandId:randomUUID(),commandType:'job.switch_live',semanticKey:`live:${jobId}`,actorMembershipId:M,subjectType:'job',subjectRef:jobId,action:{actionType:'job.switch_live',recipient:null,contentHash:artifact.content_hash,aggregateRevision:1,amountPence:null,currency:null,policyVersion:'synthetic_demo_activation.v3',expiresAt}},new SwitchJobLiveV3Mutation(T,{version:'switch-live.v3',activationId:randomUUID(),termsId:randomUUID(),jobId,acceptedDocumentId:documentId,acceptedDocumentVersion:1,acceptedDocumentHash:artifact.content_hash,expectedJobRevision:2}));
  }
  return {jobId,session,auth,scoped};
}
type Fixture=Awaited<ReturnType<typeof setup>>;
async function setup(options:{documents?:boolean;claim?:number;type?:'merchant_overcharge'|'duplicate_supplier_payment';open?:boolean}={}) {
  const f=await liveJob(admin,runtime),feed=new PracticeFeedRepository(runtime,'synthetic_demo'),cases=new RecoveryCaseRepository(f.scoped);
  await feed.command(context,actor,f.auth.digest,f.jobId,{version:'practice-feed-command.v1',commandId:randomUUID(),expectedRevision:0,action:'connect'});
  if(options.documents!==false)await documents(f);
  const c=options.open===false?null:await cases.command(context,f.jobId,{version:'recovery-case-command.v1',commandId:randomUUID(),action:'open',caseType:options.type??'merchant_overcharge',claimedNetPence:options.claim??30000,counterparty:'Fictional supplier',book:'supplier_cost',sourceType:'supplier_documents',sourceRefs:['CR-PF1B-001','INV-PF1B-001'],expectedRevision:0},actor);
  return {...f,feed,cases,c,repo:new RecoveryEligibilityV3Repository(f.scoped,'synthetic_demo')};
}
async function documents(f:Awaited<ReturnType<typeof liveJob>>) {
  const repo=new SupplierDocumentRepository(f.scoped);
  await repo.intake(context,f.jobId,{version:'supplier-document-intake.v1',commandId:randomUUID(),fixtureId:'practice-credit-300',channel:'picker',expectedRevision:0});
  await repo.intake(context,f.jobId,{version:'supplier-document-intake.v1',commandId:randomUUID(),fixtureId:'practice-later-invoice-1440',channel:'picker',expectedRevision:1});
}
async function advance(f:Fixture,movement='supplier-payment-600',step='settled') {
  const revision=Number((await admin.query('SELECT max(revision) r FROM app.practice_feed_command WHERE tenant_id=$1 AND job_id=$2',[T,f.jobId])).rows[0].r);
  const body={version:'practice-facts-command.v1',commandId:randomUUID(),expectedRevision:revision,action:'advance',movement,step};
  await f.feed.factsCommand(context,actor,f.auth.digest,f.jobId,body);return body;
}
const review=(f:Fixture,fixture='F16-partial',expectedReviewRevision=0)=>({version:'recovery-eligibility-command.v3',action:'review',commandId:randomUUID(),caseId:f.c!.id,fixture,expectedCaseRevision:f.c!.revision,expectedReviewRevision});
const save=(f:Fixture,raw=review(f))=>f.repo.review(context,f.jobId,raw,actor,f.auth.digest);
const tables=['practice_supplier_credit_case_binding','recovery_eligibility_v3_review','recovery_claim_line','practice_supplier_credit_review_payment','supplier_credit_consumption'];
async function snapshot(f:Fixture) {
  const rows:Record<string,unknown>={};
  for(const table of tables)rows[table]=(await admin.query(`SELECT row_to_json(t)::text bytes FROM app.${table} t WHERE tenant_id=$1 AND job_id=$2 ORDER BY id`,[T,f.jobId])).rows;
  rows.audit=(await admin.query("SELECT row_to_json(t)::text bytes FROM app.audit_event t WHERE tenant_id=$1 AND subject_ref=$2 ORDER BY sequence",[T,f.c!.id])).rows;
  return rows;
}
async function refusal(f:Fixture,body=review(f),code='ELIGIBILITY_SUPPLIER_PAYMENT_UNAVAILABLE') {
  const before=await snapshot(f);await expect(save(f,body)).rejects.toThrow(code);expect(await snapshot(f)).toEqual(before);
}
async function raw(f:Fixture,body:unknown,work?:(db:Parameters<Parameters<typeof withTenant>[2]>[0],reply:Record<string,any>)=>Promise<void>) {
  return withTenant(f.scoped,context,async db=>{
    await db.$client.query("SELECT set_config('app.recovery_eligibility_environment','synthetic_demo',true)");
    const reply=(await db.$client.query('SELECT app.pf1b_review_supplier_credit($1,$2,$3::jsonb) value',[T,f.jobId,JSON.stringify(body)])).rows[0].value as Record<string,any>;
    if(work)await work(db,reply);return reply;
  });
}
async function complete(f:Fixture) {await advance(f);const command=review(f),partial=await save(f,command);await advance(f,'supplier-payment-840');const fullCommand=review(f,'F16-full',partial.revision),full=await save(f,fullCommand);return {partial,full,command,fullCommand};}
it('PF1B-A02 A02_LivePracticeSupplierIntake',async()=>{
  const f=await setup();expect((await admin.query('SELECT status FROM app.job WHERE tenant_id=$1 AND id=$2',[T,f.jobId])).rows[0].status).toBe('live');
  const rows=(await admin.query('SELECT d.document_type,d.status,v.version,v.parent_version_id,v.content_hash=d.content_hash same_hash FROM app.supplier_document d JOIN app.supplier_document_version v ON(v.tenant_id,v.document_id)=(d.tenant_id,d.id) WHERE d.tenant_id=$1 AND d.job_id=$2',[T,f.jobId])).rows;
  expect(rows).toHaveLength(2);expect(rows.every(r=>r.status==='ready'&&r.version===1&&r.parent_version_id===null&&r.same_hash)).toBe(true);
  const draft=await liveJob(admin,runtime,false);await expect(documents(draft)).rejects.toThrow('JOB_NOT_LIVE');
});
it('PF1B-A03 A03_F14SavedFullPayment',async()=>{
  const f=await setup();await advance(f);await advance(f,'supplier-payment-840');const r=await save(f,review(f,'F14'));
  expect(r.result).toMatchObject({outcome:'eligible_for_review',qualifyingPrincipal:{pence:30000,currency:'GBP'},reason:null,lines:[{kind:'principal',debtorType:'business',netPence:30000,qualifyingPrincipal:{pence:30000}}]});
  const rows=await snapshot(f);expect(rows.practice_supplier_credit_case_binding).toHaveLength(1);expect(rows.practice_supplier_credit_review_payment).toHaveLength(2);expect(rows.supplier_credit_consumption).toHaveLength(1);expect(rows.audit).toHaveLength(2); // case open + review
  const consumption=(await admin.query('SELECT consumed_net_pence,settled_payment_event_id FROM app.supplier_credit_consumption WHERE tenant_id=$1 AND review_id=$2',[T,r.id])).rows[0];expect(consumption).toEqual({consumed_net_pence:'30000',settled_payment_event_id:r.sourceEventId});
});
it('PF1B-A04 A04_F16SavedPartialPayment',async()=>{
  const f=await setup();await advance(f);const r=await save(f);
  expect(r.result).toMatchObject({outcome:'excluded',qualifyingPrincipal:{pence:0},reason:'Credit note used against an invoice not yet paid in full',lines:[{kind:'principal',netPence:30000,qualifyingPrincipal:{pence:0}}]});
  const rows=await snapshot(f);expect(rows.practice_supplier_credit_review_payment).toHaveLength(1);expect(rows.supplier_credit_consumption).toHaveLength(0);
  expect((await admin.query('SELECT movement_key,gross_pence,payment_event_id FROM app.practice_supplier_credit_review_payment WHERE tenant_id=$1 AND review_id=$2',[T,r.id])).rows).toEqual([{movement_key:'supplier-payment-600',gross_pence:'60000',payment_event_id:r.sourceEventId}]);
});
it('PF1B-A05 A05_F16PartialToFull',async()=>{
  const f=await setup(),{partial,full}=await complete(f);expect(full.revision).toBe(partial.revision+1);expect(full.result.qualifyingPrincipal.pence).toBe(30000);
  const links=(await admin.query('SELECT review_id,movement_key FROM app.practice_supplier_credit_review_payment WHERE tenant_id=$1 AND case_id=$2',[T,f.c!.id])).rows;expect(links.filter(l=>l.review_id===full.id)).toHaveLength(2);
  expect((await admin.query('SELECT consumed_net_pence,cash_due_pence FROM app.practice_supplier_credit_case_binding WHERE tenant_id=$1 AND case_id=$2',[T,f.c!.id])).rows).toEqual([{consumed_net_pence:'30000',cash_due_pence:'144000'}]);
});
it('PF1B-A06 A06_PartialHistorySurvivesCompletion',async()=>{
  const f=await setup();await advance(f);const partial=await save(f),before=await snapshot(f);await advance(f,'supplier-payment-840');await save(f,review(f,'F16-full',1));
  const after=await snapshot(f);for(const table of [...tables,'audit'])for(const row of before[table] as unknown[])expect(after[table]).toContainEqual(row);
  for(const table of tables)for(const statement of [`UPDATE app.${table} SET created_at=clock_timestamp() WHERE tenant_id=$1 AND job_id=$2`,`DELETE FROM app.${table} WHERE tenant_id=$1 AND job_id=$2`])await expect(withTenant(f.scoped,context,db=>db.$client.query(statement,[T,f.jobId]))).rejects.toBeTruthy();
  expect((await admin.query('SELECT result FROM app.recovery_eligibility_v3_review WHERE tenant_id=$1 AND id=$2',[T,partial.id])).rows[0].result).toEqual(partial.result);
});
it('PF1B-A07 A07_ReconnectReadsSavedHistory',async()=>{
  const f=await setup(),r=await complete(f),connection=new Pool(runtime.options);
  try{const scoped=practiceMaterialPool(connection,f.auth.digest);expect((await new RecoveryCaseRepository(scoped).listForMember(context,f.jobId,actor)).find(c=>c.id===f.c!.id)?.eligibilityV3).toEqual(r.full);
  expect(await new RecoveryEligibilityV3Repository(scoped,'synthetic_demo').review(context,f.jobId,r.command,actor,f.auth.digest)).toEqual(r.partial);}finally{await closeTestPools(connection);}
});
it('PF1B-A09 A09_RejectCustomerCashAndSupplierRefund',async()=>{
  for(const movement of ['receipt-3000','supplier-refund-540']) {const f=await setup();await f.feed.command(context,actor,f.auth.digest,f.jobId,{version:'practice-feed-command.v1',commandId:randomUUID(),expectedRevision:1,action:'advance',movement,step:'settled'});await refusal(f);}
  const f=await setup();await advance(f,'supplier-payment-600','alternate_representation');await refusal(f);
  // Explicit administrative source probe: bypass feed triggers to simulate invalid imported data.
  await advance(f);await admin.query("UPDATE app.practice_feed_event SET source_hash=$3 WHERE tenant_id=$1 AND job_id=$2 AND event_kind='settled'",[T,f.jobId,'0'.repeat(64)]);await refusal(f);
  await refusal(f); // invalid source is never accepted by another review
});
it('PF1B-A10 A10_RejectIncompleteSupplierProof',async()=>{
  const absent=await setup({documents:false});await advance(absent);await refusal(absent);
  const pending=await setup();await advance(pending,'supplier-payment-600','pending');await refusal(pending);
  for(const change of ["status='held'","document_type='delivery'","content_hash=repeat('0',64)"]) {
    const f=await setup();await advance(f);await admin.query(`UPDATE app.supplier_document SET ${change} WHERE tenant_id=$1 AND job_id=$2 AND document_type='credit'`,[T,f.jobId]);await refusal(f);
  }
  for(const field of ["version=2","content_hash=repeat('0',64)"]) {const v=await setup();await advance(v);await admin.query(`UPDATE app.supplier_document_version SET ${field} WHERE tenant_id=$1 AND job_id=$2`,[T,v.jobId]);await refusal(v);}
  const f=await setup();await advance(f);await advance(f,'supplier-payment-600','unknown_duplicate');await refusal(f);
  const rev=Number((await admin.query('SELECT max(revision) n FROM app.practice_feed_command WHERE tenant_id=$1 AND job_id=$2',[T,f.jobId])).rows[0].n);
  await f.feed.factsCommand(context,actor,f.auth.digest,f.jobId,{version:'practice-facts-command.v1',commandId:randomUUID(),action:'reconcile_duplicate',movement:'supplier-payment-600',expectedRevision:rev});expect((await save(f)).result.qualifyingPrincipal.pence).toBe(0);
});
it('PF1B-A11 A11_PreCasePaymentCapabilityHeld',async()=>{
  for(const mode of ['both','mixed','equal']) {
    const f=await setup();await advance(f);await advance(f,'supplier-payment-840');
    // Administrative timestamp probes, preserving the real case and original feed commands.
    const adjustment=mode==='equal'?"created_at=c.created_at": "created_at=c.created_at-interval '1 microsecond'";
    await admin.query(`UPDATE app.practice_feed_event e SET ${adjustment} FROM app.recovery_case c WHERE e.tenant_id=c.tenant_id AND e.job_id=c.job_id AND c.id=$1 AND e.event_kind='settled' ${mode==='mixed'?"AND e.movement_key='supplier-payment-600'":''}`,[f.c!.id]);
    await refusal(f,review(f,'F14'));await expect(save(f,review(f,'F14'))).rejects.toMatchObject({cause:{detail:'PF1B_EARLIER_PAYMENT_CAPABILITY_HELD'}});expect((await snapshot(f)).recovery_eligibility_v3_review).toHaveLength(0);
  }
});
it('PF1B-A12 A12_FixtureMatchesPersistedPaymentState',async()=>{
  const f=await setup();await advance(f);await refusal(f,review(f,'F14'),'ELIGIBILITY_FIXTURE_MISMATCH');await refusal(f,review(f,'F16-full'),'ELIGIBILITY_FIXTURE_MISMATCH');await advance(f,'supplier-payment-840');await refusal(f,review(f),'ELIGIBILITY_FIXTURE_MISMATCH');
});
it('PF1B-A13 A13_OnlyPartialToFullFixtureChange',async()=>{
  const f=await setup();await advance(f);await save(f);await save(f,review(f,'F16-partial',1));await advance(f,'supplier-payment-840');await save(f,review(f,'F16-full',2));await save(f,review(f,'F16-full',3));
  for(const fixture of ['F16-partial','F14','F15'])await refusal(f,review(f,fixture,4),'ELIGIBILITY_FIXTURE_MISMATCH');
  const a=await setup();await advance(a);await advance(a,'supplier-payment-840');await save(a,review(a,'F14'));await refusal(a,review(a,'F16-full',1),'ELIGIBILITY_FIXTURE_MISMATCH');
});
it('PF1B-A14 A14_ClaimAndConsumedCreditBounds',async()=>{
  const f=await setup({claim:29999});await advance(f);await refusal(f,review(f),'ELIGIBILITY_FIXTURE_MISMATCH');
  const g=await setup();await advance(g);const before=await snapshot(g);
  await expect(raw(g,{...review(g),consumedNetPence:30001})).rejects.toThrow('INVALID_COMMAND');expect(await snapshot(g)).toEqual(before);
});
it('PF1B-A15 A15_CrossTenantJobAndDocumentVersionRefused',async()=>{
  const a=await setup(),b=await setup();await advance(a);await advance(b);
  await expect(a.repo.review(testTenantContext(randomUUID()),a.jobId,review(a),actor,a.auth.digest)).rejects.toBeTruthy();
  await expect(a.repo.review(context,b.jobId,review(a),actor,a.auth.digest)).rejects.toThrow('RECOVERY_JOB_NOT_FOUND');
  // SQL association probes under a privileged transaction, rolled back.
  const saved=await save(a);
  await advance(b,'supplier-payment-840');
  const otherEvent=(await admin.query("SELECT id FROM app.practice_feed_event WHERE tenant_id=$1 AND job_id=$2 AND movement_key='supplier-payment-840' AND event_kind='settled'",[T,b.jobId])).rows[0].id;
  // Isolate the actual composite FK in a rolled-back owner probe. The new insertion
  // guard is disabled only in this scratch transaction; all FK triggers stay enabled.
  for(const boundary of ['tenant','job','case','event'])await expect(rolledBack(admin,async db=>{
    await db.query('ALTER TABLE app.practice_supplier_credit_review_payment DISABLE TRIGGER pf1b_payment_guard');
    await db.query("INSERT INTO app.practice_supplier_credit_review_payment(id,tenant_id,job_id,case_id,review_id,payment_event_id,movement_key,gross_pence,source_hash) VALUES($1,$2,$3,$4,$5,$6,'supplier-payment-840',84000,$7)",[randomUUID(),boundary==='tenant'?randomUUID():T,boundary==='job'?b.jobId:a.jobId,boundary==='case'?b.c!.id:a.c!.id,saved.id,otherEvent,'0'.repeat(64)]);
  })).rejects.toMatchObject({code:'23503'});
  const originals=(await admin.query('SELECT d.document_type,d.id,d.content_hash,v.id version_id FROM app.supplier_document d JOIN app.supplier_document_version v ON(v.tenant_id,v.document_id)=(d.tenant_id,d.id) WHERE d.tenant_id=$1 AND d.job_id=$2',[T,b.jobId])).rows;
  const credit=originals.find(d=>d.document_type==='credit')!,invoice=originals.find(d=>d.document_type==='invoice')!;
  await expect(rolledBack(admin,async db=>{
    await db.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.practice_material_digest',$2,true),set_config('app.recovery_eligibility_environment','synthetic_demo',true)",[T,b.auth.digest]);
    await db.query('INSERT INTO app.practice_supplier_credit_case_binding(id,tenant_id,job_id,case_id,credit_note_id,credit_note_version_id,later_invoice_id,later_invoice_version_id,credit_source_hash,invoice_source_hash,consumed_net_pence,cash_due_pence,actor_membership_id,command_id) VALUES($1,$2,$3,$4,$5,$6,$7,$6,$8,$9,30000,144000,$10,$11)',[randomUUID(),T,b.jobId,b.c!.id,credit.id,invoice.version_id,invoice.id,credit.content_hash,invoice.content_hash,M,randomUUID()]);
  })).rejects.toThrow('ELIGIBILITY_SUPPLIER_PAYMENT_UNAVAILABLE');

  for(const variant of ['job','case','payment','version']) {
    await expect(rolledBack(admin,async db=>{
      await db.query("SELECT set_config('app.tenant_id',$1,true)",[T]);
      if(variant==='version')await db.query('UPDATE app.practice_supplier_credit_case_binding SET credit_note_version_id=(SELECT later_invoice_version_id FROM app.practice_supplier_credit_case_binding WHERE tenant_id=$1 AND case_id=$2) WHERE tenant_id=$1 AND case_id=$2',[T,a.c!.id]);
      else await db.query(`INSERT INTO app.practice_supplier_credit_review_payment(id,tenant_id,job_id,case_id,review_id,payment_event_id,movement_key,gross_pence,source_hash) VALUES($1,$2,$3,$4,$5,$6,'supplier-payment-840',84000,$7)`,[randomUUID(),T,variant==='job'?b.jobId:a.jobId,variant==='case'?b.c!.id:a.c!.id,saved.id,variant==='payment'?randomUUID():saved.sourceEventId,'0'.repeat(64)]);
    })).rejects.toBeTruthy();
  }
});
it('PF1B-A16 A16_ActorDerivedAndRechecked',async()=>{
  const f=await setup();await advance(f);const before=await snapshot(f);
  for(const digest of ['','invalid','a'.repeat(64),(await setup()).auth.digest]) {
    await expect(withTenant(runtime,context,async db=>{await db.$client.query("SELECT set_config('app.practice_material_digest',$1,true),set_config('app.recovery_eligibility_environment','synthetic_demo',true)",[digest]);await db.$client.query('SELECT app.pf1b_review_supplier_credit($1,$2,$3)',[T,f.jobId,review(f)]);})).rejects.toBeTruthy();
  }
  await expect(raw(f,{...review(f),actorMembershipId:M})).rejects.toThrow('INVALID_COMMAND');expect(await snapshot(f)).toEqual(before);
  for(const field of ["role='member'","revoked_at=clock_timestamp()","expires_at=clock_timestamp()-interval '1 second'"]) {
    await expect(rolledBack(admin,async db=>{await db.query(`UPDATE app.membership SET ${field} WHERE tenant_id=$1 AND id=$2`,[T,M]);await db.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.practice_material_digest',$2,true),set_config('app.recovery_eligibility_environment','synthetic_demo',true)",[T,f.auth.digest]);await db.query('SELECT app.pf1b_review_supplier_credit($1,$2,$3)',[T,f.jobId,review(f)]);})).rejects.toThrow('ELIGIBILITY_REVIEWER_FORBIDDEN');
  }
});
it('PF1B-A17 A17_SettingsAreNotActorAuthority',async()=>{
  const f=await setup();await advance(f);
  for(const environment of ['production','pilot_no_charge',''])await expect(withTenant(f.scoped,context,async db=>{await db.$client.query("SELECT set_config('app.recovery_eligibility_environment',$1,true)",[environment]);await db.$client.query('SELECT app.pf1b_review_supplier_credit($1,$2,$3)',[T,f.jobId,review(f)]);})).rejects.toThrow('ELIGIBILITY_REVIEWER_FORBIDDEN');
  await expect(withTenant(runtime,context,async db=>{await db.$client.query("SELECT set_config('app.recovery_eligibility_environment','synthetic_demo',true)");await db.$client.query('SELECT app.pf1b_review_supplier_credit($1,$2,$3)',[T,f.jobId,review(f)]);})).rejects.toThrow('ELIGIBILITY_REVIEWER_FORBIDDEN');
});
it('ExactReplay',async()=>{const f=await setup(),r=await complete(f),before=await snapshot(f);expect(await save(f,r.command)).toEqual(r.partial);expect(await save(f,r.fullCommand)).toEqual(r.full);expect(await snapshot(f)).toEqual(before);});
it('ChangedPayloadConflict',async()=>{const f=await setup();await advance(f);const command=review(f);await save(f,command);for(const change of [{fixture:'F14'},{caseId:randomUUID()},{expectedReviewRevision:1},{expectedCaseRevision:command.expectedCaseRevision+1}])await refusal(f,{...command,...change},'IDEMPOTENCY_PAYLOAD_CONFLICT');});
it('CrossJobReplayRefused',async()=>{const f=await setup();await advance(f);const command=review(f);await save(f,command);const g=await setup();const before=await snapshot(f);await expect(g.repo.review(context,g.jobId,command,actor,g.auth.digest)).rejects.toThrow('IDEMPOTENCY_PAYLOAD_CONFLICT');expect(await snapshot(f)).toEqual(before);});
it('StaleRevisionRefused',async()=>{const f=await setup();await advance(f);await save(f);await refusal(f,review(f),'ELIGIBILITY_STALE_REVISION');await refusal(f,{...review(f,'F16-partial',1),expectedCaseRevision:f.c!.revision+1},'ELIGIBILITY_STALE_REVISION');});
it('RevokedActorReplayRefused',async()=>{
  const f=await setup();await advance(f);const command=review(f);await save(f,command);
  for(const table of ['membership','expired_membership','session','expired_session'])await expect(rolledBack(admin,async db=>{
    if(table==='membership')await db.query('UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2',[T,M]);else if(table==='expired_membership')await db.query("UPDATE app.membership SET expires_at=clock_timestamp()-interval '1 second' WHERE tenant_id=$1 AND id=$2",[T,M]);else if(table==='expired_session')await db.query("UPDATE control_plane.practice_session SET expires_at=clock_timestamp()-interval '1 second' WHERE token_digest=$1",[f.auth.digest]);else await db.query('UPDATE control_plane.practice_session SET revoked_at=clock_timestamp() WHERE token_digest=$1',[f.auth.digest]);
    await db.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.practice_material_digest',$2,true),set_config('app.recovery_eligibility_environment','synthetic_demo',true)",[T,f.auth.digest]);await db.query('SELECT app.pf1b_review_supplier_credit($1,$2,$3)',[T,f.jobId,command]);
  })).rejects.toThrow('ELIGIBILITY_REVIEWER_FORBIDDEN');
});
it('ConcurrentCommandSingleEffect',async()=>{
  const f=await setup();await advance(f);const command=review(f),results=await Promise.all([save(f,command),save(f,command)]);expect(results[0]).toEqual(results[1]);
  const g=await setup();await advance(g);const competing=await Promise.allSettled([save(g),save(g)]);expect(competing.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(competing.filter(r=>r.status==='rejected')).toHaveLength(1);expect((competing.find(r=>r.status==='rejected') as PromiseRejectedResult).reason.message).toBe('ELIGIBILITY_STALE_REVISION');
  expect((await snapshot(g)).recovery_eligibility_v3_review).toHaveLength(1);
});
it('PF1B-A18 A18_ReplayAfterJobLeavesLive',async()=>{
  const f=await setup();await advance(f);const command=review(f),saved=await save(f,command);
  await withTenant(admin,context,db=>db.$client.query("SELECT app.transition_job($1,$2,3,'invoiced','issue_invoice')",[T,f.jobId]));
  expect(await save(f,command)).toEqual(saved);await refusal(f,review(f,'F16-partial',1),'ELIGIBILITY_SUPPLIER_PAYMENT_UNAVAILABLE');
});
it('PF1B-A19 A19_ReplayAndRepresentationDoNotIncreasePaidValue',async()=>{
  const f=await setup();await advance(f);await advance(f,'supplier-payment-600','replay');await advance(f,'supplier-payment-600','alternate_representation');const partial=await save(f);expect(partial.result.qualifyingPrincipal.pence).toBe(0);
  await advance(f,'supplier-payment-840');await save(f,review(f,'F16-full',1));await save(f,review(f,'F16-full',2));
  const binding=(await admin.query('SELECT count(*)::int n FROM app.practice_supplier_credit_case_binding WHERE tenant_id=$1 AND case_id=$2',[T,f.c!.id])).rows[0];expect(binding.n).toBe(1);
  const view=await f.feed.factsView(context,actor,f.auth.digest,f.jobId);expect(view.laterInvoice.settledPence).toBe(144000);expect(view.movements.every(m=>m.allocatedEligibleNetPence===0)).toBe(true);
});
it('PF1B-A20 A20_RawRoutineRequiresCompleteAuditAndSources',async()=>{
  const f=await setup();await advance(f);const before=await snapshot(f);
  await expect(raw(f,review(f))).rejects.toThrow('ELIGIBILITY_AUDIT_REQUIRED');
  await expect(raw(f,review(f),async(db,reply)=>{await appendAuditBatch(db,[{id:randomUUID(),version:'audit.v1',actorRef:`membership:${M}`,eventType:'recovery.eligibility.v3_reviewed',subjectType:'recovery_case',subjectRef:f.c!.id,payload:{references:{jobId:f.jobId,reviewId:reply.id,commandId:reply.commandId},hashes:{command:reply.payloadHash,result:'0'.repeat(64)},classifications:{recovery:'financial'}}}]);})).rejects.toThrow('ELIGIBILITY_AUDIT_REQUIRED');
  await expect(raw(f,{...review(f),result:{qualifyingPrincipal:{pence:30001}}})).rejects.toThrow('INVALID_COMMAND');
  expect(await snapshot(f)).toEqual(before);
  // Privileged constraint probes remove/change writer output inside one transaction;
  // trigger suppression is only for constructing the invalid state, constraints are then restored.
  await advance(f,'supplier-payment-840');
  for(const edit of ["DELETE FROM app.practice_supplier_credit_review_payment WHERE movement_key='supplier-payment-600'",'DELETE FROM app.supplier_credit_consumption',"UPDATE app.supplier_credit_consumption SET consumed_net_pence=29999"]) {
    await expect(rolledBack(admin,async db=>{
      await db.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.practice_material_digest',$2,true),set_config('app.recovery_eligibility_environment','synthetic_demo',true)",[T,f.auth.digest]);
      const body=review(f,'F14'),reply=(await db.query('SELECT app.pf1b_review_supplier_credit($1,$2,$3) r',[T,f.jobId,body])).rows[0].r;
      // Use the real audit implementation on the same transaction.
      await appendAuditBatch({$client:db} as never,[{id:randomUUID(),version:'audit.v1',actorRef:`membership:${M}`,eventType:'recovery.eligibility.v3_reviewed',subjectType:'recovery_case',subjectRef:f.c!.id,payload:{references:{jobId:f.jobId,reviewId:reply.id,commandId:body.commandId},hashes:{command:reply.payloadHash,result:reply.resultHash},classifications:{recovery:'financial'}}}]);
      await db.query('SET LOCAL session_replication_role=replica');await db.query(edit);await db.query('SET LOCAL session_replication_role=origin');await db.query('SET CONSTRAINTS ALL IMMEDIATE');
    })).rejects.toBeTruthy();
  }
});
it('PF1B-A21 A21_SelectOnlySideTablesAndCheckedWriter',async()=>{
  const names=['practice_supplier_credit_case_binding','practice_supplier_credit_review_payment'];
  const rows=(await admin.query("SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,r.rolname owner,has_table_privilege('jobguard_runtime',c.oid,'SELECT') can_read,has_table_privilege('jobguard_runtime',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') can_write FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.oid=c.relowner WHERE n.nspname='app' AND c.relname=ANY($1)",[names])).rows;
  expect(rows).toHaveLength(2);for(const row of rows)expect(row).toMatchObject({relrowsecurity:true,relforcerowsecurity:true,owner:'jobguard_migration',can_read:true,can_write:false});
  expect((await admin.query("SELECT tablename FROM pg_policies WHERE schemaname='app' AND tablename=ANY($1) AND policyname='tenant_isolation'",[names])).rows).toHaveLength(2);
  const functions=(await admin.query("SELECT p.proname,p.prosecdef,p.proconfig,r.rolname owner,has_function_privilege('jobguard_runtime',p.oid,'EXECUTE') allowed FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner WHERE n.nspname='app' AND p.proname LIKE 'pf1b_%'")).rows;
  expect(functions.find(f=>f.proname==='pf1b_review_supplier_credit')).toMatchObject({prosecdef:true,owner:'jobguard_migration',allowed:true});for(const row of functions.filter(f=>f.proname!=='pf1b_review_supplier_credit'))expect(row.allowed).toBe(false);
  const f=await setup();for(const table of names)for(const sql of [`INSERT INTO app.${table}(id) VALUES(gen_random_uuid())`,`UPDATE app.${table} SET id=gen_random_uuid()`,`DELETE FROM app.${table}`,`TRUNCATE app.${table}`])await expect(withTenant(f.scoped,context,db=>db.$client.query(sql))).rejects.toMatchObject({code:'42501'});
  await expect(withTenant(f.scoped,context,db=>db.$client.query('SELECT app.pf1b_pin_time()'))).rejects.toMatchObject({code:'42501'});
});
it('PF1B-A22 A22_CandidateOnlyNoFinancialEffects',async()=>{
  const f=await setup(),surfaces=['landing_allocation','landing_reversal','recovery_fee_derivation','recovery_fee_journal','synthetic_recovery_receipt','recovery_case_allocation','recovery_case_allocation_reversal','receipt_line_allocation','journal','journal_line','simulated_settlement_event','financial_authorization','action_authorization','decision_resolution','action_outbox'];
  const counts=async()=>{const found:Record<string,unknown>={};for(const table of surfaces)found[table]=(await admin.query(`SELECT row_to_json(t)::text bytes FROM app.${table} t WHERE tenant_id=$1 ORDER BY id`,[T])).rows;return found;};
  const before=await counts();await complete(f);expect(await counts()).toEqual(before);
  expect((await f.feed.factsView(context,actor,f.auth.digest,f.jobId)).movements.every(m=>m.allocatedEligibleNetPence===0)).toBe(true);
});
it('PF1B-A24 A24_F17NewestTimingGuardPreserved',async()=>{
  for(const timing of ['before','equal','after']) {
    const earlier=timing!=='after';
    const f=await setup({type:'duplicate_supplier_payment',claim:45000});await f.feed.command(context,actor,f.auth.digest,f.jobId,{version:'practice-feed-command.v1',commandId:randomUUID(),expectedRevision:1,action:'advance',movement:'supplier-refund-540',step:'settled'});
    if(earlier)await admin.query(`UPDATE app.practice_feed_event e SET created_at=c.created_at${timing==='before'?"-interval '1 microsecond'":''} FROM app.recovery_case c WHERE e.tenant_id=c.tenant_id AND e.job_id=c.job_id AND c.id=$1`,[f.c!.id]);
    const r=await save(f,review(f,'F17'));expect(r.result).toMatchObject({qualifyingPrincipal:{pence:earlier?0:45000},reason:earlier?'Paid before you opened this case':null});
    if(earlier)await expect(rolledBack(admin,async db=>{
      await db.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.practice_material_digest',$2,true),set_config('app.recovery_eligibility_environment','synthetic_demo',true)",[T,f.auth.digest]);
      const forged=evaluateRecoveryEligibilityV3({version:'recovery-eligibility-facts.v3',environment:'synthetic_demo',tenantId:T,jobId:f.jobId,caseId:f.c!.id,fixture:'F17',settlement:'settled',paymentTiming:'after_opening',sourceRef:r.sourceEventId});
      await db.query('INSERT INTO app.recovery_eligibility_v3_review(id,tenant_id,job_id,case_id,revision,case_revision,fixture,source_event_id,actor_membership_id,command_id,payload_hash,result) VALUES($1,$2,$3,$4,2,$5,\'F17\',$6,$7,$8,$9,$10)',[randomUUID(),T,f.jobId,f.c!.id,f.c!.revision,r.sourceEventId,M,randomUUID(),'a'.repeat(64),forged]);
    })).rejects.toThrow('ELIGIBILITY_FIXTURE_MISMATCH');
  }
});
