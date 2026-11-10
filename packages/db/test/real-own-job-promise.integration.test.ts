import { withTenant } from "../src/tenant-context.js";
// REAL-OWN-JOB-PROMISE: real PostgreSQL, exact practice originals, no seeded signals.
import { withTenant } from "../src/tenant-context.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { CaptureApplication } from "../../../apps/api/src/capture/capture.application.js";
import { FinalCheckWorker } from "../../../apps/api/src/final-check.worker.js";
import { startBlankPracticeCompany } from "../src/blank-practice-company.js";
import { authenticatePracticeSession, practiceMaterialPool } from "../src/practice-session.js";
import { FinalCheckRepository } from "../src/final-check-repository.js";
import { FinalAccountLockRepository } from "../src/final-account-lock-repository.js";
import { JobSourceRepository } from "../src/job-source-repository.js";
import { JobPartiesRepository } from "../src/job-parties-repository.js";
import { FinalCheckCompletionRepository, practiceFinalCheckPorts } from "../src/shadow-detection-repository.js";
import { createFinalCheckFixture, closeFinalCheckFixture, seedFinalCheckJob, finalCheckTenant, type FinalCheckFixture } from "./final-check-fixture.js";

const request = "can you also paint the hallway ceiling? Happy to pay extra";
const diary = "Painted the hallway ceiling as asked, three hours extra, about 150 pounds";
let f: FinalCheckFixture;
beforeAll(async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  f = await createFinalCheckFixture();
  await seedFinalCheckJob(f); // Existing synthetic home owner, outside each blank firm's namespace.
}, 240_000);
afterAll(async () => { await closeFinalCheckFixture(f); vi.unstubAllEnvs(); });

async function ownJob() {
  const token = await startBlankPracticeCompany(f.runtime, { version: "blank-practice-company.v1", action: "start" });
  const a = await authenticatePracticeSession(f.runtime, token), tenantId = a.context.tenantId;
  expect((await new JobPartiesRepository(f.runtime).list(a.context, a.membershipId, a.digest)).jobs).toEqual([]);
  const captured = await new CaptureApplication(f.runtime, token).capture({ contractVersion: "job_capture_v1", requested_tenant_id: tenantId,
    captureId: randomUUID(), source: { kind: "text", text: "JOB: Fictional blue room\nITEM: Paint walls | £200.00" }, fixtureId: "deterministic-local-v1" });
  const jobId = captured.jobId, scopeId = captured.proposal.lines[0]!.scopeItemId;
  const baselineId = randomUUID(), draftId = randomUUID(), revisionId = randomUUID();
  // Owner-only accepted baseline/account preparation, as seedFinalCheckJob does.
  // Capture, source intake, lock, detection, reveal and confirmation use real boundaries.
  await finalCheckTenant(f.admin, tenantId, async db => {
    await db.query("UPDATE app.scope_identity SET state='confirmed' WHERE tenant_id=$1 AND id=$2", [tenantId, scopeId]);
    await db.query("INSERT INTO app.job_commercial_track(tenant_id,job_id,job_track,environment,provenance) VALUES($1,$2,'small_builder','synthetic_demo','backfilled_synthetic_fixture')", [tenantId, jobId]);
    await db.query("UPDATE app.job SET status='live' WHERE tenant_id=$1 AND id=$2", [tenantId, jobId]);
    await db.query("INSERT INTO app.quote_version(id,tenant_id,job_id,version,content_hash,net_value_pence,status) VALUES($1,$2,$3,1,$4,20000,'accepted')", [baselineId, tenantId, jobId, "a".repeat(64)]);
    await db.query("INSERT INTO app.final_account_draft(id,tenant_id,job_id) VALUES($1,$2,$3)", [draftId, tenantId, jobId]);
    await db.query("INSERT INTO app.final_account_revision(id,tenant_id,job_id,final_account_draft_id,revision,source_hash,baseline_quote_version_id,currency,tax_policy_version,net_pence,tax_pence,total_pence,issue_blocked,findings) VALUES($1,$2,$3,$4,1,$5,$6,'GBP','candidate_m1_standard_v1',20000,4000,24000,false,'[]')", [revisionId, tenantId, jobId, draftId, "a".repeat(64), baselineId]);
    await db.query("INSERT INTO app.final_account_line(id,tenant_id,job_id,final_account_revision_id,line_kind,source_id,scope_item_id,commercial_revision_id,description,net_pence,ordinal) VALUES($1,$2,$3,$4,'baseline',$5,$6,$5,'Paint walls',20000,1)", [randomUUID(), tenantId, jobId, revisionId, baselineId, scopeId]);
    await db.query("UPDATE app.final_account_draft SET current_revision_id=$1,revision=1 WHERE tenant_id=$2 AND id=$3", [revisionId, tenantId, draftId]);
  });
  const locks = new FinalAccountLockRepository(practiceMaterialPool(f.runtime, a.digest));
  await locks.acceptTerms(a.context, { actorMembershipId: a.membershipId, commandId: randomUUID(), termsVersion: "synthetic_final_check_terms.v1" });
  await locks.disposition(a.context, { jobId, actorMembershipId: a.membershipId, commandId: randomUUID(), scopeItemId: scopeId, disposition: "done" });
  return { ...a, jobId, tenantId, revisionId, lock: () => locks.lock(a.context, { jobId, actorMembershipId: a.membershipId, commandId: randomUUID(), finalAccountRevisionId: revisionId, expectedRevision: 1, declarationVersion: "final_account_declaration.v1" }) };
}
type OwnJob = Awaited<ReturnType<typeof ownJob>>;
async function originals(a: OwnJob, note = diary) {
  const repo = new JobSourceRepository(f.runtime);
  const message = await repo.intake(a.context, a.jobId, a.digest, "customer_message", { version: "customer-message-input.v1", commandId: randomUUID(), fictionalCustomer: { kind: "named_fictional_customer", name: "Fictional Alex" }, text: request });
  const entry = await repo.intake(a.context, a.jobId, a.digest, "diary", { version: "job-diary-input.v1", commandId: randomUUID(), entryMode: "typed", onSite: false, text: note });
  return [message.record.evidence.id, entry.record.evidence.id];
}
async function run(a: OwnJob) {
  const context = testTenantContext(a.tenantId, { bound: false });
  const repo = new FinalCheckRepository(f.shadow), manifest = await repo.begin(context, a.jobId);
  const worker = new FinalCheckWorker(practiceFinalCheckPorts(f.shadow, f.runtime, "f".repeat(64)), "synthetic_demo");
  return { manifest, execute: () => worker.execute(context, { version: "final-check.task.v1", jobId: a.jobId, manifestId: manifest.id }) };
}
const count = async (a: OwnJob, table: string) => Number((await f.admin.query(`SELECT count(*) n FROM app.${table} WHERE tenant_id=$1 AND job_id=$2`, [a.tenantId, a.jobId])).rows[0].n);

it("reveals the omitted hallway work with both originals; replay creates just one unpriced draft, with no claim or charge", async () => {
  const a = await ownJob(), ids = await originals(a);
  await a.lock(); const task = await run(a);
  const result = await task.execute() as { runId: string };
  await new FinalCheckCompletionRepository(f.shadow).publish(testTenantContext(a.tenantId, { bound: false }), { version: "final-check-publication.v1", jobId: a.jobId, runId: result.runId, checkId: randomUUID() });
  const repo = new FinalCheckRepository(f.runtime), view = await repo.read(a.context, a.jobId, a.digest);
  expect(view.state).toBe("completed");
  expect(view.items).toHaveLength(1);
  const item = view.items[0]!;
  expect(item.description).toBe("hallway ceiling");
  expect((item.evidence as { id: string }[]).map(e => e.id).sort()).toEqual(ids.sort());
  const other = await ownJob(); await originals(other); // Identical text grants no access to A's reveal.
  await expect(repo.read(other.context, a.jobId, other.digest)).rejects.toMatchObject({ code: "FINAL_CHECK_FORBIDDEN" });
  expect((await repo.read(other.context, other.jobId, other.digest)).items).toEqual([]);
  expect(await count(a, "variation")).toBe(0);
  const command = { version: "final-check.catch.v1", commandId: randomUUID(), lockId: view.lockId, runId: view.runId, signalId: item.signalId, expectedSignalRevision: item.signalRevision };
  const first = await repo.confirmCatch(a.context, a.jobId, a.digest, command);
  expect(await repo.confirmCatch(a.context, a.jobId, a.digest, command)).toEqual(first);
  expect((await f.admin.query("SELECT state,origin FROM app.variation WHERE tenant_id=$1 AND job_id=$2", [a.tenantId, a.jobId])).rows).toEqual([{ state: "draft", origin: "jobguard_catch" }]);
  for (const table of ["variation_revision", "variation_approval", "recovery_case", "recovery_claim_revision", "customer_invoice", "recovery_fee_journal", "success_fee_journal"])
    expect(await count(a, table), table).toBe(0);
});

it.each(["I also painted the cupboard", diary + "."])("ordinary own words are examined and permit publication: %s", async text => {
  const a = await ownJob(); await originals(a, text);
  await a.lock(); const task = await run(a), result = await task.execute() as { runId: string };
  await new FinalCheckCompletionRepository(f.shadow).publish(testTenantContext(a.tenantId), { version: "final-check-publication.v1", jobId: a.jobId, runId: result.runId, checkId: randomUUID() });
  const fresh = await new FinalCheckRepository(f.shadow).manifest(testTenantContext(a.tenantId), a.jobId, task.manifest.id);
  expect(fresh.sources.filter(s => s.sourceKind !== "builder_capture_not_scanned").every(s => ["zero_result", "detected"].includes(s.status))).toBe(true);
  expect((await new FinalCheckRepository(f.runtime).read(a.context, a.jobId, a.digest)).state).toBe("completed");
});

it("invalidated evidence keeps completion, publication and invoice blocked", async () => {
  const a = await ownJob(); await originals(a);
  await a.lock();
  await finalCheckTenant(f.admin, a.tenantId, db => db.query("INSERT INTO app.evidence_invalidation(id,tenant_id,evidence_id,actor_membership_id,reason_code) SELECT $1,tenant_id,evidence_id,$3,'verification_invalid' FROM app.job_source_original WHERE tenant_id=$2 AND job_id=$4 AND source_kind='diary'", [randomUUID(), a.tenantId, a.membershipId, a.jobId]));
  const task = await run(a);
  await expect(task.execute()).rejects.toMatchObject({ code: "FINAL_CHECK_PENDING" });
  const fresh = await new FinalCheckRepository(f.shadow).manifest(testTenantContext(a.tenantId, { bound: false }), a.jobId, task.manifest.id);
  await expect(new FinalCheckCompletionRepository(f.shadow).publish(testTenantContext(a.tenantId, { bound: false }), { version: "final-check-publication.v1", jobId: a.jobId, runId: randomUUID(), checkId: randomUUID() })).rejects.toThrow();
  expect(fresh.result).toBeNull(); expect(fresh.sources.some(s => s.status === "unsupported")).toBe(true);
  expect(await new FinalCheckRepository(f.runtime).read(a.context, a.jobId, a.digest)).toMatchObject({ state: "failed", items: [] });
  await expect(withTenant(practiceMaterialPool(f.runtime, a.digest), a.context, db => db.$client.query("SELECT app.issue_lock_bound_customer_invoice($1,$2,$5,$3,$4,'final','fictional@example.invalid','2026-11-09'::date,$6)", [a.tenantId, a.jobId, a.membershipId, randomUUID(), a.revisionId, "a".repeat(64)]))).rejects.toThrow(/FINAL_CHECK/u);
  expect(await count(a, "customer_invoice")).toBe(0);
});

it("refuses the exact original after lock and leaves the frozen inventory unchanged", async () => {
  const a = await ownJob(); await originals(a); await a.lock();
  const task = await run(a), before = task.manifest.sources;
  await expect(new JobSourceRepository(f.runtime).intake(a.context, a.jobId, a.digest, "diary", { version: "job-diary-input.v1", commandId: randomUUID(), entryMode: "typed", onSite: false, text: diary })).rejects.toMatchObject({ code: "POST_LOCK_WORK_REQUIRES_LINKED_JOB" });
  expect((await new FinalCheckRepository(f.shadow).manifest(testTenantContext(a.tenantId, { bound: false }), a.jobId, task.manifest.id)).sources).toEqual(before);
});
