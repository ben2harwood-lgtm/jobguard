// M4-1-S-FLAKE (RED): Confirm scope and opening a recovery case on the same job must never deadlock.
// Real PostgreSQL only. Made-up data only.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { CaptureApplication } from "../../../apps/api/src/capture/capture.application.js";
import { RecoveryCaseApplication } from "../../../apps/api/src/recovery-case.application.js";
import { cluster, seedHomeOwner, type Cluster } from "./contractor-practice-session-fixtures.js";
import { authenticatePracticeSession, issuePracticeSession } from "../src/practice-session.js";

let c: Cluster;
beforeAll(async () => {
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
 c = await cluster(); await seedHomeOwner(c);
}, 240_000);
afterAll(async () => { await c?.close(); vi.unstubAllEnvs(); });

/** A captured job whose review is saved and ready for Confirm scope, exactly as the M4-1-S journey leaves it. */
async function reviewedJob(token: string) {
 const auth = await authenticatePracticeSession(c.runtime, token);
 const capture = new CaptureApplication(c.runtime, token);
 const own = await capture.capture({ contractVersion: "job_capture_v1", requested_tenant_id: auth.context.tenantId, captureId: randomUUID(),
  source: { kind: "text", text: "JOB: Fictional blue room\nITEM: Paint walls | £200.00" }, fixtureId: "deterministic-local-v1" });
 const saved = await capture.save(own.jobId, { contractVersion: "proposal_review_command_v1", expectedRevision: 0, review: {
  version: "proposal_review_v1", reviewId: own.reviewId, proposalId: own.proposalId, jobId: own.jobId, revision: 0,
  lines: own.proposal.lines.map(line => ({ id: line.id, scopeItemId: line.scopeItemId, origin: "proposal", description: line.description.value,
   room: line.room, category: line.category, quantity: line.quantity.value ?? "1", unit: line.unit.value ?? "item", unitPricePence: line.unitPricePence.value,
   disposition: "accepted", dismissalReason: null, parentScopeItemIds: [], sourceExcerpt: line.sourceExcerpt })),
  questions: own.proposal.questions.map(q => ({ id: randomUUID(), question: q.question.value, blocking: true, disposition: "answered", answer: "Fictional builder removes waste" })),
 } });
 return { tenantId: auth.context.tenantId, capture, jobId: own.jobId, revision: saved.review!.revision };
}

const lockWaiters = async () => (await c.admin.query<{ n: number }>(
 "SELECT count(*)::int n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND pid<>pg_backend_pid()")).rows[0]!.n;
async function untilWaiting(n: number) {
 for (let i = 0; i < 1000; i++) { if (await lockWaiters() >= n) return; await new Promise(resolve => setTimeout(resolve, 10)); }
 throw new Error(`expected ${n} lock waiters`);
}
const deadlocks = async () => Number((await c.admin.query("SELECT deadlocks FROM pg_stat_database WHERE datname=current_database()")).rows[0]!.deadlocks);

it("confirm scope and opening a recovery case on the same job both commit, with no deadlock", async () => {
 const token = await issuePracticeSession(c.runtime), recovery = new RecoveryCaseApplication(c.runtime, token);
 const job = await reviewedJob(token), before = await deadlocks();
 // A third, ordinary writer briefly holds the job row. Confirm scope queues on it first, then opening a case queues behind it,
 // which is the interleaving a slower machine produces by itself when the two requests arrive about 50 ms apart.
 const holder = await c.admin.connect();
 let results: PromiseSettledResult<unknown>[];
 try {
  await holder.query("BEGIN");
  await holder.query("SELECT 1 FROM app.job WHERE tenant_id=$1 AND id=$2 FOR UPDATE", [job.tenantId, job.jobId]);
  const confirm = job.capture.confirm(job.jobId, { contractVersion: "proposal_review_confirm_v1", commandId: randomUUID(), expectedRevision: job.revision });
  await untilWaiting(1);
  const open = recovery.command(job.jobId, { version: "recovery-case-command.v1", action: "open", commandId: randomUUID(), caseType: "withheld_customer_payment",
   claimedNetPence: 250000, counterparty: "Fictional Customer", book: "builder_customer", sourceType: "customer_invoice",
   sourceRefs: ["Generated customer invoice INV-18800"], expectedRevision: 0 });
  await untilWaiting(2);
  await holder.query("COMMIT");
  results = await Promise.allSettled([confirm, open]);
 } finally { holder.release(); }
 const failures = results.flatMap((r, i) => r.status === "rejected" ? [`${["confirm", "open"][i]} ${(r.reason as { code?: string }).code}: ${(r.reason as Error).message} ${(r.reason as { detail?: string }).detail ?? ""}`] : []);
 expect(failures).toEqual([]);
 expect(await deadlocks()).toBe(before);
 expect((await c.admin.query("SELECT status FROM app.job WHERE tenant_id=$1 AND id=$2", [job.tenantId, job.jobId])).rows).toEqual([{ status: "quoting" }]);
 expect((await c.admin.query("SELECT claim_pence::int claim FROM app.recovery_case WHERE tenant_id=$1 AND job_id=$2", [job.tenantId, job.jobId])).rows).toEqual([{ claim: 250000 }]);
}, 120_000);
