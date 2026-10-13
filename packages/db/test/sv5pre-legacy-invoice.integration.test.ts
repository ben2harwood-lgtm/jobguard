import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PracticeInvoiceRepository } from "../src/practice-invoice-repository.js";
import { GuardedPracticeInvoiceRepository } from "../src/guarded-practice-invoice-repository.js";
import { FinalAccountLockRepository } from "../src/final-account-lock-repository.js";
import { createLockFixture, closeLockFixture, seedAccount, prepareLock, asFixtureTenant, publishEmptyCompletion, LOCK_OWNER, LOCK_HASH, type LockFixture } from "./sv5pre-fixtures.js";

describe("SV5PRE legacy final invoice gate", () => {
 let f: LockFixture;
 beforeAll(async () => { f = await createLockFixture(); }, 60000);
 afterAll(async () => closeLockFixture(f));
 const input = (a: Awaited<ReturnType<typeof seedAccount>>) => ({ jobId:a.jobId, finalAccountRevisionId:a.revisionId, actorMembershipId:LOCK_OWNER, commandId:randomUUID(), recipient:"practice-customer@example.invalid", issuedOn:"2026-10-13" });
 const effects = async (tenant: string) => {
  const tables = ["customer_invoice_sequence", "decision", "decision_resolution", "action_authorization", "customer_invoice", "final_account_invoice_binding", "final_account_invoiced_line", "action_outbox", "command_receipt", "audit_event"];
  return Promise.all(tables.map(async table => ({ table, rows: (await f.admin.query(`SELECT row_to_json(t)::text bytes FROM (SELECT * FROM app.${table} WHERE tenant_id=$1) t ORDER BY row_to_json(t)::text COLLATE "C"`, [tenant])).rows })));
 };
 it("[PRE-Q4-01/PRE-Q4-08] new legacy final issue requires the immutable lock; invoice gate refusal leaves every commercial effect unchanged", async () => {
  const a = await seedAccount(f.admin), c = input(a), before = await effects(a.tenantId);
  await expect(new GuardedPracticeInvoiceRepository(f.runtime).issue(a.context,c)).rejects.toMatchObject({code:"FINAL_ACCOUNT_LOCK_REQUIRED"});
  await expect(asFixtureTenant(f.runtime,a.tenantId,db=>db.query("SELECT * FROM app.issue_practice_customer_invoice($1,$2,$3,$4,$5,$6,$7::date)",[a.tenantId,c.jobId,c.finalAccountRevisionId,c.actorMembershipId,c.commandId,c.recipient,c.issuedOn]))).rejects.toThrow("FINAL_ACCOUNT_LOCK_REQUIRED");
  expect(await effects(a.tenantId)).toEqual(before);
 });
 it("[PRE-Q4-02] both invoice paths enforce pending failed and uncertified completion", async () => {
  const a=await seedAccount(f.admin),repo=await prepareLock(f,a); await repo.lock(a.context,a.input);
  for(const status of [null,"pending","failed"] as const) {
   if(status) await asFixtureTenant(f.shadow,a.tenantId,db=>db.query("INSERT INTO app.final_account_lock_check(tenant_id,job_id,id,lock_id,evidence_cutoff_at,status) SELECT tenant_id,job_id,gen_random_uuid(),id,locked_at,$3 FROM app.final_account_lock WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId,status]));
   const code=status==="failed"?"FINAL_CHECK_FAILED":"FINAL_CHECK_NOT_COMPLETE", c=input(a),before=await effects(a.tenantId);
   await expect(new GuardedPracticeInvoiceRepository(f.runtime).issue(a.context,c)).rejects.toMatchObject({code});
   for(const kind of ["final","supplementary"] as const) await expect(repo.issueInvoice(a.context,{...c,expectedSourceHash:LOCK_HASH,invoiceKind:kind})).rejects.toMatchObject({code});
   expect(await effects(a.tenantId)).toEqual(before);
  }
  await expect(asFixtureTenant(f.shadow,a.tenantId,db=>db.query("INSERT INTO app.final_account_lock_check(tenant_id,job_id,id,lock_id,evidence_cutoff_at,status) SELECT tenant_id,job_id,gen_random_uuid(),id,locked_at,'completed' FROM app.final_account_lock WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId]))).rejects.toThrow("FINAL_CHECK_NOT_COMPLETE");
 });
 it("[PRE-Q4-03] legacy final issue binds the authoritative empty-run completion", async () => {
  const a=await seedAccount(f.admin),repo=await prepareLock(f,a);await repo.lock(a.context,a.input); const check=await publishEmptyCompletion(f,a);
  const c=input(a),invoices=new PracticeInvoiceRepository(f.runtime),first=await invoices.issue(a.context,c);expect(await invoices.issue(a.context,c)).toEqual(first);
  expect(first).toMatchObject({netPence:3360000,taxPence:672000,totalPence:4032000});
  const bindings=(await f.admin.query("SELECT b.invoice_kind,b.revision_id,b.check_id,c.check_id certified_check FROM app.final_account_invoice_binding b JOIN app.final_check_completion c ON(c.tenant_id,c.job_id,c.check_id)=(b.tenant_id,b.job_id,b.check_id) WHERE b.tenant_id=$1 AND b.invoice_id=$2",[a.tenantId,first.id])).rows;
  expect(bindings).toEqual([{invoice_kind:"final",revision_id:a.revisionId,check_id:check,certified_check:check}]);
  expect((await f.admin.query("SELECT final_account_line_id FROM app.final_account_invoiced_line WHERE tenant_id=$1 AND invoice_id=$2",[a.tenantId,first.id])).rows).toEqual([{final_account_line_id:a.lineId}]);
 });
 it("[PRE-Q4-05] legacy replay rechecks current access and exact command identity", async () => {
  const a=await seedAccount(f.admin),repo=await prepareLock(f,a);await repo.lock(a.context,a.input);await publishEmptyCompletion(f,a);const invoices=new GuardedPracticeInvoiceRepository(f.runtime),c=input(a);await invoices.issue(a.context,c);
  const replayBefore=await effects(a.tenantId); await invoices.issue(a.context,c);expect(await effects(a.tenantId)).toEqual(replayBefore);
  for(const changed of [{...c,recipient:"changed@example.invalid"},{...c,jobId:randomUUID()}]) await expect(invoices.issue(a.context,changed)).rejects.toThrow();
  await f.admin.query("UPDATE app.membership SET expires_at=clock_timestamp()-interval '1 second' WHERE tenant_id=$1 AND id=$2",[a.tenantId,LOCK_OWNER]);
  await expect(invoices.issue(a.context,c)).rejects.toMatchObject({code:"42501"});
  await f.admin.query("UPDATE app.membership SET expires_at=NULL WHERE tenant_id=$1 AND id=$2",[a.tenantId,LOCK_OWNER]);
  await f.admin.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2",[a.tenantId,LOCK_OWNER]);
  await expect(invoices.issue(a.context,c)).rejects.toMatchObject({code:"42501"});
  expect((await f.admin.query("SELECT count(*)::int n FROM app.customer_invoice WHERE tenant_id=$1",[a.tenantId])).rows[0].n).toBe(1);
 });
 it("[PRE-Q4-05] legacy replay rechecks persisted session expiry and session job access", async () => {
  const tenant='11111111-1111-4111-8111-111111111111',actor='d1500000-0000-4000-8000-000000000003',user='d1500000-0000-4000-8000-000000000001';
  const a=await seedAccount(f.admin,tenant),sessionId=randomUUID(),digest=createHash('sha256').update(sessionId).digest('hex');
  await f.admin.query("INSERT INTO identity.identity_user(id) VALUES($1) ON CONFLICT DO NOTHING",[user]);
  await f.admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) SELECT $1,tenant_id,account_id,$2,'owner' FROM app.membership WHERE tenant_id=$3 AND id=$4",[actor,user,tenant,LOCK_OWNER]);
  await f.admin.query("SELECT app.issue_practice_session($1)",[digest]);
  // Own synthetic fixture binds its already-created job before any commercial action.
  await asFixtureTenant(f.admin,tenant,async db=>{await db.query("SET LOCAL session_replication_role='replica'");await db.query("UPDATE app.job SET practice_session_digest=$1,practice_scenario='home' WHERE tenant_id=$2 AND id=$3",[digest,tenant,a.jobId]);});
  const repo=await prepareLock(f,a);await repo.lock(a.context,a.input);await publishEmptyCompletion(f,a);
  const invoices=new GuardedPracticeInvoiceRepository(f.runtime,sessionId),c={...input(a),actorMembershipId:actor};await invoices.issue(a.context,c);
  await expect(new GuardedPracticeInvoiceRepository(f.runtime).issue(a.context,c)).rejects.toMatchObject({code:'42501'});
  await expect(invoices.issue(a.context,{...c,actorMembershipId:LOCK_OWNER})).rejects.toMatchObject({code:'42501'});
  const before=await effects(tenant);await f.admin.query("UPDATE control_plane.practice_session SET expires_at=clock_timestamp()-interval '1 second' WHERE token_digest=$1",[digest]);
  await expect(invoices.issue(a.context,c)).rejects.toMatchObject({code:'42501'});expect(await effects(tenant)).toEqual(before);
 });
 it("[PRE-Q4-06] supplementary issue retains the authoritative check and existing source rules", async () => {
  const a=await seedAccount(f.admin),repo=await prepareLock(f,a);await repo.lock(a.context,a.input);await publishEmptyCompletion(f,a);await new PracticeInvoiceRepository(f.runtime).issue(a.context,input(a));
  await expect(new FinalAccountLockRepository(f.runtime).issueInvoice(a.context,{...input(a),expectedSourceHash:LOCK_HASH,invoiceKind:"supplementary"})).rejects.toMatchObject({code:"SUPPLEMENTARY_INVOICE_BASE_REQUIRED"});
  await expect(new GuardedPracticeInvoiceRepository(f.runtime).issue(a.context,{...input(a),commandId:randomUUID()})).rejects.toMatchObject({code:"FINAL_INVOICE_ALREADY_ISSUED"});
 });
});
