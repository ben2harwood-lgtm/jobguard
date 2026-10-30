// CI only: real PostgreSQL, runtime privileges and persisted contractor finance sessions.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { reconcileFinancialSnapshot } from "@jobguard/core";
import { FinancialReconciliationQueueRepository } from "../src/financial-reconciliation-queue-repository.js";
import { withTenant } from "../src/tenant-context.js";
import { cluster, world, type World } from "./contractor-billing-fixtures.js";
import { invite } from "./extra-approval-chain-fixtures.js";
import { seedAccount, issueHistoricalInvoice, LOCK_OWNER } from "./sv5pre-fixtures.js";
import { digestOf } from "./contractor-practice-session-fixtures.js";
let c: Awaited<ReturnType<typeof cluster>>;
beforeAll(async () => { c = await cluster(); }, 240000);
afterAll(async () => { await c?.close(); });
const tables = ["financial_reconciliation_run", "financial_reconciliation_difference", "financial_reconciliation_adjustment", "financial_reconciliation_approval", "financial_reconciliation_command"];
async function setup() {
 const w = await world(c), repo = new FinancialReconciliationQueueRepository(c.runtime);
 // Reuse the genuine historical invoice fixture, including its immutable
 // final-account revision and authorization. Never seed a claimed snapshot.
 const account = await seedAccount(c.admin, w.w.p.tenantId as ReturnType<typeof randomUUID>, 10000);
 await issueHistoricalInvoice(c.admin, account.tenantId, { jobId: account.jobId, finalAccountRevisionId: account.revisionId, actorMembershipId: LOCK_OWNER });
 await c.admin.query("INSERT INTO app.job_commercial_track(tenant_id,job_id,job_track,environment,provenance) VALUES($1,$2,'small_builder','synthetic_demo','legacy_synthetic_live_fixture') ON CONFLICT DO NOTHING",[account.tenantId,account.jobId]);
 const stored=(await c.admin.query("SELECT id,final_account_revision_id FROM app.customer_invoice WHERE tenant_id=$1 AND job_id=$2",[account.tenantId,account.jobId])).rows[0]!;
 const scope = { tenantId: account.tenantId, jobId: account.jobId }, invoiceId = stored.id as string, revision = stored.final_account_revision_id as string, paymentId = randomUUID(), effectId = randomUUID();
 const payment = { ...scope, id: paymentId, effectId, invoiceId, kind: "payment", amount: 12000, parentId: null, late: true };
 const snapshot = { ...scope, version: "financial-reconciliation-snapshot.v1", environment: "synthetic_demo", corrections: [],
  invoices: [{ ...scope, id: invoiceId, revision, net: 10000, vat: 2000, gross: 12000 }], provider: [payment], journals: [] };
 const command = () => ({ version: "financial-reconciliation-store.v1", commandId: randomUUID(), trigger: "on_demand", day: "2026-10-30", snapshot });
 const run = (input = command()) => repo.run(w.ctx, w.session, input);
 return { w, repo, scope, invoiceId, revision, payment, snapshot, command, run };
}
async function secondSession(w: World) {
 // Existing fixture's real second identity. Provision finance through the existing
 // owner-only fixture boundary; never a caller-supplied approver flag.
 const member = (await invite(c,w.w,"finance",{kind:"tenant",id:w.w.p.tenantId})).member;
 const session = randomUUID(), t = w.w.p.tenantId;
 await c.admin.query("INSERT INTO control_plane.contractor_practice_session(session_id,tenant_id,membership_id,identity_user_id,session_digest,created_at,expires_at) SELECT $1,$2,$3,$4,$5,r.t,r.t+interval '7 days' FROM (SELECT clock_timestamp() t) r", [session,t,member.membershipId,member.identityUserId,digestOf(session)]);
 return session;
}
it("stores missing, duplicate and late observations in an immutable queue; rebuilds identically after restart", async () => {
 const a = await setup(), first = await a.run();
 expect(first.report.queue.map(i => i.code)).toEqual(expect.arrayContaining(["LATE_PROVIDER_EVENT", "MISSING_OR_DUPLICATE_JOURNAL", "OUTSTANDING_CLEARING"]));
 const reloaded = await new FinancialReconciliationQueueRepository(c.runtime).read(a.w.ctx, a.w.session, a.scope.jobId, first.runId);
 expect(reloaded?.report).toEqual(first.report);
 expect(reconcileFinancialSnapshot(reloaded!.snapshot)).toEqual(first.report);
 const duplicate = await a.run({ ...a.command(), snapshot: { ...a.snapshot, provider: [a.payment, { ...a.payment, id: randomUUID() }] } });
 expect(duplicate.report.queue.map(i => i.code)).toContain("DUPLICATE_PROVIDER_EFFECT");
 expect(duplicate.report.balances.grossCharged.pence).toBe(0);
 expect((await a.repo.read(a.w.ctx,a.w.session,a.scope.jobId,first.runId))?.report).toEqual(first.report);
 const rows = (await c.admin.query("SELECT difference_id,detail FROM app.financial_reconciliation_difference WHERE tenant_id=$1 AND run_id=$2 ORDER BY difference_id", [a.scope.tenantId,first.runId])).rows;
 expect(rows.map(r => r.detail)).toEqual(first.report.queue);
});
it("binds replay payloads, serializes concurrent runs and deduplicates daily scheduling", async () => {
 const a = await setup(), input = a.command();
 const [one,two] = await Promise.all([a.run(input),a.run(input)]); expect(two).toEqual(one);
 await expect(a.run({ ...input, day: "2026-10-29" })).rejects.toThrow("RECONCILIATION_CONFLICT");
 const daily = { ...a.command(), trigger: "daily" };
 const alias={...daily,commandId:randomUUID()};
 expect((await a.run(daily)).runId).toBe((await a.run(alias)).runId);
 await expect(a.run({...alias,day:'2026-10-29'})).rejects.toThrow('RECONCILIATION_CONFLICT');
});
it("refuses self-approval including a second session for the same identity; a different finance identity approves exact content", async () => {
 const a = await setup(), run = await a.run(), fact = { ...a.scope, id: randomUUID(), invoiceId: a.invoiceId, kind: "payment", amount: 12000, sourceId: a.payment.id };
 const adjustment = { version: "financial-reconciliation-adjustment.v1", ...a.scope, commandId: randomUUID(), reportHash: run.report.sourceHash, invoiceRevision: a.revision, fact };
 const proposal = await a.repo.propose(a.w.ctx,a.w.session,{ version:"financial-reconciliation-propose.v1",runId:run.runId,adjustment });
 const approve = { version:"financial-reconciliation-approve.v1",commandId:randomUUID(),jobId:a.scope.jobId,adjustmentId:proposal.adjustmentId,contentHash:proposal.contentHash };
 await expect(a.repo.approve(a.w.ctx,a.w.session,approve)).rejects.toThrow("RECONCILIATION_SELF_APPROVAL");
 const alias = randomUUID();
 await c.admin.query("INSERT INTO control_plane.contractor_practice_session(session_id,tenant_id,membership_id,identity_user_id,session_digest,created_at,expires_at) SELECT $1,tenant_id,membership_id,identity_user_id,$2,r.t,r.t+interval '7 days' FROM control_plane.contractor_practice_session,(SELECT clock_timestamp() t) r WHERE session_id=$3",[alias,digestOf(alias),a.w.session]);
 await expect(a.repo.approve(a.w.ctx,alias,approve)).rejects.toThrow("RECONCILIATION_SELF_APPROVAL");
 const second = await secondSession(a.w);
 await expect(a.repo.approve(a.w.ctx,second,{...approve,contentHash:'0'.repeat(64)})).rejects.toThrow("RECONCILIATION_CONFLICT");
 const accepted = await a.repo.approve(a.w.ctx,second,approve);
 expect(await a.repo.approve(a.w.ctx,second,approve)).toEqual(accepted);
 expect((await a.repo.read(a.w.ctx,a.w.session,a.scope.jobId,run.runId))?.report).toEqual(run.report); // approval never posts a journal
 expect((await c.admin.query("SELECT event_type FROM app.audit_event WHERE tenant_id=$1 AND event_type LIKE 'financial_reconciliation.%' ORDER BY sequence",[a.scope.tenantId])).rows.map(r=>r.event_type)).toEqual(["financial_reconciliation.run","financial_reconciliation.propose","financial_reconciliation.approve"]);
});
it("refuses stale runs, locked invoice revision substitution and new discrepancies", async () => {
 const a=await setup(),run=await a.run();
 const adjustment={version:"financial-reconciliation-adjustment.v1",...a.scope,commandId:randomUUID(),reportHash:run.report.sourceHash,invoiceRevision:randomUUID(),fact:{...a.scope,id:randomUUID(),invoiceId:a.invoiceId,kind:"payment",amount:12000,sourceId:a.payment.id}};
 await expect(a.repo.propose(a.w.ctx,a.w.session,{version:"financial-reconciliation-propose.v1",runId:run.runId,adjustment})).rejects.toThrow("RECONCILIATION_CONFLICT");
 const proposal=await a.repo.propose(a.w.ctx,a.w.session,{version:"financial-reconciliation-propose.v1",runId:run.runId,adjustment:{...adjustment,invoiceRevision:a.revision}});
 await a.run();
 await expect(a.repo.approve(a.w.ctx,await secondSession(a.w),{version:"financial-reconciliation-approve.v1",commandId:randomUUID(),jobId:a.scope.jobId,adjustmentId:proposal.adjustmentId,contentHash:proposal.contentHash})).rejects.toThrow("RECONCILIATION_CONFLICT");
});
it("denies direct writes, enforces append-only even for owner, and leaks no cross-tenant run", async () => {
 const a=await setup(),run=await a.run(),b=await setup();
 expect(await b.repo.read(b.w.ctx,b.w.session,a.scope.jobId,run.runId)).toBeNull();
 for(const table of tables){
  for(const sql of [`INSERT INTO app.${table} DEFAULT VALUES`,`UPDATE app.${table} SET tenant_id=tenant_id`,`DELETE FROM app.${table}`,`TRUNCATE app.${table}`])await expect(c.runtime.query(sql)).rejects.toMatchObject({code:"42501"});
 }
 await expect(c.admin.query("UPDATE app.financial_reconciliation_run SET snapshot=snapshot WHERE id=$1",[run.runId])).rejects.toThrow("ENTERPRISE_FEE_IMMUTABLE");
 await expect(c.admin.query("DELETE FROM app.financial_reconciliation_run WHERE id=$1",[run.runId])).rejects.toThrow("ENTERPRISE_FEE_IMMUTABLE");
 await withTenant(c.admin,b.w.ctx,async db=>{await db.$client.query("SET LOCAL ROLE jobguard_migration");expect((await db.$client.query("SELECT id FROM app.financial_reconciliation_run WHERE id=$1",[run.runId])).rows).toEqual([]);});
 const unknown=randomUUID();await expect(a.repo.read(a.w.ctx,unknown,a.scope.jobId,run.runId)).rejects.toThrow();
 await withTenant(c.runtime,a.w.ctx,db=>db.$client.query("SELECT app.revoke_contractor_practice_session($1)",[a.w.session]));
 await expect(a.run()).rejects.toThrow();
});

// Bypass the TypeScript repository deliberately: the runtime SQL boundary must
// reject coherent forged snapshots/reports, even with recomputed source hashes.
async function rawRun(a: Awaited<ReturnType<typeof setup>>, snapshot: unknown, report: unknown = reconcileFinancialSnapshot(snapshot)) {
 return withTenant(c.runtime,a.w.ctx,db=>db.$client.query("SELECT app.financial_reconciliation_queue($1,$2,$3::jsonb) result",[a.w.session,a.scope.jobId,JSON.stringify({
  version:"financial-reconciliation-storage.v1",action:"run",commandId:randomUUID(),trigger:"on_demand",day:"2026-10-30",snapshot,report,
 })]));
}
it("SQL rejects forged invoice money, revision, unknown invoice and omission of a stored invoice despite fresh hashes",async()=>{
 const a=await setup();
 for(const invoices of [
  [{...a.snapshot.invoices[0],net:10001,gross:12001}],
  [{...a.snapshot.invoices[0],revision:randomUUID()}],
  [{...a.snapshot.invoices[0],id:randomUUID()}],
  [],
 ]) await expect(rawRun(a,{...a.snapshot,invoices})).rejects.toThrow("RECONCILIATION_CONFLICT");
 expect((await c.admin.query("SELECT id FROM app.financial_reconciliation_run WHERE tenant_id=$1 AND job_id=$2",[a.scope.tenantId,a.scope.jobId])).rows).toEqual([]);
});
it("SQL refuses fabricated, omitted and altered differences and forged balances; an honest direct run is unchanged",async()=>{
 const a=await setup(),report=reconcileFinancialSnapshot(a.snapshot);
 for(const bad of [
  {...report,queue:[]}, {...report,queue:report.queue.slice(1)},
  {...report,queue:[...report.queue,{...report.queue[0],differenceId:'f'.repeat(64),code:'FABRICATED'}]},
  {...report,queue:report.queue.map((q,i)=>i? q:{...q,observed:{pence:1,currency:'GBP'}})},
  {...report,balances:{...report.balances,grossCharged:{pence:1,currency:'GBP'}}},
 ]) await expect(rawRun(a,a.snapshot,bad)).rejects.toThrow("RECONCILIATION_CONFLICT");
 const honest=await rawRun(a,a.snapshot);
 expect(honest.rows[0].result).toMatchObject({snapshot:a.snapshot,report});
});
it("SQL refuses unbacked journal and correction facts rather than treating reviews as posted money",async()=>{
 const a=await setup();
 const journal={...a.scope,id:randomUUID(),invoiceId:a.invoiceId,kind:'payment',amount:12000,sourceId:a.payment.id};
 await expect(rawRun(a,{...a.snapshot,journals:[journal]})).rejects.toThrow("RECONCILIATION_CONFLICT");
 const duplicate={...a.payment,id:randomUUID()};
 const correction={...a.scope,id:randomUUID(),invoiceId:a.invoiceId,target:'provider',voidId:duplicate.id,duplicateOf:a.payment.id};
 await expect(rawRun(a,{...a.snapshot,provider:[a.payment,duplicate],corrections:[correction]})).rejects.toThrow("RECONCILIATION_CONFLICT");
});
it("SQL and core agree on supported provider chains, duplicate effects, limits, orphans and late events",async()=>{
 const a=await setup(),payment={...a.payment,late:false};
 const fee={...payment,id:randomUUID(),effectId:randomUUID(),kind:'fee',parentId:payment.id,amount:200};
 const payout={...fee,id:randomUUID(),effectId:randomUUID(),kind:'payout',amount:11800};
 const bank={...fee,id:randomUUID(),effectId:randomUUID(),kind:'bank',parentId:payout.id,amount:11800};
 const refund={...fee,id:randomUUID(),effectId:randomUUID(),kind:'refund',amount:12001};
 for(const provider of [[],[payment],[payment,fee,payout,bank],[payment,fee,payout],
  [payment,{...payment,id:randomUUID()}],[payment,refund,payout,bank],
  [payout,bank],[{...payment,invoiceId:randomUUID()}],[{...payment,amount:12001}],
  [payment,{...payout,late:true},bank]]) {
  const snapshot={...a.snapshot,provider:provider.sort((x,y)=>x.id<y.id?-1:1)};
  const result=await rawRun(a,snapshot);
  expect(result.rows[0].result.report).toEqual(reconcileFinancialSnapshot(snapshot));
 }
});

it("SQL does not let a daily alias persist a forged report",async()=>{
 const a=await setup();
 await a.run({...a.command(),trigger:'daily'});
 const report={...reconcileFinancialSnapshot(a.snapshot),queue:[]};
 await expect(withTenant(c.runtime,a.w.ctx,db=>db.$client.query("SELECT app.financial_reconciliation_queue($1,$2,$3::jsonb)",[a.w.session,a.scope.jobId,JSON.stringify({
  version:'financial-reconciliation-storage.v1',action:'run',commandId:randomUUID(),trigger:'daily',day:'2026-10-30',snapshot:a.snapshot,report,
 })]))).rejects.toThrow('RECONCILIATION_CONFLICT');
});
