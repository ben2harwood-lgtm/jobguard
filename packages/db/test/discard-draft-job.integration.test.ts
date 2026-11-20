import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { CaptureApplication } from "../../../apps/api/src/capture/capture.application.js";
import { cluster, seedHomeOwner, type Cluster } from "./contractor-practice-session-fixtures.js";
import { authenticatePracticeSession, issuePracticeSession } from "../src/practice-session.js";
import { JobPartiesRepository } from "../src/job-parties-repository.js";
import { withTenant } from "../src/tenant-context.js";

let c: Cluster;
beforeAll(async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  c = await cluster();
  await seedHomeOwner(c);
}, 240_000);
afterAll(async () => { await c?.close(); vi.unstubAllEnvs(); });

async function draft() {
  const token = await issuePracticeSession(c.runtime);
  const auth = await authenticatePracticeSession(c.runtime, token);
  const capture = new CaptureApplication(c.runtime, token);
  const own = await capture.capture({
    contractVersion: "job_capture_v1", requested_tenant_id: auth.context.tenantId, captureId: randomUUID(),
    source: { kind: "text", text: "JOB: Fictional blue room\nITEM: Paint walls | £200.00" }, fixtureId: "deterministic-local-v1",
  });
  return { auth, capture, own, jobId: own.jobId };
}

async function saveReview({ capture, jobId, own }: Awaited<ReturnType<typeof draft>>) {
  const reviewed = await capture.save(jobId, { contractVersion: "proposal_review_command_v1", expectedRevision: 0, review: {
    version: "proposal_review_v1", reviewId: own.reviewId, proposalId: own.proposalId, jobId, revision: 0,
    lines: own.proposal.lines.map(line => ({ id: line.id, scopeItemId: line.scopeItemId, origin: "proposal",
      description: line.description.value, room: line.room, category: line.category, quantity: line.quantity.value ?? "1",
      unit: line.unit.value ?? "item", unitPricePence: line.unitPricePence.value, disposition: "accepted",
      dismissalReason: null, parentScopeItemIds: [], sourceExcerpt: line.sourceExcerpt })),
    questions: own.proposal.questions.map(q => ({ id: randomUUID(), question: q.question.value, blocking: true,
      disposition: "answered", answer: "Fictional builder removes waste" })),
  } });
  return { contractVersion: "proposal_review_confirm_v1", commandId: randomUUID(), expectedRevision: reviewed.review!.revision };
}

const input = (expectedRevision: number) => ({ contractVersion: "draft_discard_v1", commandId: randomUUID(), expectedRevision });
const row = async (jobId: string) => (await c.admin.query<{status: string; revision: number}>(
  "SELECT status,revision FROM app.job WHERE id=$1", [jobId])).rows[0]!;
const scope = async (jobId: string) => (await c.admin.query("SELECT id,state FROM app.scope_identity WHERE job_id=$1 ORDER BY id", [jobId])).rows;
const listed = async (auth: Awaited<ReturnType<typeof draft>>["auth"], jobId: string) =>
  (await new JobPartiesRepository(c.runtime).list(auth.context, auth.membershipId, auth.digest)).jobs.some(job => job.id === jobId);

it("keeps the row, scope and one succeeded receipt, and refuses later confirmation", async () => {
  const f = await draft();
  const confirm = await saveReview(f);
  const before = await row(f.jobId), identities = await scope(f.jobId);
  expect(identities.length).toBeGreaterThan(0);
  expect(await listed(f.auth, f.jobId)).toBe(true);
  const command = input(before.revision);
  const result = { jobId: f.jobId, revision: before.revision + 1, status: "lost" };
  const outcomes = await Promise.all([f.capture.discard(f.jobId, command), f.capture.discard(f.jobId, command)]);
  expect(outcomes).toEqual([result, result]);
  await expect(f.capture.discard(f.jobId, { ...command, expectedRevision: before.revision + 1 }))
    .rejects.toMatchObject({ code: "COMMAND_CONFLICT" });
  await expect(f.capture.confirm(f.jobId, confirm)).rejects.toMatchObject({ code: "REVIEW_REVISION_CONFLICT" });
  expect(await row(f.jobId)).toEqual({ status: "lost", revision: result.revision });
  expect(await scope(f.jobId)).toEqual(identities);
  expect(await listed(f.auth, f.jobId)).toBe(false);
  expect((await c.admin.query(`SELECT command_id,status,result FROM app.command_receipt
    WHERE tenant_id=$1 AND command_type='job.discard_draft' AND semantic_key=$2`,
  [f.auth.context.tenantId, `job:${f.jobId}:discard`])).rows).toEqual([
    { command_id: command.commandId, status: "succeeded", result },
  ]);
});

it("refuses a stale revision and jobs already quoting, live or invoiced", async () => {
  const f = await draft();
  const before = await row(f.jobId);
  await expect(f.capture.discard(f.jobId, input(before.revision + 1))).rejects.toMatchObject({ code: "REVIEW_REVISION_CONFLICT" });
  expect(await row(f.jobId)).toEqual(before);
  await f.capture.confirm(f.jobId, await saveReview(f));
  const live = (await new JobPartiesRepository(c.runtime).list(f.auth.context, f.auth.membershipId, f.auth.digest))
    .jobs.find(job => job.status === "live")!;
  for (const [jobId, status] of [[f.jobId, "quoting"], [live.id, "live"], [live.id, "invoiced"]] as const) {
    if (status === "invoiced") {
      await c.admin.query("UPDATE app.job SET status='invoiced' WHERE tenant_id=$1 AND id=$2", [f.auth.context.tenantId, jobId]);
    }
    const job = await row(jobId);
    expect(job.status).toBe(status);
    await expect(f.capture.discard(jobId, input(job.revision))).rejects.toMatchObject({ code: "DISCARD_DRAFT_REFUSED" });
    expect(await row(jobId)).toEqual(job);
    expect(await listed(f.auth, jobId)).toBe(true);
  }
});

it("refuses another tenant or practice session and a non-owner actor", async () => {
  const f = await draft(), stranger = await draft();
  const before = await row(f.jobId), tenantId = f.auth.context.tenantId;
  const foreignTenant = randomUUID(), foreignJob = randomUUID(), staff = randomUUID(), staffUser = randomUUID();
  await c.admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [foreignTenant]);
  await c.admin.query("INSERT INTO app.job(tenant_id,id,title,status,provenance) VALUES($1,$2,'Fictional foreign draft','draft','system_generated_quote')", [foreignTenant, foreignJob]);
  const foreignBefore = await row(foreignJob);
  await expect(f.capture.discard(foreignJob, input(foreignBefore.revision))).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(stranger.capture.discard(f.jobId, input(before.revision))).rejects.toMatchObject({ code: "NOT_FOUND" });

  await c.admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [staffUser]);
  await c.admin.query(`INSERT INTO app.membership(tenant_id,id,account_id,identity_user_id,role)
    SELECT tenant_id,$3,account_id,$4,'staff' FROM app.membership WHERE tenant_id=$1 AND id=$2`,
  [tenantId, f.auth.membershipId, staff, staffUser]);
  await expect(withTenant(c.runtime, f.auth.context, db => db.$client.query(
    "SELECT app.discard_draft_job($1,$2,$3,$4,$5,$6)",
    [tenantId, f.jobId, before.revision, staff, randomUUID(), randomUUID()]))).rejects.toMatchObject({ code: "42501" });
  expect(await row(f.jobId)).toEqual(before);
  expect(await row(foreignJob)).toEqual(foreignBefore);
});
