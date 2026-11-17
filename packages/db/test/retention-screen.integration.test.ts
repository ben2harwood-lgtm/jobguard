import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { IdentityRepository } from "../src/identity-repository.js";
import { RetentionRecordRepository } from "../src/retention-record-repository.js";
import { IdentityApplication } from "../../../apps/api/src/auth/identity.application.js";
import { PersistedAuthProvider } from "../../../apps/api/src/auth/persisted-auth-provider.js";
import { RetentionRecordApplication } from "../../../apps/api/src/retention-record.application.js";
import { createWorkFixture, closeWorkFixture, type WorkFixture } from "./job-work-state-fixtures.js";
import { meterCompany } from "./meter-persistence-fixtures.js";
let f: WorkFixture, infrastructure: Pool;
beforeAll(async () => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); f = await createWorkFixture(); infrastructure = new Pool({ ...f.admin.options, password: f.admin.options.password, options: "-c role=jobguard_infrastructure", max: 1 }); }, 240000);
afterAll(async () => { await infrastructure?.end(); await closeWorkFixture(f); vi.unstubAllEnvs(); });
async function company() {
  const a = await meterCompany(f), token = randomUUID();
  const provider = new PersistedAuthProvider(new IdentityRepository(f.admin), "fictional-retention-screen-secret-32-bytes");
  const csrf = randomUUID();
  await f.admin.query("UPDATE identity.session SET token_digest=$1,csrf_token=$2 WHERE id=$3", [provider.digest(`session:${token}`), csrf, a.sessionId]);
  const app = new RetentionRecordApplication(new IdentityApplication(provider, "https://company.invalid"), new RetentionRecordRepository(f.runtime));
  return { ...a, app, credentials: { sessionToken: token, csrfToken: csrf, origin: "https://company.invalid" } };
}
async function financialSnapshot() {
  const tables = (await f.admin.query("SELECT tablename FROM pg_tables WHERE schemaname='app' ORDER BY tablename")).rows.map(r => r.tablename as string)
    .filter(name => /invoice|ledger|journal|receipt|fee|collection|payment|action_outbox/u.test(name));
  const snapshot: Record<string, unknown> = {};
  for (const table of tables) snapshot[table] = (await f.admin.query(`SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),'[]'::jsonb) rows FROM app."${table}" r`)).rows[0].rows;
  return snapshot;
}
it("session application reads timer review, resolves as session person, refuses stale/reused approvals and changes no financial rows", async () => {
  const a = await company(), b = await company(), pid = randomUUID(), condition = randomUUID();
  const amount = { netPence: 10000, taxPence: 2000 }, source = { kind: "contract_profile", profileVersion: "fictional.v1", clause: "retention" };
  const profile = { version: "retention.profile.v1", revision: 1, previousProfileId: null as string | null, contractProfileVersion: "fictional.v1",
    fixtureApprovalId: randomUUID(), taxTreatmentVersion: "fictional.v1", retained: amount, alreadyBilled: { netPence: 0, taxPence: 0 },
    conditions: [{ id: condition, milestone: "completion", description: "Fictional release", source, dateSource: source, dueDate: "2000-01-01", cumulativeLimit: amount }] };
  const input = (record: unknown, commandId = randomUUID()) => ({ version: "retention-record-command.v1", commandId, jobId: a.jobId, record });
  const append = (record: unknown, id = randomUUID()) => a.app.command(a.credentials, a.jobId, input(record, id));
  const read = () => a.app.read(a.credentials, a.jobId);
  const before = await financialSnapshot();
  await append(profile, pid); await new RetentionRecordRepository(f.runtime).raiseTimerReviews(a.context);
  const review = (await read()).book.records[1]!;
  expect(review).toMatchObject({ version: "retention.review.v1", trigger: "timer" });
  expect((await read()).reconciliation).toMatchObject({ pendingReviewIds: [review.id], released: { netPence: 0, taxPence: 0 } });
  const resolutionId = randomUUID(), resolution = { version: "retention.resolution.v1", reviewId: review.id, outcome: "approved", conditionSatisfied: true,
    humanSource: { inputId: randomUUID() }, amount: { netPence: 4000, taxPence: 800 } };
  await expect(append({ ...resolution, humanSource: { ...resolution.humanSource, actorId: b.actorId } })).rejects.toThrow("INVALID_RETENTION_INPUT");
  await append(resolution, resolutionId);
  expect((await read()).book.records.at(-1)).toMatchObject({ humanSource: { actorId: a.actorId } });
  const release = { version: "retention.release.v1", resolutionId }, releaseId = randomUUID();
  await append(release, releaseId); await append(release, releaseId);
  await expect(append(release)).rejects.toMatchObject({ code: "REPLAY_CONFLICT" });
  await expect(append({ ...profile, taxTreatmentVersion: "changed" }, pid)).rejects.toMatchObject({ code: "REPLAY_CONFLICT" });
  const receiptId = randomUUID();
  await append({ version: "retention.receipt.v1", releaseId, grossPence: 4800 }, receiptId);
  await append({ version: "retention.reversal.v1", receiptId, grossPence: 1200 });
  await append({ ...profile, revision: 2, previousProfileId: pid, conditions: profile.conditions.map(c => ({ ...c, dueDate: "2001-01-01" })) });
  await new RetentionRecordRepository(f.runtime).raiseTimerReviews(a.context);
  const nextReview = (await read()).book.records.at(-1)!;
  const finalResolution = randomUUID();
  await append({ ...resolution, reviewId: nextReview.id, amount: { netPence: 6000, taxPence: 1200 } }, finalResolution);
  // A date change invalidates this approval before any release is recorded.
  const currentProfile = (await read()).book.records.findLast(r => r.version === "retention.profile.v1")!;
  const saved = await read();
  await append({ ...profile, revision: 3, previousProfileId: currentProfile.id, conditions: profile.conditions.map(c => ({ ...c, dueDate: "2002-01-01" })) });
  const afterRevision = await read();
  await expect(append({ version: "retention.release.v1", resolutionId: finalResolution })).rejects.toMatchObject({ code: "STALE_PROFILE" });
  expect(await read()).toEqual(afterRevision);
  await new RetentionRecordRepository(f.runtime).raiseTimerReviews(a.context);
  const finalReview = (await read()).book.records.at(-1)!, finalId = randomUUID();
  await append({ ...resolution, reviewId: finalReview.id, amount: { netPence: 6000, taxPence: 1200 } }, finalId);
  await append({ version: "retention.release.v1", resolutionId: finalId });
  expect((await read()).reconciliation).toMatchObject({ remaining: { netPence: 0, taxPence: 0 }, released: amount, grossReceived: { pence: 3600 }, feeEligibleRecovery: { pence: 0 } });
  expect((await read()).book.records.slice(0, saved.book.records.length)).toEqual(saved.book.records);
  expect(await financialSnapshot()).toEqual(before);
  for (const jobId of [b.jobId, randomUUID()]) {
    await expect(a.app.read(a.credentials, jobId)).rejects.toMatchObject({ code: "RETENTION_NOT_FOUND" });
    await expect(a.app.command(a.credentials, jobId, { ...input(release), jobId })).rejects.toMatchObject({ code: "RETENTION_NOT_FOUND" });
  }
  for (const key of ["tenantId", "actorId", "enabled"]) await expect(a.app.command(a.credentials, a.jobId, { ...input(release), [key]: true })).rejects.toThrow("INVALID_RETENTION_INPUT");
  const beforeRefusals = await read();
  for (const role of ["estimator", "foreman", "finance", "read_only"]) {
    await f.admin.query("UPDATE app.membership SET role=$1 WHERE tenant_id=$2 AND id=$3", [role, a.tenantId, a.actorId]);
    await expect(append(release)).rejects.toThrow();
    await expect(read()).rejects.toThrow("RETENTION_FORBIDDEN");
  }
  await f.admin.query("UPDATE app.membership SET role='owner' WHERE tenant_id=$1 AND id=$2", [a.tenantId,a.actorId]);
  expect(await read()).toEqual(beforeRefusals);
  await f.admin.query("UPDATE identity.session SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", [a.sessionId]);
  await expect(read()).rejects.toThrow("UNAUTHENTICATED");
  await f.admin.query("UPDATE identity.session SET expires_at=clock_timestamp()+interval '1 hour',revoked_at=clock_timestamp() WHERE id=$1", [b.sessionId]);
  await expect(b.app.read(b.credentials, b.jobId)).rejects.toThrow("UNAUTHENTICATED");
}, 60000);
