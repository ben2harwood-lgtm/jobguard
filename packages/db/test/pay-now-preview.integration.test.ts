import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { cluster, type Cluster } from "./extra-fixtures.js";
import { meterCompany } from "./meter-persistence-fixtures.js";
import { workTenant, type WorkFixture } from "./job-work-state-fixtures.js";
import { prepareInvoicePrerequisites } from "./sv5pre-fixtures.js";
import { PayNowAttemptRepository } from "../src/pay-now-attempt-repository.js";
import { PracticeInvoiceRepository } from "../src/practice-invoice-repository.js";

import { PayNowAttemptApplication } from "../../../apps/api/src/pay-now-attempt.application.js";
import { IdentityApplication } from "../../../apps/api/src/auth/identity.application.js";
import { PersistedAuthProvider } from "../../../apps/api/src/auth/persisted-auth-provider.js";
import { IdentityRepository } from "../src/identity-repository.js";

describe("MON-6 stored preview boundaries",()=>{
 let c:Cluster;
 beforeAll(async()=>{vi.stubEnv("JOBGUARD_ENV","synthetic_demo");c=await cluster();},240000);
 afterAll(async()=>{try{await c?.close();}finally{vi.unstubAllEnvs();}});
 const company=()=>meterCompany(c as unknown as WorkFixture);
 async function fixture(balance=12000){
  const a=await company(),net=balance===1?1:Number(BigInt(balance)*5n/6n),tax=balance-net,t=a.tenantId,j=a.jobId,q=randomUUID(),d=randomUUID(),r=randomUUID(),h="a".repeat(64);
  await c.admin.query("INSERT INTO app.quote_version(id,tenant_id,job_id,version,content_hash,net_value_pence,status) VALUES($1,$2,$3,1,$4,$5,'accepted')",[q,t,j,h,net]);
  await c.admin.query("INSERT INTO app.final_account_draft(id,tenant_id,job_id) VALUES($1,$2,$3)",[d,t,j]);
  await c.admin.query(`INSERT INTO app.final_account_revision(id,tenant_id,job_id,final_account_draft_id,revision,source_hash,baseline_quote_version_id,currency,tax_policy_version,net_pence,tax_pence,total_pence,issue_blocked,findings)
   VALUES($1,$2,$3,$4,1,$5,$6,'GBP','candidate_m1_standard_v1',$7,$8,$9,false,'[]')`,[r,t,j,d,h,q,net,tax,balance]);
  await c.admin.query("UPDATE app.final_account_draft SET revision=1,current_revision_id=$3 WHERE tenant_id=$1 AND id=$2",[t,d,r]);
  await c.admin.query(`INSERT INTO app.final_account_line(id,tenant_id,job_id,final_account_revision_id,line_kind,source_id,scope_item_id,commercial_revision_id,description,net_pence,ordinal)
   VALUES($1,$2,$3,$4,'baseline',$5,$6,$5,'Fictional baseline',$7,1)`,[randomUUID(),t,j,r,q,a.scopeId,net]);
  await prepareInvoicePrerequisites(c.admin,c.runtime,t,j,a.actorId,r);
  const invoices=new PracticeInvoiceRepository(c.runtime);
  const invoice=await invoices.issue(a.context,{jobId:j,finalAccountRevisionId:r,actorMembershipId:a.actorId,commandId:randomUUID(),recipient:"fictional@example.invalid",issuedOn:"2026-11-04"});
  const actor={jobId:j,sessionDigest:a.digest};
  const input={version:"pay-now-attempt.v1",commandId:randomUUID(),invoiceId:invoice.id,rail:"card"};
  return {...a,actor,input,invoices,invoice};
 }
 it.each([1,1000000000000])("caps fees without a surcharge at stored balance %i",async balance=>{
  for(const rail of ["bank_transfer","card","pay_by_bank"] as const){
   const a=await fixture(balance),repo=new PayNowAttemptRepository(c.runtime);
   const x=await repo.command(a.context,a.actor,{...a.input,rail});
   expect(x.invoice.balancePence).toBe(balance);
   expect(x.result.builderFeeDebit.pence).toBeLessThanOrEqual(Math.min(600,balance));
   expect(x.result.destinationAccount).toBe(`fake-builder-${a.tenantId}`);
   expect(x.result.platformCustomerFunds.pence).toBe(0);
   for(const option of x.options){expect(option.customerSurcharge.pence).toBe(0);expect(option.customerTotal.pence).toBe(balance);}
   expect(x.options[0]).toMatchObject({rail:"bank_transfer",builderFee:{pence:0}});
  }
 });
 it("changes no existing business rows through concurrent attempts and replay",async()=>{
  const a=await fixture(),repo=new PayNowAttemptRepository(c.runtime);
  const tables=(await c.admin.query("SELECT table_name FROM information_schema.columns WHERE table_schema='app' AND column_name='tenant_id' AND table_name<>'pay_now_fake_attempt' ORDER BY table_name")).rows.map(r=>String(r.table_name));
  const snapshot=async()=>{
   const rows:Record<string,unknown>={};
   for(const table of tables){
    if(!/^[a-z0-9_]+$/u.test(table))throw new Error("unsafe catalog identifier");
    rows[table]=(await c.admin.query(`SELECT coalesce(jsonb_agg(v ORDER BY v::text),'[]'::jsonb) rows FROM (SELECT to_jsonb(t) v FROM app."${table}" t WHERE tenant_id=$1) q`,[a.tenantId])).rows[0].rows;
   }
   return rows;
  };
  const before=await snapshot();
  const [x,y]=await Promise.all([repo.command(a.context,a.actor,a.input),repo.command(a.context,a.actor,a.input)]);
  expect(x).toEqual(y);expect(await snapshot()).toEqual(before);
  expect((await repo.read(a.context,a.jobId,a.invoice.id)).attempts).toHaveLength(1);
 });
 it("refuses non-owner/admin roles and revoked or expired sessions",async()=>{
  const repo=new PayNowAttemptRepository(c.runtime);
  for(const role of ["estimator","foreman","finance","read_only"]){
   const a=await fixture();await c.admin.query("UPDATE app.membership SET role=$1 WHERE id=$2",[role,a.actorId]);
   await expect(repo.command(a.context,a.actor,a.input)).rejects.toThrow("FORBIDDEN");
   await expect(workTenant(c.runtime,a.tenantId,db=>db.query(
    "SELECT app.pay_now_fake_attempt($1,$2,$3,'prepare',$4::jsonb)",
    [a.tenantId,a.digest,a.jobId,JSON.stringify(a.input)],
   ), { membershipId: a.actorId })).rejects.toMatchObject({message:"METER_FORBIDDEN",code:"42501"});
  }
  for(const mutation of ["UPDATE app.membership SET revoked_at=clock_timestamp() WHERE id=$1","UPDATE identity.session SET revoked_at=clock_timestamp() WHERE id=$1","UPDATE identity.session SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1"]){
   const a=await fixture();
   const original=await repo.command(a.context,a.actor,a.input);
   expect(original.synthetic).toBe(true);
   await c.admin.query(mutation,[mutation.includes("membership")?a.actorId:a.sessionId]);
   const membership=mutation.includes("membership");
   // PAY_NOW_AUTH_SPLIT: raw meter binding refuses revoked membership; revoked/expired sessions retain the SQL session refusal.
   // Repository calls retain the built public UNAUTHENTICATED code for an initial binding refusal.
   await expect(repo.command(a.context,a.actor,a.input)).rejects.toThrow("UNAUTHENTICATED");
   await expect(workTenant(c.runtime,a.tenantId,db=>db.query(
    "SELECT app.pay_now_fake_attempt($1,$2,$3,'prepare',$4::jsonb)",
    [a.tenantId,a.digest,a.jobId,JSON.stringify(a.input)],
   ), { membershipId: a.actorId, bindRequest: false })).rejects.toMatchObject({message:membership?"REQUEST_BINDING_REFUSED":"PAY_NOW_UNAUTHENTICATED",code:membership?"42501":"28000"});
  }
 });
 it("refuses an unknown session as unauthenticated",async()=>{
  const a=await fixture(),repo=new PayNowAttemptRepository(c.runtime);
  await expect(repo.command(a.context,{...a.actor,sessionDigest:"f".repeat(64)},a.input)).rejects.toMatchObject({code:"UNAUTHENTICATED"});
 });
 it("reloads stored credit/receipt balances and hides foreign and missing invoices",async()=>{
  const a=await fixture(),b=await fixture(),provider=new PersistedAuthProvider(new IdentityRepository(c.admin),"synthetic-fixture-only-secret-32-characters");
  const token=randomUUID(),csrf=randomUUID(),origin="https://preview.invalid";
  await c.admin.query("UPDATE identity.session SET token_digest=$1,csrf_token=$2 WHERE id=$3",[provider.digest(`session:${token}`),csrf,a.sessionId]);
  const app=new PayNowAttemptApplication(new IdentityApplication(provider,origin),c.runtime);
  const credentials={sessionToken:token,csrfToken:csrf,tenantHeader:a.tenantId,origin};
  expect((await app.read(credentials,a.jobId,a.invoice.id)).balancePence).toBe(12000);
  await expect(app.read(credentials,b.jobId,b.invoice.id)).rejects.toThrow("NOT_FOUND");
  await expect(app.read(credentials,a.jobId,randomUUID())).rejects.toThrow("NOT_FOUND");
  await app.command(credentials,a.jobId,a.invoice.id,{commandId:a.input.commandId,rail:"card"});
  const credit={jobId:a.jobId,invoiceId:a.invoice.id,actorMembershipId:a.actorId,commandId:randomUUID(),netPence:1000,reason:"Fictional credit"};
  const preview=await a.invoices.previewCredit(a.context,credit);
  await a.invoices.issueCredit(a.context,{...credit,previewHash:preview.previewHash});
  expect((await app.read(credentials,a.jobId,a.invoice.id)).balancePence).toBe(10800);
  await a.invoices.recordReceipt(a.context,{jobId:a.jobId,invoiceId:a.invoice.id,actorMembershipId:a.actorId,commandId:randomUUID(),paidOn:"2026-11-04",amountPence:10800,method:"bank_transfer",reference:"Fictional receipt"});
  const paid=await app.read(credentials,a.jobId,a.invoice.id);
  expect(paid).toMatchObject({balancePence:0,options:[]});expect(paid.attempts).toHaveLength(1);
  expect((await app.command(credentials,a.jobId,a.invoice.id,{commandId:a.input.commandId,rail:"card"})).result.customerDebit.pence).toBe(12000);
 });
});
