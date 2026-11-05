import { randomUUID, randomBytes } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { cluster, type Cluster } from "./extra-fixtures.js";
import { meterCompany } from "./meter-persistence-fixtures.js";
import { type WorkFixture } from "./job-work-state-fixtures.js";
import { prepareInvoicePrerequisites } from "./sv5pre-fixtures.js";
import { PracticeInvoiceRepository } from "../src/practice-invoice-repository.js";
import { issueApprovedCatchInvoice } from "./customer-practice-pay-now-fixtures.js";
import { snapshotRows } from "./upgrade-proof-utils.js";
import { PayNowAttemptApplication } from "../../../apps/api/src/pay-now-attempt.application.js";
import { IdentityApplication } from "../../../apps/api/src/auth/identity.application.js";
import { PersistedAuthProvider } from "../../../apps/api/src/auth/persisted-auth-provider.js";
import { IdentityRepository } from "../src/identity-repository.js";

describe("MON-6 customer practice read",()=>{
 let c:Cluster, provider:PersistedAuthProvider, app:PayNowAttemptApplication;
 beforeAll(async()=>{ c=await cluster(); vi.stubEnv("JOBGUARD_ENV","synthetic_demo");
  provider=new PersistedAuthProvider(new IdentityRepository(c.admin),"fictional-customer-practice-secret-32-bytes");
  app=new PayNowAttemptApplication(new IdentityApplication(provider,"https://practice.invalid"),c.runtime);
 },240000);
 afterAll(async()=>{await c?.close();vi.unstubAllEnvs();});
 const company=()=>meterCompany(c as unknown as WorkFixture);
 async function identity(sql:string,args:unknown[]) {
  const db=await c.admin.connect();
  try {await db.query("BEGIN");await db.query("SET LOCAL ROLE jobguard_identity");const result=await db.query(sql,args);await db.query("COMMIT");return result;}
  catch(error){await db.query("ROLLBACK");throw error;}finally{db.release();}
 }
 async function fixture(balance=12000, includesCatch=false){
  const net=balance===1?1:Number(BigInt(balance)*5n/6n),tax=balance-net;
  const catchFixture=includesCatch ? await issueApprovedCatchInvoice(c,net) : null;
  const a=catchFixture?.a ?? await company(),t=a.tenantId,j=a.jobId,q=randomUUID(),d=randomUUID(),r=randomUUID(),lineId=randomUUID(),h="a".repeat(64);
  if(!catchFixture){
  await c.admin.query("INSERT INTO app.quote_version(id,tenant_id,job_id,version,content_hash,net_value_pence,status) VALUES($1,$2,$3,1,$4,$5,'accepted')",[q,t,j,h,net]);
  await c.admin.query("INSERT INTO app.final_account_draft(id,tenant_id,job_id) VALUES($1,$2,$3)",[d,t,j]);
  await c.admin.query(`INSERT INTO app.final_account_revision(id,tenant_id,job_id,final_account_draft_id,revision,source_hash,baseline_quote_version_id,currency,tax_policy_version,net_pence,tax_pence,total_pence,issue_blocked,findings)
   VALUES($1,$2,$3,$4,1,$5,$6,'GBP','candidate_m1_standard_v1',$7,$8,$9,false,'[]')`,[r,t,j,d,h,q,net,tax,balance]);
  await c.admin.query("UPDATE app.final_account_draft SET revision=1,current_revision_id=$3 WHERE tenant_id=$1 AND id=$2",[t,d,r]);
  await c.admin.query(`INSERT INTO app.final_account_line(id,tenant_id,job_id,final_account_revision_id,line_kind,source_id,scope_item_id,commercial_revision_id,description,net_pence,ordinal,approval_id)
   VALUES($1,$2,$3,$4,'baseline',$5,$6,$5,'Fictional source',$7,1,NULL)`,[lineId,t,j,r,q,a.scopeId,net]);
  await prepareInvoicePrerequisites(c.admin,c.runtime,t,j,a.actorId,r);
  }
  const invoices=new PracticeInvoiceRepository(c.runtime);
  const invoice=catchFixture ? catchFixture.invoice : await invoices.issue(a.context,{jobId:j,finalAccountRevisionId:r,actorMembershipId:a.actorId,commandId:randomUUID(),recipient:"fictional@example.invalid",issuedOn:"2026-11-04"});
  const actor={jobId:j,sessionDigest:a.digest};
  const input={version:"pay-now-attempt.v1",commandId:randomUUID(),invoiceId:invoice.id,rail:"card"};
  const party=(await c.admin.query("SELECT b.customer_id FROM app.job_party_current p JOIN app.job_party_binding b ON(b.tenant_id,b.id)=(p.tenant_id,p.binding_id) WHERE p.tenant_id=$1 AND p.job_id=$2",[t,j])).rows[0];
  const customer=String(party.customer_id),token=`${t}.${j}.${customer}.${randomBytes(32).toString("base64url")}`;
  const link=provider.digest(randomUUID()),digest=provider.digest(`customer-session:${token}`);
  await identity("SELECT identity.customer_portal_issue($1,$2,$3,$4,$5,$6)",[t,a.digest,j,customer,link,`customer-signin-reference.v1:${t}/${j}/${customer}/${"a".repeat(43)}`]);
  await identity("SELECT identity.customer_portal_use($1,$2,$3,$4,$5,'redeem')",[t,j,customer,link,digest]);
  return {...a,actor,input,invoices,invoice,customer,token,digest};
 }

 const request=(token:string)=>({headers:{cookie:`jobguard_customer=${token}`}});
 it.each([1,12000,1000000000000])("shows stored amount %i without a surcharge and stores nothing",async amount=>{
  const a=await fixture(amount),before=await snapshotRows(c.admin);
  const result=await app.customerPractice(request(a.token));
  expect(result.amountDue.pence).toBe(amount);
  expect(result.options).toHaveLength(3);
  for(const option of result.options)expect(option.customerTotal.pence).toBe(amount);
  expect(JSON.stringify(result)).not.toMatch(/fee|catch|surcharge|policy|attempt/iu);
  expect(await snapshotRows(c.admin)).toEqual(before);
 });
 it("catch and ordinary stored invoices produce byte-identical public bodies apart from number",async()=>{
  const a=await fixture(12000,false),b=await fixture(12000,true);
  const catchLines=(await c.admin.query(`SELECT o.kind,a.id approval_id,l.approval_id line_approval_id
   FROM app.final_account_invoiced_line i
   JOIN app.final_account_line l ON(l.tenant_id,l.id)=(i.tenant_id,i.final_account_line_id)
   JOIN app.variation_approval a ON(a.tenant_id,a.id)=(l.tenant_id,l.approval_id)
   JOIN app.extra_origin o ON(o.tenant_id,o.variation_id)=(a.tenant_id,a.variation_id)
   WHERE i.tenant_id=$1 AND i.invoice_id=$2`,[b.tenantId,b.invoice.id])).rows;
  expect(catchLines).toHaveLength(1);
  expect(catchLines[0]).toMatchObject({kind:"jobguard_catch",line_approval_id:catchLines[0].approval_id});
  expect(b.invoice.balancePence).toBe(12000);
  const redact=async(token:string)=>{const result=await app.customerPractice(request(token));expect(result.amountDue.pence).toBe(12000);return JSON.stringify({...result,invoiceNumber:"REDACTED"});};
  expect(await redact(a.token)).toBe(await redact(b.token));
 });
 it("rejects missing, revoked, expired, and foreign customer/company credentials identically without writes",async()=>{
  const a=await fixture(),b=await fixture();
  const foreign=[`${a.tenantId}.${a.jobId}.${b.customer}.${a.token.split(".")[3]}`,`${b.tenantId}.${b.jobId}.${b.customer}.${a.token.split(".")[3]}`];
  const beforeForeign=await snapshotRows(c.admin);
  for(const token of ["",...foreign])await expect(app.customerPractice(request(token))).rejects.toMatchObject({ code: "CUSTOMER_REFUSED" });
  expect(await snapshotRows(c.admin)).toEqual(beforeForeign);
  for(const sql of ["UPDATE app.customer_portal_session SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND job_id=$2", "UPDATE app.customer_portal_grant SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND job_id=$2", "UPDATE app.customer_portal_session SET issued_at=issued_at-interval '2 hours',expires_at=expires_at-interval '2 hours' WHERE tenant_id=$1 AND job_id=$2"]){
   const w=await fixture();await c.admin.query(sql,[w.tenantId,w.jobId]);const before=await snapshotRows(c.admin);
   await expect(app.customerPractice(request(w.token))).rejects.toMatchObject({ code: "CUSTOMER_REFUSED" });
   expect(await snapshotRows(c.admin)).toEqual(before);
  }
 });
 it("has only identity EXECUTE, resolves before invoice access, reads neither attempts nor hidden data",async()=>{
  for(const role of ["jobguard_runtime","jobguard_infrastructure","jobguard_shadow","jobguard_shadow_emergency_access"])
   expect((await c.admin.query("SELECT has_function_privilege($1,'identity.customer_practice_pay_now(uuid,uuid,uuid,text)','EXECUTE') allowed",[role])).rows[0].allowed).toBe(false);
  expect((await c.admin.query("SELECT has_function_privilege('jobguard_identity','identity.customer_practice_pay_now(uuid,uuid,uuid,text)','EXECUTE') allowed")).rows[0].allowed).toBe(true);
  const a=await fixture();
  expect((await identity("SELECT identity.customer_practice_pay_now($1,$2,$3,$4) result",[a.tenantId,a.jobId,a.customer,a.digest])).rows[0].result).toEqual({invoiceNumber:a.invoice.number,balancePence:12000});
  const definition=String((await c.admin.query("SELECT pg_get_functiondef('identity.customer_practice_pay_now(uuid,uuid,uuid,text)'::regprocedure) def")).rows[0].def);
  expect(definition.indexOf("PERFORM identity.customer_portal_use")).toBeLessThan(definition.indexOf("SELECT jsonb_build_object"));
  expect(definition).not.toMatch(/pay_now_fake_attempt|shadow|INSERT INTO|UPDATE app|DELETE FROM/iu);
 });
 it("reflects credits, payments and reversals without storing an attempt",async()=>{
  const a=await fixture();
  const credit={jobId:a.jobId,invoiceId:a.invoice.id,actorMembershipId:a.actorId,commandId:randomUUID(),netPence:1000,reason:"Fictional credit"};
  const preview=await a.invoices.previewCredit(a.context,credit);
  await a.invoices.issueCredit(a.context,{...credit,previewHash:preview.previewHash});
  expect((await app.customerPractice(request(a.token))).amountDue.pence).toBe(10800);
  const payment=await a.invoices.recordReceipt(a.context,{jobId:a.jobId,invoiceId:a.invoice.id,actorMembershipId:a.actorId,commandId:randomUUID(),paidOn:"2026-11-04",amountPence:10800,method:"bank_transfer",reference:"Fictional receipt"});
  expect(await app.customerPractice(request(a.token))).toMatchObject({amountDue:{pence:0},options:[]});
  await a.invoices.reverseReceipt(a.context,{jobId:a.jobId,invoiceId:a.invoice.id,paymentId:payment.paymentId,actorMembershipId:a.actorId,commandId:randomUUID(),reason:"Fictional reversal"});
  const before=await snapshotRows(c.admin);
  expect((await app.customerPractice(request(a.token))).amountDue.pence).toBe(10800);
  expect(await snapshotRows(c.admin)).toEqual(before);
 });
});
