import { randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { proposalReviewV1, type ProposalReview } from "@jobguard/core";
import {
  CaptureRepository, ConfirmProposalReview, migrate, ProposalReviewRepository,
  reviewContentHash, UserCommandDispatcher, withTenant,
} from "../src/index.js";
import type { PersistCapture } from "../src/capture-repository.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { closeTestPools, freePort, installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";

const tenantId = randomUUID(), accountId = randomUUID(), userId = randomUUID(), memberId = randomUUID();
const context = testTenantContext(tenantId);
let postgres: EmbeddedPostgres, admin: Pool, runtime: Pool;
beforeAll(async () => {
  const directory = await mkdtemp(join(tmpdir(), "later-b8-pg-"));
  const port = await freePort(56500, 300), credential = randomUUID();
  postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password: credential,
    persistent: false, createPostgresUser: process.getuid?.() === 0,
    initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
  await postgres.initialise(); await postgres.start();
  admin = new Pool({ host: "127.0.0.1", port, user: "postgres", password: credential });
  await migrate(admin);
  await installLegacySyntheticPartyFixtures(admin);
  await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [tenantId]);
  await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [userId]);
  await admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Fictional LATER-B8 builder')", [accountId, tenantId]);
  await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')",
    [memberId, tenantId, accountId, userId]);
  // Disposable login inherits existing privileges; no new table write grant.
  await admin.query(`CREATE ROLE later_b8_login LOGIN PASSWORD '${credential}' NOSUPERUSER NOBYPASSRLS; GRANT jobguard_runtime TO later_b8_login`);
  runtime = new Pool({ host: "127.0.0.1", port, database: "postgres", user: "later_b8_login",
    password: credential, max: 4, application_name: "later-b8-capture" });
}, 60000);
afterAll(async () => { await closeTestPools(runtime, admin); await postgres?.stop(); });

function input(): PersistCapture {
  const captureId = randomUUID();
  const provenance = { kind: "extracted" as const, span: { sourceId: captureId, sourceVersion: 1 as const, start: 5, end: 12 } };
  return { captureId, text: "JOB: Kitchen\nITEM: Fictional cabinets", sourceKind: "browser_local_transcript",
    acquisition: { contractVersion: "browser_local_dictation_v1", language: "en-GB", processLocally: true,
      audioUploaded: false, audioStored: false, rawFinalText: "JOB: Kitchen\nITEM: Fictional cabinets", humanEdited: false },
    promptVersion: "fictional-v1", schemaVersion: "fictional-v1", model: "fixture-only",
    proposal: { title: { value: "Kitchen", provenance }, materials: [], questions: [], lines: [{
      description: { value: "Fictional cabinets", provenance }, quantity: { value: "1", provenance },
      unit: { value: "item", provenance }, unitPricePence: { value: null, provenance: { kind: "defaulted", note: "Unknown rate" } },
    }] } };
}
const capture = (value: PersistCapture) => new CaptureRepository(runtime).persist(context, value);
async function reviewFixture() {
  const saved = await capture(input());
  const stored = await new CaptureRepository(runtime).readByJob(context, saved.job_id);
  const line = stored!.lines[0]!;
  const review: ProposalReview = { version: "proposal_review_v1", reviewId: randomUUID(), proposalId: saved.id,
    jobId: saved.job_id, revision: 0, questions: [], lines: [{ id: line.id, scopeItemId: line.scope_item_id,
      origin: "proposal", description: "Fictional cabinets", room: "Kitchen", category: "Joinery", quantity: "1",
      unit: "item", unitPricePence: null, disposition: "accepted", dismissalReason: null,
      parentScopeItemIds: [], sourceExcerpt: "Kitchen" }] };
  return review;
}
async function jobCounts(jobId: string) {
  const counts: Record<string, number> = {};
  for (const [table, predicate] of [
    ["scope_revision", "job_id=$2"], ["audit_event", "subject_ref=$2"], ["decision", "subject_ref=$2"],
    ["command_receipt", "semantic_key LIKE 'job:' || $2 || ':confirm:%'"],
    ["action_authorization", "decision_id IN (SELECT id FROM app.decision WHERE tenant_id=$1 AND subject_ref=$2)"],
  ]) counts[table!] = (await admin.query(`SELECT count(*)::int n FROM app.${table} WHERE tenant_id=$1 AND ${predicate}`, [tenantId, jobId])).rows[0].n;
  return counts;
}

describe("LATER-B8 capture provenance and review races (real PostgreSQL)", () => {
  it.each(["kind", "acquisition", "prompt", "schema", "model", "proposal", "span", "text"])(
    "L012 same command with changed source provenance conflicts: %s", async field => {
      const original = input(), first = await capture(original), changed = structuredClone(original);
      if (field === "kind") changed.sourceKind = "text";
      if (field === "acquisition") changed.acquisition = { ...changed.acquisition, humanEdited: true };
      if (field === "prompt") changed.promptVersion = "fictional-v2";
      if (field === "schema") changed.schemaVersion = "fictional-v2";
      if (field === "model") changed.model = "fixture-v2";
      if (field === "proposal") changed.proposal.title.value = "Edited title";
      if (field === "span") changed.proposal.title.provenance = { kind: "extracted", span: {
        sourceId: original.captureId, sourceVersion: 1, start: 6, end: 12 } };
      if (field === "text") changed.text += " changed";
      const before = await new CaptureRepository(runtime).readByJob(context, first.job_id);
      await expect(capture(changed)).rejects.toMatchObject({ code: "CAPTURE_ID_REUSED" });
      expect(await new CaptureRepository(runtime).readByJob(context, first.job_id)).toEqual(before);
      expect(await jobCounts(first.job_id)).toEqual({ scope_revision: 0, audit_event: 0, decision: 0, command_receipt: 0, action_authorization: 0 });
    });

  it("L012 exact replay preserves reserved scope IDs and sources with reordered metadata", async () => {
    const original = input(), first = await capture(original);
    const before = await new CaptureRepository(runtime).readByJob(context, first.job_id);
    const replay = await capture({ ...original, acquisition: Object.fromEntries(Object.entries(original.acquisition!).reverse()) });
    expect(replay.id).toBe(first.id); expect(replay.job_id).toBe(first.job_id);
    expect(await new CaptureRepository(runtime).readByJob(context, replay.job_id)).toEqual(before);
    expect(before!.lines).toHaveLength(1);
    expect(before).toMatchObject({ source_kind: original.sourceKind, acquisition_metadata: original.acquisition, source_version: 1 });
    expect(before!.lines[0]).toMatchObject({ source_reference: `${original.captureId}:v1`, proposed_data: original.proposal.lines[0] });
    await withTenant(runtime, context, async db => {
      const source = (await db.$client.query("SELECT content_bytes,sha256,source_version FROM app.capture_source WHERE tenant_id=$1 AND id=$2", [tenantId, original.captureId])).rows[0];
      expect(source).toEqual({ content_bytes: Buffer.from(original.text, "utf8"), sha256: first.source_sha256, source_version: 1 });
    });
  });

  it("L012 omitted text defaults replay explicit text and null metadata", async () => {
    const { sourceKind: _kind, acquisition: _acquisition, ...original } = input();
    const first = await capture(original);
    expect((await capture({ ...original, sourceKind: "text", acquisition: null })).id).toBe(first.id);
  });

  it("L013 validly shaped stale review reaches the stored revision guard", async () => {
    const review = await reviewFixture(), repo = new ProposalReviewRepository(runtime);
    const saved = await repo.save(context, review, 0);
    const stale = { ...saved, revision: 0, lines: [{ ...saved.lines[0]!, description: "Stale edit" }] };
    expect(proposalReviewV1.safeParse(stale).success).toBe(true);
    // Both request revision fields agree: only the stored revision can refuse this save.
    expect(stale.revision).toBe(0);
    await expect(repo.save(context, stale, stale.revision)).rejects.toMatchObject({
      code: "REVIEW_REVISION_CONFLICT", message: "The review changed; reconcile before saving",
    });
    expect(await repo.read(context, review.jobId)).toEqual(saved);
    expect(await jobCounts(review.jobId)).toEqual({ scope_revision: 0, audit_event: 0, decision: 0, command_receipt: 0, action_authorization: 0 });
  });

  it.each([false, true])("L018 concurrent identical capture yields one proposal and replay; changed payload conflicts: changed=%s", async changed => {
    const original = input(), second = structuredClone(original);
    if (changed) second.acquisition = { ...second.acquisition, humanEdited: true };
    const blocker = await admin.connect();
    let pending: Promise<PromiseSettledResult<Awaited<ReturnType<typeof capture>>>[]> | undefined;
    try {
      await blocker.query("BEGIN");
      // Both calls reach a lock before either can insert. Without capture serialization,
      // both read an absent proposal and later race on the source primary key.
      await blocker.query("LOCK TABLE app.capture_source IN SHARE MODE");
      pending = Promise.allSettled([capture(original), capture(second)]);
      const deadline = Date.now() + 10_000;
      let waiting = 0;
      while (waiting < 2 && Date.now() < deadline) {
        waiting = (await admin.query("SELECT count(*)::int n FROM pg_stat_activity WHERE application_name='later-b8-capture' AND wait_event_type='Lock'")).rows[0].n;
        if (waiting < 2) await new Promise(resolve => setTimeout(resolve, 10));
      }
      expect(waiting).toBe(2);
    } finally {
      await blocker.query("ROLLBACK"); blocker.release();
      // Always drain outstanding work, including a failing barrier assertion.
      if (pending) await pending;
    }
    const results = await pending!;
    const fulfilled = results.filter(result => result.status === "fulfilled");
    expect(fulfilled).toHaveLength(changed ? 1 : 2);
    const first = fulfilled[0]!.value;
    if (changed) expect(results.find(result => result.status === "rejected")).toMatchObject({ reason: { code: "CAPTURE_ID_REUSED" } });
    else expect(fulfilled[1]!.value.id).toBe(first.id);
    const stored = await new CaptureRepository(runtime).readByJob(context, first.job_id);
    expect(stored!.lines).toHaveLength(1);
    await withTenant(runtime, context, async db => {
      for (const [table, column] of [["capture_source", "id"], ["job_record_proposal", "capture_id"]]) {
        expect((await db.$client.query(`SELECT count(*)::int n FROM app.${table} WHERE tenant_id=$1 AND ${column}=$2`, [tenantId, original.captureId])).rows[0].n).toBe(1);
      }
      expect((await db.$client.query("SELECT count(*)::int n FROM app.scope_identity WHERE tenant_id=$1 AND job_id=$2", [tenantId, first.job_id])).rows[0].n).toBe(1);
    });
    const winner = { ...original, acquisition: stored!.acquisition_metadata };
    expect((await capture(winner)).id).toBe(first.id);
    expect(await new CaptureRepository(runtime).readByJob(context, first.job_id)).toEqual(stored);
  }, 20000);

  it("L018 rollback leaves no partial proposal, source, identity or audit and permits retry", async () => {
    const original = input();
    const tables = ["capture_source", "job_record_proposal", "job", "scope_identity", "proposal_line", "audit_event", "command_receipt"];
    const snapshot = async () => Promise.all(tables.map(async table =>
      (await admin.query(`SELECT count(*)::int n FROM app.${table} WHERE tenant_id=$1`, [tenantId])).rows[0].n));
    const before = await snapshot();
    // Fails the proposal insert after its source and job have been inserted.
    await expect(capture({ ...original, promptVersion: "v".repeat(81) })).rejects.toMatchObject({ code: "22001" });
    expect(await snapshot()).toEqual(before);
    const saved = await capture(original);
    expect((await capture(original)).id).toBe(saved.id);
  });

  it("L018 confirmation failure rolls back scope, receipt, authorization and audit", async () => {
    const review = await reviewFixture(), saved = await new ProposalReviewRepository(runtime).save(context, review, 0);
    const command = { version: "command.v1" as const, commandId: randomUUID(), commandType: "confirm_proposal_review",
      semanticKey: `job:${saved.jobId}:confirm:${saved.proposalId}`, actorMembershipId: memberId,
      subjectType: "job", subjectRef: saved.jobId, action: { actionType: "confirm_scope", recipient: null,
        contentHash: reviewContentHash(saved), aggregateRevision: saved.revision, amountPence: null, currency: null,
        policyVersion: "fictional-later-b8", expiresAt: new Date(Date.now() + 60_000) } };
    await expect(new UserCommandDispatcher(runtime).dispatch(context, command, new ConfirmProposalReview(saved, true)))
      .rejects.toThrow("SYNTHETIC_CONFIRMATION_FAILURE");
    expect(await jobCounts(saved.jobId)).toEqual({ scope_revision: 0, audit_event: 0, decision: 0, command_receipt: 0, action_authorization: 0 });
    expect(await new ProposalReviewRepository(runtime).read(context, saved.jobId)).toEqual(saved);
    expect((await new CaptureRepository(runtime).readByJob(context, saved.jobId))!.status).toBe("draft");
  });
});
