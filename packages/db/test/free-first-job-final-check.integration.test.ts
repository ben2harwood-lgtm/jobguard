// MON-3: CI-only PostgreSQL proof. Fictional evidence/feed; no provider calls.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FinalCheckApplication } from "../../../apps/api/src/final-check.application.js";
import { attributionValueReceipt } from "../../../apps/api/src/recovery-attribution-value.js";
import { RecoveryAttributionRepository } from "../src/recovery-attribution-repository.js";
import { StoredReceiptCaseAllocationRepository } from "../src/stored-receipt-case-allocation-repository.js";
import { DEMO_MEMBERSHIP_ID } from "../src/demo-seed.js";
import { PracticeFeedRepository } from "../src/practice-feed-repository.js";
import { snapshot, store } from "./free-first-job-keys-fixtures.js";
import { createFinalCheckFixture, closeFinalCheckFixture, finalCheckTenant, type FinalCheckFixture } from "./final-check-fixture.js";
import { realReceiptFixture } from "./stored-receipt-case-fixture.js";

type Receipt = Awaited<ReturnType<typeof realReceiptFixture>>;

/** Same owner-only admission prerequisite as firstTrialFixture, attached to the
 * existing receipt journey's activation. Not company-route/admission proof.
 * Start/end triggers, lock, check, catch, invoice and receipt writers run normally.
 * Company screen access remains on jobguard-trial-demo-scope-2026-11-01. */
async function trialBeforeLock(f: FinalCheckFixture, tenantId: string, jobId: string) {
 expect((await f.admin.query("SELECT count(*)::int n FROM app.job_activation WHERE tenant_id=$1", [tenantId])).rows).toEqual([{ n: 1 }]);
 const parent = (await f.admin.query<Parameters<typeof snapshot>[0]>(
  'SELECT tenant_id AS "tenantId",job_id AS "jobId",id AS "activationId" FROM app.job_activation WHERE tenant_id=$1 AND job_id=$2', [tenantId, jobId])).rows[0]!;
 const s = snapshot(parent), commandId = randomUUID();
 await store(f, s);
 await finalCheckTenant(f.admin, tenantId, async db => {
  await db.query("INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,actor_membership_id,result,completed_at) VALUES($1,$2::uuid,'ch4.fixture',($2::uuid)::text,$3,'succeeded',$4,'{}',clock_timestamp())", [tenantId, commandId, 'a'.repeat(64), DEMO_MEMBERSHIP_ID]);
  await db.query("SET LOCAL ROLE jobguard_migration");
  await db.query("INSERT INTO app.trial_business_verification(tenant_id,id,version,environment,source,company_number,normalized_phone) VALUES($1,$2,'trial-business-verification.v1','synthetic_demo','fictional_verified_fixture.v1',$3,$4)", [tenantId, s.provenance, s.company, s.phone]);
  await db.query("INSERT INTO app.trial_admission(tenant_id,job_id,activation_id,snapshot_id,verification_id,command_id,admission_kind) VALUES($1,$2,$3,$4,$5,$6,'first')", [tenantId, jobId, parent.activationId, s.id, s.provenance, commandId]);
 });
 expect((await f.admin.query("SELECT started_at<clock_timestamp() AND deadline_at>clock_timestamp() active FROM app.trial_start WHERE tenant_id=$1 AND job_id=$2", [tenantId, jobId])).rows).toEqual([{ active: true }]);
 expect((await f.admin.query("SELECT count(*)::int n FROM app.trial_end_source WHERE tenant_id=$1", [tenantId])).rows).toEqual([{ n: 0 }]);
}

async function illustration(f: FinalCheckFixture, x: Receipt) {
 const revision = (await f.admin.query("SELECT revision FROM app.recovery_case_current WHERE tenant_id=$1 AND id=$2", [x.context.tenantId, x.caseId])).rows[0].revision as number;
 const allocator = new StoredReceiptCaseAllocationRepository(f.runtime, "synthetic_demo");
 const selection = { version: "stored-receipt-case-command.v1", commandId: randomUUID(), action: "review", factLineId: x.fact.lineAllocationId, caseId: x.caseId, workId: x.workId, expectedCaseRevision: revision };
 const review = await allocator.command(x.context, x.jobId, x.auth.digest, selection);
 const saved = await allocator.command(x.context, x.jobId, x.auth.digest, { ...selection, action: "approve", commandId: randomUUID(), reviewId: review.reviewId, approvalHash: review.approvalHash });
 const repo = new RecoveryAttributionRepository(f.runtime);
 const command = { version: "recovery-attribution-command.v1", action: "assess", commandId: randomUUID(), caseId: x.caseId, workId: x.workId, lineId: x.line, lockId: x.lock.id, expectedCaseRevision: revision, expectedAttributionRevision: 0 };
 const assessed = await repo.assess(x.context, x.jobId, x.auth.digest, command);
 expect(assessed.assessmentOutcome).toBe("eligible_for_review");
 expect(assessed.sourceManifest).toContainEqual(expect.objectContaining({ kind: "line_allocation", sourceId: saved.allocationId }));
 expect(await repo.assess(x.context, x.jobId, x.auth.digest, command)).toEqual(assessed);
 return attributionValueReceipt(assessed);
}

// Isolate the control so the trial job is its company's first activation.
// Both use exactly the same synthetic Final Check/receipt ports.
describe.each(["F7", "F5"] as const)("MON-3 trial Final Check %s", kind => {
 let f: FinalCheckFixture, controlFixture: FinalCheckFixture;
 const environment = process.env.JOBGUARD_ENV;
 beforeAll(async () => {
  f = await createFinalCheckFixture();
  controlFixture = await createFinalCheckFixture();
 }, 240_000);
 afterAll(async () => {
  await closeFinalCheckFixture(f);
  await closeFinalCheckFixture(controlFixture);
  if (environment === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV = environment;
 });
 it(kind === "F7" ? "lock ends the trial; a confirmed catch settles and illustrates £800 / £80 / £720 unchanged" : "a completed zero check retains the exact zero wording on the trial job", async () => {
  const ordinary = await realReceiptFixture(controlFixture, kind, "receipt-line-allocation-command.v1");
  expect((await controlFixture.admin.query("SELECT count(*)::int n FROM app.trial_start WHERE tenant_id=$1", [ordinary.context.tenantId])).rows).toEqual([{ n: 0 }]);
  const trial = await realReceiptFixture(f, kind, "receipt-line-allocation-command.v1", false, false, async source => {
   await trialBeforeLock(f, source.context.tenantId, source.jobId);
  });
  const sources = (await f.admin.query(`SELECT e.kind,e.source_id,e.job_id,e.effective_at=l.locked_at exact_time,
   s.deadline_at>l.locked_at before_deadline FROM app.trial_start s
   JOIN app.trial_end_source e ON(e.tenant_id,e.trial_id)=(s.tenant_id,s.id)
   JOIN app.final_account_lock l ON(l.tenant_id,l.job_id,l.id)=(e.tenant_id,e.job_id,e.source_id)
   WHERE s.tenant_id=$1 AND s.job_id=$2`, [trial.context.tenantId, trial.jobId])).rows;
  expect(sources).toEqual([{ kind: "lock", source_id: trial.lock.id, job_id: trial.jobId, exact_time: true, before_deadline: true }]);
  const ended = await finalCheckTenant(f.admin, trial.context.tenantId, async db => {
   await db.query("SET LOCAL ROLE jobguard_migration");
   return (await db.query("SELECT app.mon3_trial_date($1,clock_timestamp()) IS NOT NULL ended", [trial.context.tenantId])).rows[0].ended;
  });
  expect(ended).toBe(true);
  const read = (x: Receipt) => new FinalCheckApplication(x.f.runtime, x.session).get(x.jobId);
  const [control, result] = await Promise.all([read(ordinary), read(trial)]);
  expect(control.state).toBe("completed");expect(result.state).toBe("completed");
  expect(result.lockId).toBe(trial.lock.id);expect(result.runId).toBe(trial.run.runId);
  if (kind === "F7") {
   expect(result.items).toHaveLength(1);
   expect(result.items[0]).toMatchObject({ signalId: trial.signal, disposition: "confirmed_extra" });
   expect(trial.fact).toMatchObject({ paymentId: trial.paymentId, lineId: trial.line, net: { numerator: "80000", denominator: "1" } });
   const feed = await new PracticeFeedRepository(f.runtime, "synthetic_demo").view(trial.context, trial.actor, trial.auth.digest, trial.jobId);
   expect(feed.receipts).toContainEqual(expect.objectContaining({ paymentId: trial.paymentId, amountPence: 96000, assessment: expect.objectContaining({ status: "qualifies" }) }));
   expect(trial.fact.invoiceBinding).toMatchObject({ invoiceId: trial.invoiceId, lockId: trial.lock.id, invoiceKind: "supplementary" });
   const [normalValue, trialValue] = await Promise.all([illustration(controlFixture, ordinary), illustration(f, trial)]);
   expect(trialValue.display).toEqual({ recovered: "£800.00", fee: "£80.00", yoursBeforeVatAndTax: "£720.00" });
   expect(trialValue.display).toEqual(normalValue.display);
   expect(trialValue).toMatchObject({ recovered: normalValue.recovered, fee: normalValue.fee, yoursBeforeVatAndTax: normalValue.yoursBeforeVatAndTax, productionEnabled: false, realExternalActions: 0 });
  } else {
   expect(result.items).toEqual([]);
   expect(result.message).toBe("JobGuard's final check found nothing missing from your bill.");
   expect(result.message).toBe(control.message);
  }
  expect(await read(trial)).toEqual(result);
  for (const table of ["platform_statement", "recovery_fee_journal", "success_fee_journal"])
   expect((await f.admin.query(`SELECT count(*)::int n FROM app.${table} WHERE tenant_id=$1`, [trial.context.tenantId])).rows).toEqual([{ n: 0 }]);
 });
});
