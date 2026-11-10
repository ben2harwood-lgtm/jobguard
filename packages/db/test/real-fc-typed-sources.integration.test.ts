// Real PostgreSQL + actual worker ports. Private synthetic fixture only; no seeded detections.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { withTenant } from "../src/tenant-context.js";
import { practiceMaterialPool } from "../src/practice-session.js";
import { JobSourceRepository } from "../src/job-source-repository.js";
import { FinalCheckRepository } from "../src/final-check-repository.js";
import { FinalCheckCompletionRepository, practiceFinalCheckPorts } from "../src/shadow-detection-repository.js";
import { FinalCheckWorker } from "../../../apps/api/src/final-check.worker.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { createFinalCheckFixture, closeFinalCheckFixture, seedFinalCheckJob, finalCheckTenant, FINAL_CHECK_ACTOR, type FinalCheckFixture } from "./final-check-fixture.js";

let f: FinalCheckFixture;
const diary = "also painted the hallway ceiling, customer asked";
const request = "Please paint the hallway ceiling as an extra.";
beforeAll(async () => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); f = await createFinalCheckFixture(); }, 240000);
afterAll(async () => { await closeFinalCheckFixture(f); vi.unstubAllEnvs(); });
async function setup(note: string | null = diary, message: string | null = request) {
  const a = await seedFinalCheckJob(f), sources = new JobSourceRepository(f.runtime);
  if (message !== null) await sources.intake(a.context, a.jobId, a.digest, "customer_message", { version: "customer-message-input.v1", commandId: randomUUID(), fictionalCustomer: { kind: "named_fictional_customer", name: "Fictional Alex" }, text: message });
  if (note !== null) await sources.intake(a.context, a.jobId, a.digest, "diary", { version: "job-diary-input.v1", commandId: randomUUID(), entryMode: "typed", onSite: false, text: note });
  await a.lock();
  const repo = new FinalCheckRepository(f.shadow), m = await repo.begin(a.context, a.jobId);
  const ports = practiceFinalCheckPorts(f.shadow, f.runtime, "f".repeat(64));
  const worker = new FinalCheckWorker(ports, "synthetic_demo");
  return { ...a, repo, m, ports, execute: () => worker.execute(a.context, { version: "final-check.task.v1", jobId: a.jobId, manifestId: m.id }) };
}
it.each([
  [diary, request, null],
  [diary + ". Estimated extra 150 pounds.", request, 15000],
  [diary + ". Estimated extra £150.", request, 15000],
  [diary + ". Estimated extra 150 quid.", request, 15000],
  [diary + ". Estimated extra £150. Estimated extra £200.", request, null],
  [null, request, null],
  ["ALSO PAINTED THE HALLWAY CEILING, CUSTOMER ASKED!", "CAN YOU ALSO PAINT THE HALLWAY CEILING?", null],
  ["Weather was sunny today.", "Thanks for the update.", null],
] as const)("examines ordinary originals, coalesces proposals and replays certificate/invoice once: %s", async (note, message, estimate) => {
  const a = await setup(note, message), result = await a.execute() as { runId: string };
  const count = message.startsWith("Thanks") ? 0 : 1;
  const completed = await a.repo.manifest(a.context, a.jobId, a.m.id);
  expect(completed.sources.every(s => ["zero_result", "detected"].includes(s.status))).toBe(true);
  if (count === 0) expect(completed.sources.every(s => s.status === "zero_result")).toBe(true);
  const completion = new FinalCheckCompletionRepository(f.shadow), checkId = randomUUID();
  const publication = { version: "final-check-publication.v1" as const, jobId: a.jobId, runId: result.runId, checkId };
  await completion.publish(a.context, publication);
  await completion.publish(a.context, publication);
  expect(await a.execute()).toMatchObject({ runId: result.runId });
  const view = await new FinalCheckRepository(f.runtime).read(a.context, a.jobId, a.digest);
  expect(view).toMatchObject({ state: "completed" }); expect(view.items).toHaveLength(count);
  if (count) {
    const originalIds = (await f.admin.query("SELECT evidence_id FROM app.job_source_original WHERE tenant_id=$1 AND job_id=$2 ORDER BY evidence_id", [a.tenantId, a.jobId])).rows.map(row => row.evidence_id);
    expect((view.items[0]!.evidence as { id: string }[]).map(e => e.id).sort()).toEqual(originalIds);
    expect(originalIds).toHaveLength(note === null ? 1 : 2);
    const proposals = (await finalCheckTenant(f.admin, a.tenantId, db => db.query("SELECT estimated_value_pence FROM app.shadow_commercial_signal WHERE tenant_id=$1 AND job_id=$2", [a.tenantId, a.jobId]))).rows;
    if (estimate !== null) expect(proposals.some(p => Number(p.estimated_value_pence) === estimate)).toBe(true);
    else expect(proposals.every(p => p.estimated_value_pence === null)).toBe(true);
  }
  const issueId = randomUUID();
  const issue = () => withTenant(practiceMaterialPool(f.runtime, a.digest), a.context, db => db.$client.query("SELECT app.issue_lock_bound_customer_invoice($1,$2,$3,$4,$5,'final','fictional@example.invalid','2026-11-09'::date,$6)", [a.tenantId, a.jobId, a.revisionId, FINAL_CHECK_ACTOR, issueId, "a".repeat(64)]));
  await issue(); await issue();
  expect((await f.admin.query("SELECT count(*)::int n FROM app.final_account_lock_check WHERE tenant_id=$1 AND job_id=$2", [a.tenantId, a.jobId])).rows[0].n).toBe(1);
  expect((await f.admin.query("SELECT count(*)::int n FROM app.customer_invoice WHERE tenant_id=$1 AND job_id=$2", [a.tenantId, a.jobId])).rows[0].n).toBe(1);
});

it("preserves the reviewed must-surface fixture refusal in the actual worker", async () => {
  const a = await setup(null, "Fictional practice customer request: please build a garden room for £8,000 net; written agreement is required before work starts.");
  expect(await a.ports.process(a.context, a.m, a.m.sources[0]!)).toMatchObject({ status: "unsupported", failureCode: "UNSUPPORTED_SOURCE" });
  await expect(a.execute()).rejects.toThrow("FINAL_CHECK_PENDING");
  expect((await a.repo.manifest(a.context, a.jobId, a.m.id)).result).toBeNull();
});

it("rejects forged tenant/job/source/version/hash/time/length/frozen bindings at the actual worker port", async () => {
  const a = await setup(), s = a.m.sources[0]!, other = await seedFinalCheckJob(f);
  for (const changed of [
    { ...s, sourceKind: "email" }, { ...s, sourceRef: randomUUID() }, { ...s, evidenceId: randomUUID() },
    { ...s, objectVersionId: "wrong-version" }, { ...s, sha256: "0".repeat(64) }, { ...s, inputHash: "0".repeat(64) },
    { ...s, receivedAt: s.receivedAt.replace("Z", "+00:01") }, { ...s, input: { ...(s.input as object), byte_length: 1 } },
  ]) expect(await a.ports.process(a.context, a.m, changed)).toMatchObject({ status: "unsupported" });
  await expect(a.ports.process(testTenantContext(randomUUID()), a.m, s)).rejects.toThrow();
  await expect(a.ports.process(a.context, { ...a.m, comparisons: { ...a.m.comparisons, jobId: other.jobId } }, s)).rejects.toThrow();
  // Another firm/session cannot read or process A's job merely by knowing IDs.
  await expect(new JobSourceRepository(f.runtime).read(a.context, a.jobId, other.digest, "diary")).rejects.toThrow();
  await f.admin.query("UPDATE control_plane.practice_session SET revoked_at=clock_timestamp() WHERE token_digest=$1", [a.digest]);
  expect(await a.ports.process(a.context, a.m, s)).toMatchObject({ status: "unsupported", failureCode: "SOURCE_INVALID" });
  await expect(new FinalCheckRepository(f.runtime).read(a.context, a.jobId, a.digest)).rejects.toThrow();
});

it("invalidated sources block completion/publication, and post-lock intake cannot change inventory", async () => {
  const a = await setup(), s = a.m.sources[0]!;
  // Owner-only simulation in this disposable cluster: 0666 refuses invalidating a locked verified source,
  // so bypass triggers for this one insert to model evidence invalidated by other means.
  await finalCheckTenant(f.admin, a.tenantId, async db => { await db.query("SET LOCAL session_replication_role='replica'"); return db.query("INSERT INTO app.evidence_invalidation(id,tenant_id,evidence_id,actor_membership_id,reason_code) VALUES($1,$2,$3,$4,'verification_invalid')", [randomUUID(), a.tenantId, s.evidenceId, FINAL_CHECK_ACTOR]); });
  expect(await a.ports.process(a.context, a.m, s)).toMatchObject({ status: "unsupported", failureCode: "SOURCE_INVALID" });
  await expect(a.execute()).rejects.toThrow("FINAL_CHECK_PENDING");
  await expect(new FinalCheckCompletionRepository(f.shadow).publish(a.context, { version: "final-check-publication.v1", jobId: a.jobId, runId: randomUUID(), checkId: randomUUID() })).rejects.toThrow();
  await expect(new JobSourceRepository(f.runtime).intake(a.context, a.jobId, a.digest, "diary", { version: "job-diary-input.v1", commandId: randomUUID(), entryMode: "typed", onSite: false, text: diary })).rejects.toMatchObject({ code: "POST_LOCK_WORK_REQUIRES_LINKED_JOB" });
  expect((await a.repo.manifest(a.context, a.jobId, a.m.id)).sources.map(source => source.id)).toEqual(a.m.sources.map(source => source.id));
});

it("missing, altered and invalid UTF-8 original bytes cannot become examined zero-results", async () => {
  const a = await setup(), s = a.m.sources[0]!;
  // Owner-only corruption simulation in this disposable PG cluster. Runtime still
  // has SELECT only; restore both the exact row and the constraint in finally.
  const original = (await f.admin.query("SELECT bytes FROM app.job_source_original WHERE tenant_id=$1 AND evidence_id=$2", [a.tenantId, s.evidenceId])).rows[0].bytes;
  const constraint = (await f.admin.query("SELECT pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conrelid='app.job_source_original'::regclass AND conname='job_source_original_bytes_ck'")).rows[0].definition;
  await f.admin.query("ALTER TABLE app.job_source_original DROP CONSTRAINT job_source_original_bytes_ck, ALTER COLUMN bytes DROP NOT NULL");
  try {
    for (const bytes of [null, Buffer.from("Changed original"), Buffer.from([0xff, 0xfe])]) {
      await finalCheckTenant(f.admin, a.tenantId, async db => {
        await db.query("SET LOCAL session_replication_role='replica'");
        await db.query("UPDATE app.job_source_original SET bytes=$3 WHERE tenant_id=$1 AND evidence_id=$2", [a.tenantId, s.evidenceId, bytes]);
      });
      expect(await a.ports.process(a.context, a.m, s)).toMatchObject({ status: "unsupported", failureCode: "SOURCE_INVALID" });
      await expect(a.execute()).rejects.toThrow("FINAL_CHECK_PENDING");
    }
  } finally {
    await finalCheckTenant(f.admin, a.tenantId, async db => {
      await db.query("SET LOCAL session_replication_role='replica'");
      await db.query("UPDATE app.job_source_original SET bytes=$3 WHERE tenant_id=$1 AND evidence_id=$2", [a.tenantId, s.evidenceId, original]);
    });
    await f.admin.query(`ALTER TABLE app.job_source_original ALTER COLUMN bytes SET NOT NULL, ADD CONSTRAINT job_source_original_bytes_ck ${constraint}`);
  }
});
