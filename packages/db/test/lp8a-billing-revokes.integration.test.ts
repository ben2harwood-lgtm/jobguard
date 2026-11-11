import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createSyntheticInvoicePdf, money } from "@jobguard/core";
import { CustomerBillingCommandService } from "../src/customer-billing-repository.js";
import { UserCommandDispatcher } from "../src/commands.js";
import { appendOutboundAction } from "../src/outbox.js";
import { withTenant } from "../src/tenant-context.js";
import { createLockFixture, closeLockFixture, seedAccount, prepareInvoicePrerequisites, LOCK_OWNER, type LockFixture } from "./sv5pre-fixtures.js";
import { testBoundTenantContext } from "./tenant-context-test-utils.js";
import { jobDoorsDatabase, type JobDoorsDatabase } from "./lp-job-doors-fixtures.js";
import { migrate } from "../src/migrate.js";
import { installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";

let f: LockFixture;
beforeAll(async () => { f = await createLockFixture(); }, 300_000);
afterAll(async () => { if (f) await closeLockFixture(f); });
const tables = ["customer_invoice", "customer_invoice_evidence", "customer_credit_note", "customer_payment", "customer_payment_reversal", "customer_invoice_sequence", "customer_credit_note_sequence"];

async function invoiceFixture() {
 const a = await seedAccount(f.admin, randomUUID(), 10000);
 await prepareInvoicePrerequisites(f.admin, f.runtime, a.tenantId, a.jobId, LOCK_OWNER, a.revisionId);
 const context = await testBoundTenantContext(f.admin, a.tenantId, LOCK_OWNER);
 const pdf = createSyntheticInvoicePdf({invoiceNumber:"SYN-2026-000001",issuerName:"Fictional LP8a builder",total:money(12000),sourceRevisionId:a.revisionId,evidenceVersionIds:[]});
 const raw = {version:"customer-invoice.issue.v1",finalAccountRevisionId:a.revisionId,issuedOn:"2026-11-10",issuer:{legalName:"Fictional LP8a builder",address:"Fictional street",vatNumber:null},
  command:{version:"command.v1",commandId:randomUUID(),commandType:"customer_invoice.issue",semanticKey:`invoice:${a.revisionId}`,actorMembershipId:LOCK_OWNER,subjectType:"job",subjectRef:a.jobId,
   action:{actionType:"final_account.issue",recipient:null,contentHash:createHash("sha256").update(pdf).digest("hex"),aggregateRevision:1,amountPence:12000,currency:"GBP",policyVersion:"candidate_m1_standard_v1",expiresAt:new Date(Date.now()+300000)}}};
 return {a,context,raw,service:new CustomerBillingCommandService(f.runtime)};
}

it("withdraws direct billing and number writes, including effective column privileges", async () => {
 for (const table of tables) {
  await expect(f.runtime.query(`INSERT INTO app.${table} DEFAULT VALUES`)).rejects.toMatchObject({code:"42501"});
  const cols = (await f.runtime.query(`SELECT a.attname,has_column_privilege(current_user,c.oid,a.attnum,'INSERT') allowed
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid
   WHERE n.nspname='app' AND c.relname=$1 AND a.attnum>0 AND NOT a.attisdropped`,[table])).rows;
  expect(cols.length).toBeGreaterThan(0); expect(cols.every(c=>!c.allowed)).toBe(true);
 }
 for(const table of tables.slice(-2)) for(const operation of ["UPDATE next_number=next_number+1","DELETE"]) {
  const sql=operation.startsWith("UPDATE")?`UPDATE app.${table} SET next_number=next_number+1`:`DELETE FROM app.${table}`;
  await expect(f.runtime.query(sql)).rejects.toMatchObject({code:"42501"});
 }
 await expect(f.runtime.query("SELECT app.reserve_customer_invoice_number($1)",[randomUUID()])).rejects.toMatchObject({code:"42501"});
});

it("preserves issue, credit, manual payment, reversal and exact replay after revocation", async () => {
 const {a,context,raw,service}=await invoiceFixture();
 const invoice=await service.issue(context,raw);
 expect(await service.issue(context,raw)).toEqual(invoice);
 await expect(service.issue(context,{...raw,issuer:{...raw.issuer,address:"Changed address"}})).rejects.toThrow("COMMAND_CONFLICT");
 const credit={version:"customer-credit-note.issue.v1",invoiceId:invoice.invoiceId,amountPence:1200,reason:"Fictional correction",command:{...raw.command,commandId:randomUUID(),commandType:"customer_credit_note.issue",semanticKey:`credit:${randomUUID()}`,action:{...raw.command.action,actionType:"customer_credit_note.issue",amountPence:1200}}};
 const saved=await service.credit(context,credit); expect(await service.credit(context,credit)).toEqual(saved);
 await expect(service.credit(context,{...credit,reason:"Changed reason"})).rejects.toThrow("COMMAND_CONFLICT");
 await expect(service.credit(context,{...credit,invoiceId:randomUUID()})).rejects.toThrow();
 const paymentInput={version:"customer-payment.record.v1",commandId:randomUUID(),actorMembershipId:LOCK_OWNER,jobId:a.jobId,invoiceId:invoice.invoiceId,paidOn:"2026-11-10",amountPence:5000,currency:"GBP",method:"bank_transfer",reference:"fictional",builderAttestsReceived:true};
 const payment=await service.recordPayment(context,paymentInput); expect(await service.recordPayment(context,paymentInput)).toEqual(payment);
 const reversal={version:"customer-payment.reverse.v1",commandId:randomUUID(),actorMembershipId:LOCK_OWNER,jobId:a.jobId,paymentId:payment.paymentId,reason:"Fictional reversal"};
 expect(await service.reversePayment(context,reversal)).toEqual(await service.reversePayment(context,reversal));
 expect(await service.balance(context,invoice.invoiceId)).toMatchObject({balance:{pence:10800}});
 await expect(service.recordPayment(context,{...paymentInput,amountPence:1})).rejects.toThrow();
 const foreign=await seedAccount(f.admin,randomUUID(),10000),foreignContext=await testBoundTenantContext(f.admin,foreign.tenantId,LOCK_OWNER);
 await expect(service.credit(foreignContext,{...credit,command:{...credit.command,commandId:randomUUID(),semanticKey:`foreign:${randomUUID()}`,subjectRef:foreign.jobId}})).rejects.toThrow();
 await expect(service.recordPayment(context,{...paymentInput,commandId:randomUUID(),jobId:foreign.jobId})).rejects.toThrow();
});

it("refuses unbound requests and invalid final-account parent/revision links inside the owner routine", async () => {
 const {a,context}=await invoiceFixture();
 await expect(f.runtime.query("SELECT app.advance_final_account_draft($1,$2,$3,1)",[a.tenantId,a.draftId,a.revisionId])).rejects.toMatchObject({code:"42501"});
 await expect(withTenant(f.runtime,context,db=>db.$client.query("SELECT app.advance_final_account_draft($1,$2,$3,2)",[a.tenantId,a.draftId,randomUUID()]))).rejects.toMatchObject({code:"23514",message:"INVALID_TRANSITION"});
 await expect(withTenant(f.runtime,context,db=>db.$client.query("SELECT app.advance_final_account_draft($1,$2,$3,1)",[randomUUID(),a.draftId,a.revisionId]))).rejects.toMatchObject({code:"42501"});
 await expect(withTenant(f.runtime,context,db=>db.$client.query("SELECT app.issue_approved_customer_credit($1,$2,1200,'forged',NULL)",[randomUUID(),randomUUID()]))).rejects.toMatchObject({code:"42501"});
});

it("applies the cutover to an installed predecessor without changing stored billing rows", async () => {
 let old:JobDoorsDatabase|undefined;
 try {
  old=await jobDoorsDatabase(true,"0980_lp8a_billing_revokes.sql");
  // Same labelled party fixture as the current-schema lock fixture: each seeded job gets its parties before it goes live.
  await installLegacySyntheticPartyFixtures(old.owner);
  const account=await seedAccount(old.owner,randomUUID(),10000);
  // A real legacy invoice is created using the supported checked issuer before cutover.
  await prepareInvoicePrerequisites(old.owner,old.runtime,account.tenantId,account.jobId,LOCK_OWNER,account.revisionId);
  const {PracticeInvoiceRepository}=await import("../src/practice-invoice-repository.js");
  const invoice=await new PracticeInvoiceRepository(old.runtime).issue(account.context,{jobId:account.jobId,finalAccountRevisionId:account.revisionId,actorMembershipId:LOCK_OWNER,commandId:randomUUID(),recipient:"fixture@example.invalid",issuedOn:"2026-11-10"});
  const legacyAccount=await seedAccount(old.owner,randomUUID(),10000);
  await prepareInvoicePrerequisites(old.owner,old.runtime,legacyAccount.tenantId,legacyAccount.jobId,LOCK_OWNER,legacyAccount.revisionId);
  const pdf=createSyntheticInvoicePdf({invoiceNumber:"SYN-2026-000001",issuerName:"Fictional legacy builder",total:money(12000),sourceRevisionId:legacyAccount.revisionId,evidenceVersionIds:[]}),pdfHash=createHash("sha256").update(pdf).digest("hex");
  const legacyRaw={version:"customer-invoice.issue.v1",finalAccountRevisionId:legacyAccount.revisionId,issuedOn:"2026-11-10",issuer:{legalName:"Fictional legacy builder",address:"Fictional street",vatNumber:null},command:{version:"command.v1",commandId:randomUUID(),commandType:"customer_invoice.issue",semanticKey:`invoice:${legacyAccount.revisionId}`,actorMembershipId:LOCK_OWNER,subjectType:"job",subjectRef:legacyAccount.jobId,action:{actionType:"final_account.issue",recipient:null,contentHash:pdfHash,aggregateRevision:1,amountPence:12000,currency:"GBP",policyVersion:"candidate_m1_standard_v1",expiresAt:new Date(Date.now()+300000)}}};
  const legacyInvoiceId=randomUUID();
  const legacySaved=await new UserCommandDispatcher(old.runtime).dispatch(legacyAccount.context,legacyRaw.command,{mutate:async(db,command)=>{
   await db.$client.query("SELECT app.reserve_customer_invoice_number($1)",[legacyAccount.tenantId]);
   await db.$client.query(`INSERT INTO app.customer_invoice(id,tenant_id,job_id,final_account_revision_id,authorization_id,invoice_number,issued_on,issuer_details,tax_policy_version,currency,net_pence,tax_pence,total_pence,source_hash,pdf_sha256,pdf_bytes,synthetic,watermark)
    VALUES($1,$2,$3,$4,$5,'SYN-2026-000001','2026-11-10',$6,'candidate_m1_standard_v1','GBP',10000,2000,12000,$7,$8,$9,true,'SYNTHETIC - NOT A REAL INVOICE')`,[legacyInvoiceId,legacyAccount.tenantId,legacyAccount.jobId,legacyAccount.revisionId,command.authorizationId,legacyRaw.issuer,"a".repeat(64),pdfHash,Buffer.from(pdf)]);
   await appendOutboundAction(db,legacyAccount.tenantId,{version:"outbound-action.v1",id:randomUUID(),authorizationId:command.authorizationId!,adapter:"fake_invoice_delivery",providerEffectKey:`invoice:${legacyInvoiceId}`,actionType:"final_account.issue",recipient:null,contentHash:pdfHash,immutableContent:new TextDecoder().decode(pdf),aggregateRevision:1,amountPence:12000,currency:"GBP",policyVersion:"candidate_m1_standard_v1",authorizationExpiresAt:legacyRaw.command.action.expiresAt});
   return{invoiceId:legacyInvoiceId};
  }});
  const before=(await old.owner.query("SELECT * FROM app.customer_invoice ORDER BY tenant_id,id")).rows;
  await migrate(old.owner); await migrate(old.owner);
  expect((await old.owner.query("SELECT * FROM app.customer_invoice ORDER BY tenant_id,id")).rows).toEqual(before);
  expect((await old.runtime.query("SELECT has_table_privilege(current_user,'app.customer_invoice','INSERT') allowed")).rows[0].allowed).toBe(false);
  const upgraded=new CustomerBillingCommandService(old.runtime);
  expect(await upgraded.issue(legacyAccount.context,legacyRaw)).toEqual(legacySaved);
  await expect(upgraded.issue(legacyAccount.context,{...legacyRaw,issuer:{...legacyRaw.issuer,address:"Changed"}})).rejects.toThrow("COMMAND_CONFLICT");
  expect(await upgraded.balance(account.context,invoice.id)).toMatchObject({balance:{pence:12000}});
 } finally { await old?.close(); }
},300_000);

it("checks preflight job scope without granting writes or consuming a number",async()=>{
 const {a,context}=await invoiceFixture();
 await withTenant(f.runtime,context,db=>db.$client.query("SELECT app.lock_customer_invoice_issue($1)",[a.jobId]));
 await expect(withTenant(f.runtime,context,db=>db.$client.query("SELECT app.lock_customer_invoice_issue($1)",[randomUUID()]))).rejects.toMatchObject({code:"42501"});
 expect((await f.admin.query("SELECT count(*)::int n FROM app.customer_invoice_sequence WHERE tenant_id=$1",[a.tenantId])).rows[0].n).toBe(0);
 expect((await f.runtime.query("SELECT has_table_privilege(current_user,'app.job','UPDATE') allowed")).rows[0].allowed).toBe(false);
});
