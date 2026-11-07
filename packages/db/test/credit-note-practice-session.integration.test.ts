import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GuardedPracticeInvoiceRepository } from "../src/guarded-practice-invoice-repository.js";
import { PracticeInvoiceRepository } from "../src/practice-invoice-repository.js";
import { JobImportV3Repository } from "../src/job-import-v3-repository.js";
import { practiceMaterialPool } from "../src/practice-session.js";
import { withTenant, type VerifiedTenantContext } from "../src/tenant-context.js";
import { createWorkFixture, closeWorkFixture, seedWorkJob, seedWorkPractice, workTenant } from "./job-work-state-fixtures.js";
import { prepareInvoicePrerequisites } from "./sv5pre-fixtures.js";

const trigger = "credit_note_practice_session_guard";
type Visitor = Awaited<ReturnType<typeof seedWorkPractice>>;
type InvoiceFixture = { jobId: string; invoiceId: string; context: VerifiedTenantContext; actor: string; repo: PracticeInvoiceRepository | GuardedPracticeInvoiceRepository };

describe("LATER-SAFETY-126 credit-note practice session boundary (real PostgreSQL)", () => {
 let f: Awaited<ReturnType<typeof createWorkFixture>>, a: Visitor, b: Visitor;
 const priorEnvironment = process.env.JOBGUARD_ENV;
 beforeAll(async () => {
  process.env.JOBGUARD_ENV = "synthetic_demo";
  // Fresh empty database: the normal migrator discovers and applies 0659.
  f = await createWorkFixture();
  a = await seedWorkPractice(f); b = await seedWorkPractice(f);
 }, 60_000);
 afterAll(async () => {
  if (priorEnvironment === undefined) delete process.env.JOBGUARD_ENV;
  else process.env.JOBGUARD_ENV = priorEnvironment;
  await closeWorkFixture(f);
 });

 async function invoice(jobId: string, context: VerifiedTenantContext, actor: string, pool: Pool, sessionId?: string): Promise<InvoiceFixture> {
  const tenant = context.tenantId, quote = randomUUID(), draft = randomUUID(), revision = randomUUID(), scope = randomUUID(), hash = "b".repeat(64);
  await workTenant(f.admin, tenant, async db => {
   await db.query("INSERT INTO app.quote_version(id,tenant_id,job_id,version,content_hash,net_value_pence,status) VALUES($1,$2,$3,1,$4,10000,'accepted')", [quote,tenant,jobId,hash]);
   await db.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')", [scope,tenant,jobId]);
   await db.query("INSERT INTO app.final_account_draft(id,tenant_id,job_id) VALUES($1,$2,$3)", [draft,tenant,jobId]);
   await db.query(`INSERT INTO app.final_account_revision(id,tenant_id,job_id,final_account_draft_id,revision,source_hash,baseline_quote_version_id,currency,tax_policy_version,net_pence,tax_pence,total_pence,issue_blocked,findings)
    VALUES($1,$2,$3,$4,1,$5,$6,'GBP','candidate_m1_standard_v1',10000,2000,12000,false,'[]')`, [revision,tenant,jobId,draft,hash,quote]);
   await db.query("INSERT INTO app.final_account_line(id,tenant_id,job_id,final_account_revision_id,line_kind,source_id,scope_item_id,commercial_revision_id,description,net_pence,ordinal) VALUES($1,$2,$3,$4,'baseline',$5,$6,$5,'Fictional baseline',10000,1)", [randomUUID(),tenant,jobId,revision,quote,scope]);
   await db.query("UPDATE app.final_account_draft SET revision=1,current_revision_id=$3 WHERE tenant_id=$1 AND id=$2", [tenant,draft,revision]);
  });
  await prepareInvoicePrerequisites(f.admin,pool,tenant,jobId,actor,revision);
  const repo = sessionId ? new GuardedPracticeInvoiceRepository(f.runtime,sessionId) : new PracticeInvoiceRepository(pool);
  const issued = await repo.issue(context,{jobId,finalAccountRevisionId:revision,actorMembershipId:actor,commandId:randomUUID(),recipient:"practice@example.invalid",issuedOn:"2026-11-06"});
  expect(issued).toMatchObject({netPence:10000,taxPence:2000,totalPence:12000});
  return {jobId,invoiceId:issued.id,context,actor,repo};
 }
 async function visitorInvoice(visitor: Visitor) {
  return invoice(visitor.jobId,visitor.auth.context,visitor.auth.membershipId,practiceMaterialPool(f.runtime,visitor.auth.digest),visitor.sessionId);
 }
 async function command(target: InvoiceFixture) {
  const input = {jobId:target.jobId,invoiceId:target.invoiceId,netPence:1000,reason:"Fictional correction"};
  const preview = await target.repo.previewCredit(target.context,input);
  expect(preview).toMatchObject({netPence:-1000,taxPence:-200,totalPence:-1200});
  return {...input,previewHash:preview.previewHash,actorMembershipId:target.actor,commandId:randomUUID()};
 }
 async function effects() {
  const rows: Record<string,unknown> = {};
  for (const table of ["app.customer_credit_note", "app.customer_credit_note_sequence", "app.customer_invoice", "app.command_receipt", "app.audit_event", "audit_control.audit_head", "app.decision", "app.decision_resolution", "app.action_authorization"]) {
   rows[table] = (await f.admin.query(`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) rows FROM ${table} t`)).rows[0].rows;
  }
  return rows;
 }
 async function direct(target: InvoiceFixture, input: Awaited<ReturnType<typeof command>>, digest?: string) {
  return withTenant(f.runtime,target.context,async db => {
   if (digest !== undefined) await db.$client.query("SELECT set_config('app.practice_material_digest',$1,true)",[digest]);
   return (await db.$client.query("SELECT * FROM app.issue_practice_customer_credit_note($1,$2,$3,$4,$5,$6,$7,$8)",
    [target.context.tenantId,target.jobId,target.invoiceId,input.actorMembershipId,input.commandId,input.netPence,input.reason,input.previewHash])).rows[0];
  });
 }
 async function refused(target: InvoiceFixture, input: Awaited<ReturnType<typeof command>>, digest?: string) {
  const before = await effects();
  await expect(direct(target,input,digest)).rejects.toMatchObject({code:"42501",message:"FORBIDDEN"});
  expect(await effects()).toEqual(before);
 }

 it("installs a private definer trigger with the required owner and fixed search path", async () => {
  const routine = (await f.admin.query(`SELECT p.prosecdef,p.proconfig,pg_get_userbyid(p.proowner) owner,
   has_function_privilege('jobguard_runtime',p.oid,'EXECUTE') runtime,
   has_function_privilege('jobguard_identity',p.oid,'EXECUTE') identity,
   has_function_privilege('jobguard_infrastructure',p.oid,'EXECUTE') infrastructure
   FROM pg_proc p WHERE p.oid='app.guard_credit_note_practice_session()'::regprocedure`)).rows[0];
  expect(routine).toEqual({prosecdef:true,proconfig:["search_path=pg_catalog"],owner:"jobguard_migration",runtime:false,identity:false,infrastructure:false});
  expect((await f.admin.query("SELECT tgenabled FROM pg_trigger WHERE tgrelid='app.customer_credit_note'::regclass AND tgname=$1",[trigger])).rows).toEqual([{tgenabled:"O"}]);
  expect((await f.admin.query("SELECT 1 FROM public.jobguard_schema_migration WHERE migration_name='0659_credit_note_practice_session_guard.sql'")).rowCount).toBe(1);
 });
 it("credits A's own invoice through the real guarded repository, preserving figures and replay", async () => {
  const target = await visitorInvoice(a), input = await command(target);
  const issued = await target.repo.issueCredit(target.context,input);
  expect(issued.totalPence).toBe(-1200);
  const beforeReplay = await effects();
  expect(await target.repo.issueCredit(target.context,input)).toEqual(issued);
  expect(await effects()).toEqual(beforeReplay);
  expect((await target.repo.creditView(target.context,target.jobId,target.invoiceId)).invoice).toMatchObject({creditedPence:1200,balancePence:10800});
 });
 it("refuses B's invoice under A's digest even with their shared owner and a valid preview", async () => {
  expect(a.auth.membershipId).toBe(b.auth.membershipId);
  const target = await visitorInvoice(b), input = await command(target);
  await refused(target,input,a.auth.digest);
  // Missing/malformed claims fail closed, including a pooled transaction after A.
  await refused(target,input);
  await refused(target,input,"invalid");
  expect((await target.repo.issueCredit(target.context,input)).totalPence).toBe(-1200);
 });
 it("keeps non-practice jobs without a digest usable", async () => {
  const job = await seedWorkJob(f);
  const target = await invoice(job.jobId,job.context,job.actorId,f.runtime);
  expect((await target.repo.issueCredit(target.context,await command(target))).totalPence).toBe(-1200);
 });
 it("protects an imported job whose own digest is NULL through its source ancestry", async () => {
  const importer = new JobImportV3Repository(f.runtime), auth = b.auth;
  const binding = (await f.admin.query("SELECT binding_id FROM app.job_party_current WHERE tenant_id=$1 AND job_id=$2",[auth.context.tenantId,b.jobId])).rows[0].binding_id;
  const preview = await importer.preview(auth.context,auth.digest,b.jobId,{version:"job-import-preview.v3",fixtureId:"fictional-extension-v3",expectedBindingId:binding,lifecyclePoint:"invoiced"});
  const adopted = await importer.adopt(auth.context,auth.digest,b.jobId,{version:"job-parties-import.v3",commandId:randomUUID(),fixtureId:"fictional-extension-v3",expectedBindingId:binding,lifecyclePoint:"invoiced",previewHash:preview.previewHash,attest:true});
  const jobId = String(adopted.jobId);
  expect((await f.admin.query("SELECT practice_session_digest FROM app.job WHERE tenant_id=$1 AND id=$2",[auth.context.tenantId,jobId])).rows[0].practice_session_digest).toBeNull();
  const target = await invoice(jobId,auth.context,auth.membershipId,practiceMaterialPool(f.runtime,auth.digest),b.sessionId), input = await command(target);
  await refused(target,input,a.auth.digest);
  await refused(target,input);
  expect((await target.repo.issueCredit(target.context,input)).totalPence).toBe(-1200);
 });
 it("mutation control: removing the trigger makes the cross-visitor refusal assertion fail; restores it", async () => {
  const visitor = await seedWorkPractice(f), target = await visitorInvoice(visitor), input = await command(target);
  await refused(target,input,a.auth.digest);
  const definition = (await f.admin.query("SELECT pg_get_triggerdef(oid) definition FROM pg_trigger WHERE tgrelid='app.customer_credit_note'::regclass AND tgname=$1",[trigger])).rows[0].definition;
  // This fixture owns a dedicated scratch database. No migration file is changed.
  await f.admin.query(`DROP TRIGGER ${trigger} ON app.customer_credit_note`);
  try {
   // The same refusal assertion must fail because the runtime call now succeeds.
   await expect(refused(target,input,a.auth.digest)).rejects.toThrow(/promise resolved/u);
   expect((await f.admin.query("SELECT amount_pence FROM app.customer_credit_note WHERE tenant_id=$1 AND invoice_id=$2",[target.context.tenantId,target.invoiceId])).rows).toEqual([{amount_pence:"1200"}]);
  } finally { await f.admin.query(definition); }
  const fresh = await command(target);
  await refused(target,fresh,a.auth.digest);
 });
});
