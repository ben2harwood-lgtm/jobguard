import { ContractorRepository, requireContractorRequestContext } from "../src/index.js";
// CI only: real PostgreSQL, runtime privileges and persisted contractor finance sessions.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { FinancialReconciliationQueueRepository } from "../src/financial-reconciliation-queue-repository.js";
import { ContractorPracticeSessionRepository } from "../src/contractor-practice-session-repository.js";
import { cluster, world, type World } from "./contractor-billing-fixtures.js";
import { invite } from "./extra-approval-chain-fixtures.js";
import { seedAccount, issueHistoricalInvoice, LOCK_OWNER } from "./sv5pre-fixtures.js";
import { digestOf, makeSessionExpired } from "./contractor-practice-session-fixtures.js";
let c: Awaited<ReturnType<typeof cluster>>;
beforeAll(async () => { c = await cluster(); }, 240000);
afterAll(async () => { await c?.close(); });
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
// LP-6d: each finance session acts in its own bound request (the route derives context and session together).
const ctxFor = async (session: string) => requireContractorRequestContext(await new ContractorRepository(c.runtime).resolveSession(session));
async function secondSession(w: World) {
 // Existing fixture's real second identity. Provision finance through the existing
 // owner-only fixture boundary; never a caller-supplied approver flag.
 const member = (await invite(c,w.w,"finance",{kind:"tenant",id:w.w.p.tenantId})).member;
 const session = randomUUID(), t = w.w.p.tenantId;
 await c.admin.query("INSERT INTO control_plane.contractor_practice_session(session_id,tenant_id,membership_id,identity_user_id,session_digest,created_at,expires_at) SELECT $1,$2,$3,$4,$5,r.t,r.t+interval '7 days' FROM (SELECT clock_timestamp() t) r", [session,t,member.membershipId,member.identityUserId,digestOf(session)]);
 return session;
}

const proposalInput = (a: Awaited<ReturnType<typeof setup>>, run: Awaited<ReturnType<typeof a.run>>) => ({
 version:"financial-reconciliation-propose.v1",runId:run.runId,adjustment:{version:"financial-reconciliation-adjustment.v1",...a.scope,
 commandId:randomUUID(),reportHash:run.report.sourceHash,invoiceRevision:a.revision,
 fact:{...a.scope,id:randomUUID(),invoiceId:a.invoiceId,kind:"payment",amount:12000,sourceId:a.payment.id}},
});
async function unchanged(tenant: string, job: string) {
 const rows: Record<string,unknown>={};
 // Compare every row, including run metadata, and the real invoice, journal and
 // provider books. Proposals and approvals must never alter any of these.
 for(const table of ["financial_reconciliation_run","financial_reconciliation_difference","customer_invoice","journal","provider_event_inbox","journal_line","action_outbox"]){
  rows[table]=(await c.admin.query(`SELECT to_jsonb(x) data FROM app.${table} x WHERE tenant_id=$1 ORDER BY to_jsonb(x)::text`,[tenant])).rows;
 }
 return {job,rows};
}
it("persists waiting state; serializes duplicate proposals and approvals, with exact hashes and unchanged books",async()=>{
 const a=await setup(),run=await a.run(),before=await unchanged(a.scope.tenantId,a.scope.jobId),input=proposalInput(a,run);
 const [one,two]=await Promise.all([a.repo.propose(a.w.ctx,a.w.session,input),a.repo.propose(a.w.ctx,a.w.session,input)]);
 expect(two).toEqual(one);
 for(const forbidden of [{...input,approved:true},{...input,actor:a.w.session},{...input,status:'approved'}])
  await expect(a.repo.propose(a.w.ctx,a.w.session,forbidden)).rejects.toThrow();
 await expect(c.runtime.query("SELECT * FROM app.financial_reconciliation_adjustment")).rejects.toMatchObject({code:'42501'});
 await expect(c.admin.query("UPDATE app.financial_reconciliation_adjustment SET content_hash=$1 WHERE tenant_id=$2 AND id=$3",['0'.repeat(64),a.scope.tenantId,one.adjustmentId])).rejects.toThrow('ENTERPRISE_FEE_IMMUTABLE');
 const reopened=new FinancialReconciliationQueueRepository(c.runtime);
 expect(await reopened.readAdjustments(a.w.ctx,a.w.session,a.scope.jobId,run.runId)).toEqual([{...one,adjustment:input.adjustment,approvalId:null}]);
 const second=await secondSession(a.w);
 const approve={version:"financial-reconciliation-approve.v1",commandId:randomUUID(),jobId:a.scope.jobId,adjustmentId:one.adjustmentId,contentHash:one.contentHash};
 await expect(a.repo.approve(a.w.ctx,a.w.session,approve)).rejects.toThrow("RECONCILIATION_SELF_APPROVAL");
 await expect(a.repo.approve(await ctxFor(second),second,{...approve,contentHash:'0'.repeat(64)})).rejects.toThrow("RECONCILIATION_CONFLICT");
 expect((await reopened.readAdjustments(await ctxFor(second),second,a.scope.jobId,run.runId))![0]!.approvalId).toBeNull();
 const [first,replay]=await Promise.all([a.repo.approve(await ctxFor(second),second,approve),a.repo.approve(await ctxFor(second),second,approve)]);
 expect(replay).toEqual(first);
 expect((await reopened.readAdjustments(await ctxFor(second),second,a.scope.jobId,run.runId))![0]).toMatchObject({approvalId:first.approvalId,contentHash:one.contentHash});
 await expect(a.repo.propose(a.w.ctx,a.w.session,{...input,adjustment:{...input.adjustment,fact:{...input.adjustment.fact,id:randomUUID()}}})).rejects.toThrow("RECONCILIATION_CONFLICT");
 expect(await unchanged(a.scope.tenantId,a.scope.jobId)).toEqual(before);
 expect((await c.admin.query("SELECT count(*)::int n FROM app.financial_reconciliation_adjustment WHERE tenant_id=$1",[a.scope.tenantId])).rows[0].n).toBe(1);
 expect((await c.admin.query("SELECT count(*)::int n FROM app.financial_reconciliation_approval WHERE tenant_id=$1",[a.scope.tenantId])).rows[0].n).toBe(1);
});
it("refuses stale report hash and approval after a newer run, preserving the queue and books",async()=>{
 const a=await setup(),run=await a.run(),input=proposalInput(a,run),before=await unchanged(a.scope.tenantId,a.scope.jobId);
 await expect(a.repo.propose(a.w.ctx,a.w.session,{...input,adjustment:{...input.adjustment,reportHash:'0'.repeat(64)}})).rejects.toThrow("RECONCILIATION_CONFLICT");
 expect(await a.repo.readAdjustments(a.w.ctx,a.w.session,a.scope.jobId,run.runId)).toEqual([]);
 expect(await unchanged(a.scope.tenantId,a.scope.jobId)).toEqual(before);
 const p=await a.repo.propose(a.w.ctx,a.w.session,input);await a.run();
 const approver=await secondSession(a.w); // LP-6d: the other finance identity approves in its own bound request.
 await expect(a.repo.approve(await ctxFor(approver),approver,{version:"financial-reconciliation-approve.v1",commandId:randomUUID(),jobId:a.scope.jobId,adjustmentId:p.adjustmentId,contentHash:p.contentHash})).rejects.toThrow("RECONCILIATION_CONFLICT");
});
it("concurrent distinct approvals create only one approval and never modify financial books",async()=>{
 const a=await setup(),run=await a.run(),p=await a.repo.propose(a.w.ctx,a.w.session,proposalInput(a,run)),session=await secondSession(a.w);
 const input=()=>({version:"financial-reconciliation-approve.v1",commandId:randomUUID(),jobId:a.scope.jobId,adjustmentId:p.adjustmentId,contentHash:p.contentHash});
 const before=await unchanged(a.scope.tenantId,a.scope.jobId);
 const approver=await ctxFor(session); // LP-6d: both racing approvals are the approver's own bound requests.
 const results=await Promise.allSettled([a.repo.approve(approver,session,input()),a.repo.approve(approver,session,input())]);
 expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(results.filter(r=>r.status==='rejected')).toHaveLength(1);
 expect(await unchanged(a.scope.tenantId,a.scope.jobId)).toEqual(before);
});
it("reads fail closed for foreign and unknown runs, non-finance, revoked and expired sessions",async()=>{
 const a=await setup(),b=await setup(),run=await a.run();
 await a.repo.propose(a.w.ctx,a.w.session,proposalInput(a,run));
 expect(await b.repo.readAdjustments(b.w.ctx,b.w.session,a.scope.jobId,run.runId)).toBeNull();
 expect(await a.repo.readAdjustments(a.w.ctx,a.w.session,a.scope.jobId,randomUUID())).toBeNull();
 const session=await secondSession(a.w);
 await makeSessionExpired(c,session);
 await expect(a.repo.readAdjustments(a.w.ctx,session,a.scope.jobId,run.runId)).rejects.toThrow();
 await new ContractorPracticeSessionRepository(c.runtime).revoke(a.w.ctx,a.w.session);
 await expect(a.repo.readAdjustments(a.w.ctx,a.w.session,a.scope.jobId,run.runId)).rejects.toThrow();
 const member=(await invite(c,b.w.w,"supervisor",{kind:"tenant",id:b.scope.tenantId})).member,s=randomUUID();
 await c.admin.query("INSERT INTO control_plane.contractor_practice_session(session_id,tenant_id,membership_id,identity_user_id,session_digest,created_at,expires_at) VALUES($1,$2,$3,$4,$5,clock_timestamp(),clock_timestamp()+interval '1 day')",[s,b.scope.tenantId,member.membershipId,member.identityUserId,digestOf(s)]);
 // LP-6d: the non-finance member reads in its own bound request and is refused by the read itself.
 await expect(b.repo.readAdjustments(await ctxFor(s),s,b.scope.jobId,run.runId)).rejects.toThrow("EXTRA_FORBIDDEN");
});
