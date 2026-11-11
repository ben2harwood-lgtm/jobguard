import { readFile } from "node:fs/promises";
import { proofSchema } from "./migration-proof-loader.js";
import { MIGRATION_URLS, migrate } from "../src/migrate.js";
import { allocateSignedInvoiceTax, candidateM1TaxPolicy, money } from "@jobguard/core";
import { withTenant } from "../src/tenant-context.js";
import { publishEmptyCompletion, createHistoricalInvoice } from "./sv5pre-fixtures.js";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FinalAccountLockRepository } from "../src/final-account-lock-repository.js";
import { PracticeInvoiceRepository } from "../src/practice-invoice-repository.js";
import { createLockFixture, closeLockFixture, seedAccount, prepareLock, asFixtureTenant, lockRow, LOCK_OWNER, LOCK_HASH, type LockFixture } from "./final-account-lock.integration.test.js";

type Account=Awaited<ReturnType<typeof seedAccount>>;
const invoiceInput=(a:Account,invoiceKind:'final'|'supplementary'='final')=>({jobId:a.jobId,actorMembershipId:LOCK_OWNER,commandId:randomUUID(),finalAccountRevisionId:a.revisionId,expectedSourceHash:LOCK_HASH,invoiceKind,recipient:'practice-customer@example.invalid',issuedOn:'2026-10-12'});
async function appendCheck(f:LockFixture,a:Account,status:'pending'|'failed'|'completed',overrides:{lockId?:string;cutoff?:string;jobId?:string}={}){
 const row=(await f.admin.query("SELECT id,locked_at::text cutoff FROM app.final_account_lock WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId])).rows[0];
 if(status==='completed' && Object.keys(overrides).length===0) return publishEmptyCompletion(f,a);
 const id=randomUUID();await asFixtureTenant(f.shadow,a.tenantId,db=>db.query("INSERT INTO app.final_account_lock_check(tenant_id,job_id,id,lock_id,evidence_cutoff_at,status) VALUES($1,$2,$3,$4,$5::timestamptz,$6)",[a.tenantId,overrides.jobId??a.jobId,id,overrides.lockId??row.id,overrides.cutoff??row.cutoff,status]));return id;
}
describe("SV-4 DW7 lock-bound final and supplementary issue",()=>{
 let f:LockFixture;
 beforeAll(async()=>{f=await createLockFixture()},60000);afterAll(async()=>closeLockFixture(f));
 let historical:Awaited<ReturnType<typeof createHistoricalInvoice>>;
 beforeAll(async()=>{historical=await createHistoricalInvoice()},60000);
 afterAll(async()=>{if(historical)await historical.close()});
 const direct=(a:Account,input:ReturnType<typeof invoiceInput>)=>withTenant(f.runtime,a.context,db=>db.$client.query("SELECT app.issue_lock_bound_customer_invoice($1,$2,$3,$4,$5,$6,$7,$8::date,$9)",[a.tenantId,input.jobId,input.finalAccountRevisionId,input.actorMembershipId,input.commandId,input.invoiceKind,input.recipient,input.issuedOn,input.expectedSourceHash]));

 // Synthetic owner fixture edits precede the immutable lock. Runtime authority
 // and production writers are exercised unchanged by every issue below.
 async function signedAccount(nets:number[]){
  const a=await seedAccount(f.admin,randomUUID(),nets.reduce((sum,n)=>sum+n,0));
  await asFixtureTenant(f.admin,a.tenantId,async db=>{
   await db.query("SET LOCAL session_replication_role='replica'");
   await db.query("UPDATE app.final_account_line SET net_pence=$1 WHERE tenant_id=$2 AND id=$3",[nets[0],a.tenantId,a.lineId]);
   for(const [index,net]of nets.entries())if(index>0){
    const source=randomUUID();
    await db.query(`INSERT INTO app.final_account_line(id,tenant_id,job_id,final_account_revision_id,line_kind,source_id,scope_item_id,commercial_revision_id,description,net_pence,ordinal)
     SELECT $1,tenant_id,job_id,final_account_revision_id,'baseline',$2,scope_item_id,$2,'Fictional signed line',$3,$4 FROM app.final_account_line WHERE tenant_id=$5 AND id=$6`,[randomUUID(),source,net,index+1,a.tenantId,a.lineId]);
   }
  });
  const repo=await prepareLock(f,a);await repo.lock(a.context,a.input);await appendCheck(f,a,'completed');
  return {a,repo};
 }
 async function descendant(a:Account,added:number[]=[]){
  const revision=randomUUID(),hash='c'.repeat(64);
  await asFixtureTenant(f.admin,a.tenantId,async db=>{
   await db.query("SET LOCAL session_replication_role='replica'");
   const delta=added.reduce((sum,n)=>sum+n,0);
   await db.query(`INSERT INTO app.final_account_revision(id,tenant_id,job_id,final_account_draft_id,revision,previous_revision_id,source_hash,baseline_quote_version_id,currency,tax_policy_version,net_pence,tax_pence,total_pence,issue_blocked,findings)
    SELECT $1,tenant_id,job_id,final_account_draft_id,2,id,$2,baseline_quote_version_id,currency,tax_policy_version,net_pence+$3,(net_pence+$3+2)/5,net_pence+$3+(net_pence+$3+2)/5,false,findings FROM app.final_account_revision WHERE tenant_id=$4 AND id=$5`,[revision,hash,delta,a.tenantId,a.revisionId]);
   await db.query(`INSERT INTO app.final_account_line(id,tenant_id,job_id,final_account_revision_id,line_kind,source_id,scope_item_id,commercial_revision_id,approval_id,description,net_pence,ordinal)
    SELECT gen_random_uuid(),tenant_id,job_id,$1,line_kind,source_id,scope_item_id,commercial_revision_id,approval_id,description,net_pence,ordinal FROM app.final_account_line WHERE tenant_id=$2 AND final_account_revision_id=$3`,[revision,a.tenantId,a.revisionId]);
   for(const [index,net]of added.entries()){
    const source=randomUUID();
    // Product variation lines always carry their approval (final-account-repository.ts);
    // omission variations are negative (core variation.ts), so signed nets are reachable.
    await db.query(`INSERT INTO app.final_account_line(id,tenant_id,job_id,final_account_revision_id,line_kind,source_id,scope_item_id,commercial_revision_id,approval_id,description,net_pence,ordinal)
     VALUES($1,$2,$3,$4,'variation',$5,$6,$5,$9,'Fictional supplementary line',$7,$8)`,[randomUUID(),a.tenantId,a.jobId,revision,source,a.scopeItemId,net,index+2,randomUUID()]);
   }
   await db.query("UPDATE app.final_account_draft SET current_revision_id=$1,revision=2 WHERE tenant_id=$2 AND id=$3",[revision,a.tenantId,a.draftId]);
  });return {revision,hash};
 }
 async function stored(a:Account,id:string){
  return (await f.admin.query(`SELECT l.final_account_line_id id,l.net_pence,l.tax_pence,l.gross_pence FROM app.final_account_invoiced_line l
   JOIN app.final_account_line source ON(source.tenant_id,source.id)=(l.tenant_id,l.final_account_line_id) WHERE l.tenant_id=$1 AND l.invoice_id=$2 ORDER BY source.ordinal`,[a.tenantId,id])).rows;
 }
 it("combined invoice preserves credit VAT sign and exact totals",async()=>{
  const {a,repo}=await signedAccount([1000,-500]),next=await descendant(a);
  const input={...invoiceInput(a),finalAccountRevisionId:next.revision,expectedSourceHash:next.hash};
  const first=await repo.issueInvoice(a.context,input);
  expect(first).toMatchObject({netPence:500,taxPence:100,totalPence:600,sourceHash:next.hash});
  const lines=await stored(a,first.invoiceId);
  expect(lines.map(l=>[l.net_pence,l.tax_pence,l.gross_pence])).toEqual([["1000","200","1200"],["-500","-100","-600"]]);
  expect((await f.admin.query(`SELECT i.net_pence,i.tax_pence,i.total_pence,b.revision_id,b.lock_id FROM app.customer_invoice i
   JOIN app.final_account_invoice_binding b ON(b.tenant_id,b.job_id,b.invoice_id)=(i.tenant_id,i.job_id,i.id) WHERE i.tenant_id=$1 AND i.id=$2`,[a.tenantId,first.invoiceId])).rows).toEqual([{net_pence:'500',tax_pence:'100',total_pence:'600',revision_id:next.revision,lock_id:first.lockId}]);
  expect((await lockRow(f,a.tenantId,a.jobId)).final_account_revision_id).toBe(a.revisionId);
  expect(await repo.issueInvoice(a.context,input)).toEqual(first);
  expect((await direct(a,input)).rows[0].issue_lock_bound_customer_invoice).toEqual(first);
  expect(await stored(a,first.invoiceId)).toEqual(lines);
  const pdf=(await f.admin.query("SELECT convert_from(pdf_bytes,'UTF8') pdf FROM app.customer_invoice WHERE tenant_id=$1 AND id=$2",[a.tenantId,first.invoiceId])).rows[0].pdf;
  expect(pdf).toContain('Net GBP: -5.00');expect(pdf).toContain('Total GBP: 6.00');
  await expect(direct(a,{...input,expectedSourceHash:LOCK_HASH})).rejects.toThrow('IDEMPOTENCY_PAYLOAD_CONFLICT');
  await expect(repo.issueInvoice(a.context,{...input,commandId:randomUUID(),expectedSourceHash:LOCK_HASH})).rejects.toThrow('STALE_REVISION');
  await expect(direct(a,{...input,jobId:randomUUID()})).rejects.toThrow('FORBIDDEN');
  const foreign=await seedAccount(f.admin);
  await expect(direct(foreign,input)).rejects.toThrow();
 });
 it.each([[1000,-500],[7,-1,-1,-1,-1],[4,4,-5,0],[1001,502],[1000,-1000],[0,0]])("SQL and independent verification agree for signed final and supplementary lines %j",async(...nets)=>{
  for(const kind of ['final','supplementary']as const){
   const {a,repo}=await signedAccount(kind==='final'?nets:[10]);
   let input=invoiceInput(a,kind);
   if(kind==='supplementary'){
    await repo.issueInvoice(a.context,invoiceInput(a));const next=await descendant(a,nets);
    input={...input,finalAccountRevisionId:next.revision,expectedSourceHash:next.hash};
   }
   const first=(await direct(a,input)).rows[0].issue_lock_bound_customer_invoice;
   expect(await repo.issueInvoice(a.context,input)).toEqual(first);
   const lines=await stored(a,first.invoiceId),tax=candidateM1TaxPolicy.calculateGroup(money(nets.reduce((sum,n)=>sum+n,0)),"standard_rate_20");
   const split=allocateSignedInvoiceTax(tax,lines.map(l=>({id:l.id,net:money(Number(l.net_pence))})));
   expect(lines.map(l=>Number(l.net_pence))).toEqual(nets);
   expect(lines.map(l=>Number(l.tax_pence))).toEqual(lines.map(l=>split.get(l.id)!.pence));
   expect(lines.reduce((sum,l)=>sum+Number(l.tax_pence),0)).toBe(first.taxPence);
   for(const line of lines)expect(Number(line.gross_pence)).toBe(Number(line.net_pence)+Number(line.tax_pence));
   await expect(direct(a,{...input,recipient:'changed@example.invalid'})).rejects.toThrow('IDEMPOTENCY_PAYLOAD_CONFLICT');
   await f.admin.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2",[a.tenantId,LOCK_OWNER]);
   await expect(direct(a,input)).rejects.toThrow('FORBIDDEN');
   await expect(repo.issueInvoice(a.context,input)).rejects.toMatchObject({code:'FORBIDDEN'});
  }
 });
 it("upgrade preserves actual routine owner/ACL and immutable historical invoice replay",async()=>{
  const forward=MIGRATION_URLS.find(u=>u.pathname.endsWith('_combined_invoice_signed_vat.sql'))!;
  const predecessor=await readFile(new URL('../migrations/0723_lp6c_money_binding.sql',import.meta.url),'utf8');
  const start=predecessor.indexOf('CREATE OR REPLACE FUNCTION app.issue_lock_bound_customer_invoice');
  const oldRoutine=predecessor.slice(start,predecessor.indexOf('END $$;',start)+7);
  const catalog=async()=>(await f.admin.query(`SELECT pg_get_userbyid(proowner) owner,proacl::text,prosecdef,proconfig,has_function_privilege('jobguard_runtime',oid,'EXECUTE') runtime_execute,EXISTS(SELECT 1 FROM aclexplode(coalesce(proacl,acldefault('f',proowner))) acl WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE') public_execute FROM pg_proc WHERE oid='app.issue_lock_bound_customer_invoice(uuid,uuid,uuid,uuid,uuid,text,text,date,text)'::regprocedure`)).rows;
  const before=await catalog();expect(before[0]).toMatchObject({owner:'jobguard_migration',prosecdef:true,proconfig:['search_path=pg_catalog, app'],runtime_execute:true,public_execute:false});let a:Account|undefined,input:ReturnType<typeof invoiceInput>|undefined,first:any,history:any,historyLines:any;
  try{
   await f.admin.query(oldRoutine);
   ({a}=await signedAccount([1000,-500]));input=invoiceInput(a);
   await expect(new FinalAccountLockRepository(f.runtime).issueInvoice(a.context,input)).rejects.toThrow('INVOICE_AMOUNT_INVALID');
   expect((await f.admin.query('SELECT count(*)::int n FROM app.customer_invoice WHERE tenant_id=$1',[a.tenantId])).rows[0].n).toBe(0);
   first=(await direct(a,input)).rows[0].issue_lock_bound_customer_invoice;
   // The installed predecessor actually persists the defect; no source-text proxy.
   expect((await stored(a,first.invoiceId)).map(l=>l.tax_pence)).toEqual(['67','33']);
   expect((await stored(a,first.invoiceId)).map(l=>l.tax_pence)).not.toEqual(['200','-100']);
   historyLines=await stored(a,first.invoiceId);
   history=(await f.admin.query("SELECT row_to_json(i) invoice FROM app.customer_invoice i WHERE tenant_id=$1 AND id=$2",[a.tenantId,first.invoiceId])).rows;
  }finally{await f.admin.query(await readFile(forward,'utf8'))}
  expect(await catalog()).toEqual(before);
  expect((await f.admin.query("SELECT row_to_json(i) invoice FROM app.customer_invoice i WHERE tenant_id=$1 AND id=$2",[a!.tenantId,first.invoiceId])).rows).toEqual(history);
  expect((await direct(a!,input!)).rows[0].issue_lock_bound_customer_invoice).toEqual(first);
  expect(await new FinalAccountLockRepository(f.runtime).issueInvoice(a!.context,input!)).toEqual(first);
  expect(await stored(a!,first.invoiceId)).toEqual(historyLines);
  await migrate(f.admin);expect(await catalog()).toEqual(before);
 });
 it("missing lock, no completion, pending and failed are typed repository/routine refusals with no invoice effects",async()=>{
  const a=await seedAccount(f.admin),repo=new FinalAccountLockRepository(f.runtime);
  for(const kind of ['final','supplementary']as const){const input=invoiceInput(a,kind);await expect(repo.issueInvoice(a.context,input)).rejects.toMatchObject({code:'FINAL_ACCOUNT_LOCK_REQUIRED'});await expect(direct(a,input)).rejects.toThrow('FINAL_ACCOUNT_LOCK_REQUIRED');}
  await prepareLock(f,a);await repo.lock(a.context,a.input);
  for(const [state,code]of [[null,'FINAL_CHECK_NOT_COMPLETE'],['pending','FINAL_CHECK_NOT_COMPLETE'],['failed','FINAL_CHECK_FAILED']]as const){
   if(state)await appendCheck(f,a,state);
   for(const kind of ['final','supplementary']as const){const input=invoiceInput(a,kind);await expect(repo.issueInvoice(a.context,input)).rejects.toMatchObject({code});await expect(direct(a,input)).rejects.toThrow(code);}
  }
  expect((await f.admin.query("SELECT count(*)::int n FROM app.customer_invoice WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId])).rows[0].n).toBe(0);
 });
 it("completion is bound to exact lock and microsecond cutoff; wrong-job and wrong-cutoff facts cannot authorize",async()=>{
  const a=await seedAccount(f.admin),b=await seedAccount(f.admin,a.tenantId);for(const job of [a,b]){const repo=await prepareLock(f,job);await repo.lock(job.context,job.input)}
  const bLock=await lockRow(f,b.tenantId,b.jobId);
  await expect(appendCheck(f,a,'completed',{lockId:bLock.id})).rejects.toMatchObject({code:'23503'});
  const cutoff=(await f.admin.query("SELECT (locked_at+interval '1 microsecond')::text cutoff FROM app.final_account_lock WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId])).rows[0].cutoff;
  await expect(appendCheck(f,a,'completed',{cutoff})).rejects.toMatchObject({code:'23503'});
  await appendCheck(f,b,'completed');const repo=new FinalAccountLockRepository(f.runtime),input=invoiceInput(a);
  await expect(repo.issueInvoice(a.context,input)).rejects.toMatchObject({code:'FINAL_CHECK_NOT_COMPLETE'});await expect(direct(a,input)).rejects.toThrow('FINAL_CHECK_NOT_COMPLETE');
 });
 it("F7 main £40,320 and supplementary £960 bind exact source lines, replay once and never rebill the baseline",async()=>{
  const a=await seedAccount(f.admin),repo=await prepareLock(f,a);await repo.lock(a.context,a.input);const check=await appendCheck(f,a,'completed');
  const input=invoiceInput(a),first=await repo.issueInvoice(a.context,input);expect(await repo.issueInvoice(a.context,input)).toEqual(first);
  const main=(await f.admin.query("SELECT * FROM app.customer_invoice WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId])).rows[0];expect([Number(main.net_pence),Number(main.tax_pence),Number(main.total_pence)]).toEqual([3360000,672000,4032000]);
  const parties=(await asFixtureTenant(f.admin,a.tenantId,db=>db.query("SELECT app.require_current_job_parties($1,$2) snapshot",[a.tenantId,a.jobId]))).rows[0].snapshot;
  expect({issuer_details:main.issuer_details,parties_snapshot:main.parties_snapshot},"F7 builder issuer and trigger-populated party snapshot").toEqual({issuer_details:{legalName:'Fictional Builder Ltd',runIdentity:a.tenantId},parties_snapshot:parties});
  const revision=randomUUID(),scope=randomUUID(),line=randomUUID(),source=randomUUID(),commercial=randomUUID(),hash='b'.repeat(64);
  await asFixtureTenant(f.admin,a.tenantId,async db=>{
   await db.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')",[scope,a.tenantId,a.jobId]);
   await db.query("INSERT INTO app.final_account_revision(id,tenant_id,job_id,final_account_draft_id,revision,previous_revision_id,source_hash,baseline_quote_version_id,currency,tax_policy_version,net_pence,tax_pence,total_pence,issue_blocked,findings,created_at) SELECT $1,tenant_id,job_id,final_account_draft_id,2,id,$2,baseline_quote_version_id,currency,tax_policy_version,3440000,688000,4128000,false,findings,clock_timestamp() FROM app.final_account_revision WHERE tenant_id=$3 AND id=$4",[revision,hash,a.tenantId,a.revisionId]);
   await db.query("INSERT INTO app.final_account_line(id,tenant_id,job_id,final_account_revision_id,line_kind,source_id,scope_item_id,commercial_revision_id,approval_id,description,net_pence,ordinal) SELECT gen_random_uuid(),tenant_id,job_id,$1,line_kind,source_id,scope_item_id,commercial_revision_id,approval_id,description,net_pence,ordinal FROM app.final_account_line WHERE tenant_id=$2 AND final_account_revision_id=$3",[revision,a.tenantId,a.revisionId]);
   await db.query("INSERT INTO app.final_account_line(id,tenant_id,job_id,final_account_revision_id,line_kind,source_id,scope_item_id,commercial_revision_id,approval_id,description,net_pence,ordinal) VALUES($1,$2,$3,$4,'variation',$5,$6,$7,$8,'Synthetic fixture catch line',80000,2)",[line,a.tenantId,a.jobId,revision,source,scope,commercial,randomUUID()]);
   await db.query("UPDATE app.final_account_draft SET current_revision_id=$1,revision=2 WHERE tenant_id=$2 AND id=$3",[revision,a.tenantId,a.draftId]);
  });
  const supplemental=await repo.issueInvoice(a.context,{...invoiceInput(a,'supplementary'),finalAccountRevisionId:revision,expectedSourceHash:hash});
  const invoices=(await f.admin.query("SELECT i.id,i.net_pence,i.tax_pence,i.total_pence,b.invoice_kind,b.check_id FROM app.customer_invoice i JOIN app.final_account_invoice_binding b ON(b.tenant_id,b.job_id,b.invoice_id)=(i.tenant_id,i.job_id,i.id) WHERE i.tenant_id=$1 AND i.job_id=$2 ORDER BY i.created_at,i.id",[a.tenantId,a.jobId])).rows;
  expect(invoices).toHaveLength(2);const supplementary=invoices.find(i=>i.invoice_kind==='supplementary')!;
  expect([Number(supplementary.net_pence),Number(supplementary.tax_pence),Number(supplementary.total_pence)]).toEqual([80000,16000,96000]);expect(supplementary.check_id).toBe(check);
  expect((await f.admin.query("SELECT final_account_line_id,net_pence FROM app.final_account_invoiced_line WHERE tenant_id=$1 AND invoice_id=$2",[a.tenantId,supplementary.id])).rows).toEqual([{final_account_line_id:line,net_pence:'80000'}]);
  expect(supplemental).toBeDefined();
 });
 it("LP-5 lock invoice binds its checked lifecycle, conflicts and revoked-member replay",async()=>{
  const a=await seedAccount(f.admin),repo=await prepareLock(f,a);await repo.lock(a.context,a.input);await appendCheck(f,a,'completed');
  const input=invoiceInput(a),first=await repo.issueInvoice(a.context,input);expect(await repo.issueInvoice(a.context,input)).toEqual(first);
  const lifecycle=(await f.admin.query("SELECT c.version,c.outcome,r.status,r.result FROM app.command_lifecycle_claim c JOIN app.command_receipt r USING(tenant_id,command_id) WHERE c.tenant_id=$1 AND c.command_id=$2",[a.tenantId,input.commandId])).rows;
  expect(lifecycle).toEqual([{version:'repository-command.v1',outcome:{},status:'succeeded',result:first}]);
  await expect(repo.issueInvoice(a.context,{...input,recipient:'other-fictional@example.invalid'})).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
  await expect(direct(a,{...input,recipient:'other-fictional@example.invalid'})).rejects.toThrow('IDEMPOTENCY_PAYLOAD_CONFLICT');
  const invoiceCount=(await f.admin.query("SELECT count(*)::int n FROM app.customer_invoice WHERE tenant_id=$1",[a.tenantId])).rows[0].n;
  await f.admin.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2",[a.tenantId,LOCK_OWNER]);
  await expect(repo.issueInvoice(a.context,input)).rejects.toMatchObject({code:'FORBIDDEN'});
  expect((await f.admin.query("SELECT count(*)::int n FROM app.customer_invoice WHERE tenant_id=$1",[a.tenantId])).rows[0].n).toBe(invoiceCount);
 });
 it("latest append-only check fact overrides an older completion; shadow cannot read or rewrite checks",async()=>{
  const a=await seedAccount(f.admin),repo=await prepareLock(f,a);await repo.lock(a.context,a.input);
  await appendCheck(f,a,'completed');await appendCheck(f,a,'failed');
  expect((await repo.read(a.context,a.jobId)).checkStatus).toBe('failed');
  await expect(repo.issueInvoice(a.context,invoiceInput(a))).rejects.toMatchObject({code:'FINAL_CHECK_FAILED'});
  await expect(asFixtureTenant(f.shadow,a.tenantId,db=>db.query("SELECT * FROM app.final_account_lock_check"))).rejects.toMatchObject({code:'42501'});
  await expect(asFixtureTenant(f.shadow,a.tenantId,db=>db.query("UPDATE app.final_account_lock_check SET status='completed'"))).rejects.toMatchObject({code:'42501'});
  await expect(asFixtureTenant(f.runtime,a.tenantId,db=>db.query("INSERT INTO app.final_account_lock_check(tenant_id,job_id,id,lock_id,evidence_cutoff_at,status) SELECT tenant_id,job_id,gen_random_uuid(),id,locked_at,'completed' FROM app.final_account_lock WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId]))).rejects.toMatchObject({code:'42501'});
 });
 it("tenant and job-qualified invoice and line bindings reject cross-job references",async()=>{
  const a=await seedAccount(f.admin),b=await seedAccount(f.admin,a.tenantId),repo=await prepareLock(f,a);await repo.lock(a.context,a.input);await appendCheck(f,a,'completed');await repo.issueInvoice(a.context,invoiceInput(a));
  const invoice=(await f.admin.query("SELECT id FROM app.customer_invoice WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId])).rows[0].id;
  await expect(asFixtureTenant(f.admin,a.tenantId,db=>db.query("INSERT INTO app.final_account_invoice_binding(tenant_id,job_id,invoice_id,invoice_kind,revision_id) VALUES($1,$2,$3,'interim',$4)",[a.tenantId,b.jobId,invoice,b.revisionId]))).rejects.toMatchObject({code:'23503'});
  await expect(asFixtureTenant(f.admin,a.tenantId,db=>db.query("INSERT INTO app.final_account_invoiced_line(tenant_id,job_id,invoice_id,final_account_line_id,revision_id,scope_item_id,commercial_revision_id,line_kind,source_id,net_pence,tax_pence,gross_pence) VALUES($1,$2,$3,$4,$5,$6,$7,'baseline',$7,3360000,672000,4032000)",[a.tenantId,a.jobId,invoice,b.lineId,a.revisionId,b.scopeItemId,b.baselineId]))).rejects.toMatchObject({code:'23514'});
 });
 it("completion and issue race yields one guarded invoice or a refusal, never an invoice lacking its completion fact",async()=>{
  const a=await seedAccount(f.admin),repo=await prepareLock(f,a);await repo.lock(a.context,a.input);
  const results=await Promise.allSettled([appendCheck(f,a,'completed'),repo.issueInvoice(a.context,invoiceInput(a))]);expect(results[0].status).toBe('fulfilled');
  if(results[1].status==='rejected')expect(results[1].reason).toMatchObject({code:'FINAL_CHECK_NOT_COMPLETE'});
  const rows=(await f.admin.query("SELECT i.id,c.status,c.lock_id,l.id actual_lock,c.evidence_cutoff_at=l.locked_at exact_cutoff FROM app.customer_invoice i JOIN app.final_account_invoice_binding b ON(b.tenant_id,b.job_id,b.invoice_id)=(i.tenant_id,i.job_id,i.id) JOIN app.final_account_lock_check c ON(c.tenant_id,c.job_id,c.id)=(b.tenant_id,b.job_id,b.check_id) JOIN app.final_account_lock l ON(l.tenant_id,l.job_id,l.id)=(b.tenant_id,b.job_id,b.lock_id) WHERE i.tenant_id=$1 AND i.job_id=$2",[a.tenantId,a.jobId])).rows;
  expect(rows.length).toBeLessThanOrEqual(1);for(const row of rows){expect(row.status).toBe('completed');expect(row.lock_id).toBe(row.actual_lock);expect(row.exact_cutoff).toBe(true)}
 });
 it.each(['pending','failed']as const)("a concurrent %s fact never permits either invoice kind",async status=>{
  for(const kind of ['final','supplementary']as const){
   const a=await seedAccount(f.admin),repo=await prepareLock(f,a);await repo.lock(a.context,a.input);
   const results=await Promise.allSettled([appendCheck(f,a,status),repo.issueInvoice(a.context,invoiceInput(a,kind))]);
   expect(results[0].status).toBe('fulfilled');expect(results[1].status).toBe('rejected');
   if(results[1].status==='rejected')expect(['FINAL_CHECK_NOT_COMPLETE','FINAL_CHECK_FAILED']).toContain(results[1].reason.code);
   expect((await f.admin.query("SELECT count(*)::int n FROM app.customer_invoice WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId])).rows[0].n).toBe(0);
  }
 });
 it("Q1 new legacy final issue requires lock and changes no commercial effects",async()=>{
  const a=await seedAccount(f.admin);
  const counts=async()=>Promise.all(['customer_invoice_sequence','decision','decision_resolution','action_authorization','customer_invoice','final_account_invoice_binding','final_account_invoiced_line','action_outbox','command_receipt','audit_event'].map(async table=>(await f.admin.query(`SELECT count(*)::int n FROM app.${table} WHERE tenant_id=$1`,[a.tenantId])).rows[0].n));
  const before=await counts();
  await expect(new PracticeInvoiceRepository(f.runtime).issue(a.context,{jobId:a.jobId,finalAccountRevisionId:a.revisionId,actorMembershipId:LOCK_OWNER,commandId:randomUUID(),recipient:'practice-customer@example.invalid',issuedOn:'2026-10-12'})).rejects.toThrow('FINAL_ACCOUNT_LOCK_REQUIRED');
  expect(await counts()).toEqual(before);
 });
 it("Q1 historical interim side binding requires no lock",async()=>{
   const a=historical.account,invoice=historical.invoice;
   await asFixtureTenant(historical.fixture.admin,a.tenantId,db=>db.query("INSERT INTO app.final_account_invoice_binding(tenant_id,job_id,invoice_id,invoice_kind,revision_id) VALUES($1,$2,$3,'interim',$4)",[a.tenantId,a.jobId,invoice.id,a.revisionId]));
   expect((await historical.fixture.admin.query("SELECT invoice_kind,lock_id,check_id FROM app.final_account_invoice_binding WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId])).rows).toEqual([{invoice_kind:'interim',lock_id:null,check_id:null}]);
 });
 it("a completion belonging to a foreign tenant cannot be bound or authorize either invoice kind",async()=>{
  const a=await seedAccount(f.admin),b=await seedAccount(f.admin);
  for(const account of [a,b]){const repo=await prepareLock(f,account);await repo.lock(account.context,account.input)}
  const foreign=await lockRow(f,b.tenantId,b.jobId);
  await expect(appendCheck(f,a,'completed',{lockId:foreign.id,jobId:b.jobId})).rejects.toMatchObject({code:'23503'});
  await appendCheck(f,b,'completed');const repo=new FinalAccountLockRepository(f.runtime);
  for(const kind of ['final','supplementary']as const){const input=invoiceInput(a,kind);await expect(repo.issueInvoice(a.context,input)).rejects.toMatchObject({code:'FINAL_CHECK_NOT_COMPLETE'});await expect(direct(a,input)).rejects.toThrow('FINAL_CHECK_NOT_COMPLETE')}
 });

 it("PRE-Q4-05 r2 practice-session job issues through the lock-bound application; wrong and absent digests remain refused",async()=>{
  const {createHash}=await import("node:crypto");
  const {practiceMaterialPool,issuePracticeSession,DEMO_TENANT_ID,DEMO_MEMBERSHIP_ID,DEMO_IDENTITY_USER_ID}=await import("../src/index.js");
  const {FinalAccountLockApplication}=await import("../../../apps/api/src/final-account-lock.application.js");
  const prior=process.env.JOBGUARD_ENV;process.env.JOBGUARD_ENV="synthetic_demo";
  try{
   const a=await seedAccount(f.admin,DEMO_TENANT_ID);
   await f.admin.query("INSERT INTO identity.identity_user(id) VALUES($1) ON CONFLICT DO NOTHING",[DEMO_IDENTITY_USER_ID]);
   await f.admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) SELECT $1,tenant_id,account_id,$2,'owner' FROM app.membership WHERE tenant_id=$3 AND id=$4 ON CONFLICT DO NOTHING",[DEMO_MEMBERSHIP_ID,DEMO_IDENTITY_USER_ID,DEMO_TENANT_ID,LOCK_OWNER]);
   const session=await issuePracticeSession(f.runtime),digest=createHash("sha256").update(session).digest("hex");
   await asFixtureTenant(f.admin,a.tenantId,async db=>{await db.query("SET LOCAL session_replication_role='replica'");await db.query("UPDATE app.job SET practice_session_digest=$1,practice_scenario='home' WHERE tenant_id=$2 AND id=$3",[digest,a.tenantId,a.jobId]);});
   const repo=await prepareLock(f,a);await repo.lock(a.context,a.input);await appendCheck(f,a,'completed');
   const command={...invoiceInput(a),actorMembershipId:DEMO_MEMBERSHIP_ID};
   const before=(await f.admin.query("SELECT count(*)::int n FROM app.customer_invoice WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId])).rows;
   for(const pool of [f.runtime,practiceMaterialPool(f.runtime,createHash("sha256").update(randomUUID()).digest("hex"))])
    await expect(new FinalAccountLockRepository(pool).issueInvoice(a.context,command)).rejects.toMatchObject({code:'42501'});
   expect((await f.admin.query("SELECT count(*)::int n FROM app.customer_invoice WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId])).rows).toEqual(before);
   const {actorMembershipId:_actor,jobId:_job,...body}=command;
   const app=new FinalAccountLockApplication(f.runtime,session),result=await app.issueInvoice(a.jobId,{version:'lock-bound-invoice.issue.v1',...body});
   expect(result.invoices).toHaveLength(1);expect(result.invoices[0]).toMatchObject({netPence:3360000,taxPence:672000,totalPence:4032000});
   expect(await app.issueInvoice(a.jobId,{version:'lock-bound-invoice.issue.v1',...body})).toEqual(result);
   for(const pool of [f.runtime,practiceMaterialPool(f.runtime,createHash("sha256").update(randomUUID()).digest("hex"))])
    await expect(new FinalAccountLockRepository(pool).issueInvoice(a.context,command)).rejects.toMatchObject({code:'42501'});
   const certificates=(await f.admin.query("SELECT count(*)::int n FROM app.final_account_invoice_binding b JOIN app.shadow_final_check_completion c ON(c.tenant_id,c.job_id,c.check_id)=(b.tenant_id,b.job_id,b.check_id) WHERE b.tenant_id=$1 AND b.job_id=$2",[a.tenantId,a.jobId])).rows;
   expect(certificates).toEqual([{n:1}]);
  }finally{if(prior===undefined)delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=prior;}
 });

});

describe("LATER-SAFETY-144 source preservation",()=>{
 it("changes only the installed combined writer allocation and leaves half-up rounding intact",async()=>{
  const before=await readFile(new URL('../migrations/0723_lp6c_money_binding.sql',import.meta.url),'utf8');
  const after=await readFile(MIGRATION_URLS.find(u=>u.pathname.endsWith('_combined_invoice_signed_vat.sql'))!,'utf8');
  const body=(sql:string)=>{const start=sql.indexOf('CREATE OR REPLACE FUNCTION app.issue_lock_bound_customer_invoice');return sql.slice(start,sql.indexOf('END $$;',start)+7)};
  const withoutAllocation=(sql:string)=>body(sql).replace(/ -- (?:Largest-remainder display allocation|Mixed-sign lines)[\s\S]*? FROM ranked LOOP/,' ALLOCATION');
  expect(withoutAllocation(after)).toBe(withoutAllocation(before));
  expect(body(after)).toContain('tax:=(net+2)/5; gross:=net+tax;');
  const proof=proofSchema.parse(JSON.parse(await readFile(new URL('./migration-proofs/'+MIGRATION_URLS.find(u=>u.pathname.endsWith('_combined_invoice_signed_vat.sql'))!.pathname.split('/').at(-1)!.replace('.sql','.proof.json'),import.meta.url),'utf8')));
  const predecessor=JSON.parse(await readFile(new URL('./migration-proofs/0723_lp6c_money_binding.proof.json',import.meta.url),'utf8'));
  const previous=predecessor.lp0.find((change:any)=>change.section==='routines' && change.after?.identity==='function:app.issue_lock_bound_customer_invoice(uuid,uuid,uuid,uuid,uuid,text,text,date,text)');
  expect(proof.lp0).toEqual([{section:'routines',before:previous.after,after:previous.after}]);
  expect(proof.upgrade).toEqual([]);expect(proof.tenancy).toEqual([]);
 });
});
