// PostgreSQL CI: genuine synthetic commands and rollback-only corruption attacks.
import {randomUUID} from "node:crypto";
import {afterAll,beforeAll,expect,it} from "vitest";
import {createFinalCheckFixture,closeFinalCheckFixture,finalCheckTenant,type FinalCheckFixture} from "./final-check-fixture.js";
import {catchFeeFixture} from "./success-fee-catch-fixture.js";
import {rolledBack} from "./upgrade-proof-utils.js";
let f:FinalCheckFixture;
beforeAll(async()=>{f=await createFinalCheckFixture();},120000);
afterAll(async()=>{if(f)await closeFinalCheckFixture(f);});
type Catch=Awaited<ReturnType<typeof catchFeeFixture>>;
const approve=(r:Awaited<ReturnType<Catch["execute"]>>)=>({version:"success-fee-command.v1",action:"approve",commandId:randomUUID(),reviewId:r.reviewId,statementHash:r.statementHash,expectedPostingRevision:r.postingRevision});
const journals=async(x:Catch)=>(await f.admin.query("SELECT id,derivation_id,amount_pence,reverses_journal_id FROM app.success_fee_journal WHERE tenant_id=$1 AND job_id=$2 ORDER BY amount_pence DESC",[x.context.tenantId,x.jobId])).rows;
it("the direct production entry always refuses, including forged policy and environment flags",async()=>{
 for(const command of [null,{}, {approved:true,environment:"production",policyVersion:"reference_fee_policy_v3"}])
  await expect(f.runtime.query("SELECT app.success_fee_production_command($1,$2,$3)",[randomUUID(),"forged",command])).rejects.toMatchObject({code:"42501",message:"FEE_GATE_CLOSED"});
});
it.each(["builder_capture","disclosed_before_lock"] as const)("PostgreSQL excludes %s amounts even with a saved attribution approval",async attack=>{
 const x=await catchFeeFixture(f);
 await expect(rolledBack(f.admin,async db=>{
  await db.query("SELECT set_config('app.tenant_id',$1,true)",[x.context.tenantId]);
  if(attack==="builder_capture"){
   // Simulate an administrative source defect after assessment; the writer must independently check the lock manifest.
   await db.query("ALTER TABLE app.final_account_lock DISABLE TRIGGER USER");
   await db.query("UPDATE app.final_account_lock SET snapshot=jsonb_set(snapshot,'{captureRegister}',coalesce(snapshot->'captureRegister','[]')||jsonb_build_array(jsonb_build_object('id',(SELECT variation_id FROM app.extra_origin WHERE tenant_id=$1 AND job_id=$2 AND source_signal_id=$3)))) WHERE tenant_id=$1 AND job_id=$2",[x.context.tenantId,x.jobId,x.signal]);
   await db.query("ALTER TABLE app.shadow_commercial_signal DISABLE TRIGGER USER");
   await db.query("UPDATE app.shadow_commercial_signal SET matched_variation_id=(SELECT variation_id FROM app.extra_origin WHERE tenant_id=$1 AND job_id=$2 AND source_signal_id=$3) WHERE tenant_id=$1 AND job_id=$2 AND id=$3",[x.context.tenantId,x.jobId,x.signal]);
  }else{
   await db.query("ALTER TABLE app.shadow_commercial_signal DISABLE TRIGGER USER");
   await db.query("UPDATE app.shadow_commercial_signal SET disclosed_before_lock=true WHERE tenant_id=$1 AND job_id=$2 AND id=$3",[x.context.tenantId,x.jobId,x.signal]);
  }
  await db.query("SET LOCAL ROLE jobguard_runtime");
  await db.query("SELECT app.write_success_fee_v3($1,$2,$3,NULL)",[x.jobId,x.auth.digest,x.command]);
 })).rejects.toThrow("SUCCESS_FEE_SOURCE_CHANGED");
 expect(await journals(x)).toEqual([]);
});
it("two genuinely allocated cases on one job race without duplicate liability or attribution",async()=>{
 const x=await catchFeeFixture(f,true,true),a=await x.execute(),b=await x.execute({...x.command,commandId:randomUUID()});
 expect(a.statement.sources).toHaveLength(2);expect(a.statement.feePence).toBe(8000);
 const commands=[approve(a),approve(b)];
 const outcomes=await Promise.allSettled(commands.map(p=>x.execute(p)));
 expect(outcomes.filter(v=>v.status==="fulfilled")).toHaveLength(1);
 expect((outcomes.find(v=>v.status==="rejected") as PromiseRejectedResult).reason.message).toBe("SUCCESS_FEE_STALE");
 const winner=outcomes.findIndex(v=>v.status==="fulfilled");expect((await x.execute(commands[winner])).replayed).toBe(true);
 expect(await journals(x)).toEqual([expect.objectContaining({amount_pence:"8000",reverses_journal_id:null})]);
 expect((await f.admin.query("SELECT count(DISTINCT case_id)::int n FROM app.success_fee_source WHERE tenant_id=$1 AND job_id=$2",[x.context.tenantId,x.jobId])).rows).toEqual([{n:2}]);
});
it("reversal after posting creates exact linked compensation; historical rows and replay stay unchanged",async()=>{
 const x=await catchFeeFixture(f),review=await x.execute(),posted=await x.execute(approve(review)),before=await journals(x);
 await x.invoices.reverseReceipt(x.context,{jobId:x.jobId,invoiceId:x.invoiceId,paymentId:x.paymentId,actorMembershipId:x.actor.membershipId,commandId:randomUUID(),reason:"Fictional reversal after posting"});
 const credit=await x.execute({...x.command,commandId:randomUUID(),expectedPostingRevision:1});
 expect(credit.statement).toMatchObject({feePence:0,priorPence:8000,deltaPence:-8000,compensatesDerivationId:posted.derivationId});
 const cmd=approve(credit);const result=await x.execute(cmd);expect(result.journalId).not.toBeNull();
 expect(await x.execute(cmd)).toEqual({...result,replayed:true});
 const after=await journals(x);expect(after[0]).toEqual(before[0]);
 expect(after[1]).toMatchObject({amount_pence:"-8000",reverses_journal_id:before[0]!.id,derivation_id:result.derivationId});
 expect((await f.admin.query("SELECT sum(amount_pence)::text net FROM app.success_fee_journal WHERE tenant_id=$1 AND job_id=$2",[x.context.tenantId,x.jobId])).rows).toEqual([{net:"0"}]);
 for(const mutation of ["UPDATE app.success_fee_journal SET amount_pence=1 WHERE id=$1","DELETE FROM app.success_fee_journal WHERE id=$1"])
  await expect(finalCheckTenant(f.admin,x.context.tenantId,db=>db.query(mutation,[posted.journalId]))).rejects.toThrow();
 // A new derivation of the same immutable facts has zero delta, no second credit.
 const zero=await x.execute({...x.command,commandId:randomUUID(),expectedPostingRevision:2});
 await x.execute(approve(zero));expect(await journals(x)).toEqual(after);
});
it("the insert guard refuses extra accruals and over-consumed compensations through owner SQL",async()=>{
 const x=await catchFeeFixture(f),review=await x.execute(),posted=await x.execute(approve(review));
 await expect(finalCheckTenant(f.admin,x.context.tenantId,db=>db.query("INSERT INTO app.success_fee_journal(tenant_id,job_id,id,derivation_id,amount_pence,currency) VALUES($1,$2,$3,$4,1,'GBP')",[x.context.tenantId,x.jobId,randomUUID(),posted.derivationId]))).rejects.toThrow("SUCCESS_FEE_JOURNAL_INVALID");
 await expect(finalCheckTenant(f.admin,x.context.tenantId,db=>db.query("INSERT INTO app.success_fee_journal(tenant_id,job_id,id,derivation_id,amount_pence,currency,reverses_journal_id) VALUES($1,$2,$3,$4,-8001,'GBP',$5)",[x.context.tenantId,x.jobId,randomUUID(),posted.derivationId,posted.journalId]))).rejects.toThrow("SUCCESS_FEE_JOURNAL_INVALID");
});
it("rebuild verifies source attribution and expired/revoked statement authority at commit",async()=>{
 for(const attack of ["source","revoked","expired","environment","statement"]){
  const x=await catchFeeFixture(f),review=await x.execute();
  await expect(rolledBack(f.admin,async db=>{
   await db.query("SELECT set_config('app.tenant_id',$1,true)",[x.context.tenantId]);
   await db.query("SELECT app.write_success_fee_v3($1,$2,$3,NULL)",[x.jobId,x.auth.digest,approve(review)]);
   if(attack==="source"){
    await db.query("ALTER TABLE app.success_fee_source DISABLE TRIGGER USER");
    await db.query("DELETE FROM app.success_fee_source WHERE tenant_id=$1 AND job_id=$2",[x.context.tenantId,x.jobId]);
   }else if(attack==="environment"){
    await db.query("ALTER TABLE app.job_commercial_track DISABLE TRIGGER USER");
    await db.query("UPDATE app.job_commercial_track SET environment='pilot_no_charge' WHERE tenant_id=$1 AND job_id=$2",[x.context.tenantId,x.jobId]);
   }else if(attack==="statement"){
    await db.query("ALTER TABLE app.success_fee_review DISABLE TRIGGER USER");
    await db.query("UPDATE app.success_fee_review SET statement=jsonb_set(statement,'{priorPence}','1') WHERE tenant_id=$1 AND job_id=$2",[x.context.tenantId,x.jobId]);
   }else{
    await db.query("ALTER TABLE app.action_authorization DISABLE TRIGGER USER");
    await db.query(`UPDATE app.action_authorization SET ${attack==="revoked"?"revoked_at=clock_timestamp()":"expires_at=clock_timestamp()-interval '1 second'"} WHERE tenant_id=$1 AND action_type='success_fee.post'`,[x.context.tenantId]);
   }
   await db.query("SET CONSTRAINTS ALL IMMEDIATE");
  })).rejects.toThrow(attack==="environment"?"FEE_GATE_CLOSED":attack==="source"||attack==="statement"?"SUCCESS_FEE_SOURCE_CHANGED":"SUCCESS_FEE_DERIVATION_INVALID");
  expect(await journals(x)).toEqual([]);
 }
});
