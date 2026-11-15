// PostgreSQL CI only. Genuine fictional receipt/posting writers; no provider calls.
import { randomUUID } from "node:crypto";
import { beforeAll,afterAll,expect,it } from "vitest";
import { PaymentFeeRepository } from "../src/payment-fee-repository.js";
import { SimulationFeeCollectionRepository } from "../src/simulation-fee-collection-repository.js";
import { SimulationFeeStatementRepository } from "../src/simulation-fee-statement-repository.js";
import { RecoveryCaseRepository } from "../src/recovery-case-repository.js";
import { recoveryFeeFixture } from "./success-fee-recovery-fixture.js";
import { catchFeeFixture } from "./success-fee-catch-fixture.js";
import { createFinalCheckFixture,closeFinalCheckFixture,finalCheckTenant,type FinalCheckFixture } from "./final-check-fixture.js";
import { bindOwnSession, testTenantContext } from "./tenant-context-test-utils.js";
import { rolledBack } from "./upgrade-proof-utils.js";
let f:FinalCheckFixture;
const environment=process.env.JOBGUARD_ENV;
beforeAll(async()=>{f=await createFinalCheckFixture();},120000);
afterAll(async()=>{if(f)await closeFinalCheckFixture(f);if(environment===undefined)delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=environment;});
async function setup(){
 const x=await catchFeeFixture(f),review=await x.execute();
 await x.execute({version:"success-fee-command.v1",action:"approve",commandId:randomUUID(),expectedPostingRevision:0,reviewId:review.reviewId,statementHash:review.statementHash});
 const fees=new PaymentFeeRepository(f.runtime),collection=new SimulationFeeCollectionRepository(f.runtime);
 const receipt=await fees.command(x.context,x.jobId,x.auth.digest,{version:"payment-fee-command.v1",action:"prepare",commandId:randomUUID(),paymentId:x.paymentId});
 const statement=await new SimulationFeeStatementRepository(f.runtime).command(x.context,x.jobId,x.auth.digest,{version:"simulation-fee-statement-command.v1",action:"issue",commandId:randomUUID()});
 const view=()=>fees.read(x.context,x.jobId,x.auth.digest);
 const authorityCommand=async(action="opt_in")=>({version:"payment-fee-authority-command.v1",commandId:randomUUID(),action,
  expectedAuthorityId:(await view()).standingAuthority?.authorityId??null,cap:"per_verified_receipt_fee",policyVersion:"reference_fee_policy_v3"});
 const authority=(p:unknown)=>fees.authority(x.context,x.jobId,x.auth.digest,p);
 const collect=(authorityId:string)=>({version:"simulation-fee-collection-command.v1",action:"collect",commandId:randomUUID(),
  statementId:statement.statementId,statementHash:statement.documentHash,amountPence:8000,authorityId,receiptStatementId:receipt.statementId});
 const run=(p:unknown)=>collection.command(x.context,x.jobId,x.auth.digest,p);
 return {...x,fees,collection,receipt,statement,view,authorityCommand,authority,collect,run};
}
it("opt-in persists, is replay-safe, collects once without statement approval and preserves the customer's full payment",async()=>{
 const x=await setup(),p=await x.authorityCommand(),a=await x.authority(p);
 expect(a).toMatchObject({state:"active",cap:"per_verified_receipt_fee",productionEnabled:false,realExternalActions:0});
 expect(await x.authority(p)).toEqual(a);expect((await x.view()).standingAuthority).toEqual(a);
 expect((await x.view()).statements[0]!.state).toBe("awaiting_approval");
 const before=(await f.admin.query("SELECT to_jsonb(p) data FROM app.customer_payment p WHERE tenant_id=$1 AND id=$2",[x.context.tenantId,x.paymentId])).rows;
 const c=x.collect(a.authorityId),results=await Promise.all([x.run(c),x.run(c)]);
 expect(results[0]!.attemptId).toBe(results[1]!.attemptId);
 expect(results.map(r=>r.replayed).sort()).toEqual([false,true]);
 await expect(x.run(x.collect(a.authorityId))).rejects.toThrow("PAYMENT_FEE_AUTHORITY_CAP_EXCEEDED");
 expect(await x.collection.view(x.context,x.jobId,x.auth.digest)).toMatchObject({collectionReserved:8000,settledPrincipal:0});
 expect((await f.admin.query("SELECT count(*)::int n FROM app.platform_fee_statement_command WHERE tenant_id=$1 AND job_id=$2 AND payload->>'action'='approve'",[x.context.tenantId,x.jobId])).rows).toEqual([{n:0}]);
 expect((await f.admin.query("SELECT to_jsonb(p) data FROM app.customer_payment p WHERE tenant_id=$1 AND id=$2",[x.context.tenantId,x.paymentId])).rows).toEqual(before);
});
it("revoke is append-only; replaying opt-in cannot reactivate it, and explicit per-statement collection remains available",async()=>{
 const x=await setup(),p=await x.authorityCommand(),a=await x.authority(p),queued=x.collect(a.authorityId);
 const revoke=await x.authorityCommand("revoke"),r=await x.authority(revoke);expect(await x.authority(revoke)).toEqual(r);
 await x.authority(p);expect((await x.view()).standingAuthority?.state).toBe("revoked");
 await expect(x.run(queued)).rejects.toThrow("PAYMENT_FEE_AUTHORITY_REVOKED");
 const {authorityId:_,receiptStatementId:__,...explicit}=queued;
 await x.run(explicit);expect((await x.collection.view(x.context,x.jobId,x.auth.digest)).collectionReserved).toBe(8000);
});
it("stale consent revisions, forged caps and amounts above this receipt fee fail closed",async()=>{
 const x=await setup(),p=await x.authorityCommand(),a=await x.authority(p);
 await expect(x.authority({...await x.authorityCommand(),expectedAuthorityId:null})).rejects.toThrow("PAYMENT_FEE_AUTHORITY_STALE");
 await expect(x.authority({...p,cap:8001})).rejects.toThrow();
 await expect(x.authority({...p,action:"revoke"})).rejects.toThrow("PAYMENT_FEE_IDEMPOTENCY_CONFLICT");
 await expect(x.run({...x.collect(a.authorityId),amountPence:8001})).rejects.toThrow("PAYMENT_FEE_AUTHORITY_CAP_EXCEEDED");
 await expect(x.run({...x.collect(a.authorityId),authorityId:randomUUID()})).rejects.toThrow("PAYMENT_FEE_AUTHORITY_STALE");
 await expect(x.run({...x.collect(a.authorityId),statementHash:"0".repeat(64)})).rejects.toThrow("PAYMENT_FEE_AUTHORITY_STALE");
});
it("expired authority stops dispatch with its own reason, even with a current session",async()=>{
 const x=await setup(),a=await x.authority(await x.authorityCommand());
 await rolledBack(f.admin,async db=>{
  await db.query("SELECT set_config('app.tenant_id',$1,true)",[x.context.tenantId]); await bindOwnSession(db, x.auth.digest);
  // Negative control only: expiry of protected consent, rolled back, never used for positive fixtures.
  await db.query("ALTER TABLE app.payment_fee_authority DISABLE TRIGGER USER");
  await db.query("UPDATE app.payment_fee_authority SET expires_at=clock_timestamp()-interval '1 second' WHERE tenant_id=$1 AND command_id=$2",[x.context.tenantId,a.authorityId]);
  await db.query("ALTER TABLE app.payment_fee_authority ENABLE TRIGGER USER");
  expect((await db.query("SELECT app.read_payment_fees($1,$2) result",[x.jobId,x.auth.digest])).rows[0].result.standingAuthority.state).toBe("stale");
  await expect(db.query("SELECT app.write_platform_fee_collection($1,$2,$3::jsonb)",[x.jobId,x.auth.digest,x.collect(a.authorityId)])).rejects.toThrow("PAYMENT_FEE_AUTHORITY_STALE");
 });
});
it.each(["receipt","case","attribution"] as const)("an open %s dispute stops standing dispatch specifically",async kind=>{
 const x=await setup(),a=await x.authority(await x.authorityCommand());
 if(kind==="receipt")await x.fees.command(x.context,x.jobId,x.auth.digest,{version:"payment-fee-command.v1",action:"dispute",commandId:randomUUID(),statementId:x.receipt.statementId});
 else if(kind==="case"){
  const cases=new RecoveryCaseRepository(x.scoped);
  const assembled=await cases.command(x.context,x.jobId,{version:"recovery-case-command.v1",commandId:randomUUID(),action:"transition",caseId:x.caseId,eventType:"assemble_evidence",expectedRevision:x.assessment.caseRevision},x.actor);
  await cases.command(x.context,x.jobId,{version:"recovery-case-command.v1",commandId:randomUUID(),action:"transition",caseId:x.caseId,eventType:"dispute",expectedRevision:assembled.revision},x.actor);
 }else await finalCheckTenant(f.admin,x.context.tenantId,async db=>{
  const signal=(await db.query("SELECT source_signal_id FROM app.extra_origin WHERE tenant_id=$1 AND job_id=$2 AND kind='jobguard_catch'",[x.context.tenantId,x.jobId])).rows[0].source_signal_id;
  await db.query("INSERT INTO app.shadow_signal_ineligibility(tenant_id,job_id,id,signal_id,reason,source_ref) VALUES($1,$2,$3,$4,'attribution_disputed',$5)",[x.context.tenantId,x.jobId,randomUUID(),signal,randomUUID()]);
 });
 await expect(x.run(x.collect(a.authorityId))).rejects.toThrow("PAYMENT_FEE_AUTHORITY_DISPUTED");
});
it("another tenant/session is refused; RLS and immutable ownership deny direct authority access and mutations",async()=>{
 const x=await setup(),a=await x.authority(await x.authorityCommand());
 await expect(x.fees.authority(testTenantContext(randomUUID()),x.jobId,x.auth.digest,await x.authorityCommand("revoke"))).rejects.toThrow();
 await expect(x.fees.authority(x.context,x.jobId,"0".repeat(64),await x.authorityCommand("revoke"))).rejects.toThrow();
 for(const sql of ["SELECT * FROM app.payment_fee_authority","INSERT INTO app.payment_fee_authority DEFAULT VALUES","UPDATE app.payment_fee_authority SET action='opt_in'","DELETE FROM app.payment_fee_authority","TRUNCATE app.payment_fee_authority"])
  await expect(f.runtime.query(sql)).rejects.toMatchObject({code:"42501"});
 expect(await finalCheckTenant(f.admin,randomUUID(),async db=>{await db.query("SET LOCAL ROLE jobguard_migration");return (await db.query("SELECT * FROM app.payment_fee_authority")).rows;})).toEqual([]);
 await expect(finalCheckTenant(f.admin,x.context.tenantId,db=>db.query("UPDATE app.payment_fee_authority SET action='opt_in' WHERE command_id=$1",[a.authorityId]))).rejects.toThrow();
});
it("audit failure rolls back consent, and the same command then succeeds exactly once",async()=>{
 const x=await setup(),p=await x.authorityCommand(),before=(await x.view()).standingAuthority;
 await f.admin.query(`CREATE FUNCTION app.mon4a_authority_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type='payment_fee_authority.opt_in' THEN RAISE EXCEPTION 'MON4A_AUTHORITY_AUDIT_FAILURE'; END IF; RETURN NEW; END $$;
 CREATE TRIGGER mon4a_authority_audit_failure BEFORE INSERT ON app.audit_event FOR EACH ROW EXECUTE FUNCTION app.mon4a_authority_audit_failure()`);
 try{await expect(x.authority(p)).rejects.toThrow("MON4A_AUTHORITY_AUDIT_FAILURE");}finally{await f.admin.query("ALTER TABLE app.audit_event DISABLE TRIGGER mon4a_authority_audit_failure");}
 expect((await x.view()).standingAuthority).toEqual(before);
 const a=await x.authority(p);expect(await x.authority(p)).toEqual(a);
});
it("unverified and unmatched recovery receipts cannot prepare statements, even with standing consent",async()=>{
 const x=await recoveryFeeFixture(f,false),fees=new PaymentFeeRepository(f.runtime);
 const prior=(await fees.read(x.context,x.jobId,x.auth.digest)).standingAuthority;
 await fees.authority(x.context,x.jobId,x.auth.digest,{version:"payment-fee-authority-command.v1",action:"opt_in",commandId:randomUUID(),expectedAuthorityId:prior?.authorityId??null,cap:"per_verified_receipt_fee",policyVersion:"reference_fee_policy_v3"});
 for(const paymentId of x.payments)await expect(fees.command(x.context,x.jobId,x.auth.digest,{version:"payment-fee-command.v1",action:"prepare",commandId:randomUUID(),paymentId})).rejects.toThrow("PAYMENT_FEE_SOURCE_REQUIRED");
 expect((await fees.read(x.context,x.jobId,x.auth.digest)).statements).toEqual([]);
});
it("each verified withheld receipt has its own cap within the cumulative statement, with no per-statement approvals",async()=>{
 const x=await recoveryFeeFixture(f);await x.allocate(0);await x.allocate(1);await x.approve(await x.review());
 const fees=new PaymentFeeRepository(f.runtime),collection=new SimulationFeeCollectionRepository(f.runtime);
 const receipts=[];
 for(const paymentId of x.payments)receipts.push(await fees.command(x.context,x.jobId,x.auth.digest,{version:"payment-fee-command.v1",action:"prepare",commandId:randomUUID(),paymentId}));
 expect(receipts.map(r=>r.feePence)).toEqual([3200,25000]);
 const prior=(await fees.read(x.context,x.jobId,x.auth.digest)).standingAuthority;
 const authority=await fees.authority(x.context,x.jobId,x.auth.digest,{version:"payment-fee-authority-command.v1",action:"opt_in",commandId:randomUUID(),expectedAuthorityId:prior?.authorityId??null,cap:"per_verified_receipt_fee",policyVersion:"reference_fee_policy_v3"});
 const statement=await new SimulationFeeStatementRepository(f.runtime).command(x.context,x.jobId,x.auth.digest,{version:"simulation-fee-statement-command.v1",action:"issue",commandId:randomUUID()});
 for(const receipt of receipts){
  const p={version:"simulation-fee-collection-command.v1",action:"collect",commandId:randomUUID(),statementId:statement.statementId,statementHash:statement.documentHash,amountPence:receipt.feePence,authorityId:authority.authorityId,receiptStatementId:receipt.statementId};
  await expect(collection.command(x.context,x.jobId,x.auth.digest,{...p,amountPence:receipt.feePence+1})).rejects.toThrow("PAYMENT_FEE_AUTHORITY_CAP_EXCEEDED");
  await collection.command(x.context,x.jobId,x.auth.digest,p);
 }
 expect(await collection.view(x.context,x.jobId,x.auth.digest)).toMatchObject({collectionReserved:28200,settledPrincipal:0});
});

it("another practice session in the shared tenant cannot see, use or revoke this session's consent",async()=>{
 const a=await setup(),b=await setup();
 expect(a.context.tenantId).toBe(b.context.tenantId);expect(a.auth.digest).not.toBe(b.auth.digest);
 const authority=await a.authority(await a.authorityCommand());
 expect((await b.view()).standingAuthority).toBeNull();
 await expect(b.run(b.collect(authority.authorityId))).rejects.toThrow("PAYMENT_FEE_AUTHORITY_STALE");
 expect((await b.collection.view(b.context,b.jobId,b.auth.digest)).collectionReserved).toBe(0);
 await expect(b.authority({...await b.authorityCommand("revoke"),expectedAuthorityId:authority.authorityId})).rejects.toThrow("PAYMENT_FEE_AUTHORITY_STALE");
 expect((await a.view()).standingAuthority).toEqual(authority);
 const own=await b.authority(await b.authorityCommand());
 expect((await b.view()).standingAuthority).toEqual(own);expect((await a.view()).standingAuthority).toEqual(authority);
});
