import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Pool } from "pg";
import { expect, it } from "vitest";
import { CustomerBillingCommandService } from "../src/customer-billing-repository.js";
import { FinalAccountCommandService } from "../src/final-account-repository.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { loadReviewedInventory } from "./lp-0-catalog.js";
const read=(path:string)=>readFileSync(new URL(path,import.meta.url),"utf8");

it("refuses actor substitution before legacy receipt replay or final-account access",async()=>{
 const tenant=randomUUID(),actor=randomUUID(),peer=randomUUID(),job=randomUUID(),queries:string[]=[];
 const context=testTenantContext(tenant,{membershipId:actor});
 const pool={connect:async()=>({release(){},query:async(sql:string)=>{
  queries.push(sql);
  if(sql.includes("app.current_actor() actor"))return{rows:[{actor:peer,tenant}]};
  return{rows:[{role:"owner"}]};
 }})} as unknown as Pool;
 const billing=new CustomerBillingCommandService(pool);
 await expect(billing.recordPayment(context,{version:"customer-payment.record.v1",commandId:randomUUID(),actorMembershipId:actor,jobId:job,invoiceId:randomUUID(),paidOn:"2026-11-10",amountPence:1,currency:"GBP",method:"bank_transfer",reference:"fictional",builderAttestsReceived:true})).rejects.toThrow("FORBIDDEN");
 await expect(billing.reversePayment(context,{version:"customer-payment.reverse.v1",commandId:randomUUID(),actorMembershipId:actor,jobId:job,paymentId:randomUUID(),reason:"fictional"})).rejects.toThrow("FORBIDDEN");
 await expect(new FinalAccountCommandService(pool).assemble(context,{version:"final-account.assemble.v1",commandId:randomUUID(),actorMembershipId:actor,jobId:job})).rejects.toThrow("FORBIDDEN");
 expect(queries.join("\n")).not.toMatch(/FROM app\.(?:command_receipt|customer_payment|final_account_draft)/u);
});

it("routes every legacy billing mutation through checked SQL and keeps restore on issued identity",()=>{
 const source=read("../src/customer-billing-repository.ts"),restore=read("../tools/synthetic-restore.mjs");
 expect(source).not.toMatch(/INSERT INTO app\.customer_(?:invoice|credit_note|payment|payment_reversal)/u);
 for(const name of ["issue_approved_customer_invoice","issue_approved_customer_credit","record_practice_customer_receipt","reverse_practice_customer_receipt"])expect(source).toContain(`app.${name}(`);
 expect(restore).toContain('kind: "real", credential: sessionCredential');
 expect(restore).toContain('INSERT INTO identity.session');
 for(const call of ['locks.lock(','checksRepository.begin(','checksRepository.record(','checksRepository.reconcile(','invoices.issue('])expect(restore).toContain(call);
 expect(restore).not.toContain('billing.issue(');
});

it("binds legacy artifact inputs to the claim without expanding the LP-5 effect adapter allowlist",()=>{
 const sql=read("../migrations/0980_lp8a_billing_revokes.sql");
 expect(sql).not.toContain('app.lp5_bind_effect(');
 expect(sql.match(/right\(c->>'semanticKey',69\)/gu)).toHaveLength(2);
 expect(sql).toContain('c.transaction_id IS DISTINCT FROM pg_current_xact_id()');
 expect(sql).toContain("resolution.resolution='approved'");
 expect(sql).toContain('grant_row.revoked_at IS NULL');
 expect(sql).toContain('candidate.previous_revision_id IS DISTINCT FROM head.current_revision_id');
 expect(sql).toContain("e.kind<>'original'");
 expect(sql).toContain("u.state IS DISTINCT FROM 'verified'");
 expect(sql).not.toMatch(/ALTER TABLE app\.customer_invoice|GRANT (?:INSERT|UPDATE|DELETE)/u);
});

it("retires direct billing and number reservation capability expectations",async()=>{
 const {inventory}=await loadReviewedInventory();
 for(const entry of inventory.entries){
  expect(entry.key).not.toMatch(/^acl\|rel\|table\|app\.customer_(?:invoice|invoice_evidence|credit_note|payment|payment_reversal|invoice_sequence|credit_note_sequence)\|jobguard_runtime\|INSERT\|/u);
  expect(entry.key).not.toContain('function:app.reserve_customer_invoice_number(uuid)|jobguard_runtime|EXECUTE');
 }
 expect(inventory.recorded.routines.find(r=>r.identity==='function:app.advance_final_account_draft(uuid,uuid,uuid,integer)')?.staticCalls).toContain('app.current_actor');
});

it("keeps the original command digest for completed historical invoice retries and checks their metadata",async()=>{
 const tenant=randomUUID(),actor=randomUUID(),job=randomUUID(),revision=randomUUID(),invoice=randomUUID(),semanticKey=`invoice:${revision}`;
 const issuer={legalName:"Fictional builder",address:"Fictional street",vatNumber:null},result={invoiceId:invoice,invoiceNumber:"SYN-2026-000001",pdfSha256:"a".repeat(64),synthetic:true,reused:false};
 const context=testTenantContext(tenant,{membershipId:actor});let replays=0;
 const pool={connect:async()=>({release(){},query:async(sql:string,values:unknown[]=[])=>{
  if(sql.includes("app.current_actor() actor"))return{rows:[{actor,tenant}]};
  if(sql.startsWith("SELECT semantic_key"))return{rows:[{semantic_key:semanticKey}]};
  if(sql.startsWith("SELECT app.begin_command(")){
   expect(values[3]).toBe(semanticKey);
   expect(JSON.parse(values[6] as string).semanticKey).toBe(semanticKey);
   replays++;return{rows:[{result:{kind:"replay",result}}]};
  }
  if(sql.includes("to_char(issued_on"))return{rows:[{final_account_revision_id:revision,issued_on:"2026-11-10",issuer_details:issuer}]};
  if(sql.includes("issue_approved_customer_invoice"))throw new Error("Replay attempted invoice mutation");
  return{rows:[{role:"owner"}]};
 }})} as unknown as Pool;
 const raw={version:"customer-invoice.issue.v1",finalAccountRevisionId:revision,issuedOn:"2026-11-10",issuer,command:{version:"command.v1",commandId:randomUUID(),commandType:"customer_invoice.issue",semanticKey,actorMembershipId:actor,subjectType:"job",subjectRef:job,action:{actionType:"final_account.issue",recipient:null,contentHash:"a".repeat(64),aggregateRevision:1,amountPence:12000,currency:"GBP",policyVersion:"candidate_m1_standard_v1",expiresAt:new Date(Date.now()+300000)}}};
 const service=new CustomerBillingCommandService(pool);
 expect(await service.issue(context,raw)).toEqual(result);
 await expect(service.issue(context,{...raw,issuer:{...issuer,address:"Changed"}})).rejects.toThrow("COMMAND_CONFLICT");
 expect(replays).toBe(2);
});

it("keeps privileged locks before audit without exposing runtime job UPDATE",()=>{
 const source=read("../src/customer-billing-repository.ts"),sql=read("../migrations/0980_lp8a_billing_revokes.sql");
 expect(source).toContain('SELECT app.lock_customer_invoice_issue($1)');
 expect(source).not.toMatch(/FROM app\.job[^"`]*FOR UPDATE/u);
 const lock=sql.split('CREATE FUNCTION app.lock_customer_invoice_issue(')[1]!.split('END $$;')[0]!;
 expect(lock.indexOf('app.current_actor()')).toBeLessThan(lock.indexOf('FOR UPDATE'));
 expect(lock.indexOf('final_check_require_invoice_actor')).toBeLessThan(lock.indexOf('FOR UPDATE'));
 expect(lock.indexOf('FOR UPDATE')).toBeLessThan(lock.indexOf('pg_advisory_xact_lock'));
 const grant=sql.indexOf('GRANT CREATE ON SCHEMA app TO jobguard_command_writer;');
 const transfer=sql.indexOf('ALTER FUNCTION app.lp8a_billing_command(uuid,text) OWNER');
 expect(grant).toBeLessThan(transfer);
 expect(sql.indexOf('REVOKE CREATE ON SCHEMA app FROM jobguard_command_writer;')).toBeGreaterThan(transfer);
 const restore=read("../tools/synthetic-restore.mjs");
 expect(restore.indexOf('INSERT INTO app.membership')).toBeLessThan(restore.indexOf('INSERT INTO identity.membership_locator'));
});
