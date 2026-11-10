import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { cluster, type Cluster } from "./extra-fixtures.js";
import { meterCompany } from "./meter-persistence-fixtures.js";
import { insertPhoto, workTenant, type WorkFixture } from "./job-work-state-fixtures.js";
import { prepareInvoicePrerequisites } from "./sv5pre-fixtures.js";
import { PayNowAttemptRepository } from "../src/pay-now-attempt-repository.js";
import { PracticeInvoiceRepository } from "../src/practice-invoice-repository.js";

describe("MON-6 durable fake attempts on real PostgreSQL",()=>{
 let c:Cluster;
 beforeAll(async()=>{c=await cluster();},240000);
 afterAll(async()=>{await c?.close();});
 const company=()=>meterCompany(c as unknown as WorkFixture);
 async function fixture(includesCatch=false){
  const a=await company(),t=a.tenantId,j=a.jobId,q=randomUUID(),d=randomUUID(),r=randomUUID(),h="a".repeat(64);
  await c.admin.query("INSERT INTO app.quote_version(id,tenant_id,job_id,version,content_hash,net_value_pence,status) VALUES($1,$2,$3,1,$4,$5,'accepted')",[q,t,j,h,includesCatch?9500:10000]);
  await c.admin.query("INSERT INTO app.final_account_draft(id,tenant_id,job_id) VALUES($1,$2,$3)",[d,t,j]);
  await c.admin.query(`INSERT INTO app.final_account_revision(id,tenant_id,job_id,final_account_draft_id,revision,source_hash,baseline_quote_version_id,currency,tax_policy_version,net_pence,tax_pence,total_pence,issue_blocked,findings)
   VALUES($1,$2,$3,$4,1,$5,$6,'GBP','candidate_m1_standard_v1',10000,2000,12000,false,'[]')`,[r,t,j,d,h,q]);
  await c.admin.query("UPDATE app.final_account_draft SET revision=1,current_revision_id=$3 WHERE tenant_id=$1 AND id=$2",[t,d,r]);
  await c.admin.query(`INSERT INTO app.final_account_line(id,tenant_id,job_id,final_account_revision_id,line_kind,source_id,scope_item_id,commercial_revision_id,description,net_pence,ordinal)
   VALUES($1,$2,$3,$4,'baseline',$5,$6,$5,'Fictional baseline',$7,1)`,[randomUUID(),t,j,r,q,a.scopeId,includesCatch?9500:10000]);
  if(includesCatch){
   // Explicit synthetic catch source, with all origin, FK and approval guards on.
   // This isolates pay-now projection; it does not claim a detector/confirmation journey.
   const variation=randomUUID(),scope=randomUUID(),signal=randomUUID(),priced=randomUUID(),approval=randomUUID(),command=randomUUID();
   const evidence=await insertPhoto(c as unknown as WorkFixture,a,new Date().toISOString());
   await workTenant(c.admin,t,async db=>{
    await db.query("INSERT INTO app.shadow_commercial_signal(tenant_id,job_id,id,work_id,signal_type,detector_kind,detector_version,evidence_cutoff_at,description,confidence_band,state) VALUES($1,$2,$3,$4,'possible_extra','deterministic','synthetic.v1',clock_timestamp(),'Fictional catch','low','confirmed_extra')",[t,j,signal,randomUUID()]);
    // Copy the exact stored evidence identity and timestamp for final-check completion.
    await db.query("INSERT INTO app.shadow_signal_evidence(tenant_id,job_id,signal_id,evidence_id,object_version_id,sha256,source_received_at) SELECT tenant_id,job_id,$3,id,object_version_id,sha256,server_received_at FROM app.evidence_object WHERE tenant_id=$1 AND job_id=$2 AND id=$4",[t,j,signal,evidence]);
    await db.query("INSERT INTO app.scope_identity(tenant_id,job_id,id,state) VALUES($1,$2,$3,'reserved')",[t,j,scope]);
    await db.query("INSERT INTO app.variation(tenant_id,job_id,id,scope_item_id,capture_kind,capture_text,description,job_track,origin) VALUES($1,$2,$3,$4,'text','Fictional catch','Fictional catch','small_builder','jobguard_catch')",[t,j,variation,scope]);
    await db.query("INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,actor_membership_id,result) VALUES($1,$2,'ConfirmJobGuardCatch',$3,$4,'processing',$5,NULL)",[t,command,`extra-origin:${j}:${variation}`,h,a.actorId]);
    await db.query("INSERT INTO app.extra_origin(tenant_id,job_id,variation_id,job_track,kind,command_id,raising_membership_id,raising_role,provenance,source_signal_id) VALUES($1,$2,$3,'small_builder','jobguard_catch',$4,$5,'owner','command',$6)",[t,j,variation,command,a.actorId,signal]);
    await db.query("UPDATE app.command_receipt SET status='succeeded',result='{}',completed_at=clock_timestamp() WHERE tenant_id=$1 AND command_id=$2",[t,command]);
    await db.query("INSERT INTO app.variation_revision(tenant_id,job_id,id,variation_id,scope_item_id,revision,description,quantity_decimal,unit,unit_rate_pence,signed_delta_pence,content_hash,confirmed_by_membership_id,rate_provenance_kind,rate_source_ref,rate_source_hash,rate_version) VALUES($1,$2,$3,$4,$5,1,'Fictional catch','1','item',500,500,$6,$7,'human_entered','synthetic://fixture',$6,'fixture-v1')",[t,j,priced,variation,scope,h,a.actorId]);
    await db.query("UPDATE app.variation SET current_revision_id=$3,state='priced' WHERE tenant_id=$1 AND id=$2",[t,variation,priced]);
   });
   const {VariationRepository,approvePricedVariation}=await import("../src/variation-repository.js");
   await new VariationRepository(c.runtime).transact(a.context,db=>approvePricedVariation(db,t,variation,{
    id:approval,revisionId:priced,revision:1,contentHash:h,signedDeltaPence:500,method:"builder_attestation",
    actorMembershipId:a.actorId,evidenceId:null,approvedAt:new Date().toISOString(),
   }));
   // Add the approved source before locking; the baseline plus catch totals 10000.
   await c.admin.query(`INSERT INTO app.final_account_line(id,tenant_id,job_id,final_account_revision_id,line_kind,source_id,scope_item_id,commercial_revision_id,approval_id,description,net_pence,ordinal)
    VALUES($1,$2,$3,$4,'variation',$5,$6,$5,$7,'Fictional catch',500,2)`,[randomUUID(),t,j,r,priced,scope,approval]);
  }
  await prepareInvoicePrerequisites(c.admin,c.runtime,t,j,a.actorId,r);
  const invoices=new PracticeInvoiceRepository(c.runtime);
  const invoice=await invoices.issue(a.context,{jobId:j,finalAccountRevisionId:r,actorMembershipId:a.actorId,commandId:randomUUID(),recipient:"fictional@example.invalid",issuedOn:"2026-11-04"});
  const actor={jobId:j,sessionDigest:a.digest};
  const input={version:"pay-now-attempt.v1",commandId:randomUUID(),invoiceId:invoice.id,rail:"card"};
  return {...a,actor,input,invoices,invoice};
 }
 it("persists one replay across repository instances and refuses changed payload and a second attempt",async()=>{
  const a=await fixture(),repo=new PayNowAttemptRepository(c.runtime);
  const [x,y]=await Promise.all([repo.command(a.context,a.actor,a.input),repo.command(a.context,a.actor,a.input)]);
  expect(x.invoice.includesCatch).toBe(false);
  expect(y).toEqual(x);expect(x.result).toMatchObject({customerDebit:{pence:12000},builderCredit:{pence:12000},platformCustomerFunds:{pence:0},destinationAccount:`fake-builder-${a.tenantId}`});
  expect(await new PayNowAttemptRepository(c.runtime).command(a.context,a.actor,a.input)).toEqual(x);
  await expect(repo.command(a.context,a.actor,{...a.input,rail:"pay_by_bank"})).rejects.toThrow("REPLAY_CONFLICT");
  await expect(repo.command(a.context,a.actor,{...a.input,commandId:randomUUID()})).rejects.toThrow("ALREADY_ATTEMPTED");
  expect((await repo.read(a.context,a.jobId,a.invoice.id)).attempts).toEqual([x]);
  expect((await a.invoices.list(a.context,a.jobId))[0]!.balancePence).toBe(12000);
 });
 it("stores a truthful catch statement without changing options, fees or predecessor replay",async()=>{
  const ordinary=await fixture(),caught=await fixture(true),repo=new PayNowAttemptRepository(c.runtime);
  const plain=await repo.command(ordinary.context,ordinary.actor,ordinary.input);
  const current=await repo.command(caught.context,caught.actor,caught.input);
  expect(plain.invoice.includesCatch).toBe(false);expect(current.invoice.includesCatch).toBe(true);
  expect(current.options.map(({destinationAccount: _destinationAccount,...option})=>option))
   .toEqual(plain.options.map(({destinationAccount: _destinationAccount,...option})=>option));
  for(const option of current.options) expect(option.destinationAccount).toBe(`fake-builder-${caught.tenantId}`);
  for(const option of plain.options) expect(option.destinationAccount).toBe(`fake-builder-${ordinary.tenantId}`);
  expect(current.result.customerDebit).toEqual(plain.result.customerDebit);
  expect(current.result.builderFeeDebit).toEqual(plain.result.builderFeeDebit);
  const oldSql=await readFile(new URL("../migrations/0598_pay_now_fake_attempts.sql",import.meta.url),"utf8");
  await c.admin.query(oldSql.slice(oldSql.indexOf("CREATE FUNCTION app.pay_now_fake_attempt(t"),oldSql.indexOf("ALTER FUNCTION app.pay_now_fake_attempt")).replace("CREATE FUNCTION","CREATE OR REPLACE FUNCTION"));
  await caught.invoices.recordReceipt(caught.context,{jobId:caught.jobId,invoiceId:caught.invoice.id,
   actorMembershipId:caught.actorId,commandId:randomUUID(),paidOn:"2026-11-04",amountPence:100,method:"bank_transfer",reference:"Fictional receipt"});
  const input={...caught.input,commandId:randomUUID()};
  const old=await repo.command(caught.context,caught.actor,input);
  const snapshot=async()=>(await c.admin.query("SELECT record::text,record_hash,snapshot_hash FROM app.pay_now_fake_attempt WHERE tenant_id=$1 AND command_id=$2",[caught.tenantId,input.commandId])).rows[0];
  const before=await snapshot();expect(old.invoice.includesCatch).toBe(false);
  await c.admin.query(await readFile(new URL("../migrations/0648_pay_now_catch_statement.sql",import.meta.url),"utf8"));
  expect(await snapshot()).toEqual(before);
  expect(await repo.command(caught.context,caught.actor,input)).toEqual(old);
  expect(await repo.command(caught.context,caught.actor,caught.input)).toEqual(current);
  // The same source fingerprint remains consumed even when the field is corrected.
  await expect(repo.command(caught.context,caught.actor,{...input,commandId:randomUUID()})).rejects.toThrow("ALREADY_ATTEMPTED");
 });
 it("serializes different concurrent commands for the same revision",async()=>{
  const a=await fixture(),repo=new PayNowAttemptRepository(c.runtime);
  const outcomes=await Promise.allSettled([repo.command(a.context,a.actor,a.input),repo.command(a.context,a.actor,{...a.input,commandId:randomUUID()})]);
  expect(outcomes.filter(x=>x.status==="fulfilled")).toHaveLength(1);
  expect(outcomes.filter(x=>x.status==="rejected")).toMatchObject([{reason:{code:"ALREADY_ATTEMPTED"}}]);
  expect((await repo.read(a.context,a.jobId,a.invoice.id)).attempts).toHaveLength(1);
 });
 it("preserves old rows through credit notes, receipts and reversals and binds new balances",async()=>{
  const a=await fixture(),repo=new PayNowAttemptRepository(c.runtime);
  const old=await repo.command(a.context,a.actor,a.input);
  const credit={jobId:a.jobId,invoiceId:a.invoice.id,actorMembershipId:a.actorId,commandId:randomUUID(),netPence:1000,reason:"Synthetic correction"};
  const preview=await a.invoices.previewCredit(a.context,credit);
  await a.invoices.issueCredit(a.context,{...credit,previewHash:preview.previewHash});
  const next=await repo.command(a.context,a.actor,{...a.input,commandId:randomUUID()});
  expect(next.result.customerDebit.pence).toBe(10800);expect(next.snapshotHash).not.toBe(old.snapshotHash);
  expect(await repo.command(a.context,a.actor,a.input)).toEqual(old);
  const receipt=await a.invoices.recordReceipt(a.context,{jobId:a.jobId,invoiceId:a.invoice.id,actorMembershipId:a.actorId,commandId:randomUUID(),paidOn:"2026-11-04",amountPence:800,method:"bank_transfer",reference:"Fictional receipt"});
  const paid=await repo.command(a.context,a.actor,{...a.input,commandId:randomUUID()});expect(paid.result.customerDebit.pence).toBe(10000);
  const paymentId=(await c.admin.query("SELECT id FROM app.customer_payment WHERE tenant_id=$1 AND invoice_id=$2",[a.tenantId,a.invoice.id])).rows[0].id;
  await a.invoices.reverseReceipt(a.context,{jobId:a.jobId,invoiceId:a.invoice.id,paymentId,actorMembershipId:a.actorId,commandId:randomUUID(),reason:"Fictional reversal"});
  const reversed=await repo.command(a.context,a.actor,{...a.input,commandId:randomUUID()});expect(reversed.result.customerDebit.pence).toBe(10800);expect(reversed.snapshotHash).not.toBe(next.snapshotHash);
  expect((await repo.read(a.context,a.jobId,a.invoice.id)).attempts[0]).toEqual(old);
  expect(receipt).toBeDefined();
 });
 it("makes foreign tenant and wrong job equally not-found and refuses expired sessions",async()=>{
  const a=await fixture(),b=await company(),repo=new PayNowAttemptRepository(c.runtime);
  await expect(repo.read(b.context,b.jobId,a.invoice.id)).rejects.toThrow("NOT_FOUND");
  await expect(repo.read(a.context,b.jobId,a.invoice.id)).rejects.toThrow("NOT_FOUND");
  await expect(repo.command(b.context,{jobId:b.jobId,sessionDigest:b.digest},a.input)).rejects.toThrow("NOT_FOUND");
  await expect(repo.command(a.context,{...a.actor,jobId:b.jobId},a.input)).rejects.toThrow("NOT_FOUND");
  await c.admin.query("UPDATE identity.session SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[a.sessionId]);
  await expect(repo.command(a.context,a.actor,a.input)).rejects.toThrow("UNAUTHENTICATED");
 });
 it("enforces FORCE RLS, private grants, immutable rows and restores caller settings",async()=>{
  const a=await fixture(),repo=new PayNowAttemptRepository(c.runtime);await repo.command(a.context,a.actor,a.input);
  for(const sql of ["SELECT * FROM app.pay_now_fake_attempt","UPDATE app.pay_now_fake_attempt SET record='{}'","DELETE FROM app.pay_now_fake_attempt"]){
   await expect(workTenant(c.runtime,a.tenantId,db=>db.query(sql), { membershipId: a.actorId })).rejects.toMatchObject({code:"42501"});
  }
  for(const sql of ["UPDATE app.pay_now_fake_attempt SET record=record WHERE tenant_id=$1","DELETE FROM app.pay_now_fake_attempt WHERE tenant_id=$1"]){
   await expect(c.admin.query(sql,[a.tenantId])).rejects.toMatchObject({code:"55000"});
  }
  expect((await c.admin.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='app.pay_now_fake_attempt'::regclass")).rows[0]).toEqual({relrowsecurity:true,relforcerowsecurity:true});
  await workTenant(c.runtime,a.tenantId,async db=>{
   await db.query("SELECT app.pay_now_fake_attempt($1,$2,$3,'prepare',$4::jsonb)",[a.tenantId,a.digest,a.jobId,JSON.stringify(a.input)]);
   expect((await db.query("SELECT current_setting('app.tenant_id') t")).rows[0].t).toBe(a.tenantId);
  }, { membershipId: a.actorId, bindRequest: false });
 });
});
