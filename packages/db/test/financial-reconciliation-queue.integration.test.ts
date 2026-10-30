// CI only: real PostgreSQL, runtime privileges and persisted contractor finance sessions.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { reconcileFinancialSnapshot } from "@jobguard/core";
import { FinancialReconciliationQueueRepository } from "../src/financial-reconciliation-queue-repository.js";
import { withTenant } from "../src/tenant-context.js";
import { cluster, world, type World } from "./contractor-billing-fixtures.js";
import { invite } from "./extra-approval-chain-fixtures.js";
import { digestOf } from "./contractor-practice-session-fixtures.js";
let c: Awaited<ReturnType<typeof cluster>>;
beforeAll(async () => { c = await cluster(); }, 240000);
afterAll(async () => { await c?.close(); });
const tables = ["financial_reconciliation_run", "financial_reconciliation_difference", "financial_reconciliation_adjustment", "financial_reconciliation_approval", "financial_reconciliation_command"];
async function setup() {
 const w = await world(c), repo = new FinancialReconciliationQueueRepository(c.runtime);
 const scope = { tenantId: w.w.p.tenantId, jobId: w.s.jobId }, invoiceId = randomUUID(), revision = randomUUID(), paymentId = randomUUID(), effectId = randomUUID();
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

it("report reads require current finance access even for a known stored run", async () => {
 const a = await setup(), run = await a.run();
 const operator = a.w.w.members.operative.member, session = randomUUID();
 await c.admin.query("INSERT INTO control_plane.contractor_practice_session(session_id,tenant_id,membership_id,identity_user_id,session_digest,created_at,expires_at) SELECT $1,$2,$3,$4,$5,r.t,r.t+interval '7 days' FROM (SELECT clock_timestamp() t) r", [session,a.scope.tenantId,operator.membershipId,operator.identityUserId,digestOf(session)]);
 await expect(a.repo.read(a.w.ctx,session,a.scope.jobId,run.runId)).rejects.toMatchObject({ code: "42501" });
 // Neither a known run ID nor a missing ID bypasses the same finance gate.
 await expect(a.repo.read(a.w.ctx,session,a.scope.jobId,randomUUID())).rejects.toMatchObject({ code: "42501" });
 expect((await a.repo.read(a.w.ctx,a.w.session,a.scope.jobId,run.runId))?.report).toEqual(run.report);
 await withTenant(c.runtime,a.w.ctx,db=>db.$client.query("SELECT app.revoke_contractor_practice_session($1)",[a.w.session]));
 await expect(a.repo.read(a.w.ctx,a.w.session,a.scope.jobId,run.runId)).rejects.toThrow();
 expect((await c.admin.query("SELECT report FROM app.financial_reconciliation_run WHERE id=$1",[run.runId])).rows[0]?.report).toEqual(run.report);
});
