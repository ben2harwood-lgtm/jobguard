// CI only: real PostgreSQL, genuine receipt -> allocation -> review -> posting writers.
import { randomUUID, createHash } from "node:crypto";
import { afterAll,beforeAll,expect,it,vi } from "vitest";
import { ActionExecutor, type OutboundAdapter } from "../src/outbox.js";
import { RecoveryAttributionRepository } from "../src/recovery-attribution-repository.js";
import { SimulationFeeStatementRepository } from "../src/simulation-fee-statement-repository.js";
import { catchFeeFixture } from "./success-fee-catch-fixture.js";
import { realReceiptFixture } from "./stored-receipt-case-fixture.js";
import { createFinalCheckFixture,closeFinalCheckFixture,finalCheckTenant,type FinalCheckFixture } from "./final-check-fixture.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { rolledBack } from "./upgrade-proof-utils.js";
let f:FinalCheckFixture,repo:SimulationFeeStatementRepository;
beforeAll(async()=>{f=await createFinalCheckFixture();repo=new SimulationFeeStatementRepository(f.runtime);},120000);
afterAll(async()=>{if(f)await closeFinalCheckFixture(f);});
const issue=()=>({version:"simulation-fee-statement-command.v1",action:"issue",commandId:randomUUID()});
async function posted(){const x=await catchFeeFixture(f),review=await x.execute();await x.execute({version:"success-fee-command.v1",action:"approve",commandId:randomUUID(),expectedPostingRevision:0,reviewId:review.reviewId,statementHash:review.statementHash});return x;}
async function moneyRows(x:Awaited<ReturnType<typeof posted>>){return (await f.admin.query("SELECT (SELECT count(*)::int FROM app.success_fee_derivation WHERE tenant_id=$1 AND job_id=$2) derivations,(SELECT count(*)::int FROM app.success_fee_journal WHERE tenant_id=$1 AND job_id=$2) journals,(SELECT count(*)::int FROM app.action_outbox WHERE tenant_id=$1) outbound",[x.context.tenantId,x.jobId])).rows;}
// Test-owner mutations simulate elapsed authorization time without sleeping or expiring source approvals.
async function expireApproval(tenant:string,authorization:string){
 await finalCheckTenant(f.admin,tenant,async db=>{
  await db.query("ALTER TABLE app.action_authorization DISABLE TRIGGER USER");
  await db.query("UPDATE app.action_authorization SET expires_at=clock_timestamp()-interval '1 second' WHERE tenant_id=$1 AND id=$2",[tenant,authorization]);
  await db.query("ALTER TABLE app.action_authorization ENABLE TRIGGER USER");
 });
}
async function expectExecutionRefused(tenant:string,authorization:string,actionType?:string){
 const id=randomUUID(),deliver=vi.fn<OutboundAdapter["deliver"]>();
 // Deliberately inject an otherwise exact outbound row as test owner, bypassing the unavailable collection writer.
 await f.admin.query(`INSERT INTO app.action_outbox(id,tenant_id,authorization_id,adapter,provider_effect_key,action_type,recipient,content_hash,immutable_content,aggregate_revision,amount_pence,currency,policy_version,authorization_expires_at)
 SELECT $3::uuid,tenant_id,id,'fake_fee_collection',$3::text,coalesce($4,action_type),recipient,content_hash,'synthetic test only',aggregate_revision,amount_pence,currency,policy_version,expires_at FROM app.action_authorization WHERE tenant_id=$1 AND id=$2`,[tenant,authorization,id,actionType??null]);
 const adapter:OutboundAdapter={name:"fake_fee_collection",supportsProviderDeduplication:true,deliver,reconcile:async()=>"not_found"};
 await new ActionExecutor(f.admin,new Map([[adapter.name,adapter]]),{emit:()=>{}}).execute(testTenantContext(tenant),id);
 expect(deliver).not.toHaveBeenCalled();
 expect((await f.admin.query("SELECT count(*)::int n FROM app.action_attempt WHERE tenant_id=$1 AND action_id=$2",[tenant,id])).rows[0].n).toBe(0);
}
it("persists numbered immutable bytes, exact source/approval links; reads, download and approval never post or collect",async()=>{
 const x=await posted(),before=await moneyRows(x),command=issue();
 const saved=await repo.command(x.context,x.jobId,x.auth.digest,command);
 expect(saved.authorizationId).toBeNull();
 const view=await repo.view(x.context,x.jobId,x.auth.digest),record=view.statements[0]!;
 expect(record.document.number).toBe("DEMO-FEE-000001");
 expect(record.document).toMatchObject({cumulativeFeePrincipal:{pence:8000,currency:"GBP"},qualifyingPrincipal:{numerator:"80000",denominator:"1"},policyVersion:"reference_fee_policy_v3",sourceSnapshot:{sources:[{assessmentId:x.assessment.assessmentId}]}});
 const file=await repo.download(x.context,x.jobId,x.auth.digest,saved.statementId);
 expect(createHash("sha256").update(file!.bytes).digest("hex")).toBe(saved.documentHash);
 expect(JSON.parse(file!.canonicalJson)).toEqual(record.document);expect(file!.canonicalJson).toContain("VAT not calculated");
 const approval={version:command.version,action:"approve",commandId:randomUUID(),statementId:saved.statementId,statementHash:saved.documentHash};
 await expect(repo.command(x.context,x.jobId,x.auth.digest,{...approval,statementHash:"0".repeat(64)})).rejects.toThrow("SUCCESS_FEE_STALE");
 const approved=await repo.command(x.context,x.jobId,x.auth.digest,approval);
 expect(approved.authorizationId).not.toBeNull();
 expect((await f.admin.query("SELECT content_hash,recipient,amount_pence,action_type FROM app.action_authorization WHERE tenant_id=$1 AND id=$2",[x.context.tenantId,approved.authorizationId])).rows).toEqual([{content_hash:saved.documentHash,recipient:saved.statementId,amount_pence:"8000",action_type:"success_fee.statement_approve"}]);
 expect(await repo.command(x.context,x.jobId,x.auth.digest,command)).toEqual({...saved,replayed:true});
 expect(await moneyRows(x)).toEqual(before);
});
it("a real receipt reversal preserves the original and creates one linked correction, including concurrent new command IDs",async()=>{
 const x=await posted(),original=await repo.command(x.context,x.jobId,x.auth.digest,issue()),before=await moneyRows(x);
 const originalFile=await repo.download(x.context,x.jobId,x.auth.digest,original.statementId);
 await x.invoices.reverseReceipt(x.context,{jobId:x.jobId,invoiceId:x.invoiceId,paymentId:x.paymentId,actorMembershipId:x.actor.membershipId,commandId:randomUUID(),reason:"Fictional refund"});
 await expect(repo.command(x.context,x.jobId,x.auth.digest,{version:issue().version,action:"approve",commandId:randomUUID(),statementId:original.statementId,statementHash:original.documentHash})).rejects.toThrow("SUCCESS_FEE_STALE");
 const command=issue(),corrections=await Promise.all([repo.command(x.context,x.jobId,x.auth.digest,command),repo.command(x.context,x.jobId,x.auth.digest,command),repo.command(x.context,x.jobId,x.auth.digest,issue())]);
 expect(new Set(corrections.map(c=>c.statementId)).size).toBe(1);
 const view=await repo.view(x.context,x.jobId,x.auth.digest);expect(view.statements).toHaveLength(2);
 expect(view.statements[1]!.document.sourceSnapshot.adjustments.paymentReversalIds).toHaveLength(1);
 expect(view.statements[0]!.document.sourceSnapshot.adjustments.paymentReversalIds).toEqual([]);
 expect(view.statements[1]!.document).toMatchObject({documentPrincipal:{pence:-8000},cumulativeFeePrincipal:{pence:0},original:{statementId:original.statementId,documentHash:original.documentHash}});
 const correction=corrections[0]!;
 const approved=await repo.command(x.context,x.jobId,x.auth.digest,{version:command.version,action:"approve",commandId:randomUUID(),statementId:correction.statementId,statementHash:correction.documentHash});
 expect((await f.admin.query("SELECT amount_pence,content_hash,action_type FROM app.action_authorization WHERE tenant_id=$1 AND id=$2",[x.context.tenantId,approved.authorizationId])).rows).toEqual([{amount_pence:"8000",content_hash:correction.documentHash,action_type:"success_fee.statement_correction_approve"}]);
 expect(await repo.download(x.context,x.jobId,x.auth.digest,original.statementId)).toEqual(originalFile);
 expect(await moneyRows(x)).toEqual(before);
 await expectExecutionRefused(x.context.tenantId,approved.authorizationId!,"success_fee.statement_approve");
 await expectExecutionRefused(x.context.tenantId,approved.authorizationId!,"success_fee.collect");
});
it("foreign statement reads are empty, foreign sessions cannot issue, and direct table access/mutations fail",async()=>{
 const x=await posted(),saved=await repo.command(x.context,x.jobId,x.auth.digest,issue()),y=await realReceiptFixture(f);
 expect((await repo.view(y.context,y.jobId,y.auth.digest)).statements).toEqual([]);
 expect(await repo.download(y.context,y.jobId,y.auth.digest,saved.statementId)).toBeNull();
 await expect(repo.command(testTenantContext(randomUUID()),x.jobId,x.auth.digest,issue())).rejects.toThrow("SUCCESS_FEE_FORBIDDEN");
 await expect(repo.view(x.context,x.jobId,y.auth.digest)).rejects.toThrow("SUCCESS_FEE_FORBIDDEN");
 for(const table of ["platform_fee_statement","platform_fee_statement_command"]){
  for(const sql of [`SELECT * FROM app.${table}`,`INSERT INTO app.${table} DEFAULT VALUES`,`TRUNCATE app.${table}`])await expect(f.runtime.query(sql)).rejects.toMatchObject({code:"42501"});
  for(const sql of [`UPDATE app.${table} SET job_id=job_id WHERE tenant_id=$1`,`DELETE FROM app.${table} WHERE tenant_id=$1`])await expect(finalCheckTenant(f.admin,x.context.tenantId,db=>db.query(sql,[x.context.tenantId]))).rejects.toThrow();
 }
});
it("source invalidation changes approval binding and command payload substitution fails",async()=>{
 const x=await posted(),command=issue(),saved=await repo.command(x.context,x.jobId,x.auth.digest,command);
 await expect(repo.command(x.context,x.jobId,x.auth.digest,{...command,action:"approve",statementId:saved.statementId,statementHash:saved.documentHash})).rejects.toThrow("SUCCESS_FEE_IDEMPOTENCY_CONFLICT");
 await finalCheckTenant(f.admin,x.context.tenantId,db=>db.query("INSERT INTO app.evidence_invalidation(id,tenant_id,evidence_id,actor_membership_id,reason_code) VALUES($1,$2,$3,$4,'verification_invalid')",[randomUUID(),x.context.tenantId,x.evidence,x.actor.membershipId]));
 await expect(repo.command(x.context,x.jobId,x.auth.digest,{version:command.version,action:"approve",commandId:randomUUID(),statementId:saved.statementId,statementHash:saved.documentHash})).rejects.toThrow("SUCCESS_FEE_STALE");
 const corrected=await repo.command(x.context,x.jobId,x.auth.digest,issue());expect(corrected.statementId).not.toBe(saved.statementId);
});
it("audit failure rolls back statement identity, numbering, command receipt and Decision together",async()=>{
 const x=await posted(),command=issue();
 const counts=async()=> (await f.admin.query("SELECT (SELECT count(*)::int FROM app.platform_fee_statement WHERE tenant_id=$1) statements,(SELECT count(*)::int FROM app.platform_fee_statement_command WHERE tenant_id=$1) commands,(SELECT count(*)::int FROM app.decision WHERE tenant_id=$1 AND subject_type='simulation_fee_statement') decisions",[x.context.tenantId])).rows;
 const before=await counts();
 await f.admin.query(`CREATE FUNCTION app.fs_test_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type='simulation_fee_statement.issue' THEN RAISE EXCEPTION 'FS_TEST_AUDIT_FAILURE'; END IF; RETURN NEW; END $$;
 CREATE TRIGGER fs_test_audit_failure BEFORE INSERT ON app.audit_event FOR EACH ROW EXECUTE FUNCTION app.fs_test_audit_failure()`);
 try{await expect(repo.command(x.context,x.jobId,x.auth.digest,command)).rejects.toThrow("FS_TEST_AUDIT_FAILURE");expect(await counts()).toEqual(before);}
 finally{await f.admin.query("ALTER TABLE app.audit_event DISABLE TRIGGER fs_test_audit_failure");}
 const saved=await repo.command(x.context,x.jobId,x.auth.digest,command);
 expect((await repo.view(x.context,x.jobId,x.auth.digest)).statements).toHaveLength(1);
 expect(await repo.command(x.context,x.jobId,x.auth.digest,command)).toEqual({...saved,replayed:true});
});

it("a newer stored assessment changes the binding even when the underlying source hash is unchanged",async()=>{
 const x=await posted(),saved=await repo.command(x.context,x.jobId,x.auth.digest,issue());
 const next=await new RecoveryAttributionRepository(f.runtime).assess(x.context,x.jobId,x.auth.digest,{
  version:"recovery-attribution-command.v1",action:"assess",commandId:randomUUID(),caseId:x.caseId,workId:x.workId,
  lineId:x.line,lockId:x.fact.invoiceBinding.lockId,expectedCaseRevision:x.assessment.caseRevision,expectedAttributionRevision:x.assessment.revision,
 });
 expect(next.sourceHash).toBe(x.assessment.sourceHash);
 await expect(repo.command(x.context,x.jobId,x.auth.digest,{version:issue().version,commandId:randomUUID(),action:"approve",statementId:saved.statementId,statementHash:saved.documentHash})).rejects.toThrow("SUCCESS_FEE_STALE");
});
it("FORCE RLS makes another tenant's immutable statement rows empty for the migration role",async()=>{
 const x=await posted(),saved=await repo.command(x.context,x.jobId,x.auth.digest,issue());
 const rows=await finalCheckTenant(f.admin,randomUUID(),async db=>{
  await db.query("SET LOCAL ROLE jobguard_migration");
  return (await db.query("SELECT id FROM app.platform_fee_statement WHERE id=$1",[saved.statementId])).rows;
 });
 expect(rows).toEqual([]);
});

it("expired approval cannot execute; a new audited Decision renews unchanged sources without changing the statement",async()=>{
 const x=await posted(),saved=await repo.command(x.context,x.jobId,x.auth.digest,issue());
 const command={version:issue().version,action:"approve",commandId:randomUUID(),statementId:saved.statementId,statementHash:saved.documentHash};
 const first=await repo.command(x.context,x.jobId,x.auth.digest,command);
 const original=await repo.download(x.context,x.jobId,x.auth.digest,saved.statementId);
 await expireApproval(x.context.tenantId,first.authorizationId!);
 await expectExecutionRefused(x.context.tenantId,first.authorizationId!);
 // Replays retain their historical result; they do not renew an expired approval.
 expect(await repo.command(x.context,x.jobId,x.auth.digest,command)).toEqual({...first,replayed:true});
 const renewal={...command,commandId:randomUUID()};
 const renewed=await repo.command(x.context,x.jobId,x.auth.digest,renewal);
 expect(renewed.authorizationId).not.toBe(first.authorizationId);
 const rows=(await f.admin.query("SELECT id,decision_id,resolution_id,expires_at>clock_timestamp() active FROM app.action_authorization WHERE tenant_id=$1 AND id=ANY($2::uuid[])",[x.context.tenantId,[first.authorizationId,renewed.authorizationId]])).rows;
 expect(rows.find(r=>r.id===first.authorizationId).active).toBe(false);
 expect(rows.find(r=>r.id===renewed.authorizationId).active).toBe(true);
 expect(new Set(rows.map(r=>r.decision_id)).size).toBe(2);
 expect(new Set(rows.map(r=>r.resolution_id)).size).toBe(2);
 expect((await f.admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND event_type='simulation_fee_statement.approve' AND payload::text LIKE $2",[x.context.tenantId,'%'+renewed.authorizationId+'%'])).rows[0].n).toBe(1);
 expect(await repo.command(x.context,x.jobId,x.auth.digest,renewal)).toEqual({...renewed,replayed:true});
 expect((await repo.command(x.context,x.jobId,x.auth.digest,{...command,commandId:randomUUID()})).authorizationId).toBe(renewed.authorizationId);
 expect(await repo.download(x.context,x.jobId,x.auth.digest,saved.statementId)).toEqual(original);
 expect((await repo.view(x.context,x.jobId,x.auth.digest)).statements).toHaveLength(1);
});
it("renewal rechecks changed sources before creating any new Decision or authorization",async()=>{
 const x=await posted(),saved=await repo.command(x.context,x.jobId,x.auth.digest,issue());
 const command={version:issue().version,action:"approve",commandId:randomUUID(),statementId:saved.statementId,statementHash:saved.documentHash};
 const first=await repo.command(x.context,x.jobId,x.auth.digest,command);
 await expireApproval(x.context.tenantId,first.authorizationId!);
 const counts=async()=> (await f.admin.query("SELECT (SELECT count(*)::int FROM app.decision WHERE tenant_id=$1) decisions,(SELECT count(*)::int FROM app.action_authorization WHERE tenant_id=$1) authorizations",[x.context.tenantId])).rows;
 await x.invoices.reverseReceipt(x.context,{jobId:x.jobId,invoiceId:x.invoiceId,paymentId:x.paymentId,actorMembershipId:x.actor.membershipId,commandId:randomUUID(),reason:"Fictional reversal before renewal"});
 const before=await counts();
 await expect(repo.command(x.context,x.jobId,x.auth.digest,{...command,commandId:randomUUID()})).rejects.toThrow("SUCCESS_FEE_STALE");
 expect(await counts()).toEqual(before);
});


// PostgreSQL projection-seam attack: start with genuine posted authority, then use
// rollback-only owner fixtures for two reviewed principals and a controlled live
// source adapter. This proves the statement routine's own per-source guard;
// the real-writer reversal test above separately proves the complete source path.
it.each([10000,30000])("A £500 reversal with live B=%ip cannot offset B's reviewed £100 limit",async liveB=>{
 const x=await posted();
 const run=()=>rolledBack(f.admin,async db=>{
  await db.query("SELECT set_config('app.tenant_id',$1,true)",[x.context.tenantId]);
  const bId=randomUUID(),bWork=randomUUID();
  await db.query("ALTER TABLE app.recovery_attribution_revision DISABLE TRIGGER USER");
  await db.query(`UPDATE app.recovery_attribution_revision SET document=jsonb_set(document,'{remainingPrincipal}','{"numerator":"50000","denominator":"1"}') WHERE tenant_id=$1 AND id=$2`,[x.context.tenantId,x.assessment.assessmentId]);
  await db.query(`INSERT INTO app.recovery_attribution_revision(tenant_id,job_id,id,case_id,work_id,line_id,lock_id,revision,previous_id,case_revision,source_hash,document)
   SELECT tenant_id,job_id,$3,case_id,$4,line_id,lock_id,1,NULL,case_revision,source_hash,jsonb_set(document,'{remainingPrincipal}','{"numerator":"10000","denominator":"1"}')
   FROM app.recovery_attribution_revision WHERE tenant_id=$1 AND id=$2`,[x.context.tenantId,x.assessment.assessmentId,bId,bWork]);
  await db.query("ALTER TABLE app.recovery_attribution_revision ENABLE TRIGGER USER");
  await db.query("ALTER TABLE app.success_fee_review DISABLE TRIGGER USER");
  await db.query(`UPDATE app.success_fee_review SET statement=jsonb_set(statement,'{sources}',jsonb_build_array(statement->'sources'->0,jsonb_set(statement->'sources'->0,'{assessmentId}',to_jsonb($3::text)))) WHERE tenant_id=$1 AND job_id=$2`,[x.context.tenantId,x.jobId,bId]);
  await db.query("ALTER TABLE app.success_fee_review ENABLE TRIGGER USER");
  await db.query("ALTER TABLE app.success_fee_derivation DISABLE TRIGGER USER");
  await db.query("UPDATE app.success_fee_derivation SET fee_pence=6000,delta_pence=6000 WHERE tenant_id=$1 AND job_id=$2",[x.context.tenantId,x.jobId]);
  await db.query("ALTER TABLE app.success_fee_derivation ENABLE TRIGGER USER");
  await db.query("CREATE TEMP TABLE fs_live_source(work_id uuid PRIMARY KEY,document jsonb) ON COMMIT DROP");
  for(const [workId,principal] of [[x.workId,0],[bWork,liveB]] as const){
   await db.query("INSERT INTO fs_live_source VALUES($1,$2::jsonb)",[workId,JSON.stringify({remainingPrincipal:{numerator:String(principal),denominator:"1"},reasonCodes:[],sourceHash:"a".repeat(64),previousAssessmentId:x.assessment.assessmentId})]);
  }
  const definition=(await db.query("SELECT pg_get_functiondef('app.recovery_attribution_sources(uuid,uuid,jsonb,uuid)'::regprocedure) definition")).rows[0].definition as string;
  await db.query(definition.replace(/\$function\$[\s\S]*\$function\$/u,()=>`$function$ DECLARE result jsonb; BEGIN SELECT document INTO STRICT result FROM pg_temp.fs_live_source WHERE work_id=(p->>'workId')::uuid; RETURN result; END $function$`));
  return (await db.query("SELECT app.platform_fee_statement_sources($1,$2,$3) snapshot",[x.context.tenantId,x.jobId,x.actor.membershipId])).rows[0].snapshot;
 });
 if(liveB===30000)await expect(run()).rejects.toMatchObject({code:"40001",message:"SUCCESS_FEE_SOURCE_CHANGED"});
 else {
  const snapshot=await run();
  expect(snapshot).toMatchObject({feePence:1000,qualifyingPrincipal:{numerator:"10000",denominator:"1"}});
  expect(snapshot.feePence-6000).toBe(-5000); // £50 correction; reviewed B retains exactly £10.
 }
});
