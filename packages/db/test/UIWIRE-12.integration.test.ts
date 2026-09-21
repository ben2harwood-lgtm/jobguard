import { mkdtemp, readFile, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, MIGRATION_URLS, PracticeInvoiceRepository, type VerifiedTenantContext, withTenant } from "../src/index.js";
import { closeTestPools } from "./pool-test-utils.js";
const T="11000000-0000-4000-8000-000000000001", A="21000000-0000-4000-8000-000000000002", U="31000000-0000-4000-8000-000000000003", M="41000000-0000-4000-8000-000000000004";
const context={tenantId:T} as VerifiedTenantContext;
let pg:EmbeddedPostgres,admin:Pool,runtime:Pool,dir:string,repo:PracticeInvoiceRepository;
type Fixture={jobId:string;invoiceId:string;quoteId:string;draftId:string;revisionId:string};
type ReceiptInput=Parameters<PracticeInvoiceRepository["recordReceipt"]>[1];
let legacy:Fixture,legacyInput:ReceiptInput,legacyPayment:{paymentId:string},legacyReverseCommand:string,legacyReversal:string,legacyHashes:unknown;
async function freshInvoice():Promise<Fixture> {
 const jobId=randomUUID(),quoteId=randomUUID(),draftId=randomUUID(),revisionId=randomUUID();
 await admin.query(`INSERT INTO app.job(id,tenant_id,title,status)VALUES($1,$2,'Fictional receipt test','live')`,[jobId,T]);
 await admin.query(`INSERT INTO app.quote_version(id,tenant_id,job_id,version,content_hash,net_value_pence,status)VALUES($1,$2,$3,1,$4,110000,'accepted')`,[quoteId,T,jobId,"b".repeat(64)]);
 await admin.query(`INSERT INTO app.final_account_draft(id,tenant_id,job_id)VALUES($1,$2,$3)`,[draftId,T,jobId]);
 await admin.query(`INSERT INTO app.final_account_revision(id,tenant_id,job_id,final_account_draft_id,revision,source_hash,baseline_quote_version_id,currency,tax_policy_version,net_pence,tax_pence,total_pence,issue_blocked,findings)VALUES($1,$2,$3,$4,1,$5,$6,'GBP','candidate_m1_standard_v1',110000,22000,132000,false,'[]')`,[revisionId,T,jobId,draftId,"b".repeat(64),quoteId]);
 await admin.query(`UPDATE app.final_account_draft SET revision=1,current_revision_id=$3 WHERE tenant_id=$1 AND id=$2`,[T,draftId,revisionId]);
 const invoice=await repo.issue(context,{jobId,finalAccountRevisionId:revisionId,actorMembershipId:M,commandId:randomUUID(),recipient:"practice@example.invalid",issuedOn:"2026-09-19"});
 return {jobId,invoiceId:invoice.id,quoteId,draftId,revisionId};
}
const command=(f:Fixture,amountPence=50000):ReceiptInput=>({jobId:f.jobId,invoiceId:f.invoiceId,actorMembershipId:M,commandId:randomUUID(),paidOn:"2026-09-18",amountPence,method:"bank_transfer",reference:"Fictional receipt"});
const reversal=(f:Fixture,paymentId:string)=>({jobId:f.jobId,invoiceId:f.invoiceId,paymentId,actorMembershipId:M,commandId:randomUUID(),reason:"Practice receipt correction"});
async function rawRecord(c:ReceiptInput,overrides:Record<string,unknown>={}) {
 const v={...c,...overrides};
 return withTenant(runtime,context,db=>db.$client.query(`SELECT * FROM app.record_practice_customer_receipt($1,$2,$3,$4,$5,$6::date,$7,$8,$9)`,[T,v.jobId,v.invoiceId,v.actorMembershipId,v.commandId,v.paidOn,v.amountPence,v.method,v.reference]));
}
beforeAll(async()=>{
 dir=await mkdtemp(join(tmpdir(),"uiwire12-pg-"));
 const port=59000+Math.floor(Math.random()*400);
 pg=new EmbeddedPostgres({databaseDir:dir,port,user:"postgres",password:"synthetic",persistent:false,createPostgresUser:process.getuid?.()===0,initdbFlags:["--lc-messages=C"],onLog:()=>undefined});
 await pg.initialise();await pg.start();
 admin=new Pool({host:"127.0.0.1",port,user:"postgres",password:"synthetic"});
 // Establish a real 0029 database, issue/record/reverse there, then upgrade it.
 // This is intentionally separate from the full fresh-install bootstrap test.
 await admin.query(`CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())`);
 for(const url of MIGRATION_URLS) {
  const name=fileURLToPath(url).split("/").at(-1)!;
  if(name.startsWith("0030_"))break;
  await admin.query(await readFile(fileURLToPath(url),"utf8"));
  await admin.query(`INSERT INTO public.jobguard_schema_migration(migration_name)VALUES($1)`,[name]);
 }
 await admin.query(`INSERT INTO control_plane.tenant(id)VALUES('${T}');INSERT INTO identity.identity_user(id)VALUES('${U}');INSERT INTO app.account(id,tenant_id,name)VALUES('${A}','${T}','Synthetic');INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role)VALUES('${M}','${T}','${A}','${U}','owner');CREATE ROLE uiwire12_login LOGIN PASSWORD 'synthetic' NOSUPERUSER NOBYPASSRLS;GRANT jobguard_runtime TO uiwire12_login;`);
 runtime=new Pool({host:"127.0.0.1",port,database:"postgres",user:"uiwire12_login",password:"synthetic",max:8});repo=new PracticeInvoiceRepository(runtime);
 legacy=await freshInvoice();legacyInput=command(legacy);legacyPayment=await repo.recordReceipt(context,legacyInput);legacyReverseCommand=randomUUID();
 legacyReversal=(await withTenant(runtime,context,db=>db.$client.query(`SELECT * FROM app.reverse_practice_customer_receipt($1,$2,$3,$4,$5,$6)`,[T,legacy.jobId,legacyPayment.paymentId,M,legacyReverseCommand,"Practice receipt correction"]))).rows[0].reversal_id;
 legacyHashes=(await admin.query(`SELECT command_id,request_hash,result FROM app.command_receipt WHERE command_id=ANY($1::uuid[]) ORDER BY command_id`,[[legacyInput.commandId,legacyReverseCommand]])).rows;
 await migrate(admin);
},60000);
afterAll(async()=>{await closeTestPools(runtime,admin);await pg?.stop();if(dir)await rm(dir,{recursive:true,force:true});});

describe("UIWIRE-12 customer receipts",()=>{
 it("upgrades without changing old command hashes and replays old receipts and reversals",async()=>{
  expect((await admin.query(`SELECT count(*)::int n FROM public.jobguard_schema_migration`)).rows[0].n).toBe(34);
  expect((await admin.query(`SELECT command_id,request_hash,result FROM app.command_receipt WHERE command_id=ANY($1::uuid[]) ORDER BY command_id`,[[legacyInput.commandId,legacyReverseCommand]])).rows).toEqual(legacyHashes);
  expect(await repo.recordReceipt(context,legacyInput)).toEqual(legacyPayment);
  expect(await repo.reverseReceipt(context,{...reversal(legacy,legacyPayment.paymentId),commandId:legacyReverseCommand})).toEqual({reversalId:legacyReversal});
  const view=await repo.receiptView(context,legacy.jobId,legacy.invoiceId);
  expect(view.receipts).toHaveLength(1);expect(view.receipts[0]!.reversal?.id).toBe(legacyReversal);expect(view.invoice.balancePence).toBe(132000);
 });
 it("projects partial, full and reversed receipts exactly without destroying history",async()=>{
  const f=await freshInvoice(),c=command(f),first=await repo.recordReceipt(context,c);
  expect(await repo.recordReceipt(context,c)).toEqual(first);
  expect((await repo.receiptView(context,f.jobId,f.invoiceId)).invoice).toMatchObject({balancePence:82000,customerCreditPence:0});
  const second=await repo.recordReceipt(context,{...command(f,82000),method:"cash",reference:"Second fictional payment"});
  expect((await repo.receiptView(context,f.jobId,f.invoiceId)).invoice.balancePence).toBe(0);
  await repo.reverseReceipt(context,reversal(f,second.paymentId));
  const reversed=await repo.receiptView(context,f.jobId,f.invoiceId);
  expect(reversed.invoice.balancePence).toBe(82000);expect(reversed.receipts).toHaveLength(2);
  expect(reversed.receipts.find(r=>r.id===second.paymentId)!.reversal).not.toBeNull();
  expect(reversed).toMatchObject({eligibleRecoveryPrincipalPence:0,baseCreditPence:0});
  await expect(withTenant(runtime,context,db=>db.$client.query(`UPDATE app.customer_payment SET qualifying_recovery_proof=true`))).rejects.toMatchObject({code:"42501"});
 });
 it("shows overpayment as customer credit, never negative debt or recovery eligibility",async()=>{
  const f=await freshInvoice();await repo.recordReceipt(context,command(f,140000));
  expect((await repo.receiptView(context,f.jobId,f.invoiceId)).invoice).toMatchObject({balancePence:0,customerCreditPence:8000});
  expect((await admin.query(`SELECT count(*)::int n FROM app.landing_allocation`)).rows[0].n).toBe(0);
  expect((await admin.query(`SELECT count(*)::int n FROM app.recovery_fee_journal`)).rows[0].n).toBe(0);
 });
 it("eight simultaneous retries return one payment, command and audit event",async()=>{
  const f=await freshInvoice(),c=command(f);
  const results=await Promise.all(Array.from({length:8},()=>repo.recordReceipt(context,c)));
  for(const result of results)expect(result).toEqual(results[0]);
  expect((await repo.receiptView(context,f.jobId,f.invoiceId)).receipts).toHaveLength(1);
  expect((await admin.query(`SELECT count(*)::int n FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2`,[T,c.commandId])).rows[0].n).toBe(1);
  expect((await admin.query(`SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND event_type='customer_payment.synthetic_recorded' AND payload->'references'->>'paymentId'=$2`,[T,results[0]!.paymentId])).rows[0].n).toBe(1);
 });
 it("concurrent changed-payload reuse conflicts and cannot record two payments",async()=>{
  const f=await freshInvoice(),c=command(f);
  const outcomes=await Promise.allSettled([repo.recordReceipt(context,c),repo.recordReceipt(context,{...c,amountPence:82000})]);
  expect(outcomes.filter(x=>x.status==="fulfilled")).toHaveLength(1);
  const rejected=outcomes.find(x=>x.status==="rejected") as PromiseRejectedResult;
  expect(rejected.reason).toMatchObject({code:"23505",message:"IDEMPOTENCY_PAYLOAD_CONFLICT"});
  expect((await repo.receiptView(context,f.jobId,f.invoiceId)).receipts).toHaveLength(1);
 });
 it("concurrent reversal retries return one reversal and one audit event",async()=>{
  const f=await freshInvoice(),p=await repo.recordReceipt(context,command(f)),c=reversal(f,p.paymentId);
  const results=await Promise.all(Array.from({length:6},()=>repo.reverseReceipt(context,c)));
  for(const result of results)expect(result).toEqual(results[0]);
  expect((await repo.receiptView(context,f.jobId,f.invoiceId)).invoice.balancePence).toBe(132000);
  expect((await admin.query(`SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND event_type='customer_payment.synthetic_reversed' AND payload->'references'->>'reversalId'=$2`,[T,results[0]!.reversalId])).rows[0].n).toBe(1);
  await expect(repo.reverseReceipt(context,{...c,reason:"Different correction"})).rejects.toMatchObject({code:"23505"});
  await expect(repo.reverseReceipt(context,{...c,commandId:randomUUID()})).rejects.toThrow("PAYMENT_ALREADY_REVERSED");
 });
 it("binds reversals to the exact invoice, including another invoice in the same job",async()=>{
  const f=await freshInvoice(),p=await repo.recordReceipt(context,command(f)),next=randomUUID();
  await admin.query(`INSERT INTO app.final_account_revision(id,tenant_id,job_id,final_account_draft_id,revision,previous_revision_id,source_hash,baseline_quote_version_id,currency,tax_policy_version,net_pence,tax_pence,total_pence,issue_blocked,findings)VALUES($1,$2,$3,$4,2,$5,$6,$7,'GBP','candidate_m1_standard_v1',100000,20000,120000,false,'[]')`,[next,T,f.jobId,f.draftId,f.revisionId,"c".repeat(64),f.quoteId]);
  await admin.query(`UPDATE app.final_account_draft SET revision=2,current_revision_id=$3 WHERE tenant_id=$1 AND id=$2`,[T,f.draftId,next]);
  const other=await repo.issue(context,{jobId:f.jobId,finalAccountRevisionId:next,actorMembershipId:M,commandId:randomUUID(),recipient:"practice@example.invalid",issuedOn:"2026-09-19"});
  await expect(repo.reverseReceipt(context,{...reversal(f,p.paymentId),invoiceId:other.id})).rejects.toThrow("PAYMENT_NOT_FOUND");
  expect((await repo.receiptView(context,f.jobId,f.invoiceId)).receipts[0]!.reversal).toBeNull();
  await expect(repo.recordReceipt(context,{...command(f),jobId:randomUUID()})).rejects.toThrow("INVOICE_NOT_FOUND");
  await expect(repo.receiptView({tenantId:randomUUID()} as VerifiedTenantContext,f.jobId,f.invoiceId)).rejects.toThrow("INVOICE_NOT_FOUND");
 });
 it("rechecks membership before replay, rather than trusting an old successful command",async()=>{
  const f=await freshInvoice(),c=command(f);await repo.recordReceipt(context,c);
  await admin.query(`UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2`,[T,M]);
  try{await expect(repo.recordReceipt(context,c)).rejects.toMatchObject({code:"42501"});}
  finally{await admin.query(`UPDATE app.membership SET revoked_at=NULL WHERE tenant_id=$1 AND id=$2`,[T,M]);}
 });
 it("does not let a different authorised owner claim another actor's idempotency key",async()=>{
  const f=await freshInvoice(),c=command(f);await repo.recordReceipt(context,c);
  const user=randomUUID(),member=randomUUID();
  await admin.query(`INSERT INTO identity.identity_user(id)VALUES($1)`,[user]);
  await admin.query(`INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role)VALUES($1,$2,$3,$4,'owner')`,[member,T,A,user]);
  await expect(repo.recordReceipt(context,{...c,actorMembershipId:member})).rejects.toMatchObject({code:"23505"});
 });
 it.each([{amountPence:null},{amountPence:0},{amountPence:1_000_000_000_001},{method:null},{method:"bank_confirmed"},{reference:null},{reference:" "},{reference:"x".repeat(121)},{paidOn:"infinity"},{paidOn:"-infinity"}])("rejects malformed direct SQL inputs %j",async extra=>{
  const f=await freshInvoice();await expect(rawRecord(command(f),extra)).rejects.toMatchObject({code:"22023"});
  expect((await repo.receiptView(context,f.jobId,f.invoiceId)).receipts).toEqual([]);
 });
 it("bounds cumulative active amounts instead of converting an overflowing numeric total",async()=>{
  const f=await freshInvoice();await repo.recordReceipt(context,command(f,1_000_000_000_000));
  await expect(repo.recordReceipt(context,command(f,1))).rejects.toThrow("RECEIPT_TOTAL_LIMIT");
  expect((await repo.receiptView(context,f.jobId,f.invoiceId)).invoice.paidPence).toBe(1_000_000_000_000);
 });
 it("reads balances and history from the same snapshot during concurrent writes",async()=>{
  const f=await freshInvoice();
  const writing=Promise.all(Array.from({length:8},()=>repo.recordReceipt(context,command(f,100))));
  const reads=await Promise.all(Array.from({length:12},()=>repo.receiptView(context,f.jobId,f.invoiceId)));
  await writing;
  for(const v of reads){const paid=v.receipts.filter(p=>!p.reversal).reduce((n,p)=>n+p.amountPence,0);expect(v.invoice.paidPence).toBe(paid);expect(v.invoice.balancePence).toBe(132000-paid);}
 });
 it("keeps old invoice-unbound SQL unavailable and never expands runtime table grants",async()=>{
  const f=await freshInvoice(),p=await repo.recordReceipt(context,command(f));
  await expect(withTenant(runtime,context,db=>db.$client.query(`SELECT * FROM app.reverse_practice_customer_receipt($1,$2,$3,$4,$5,$6)`,[T,f.jobId,p.paymentId,M,randomUUID(),"Old unsafe entrypoint"]))).rejects.toMatchObject({code:"42501"});
  const privileges=(await admin.query(`SELECT has_function_privilege('jobguard_runtime','app.reverse_practice_customer_receipt(uuid,uuid,uuid,uuid,uuid,uuid,text)','EXECUTE') bound,has_function_privilege('jobguard_runtime','app.reverse_practice_customer_receipt(uuid,uuid,uuid,uuid,uuid,text)','EXECUTE') unbound`)).rows[0];
  expect(privileges).toEqual({bound:true,unbound:false});
  for(const table of ["customer_payment","customer_payment_reversal"])for(const action of ["UPDATE","DELETE","TRUNCATE"]){
   expect((await admin.query(`SELECT has_table_privilege('jobguard_runtime',$1,$2) allowed`,[`app.${table}`,action])).rows[0].allowed).toBe(false);
  }
 });
});
