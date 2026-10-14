import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ProposalReview } from "@jobguard/core";
import { CaptureApplication } from "../../../apps/api/src/capture/capture.application.js";
import {
  authenticatePracticeSession, CaptureRepository, DEMO_ACCOUNT_ID, DEMO_IDENTITY_USER_ID,
  DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID, issuePracticeSession, migrate,
} from "../src/index.js";
import { closeTestPools, freePort, installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";

let postgres: EmbeddedPostgres, admin: Pool, runtime: Pool, directory: string;
const previousEnvironment = process.env.JOBGUARD_ENV;
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "audit-api-capture-pg-"));
  const port = await freePort(56500, 300);
  postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password: "synthetic",
    persistent: false, createPostgresUser: process.getuid?.() === 0,
    initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
  await postgres.initialise(); await postgres.start();
  admin = new Pool({ host: "127.0.0.1", port, user: "postgres", password: "synthetic" });
  await migrate(admin);
  await installLegacySyntheticPartyFixtures(admin);
  await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [DEMO_TENANT_ID]);
  await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [DEMO_IDENTITY_USER_ID]);
  await admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Fictional audit builder')", [DEMO_ACCOUNT_ID, DEMO_TENANT_ID]);
  await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')",
    [DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID, DEMO_ACCOUNT_ID, DEMO_IDENTITY_USER_ID]);
  // Disposable test login inherits only the existing runtime role; no table privileges are added.
  await admin.query("CREATE ROLE audit_capture_login LOGIN PASSWORD 'synthetic' NOSUPERUSER NOBYPASSRLS; GRANT jobguard_runtime TO audit_capture_login");
  runtime = new Pool({ host: "127.0.0.1", port, database: "postgres", user: "audit_capture_login", password: "synthetic" });
  process.env.JOBGUARD_ENV = "synthetic_demo";
}, 60000);
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  if (previousEnvironment === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV = previousEnvironment;
  await closeTestPools(runtime, admin); await postgres?.stop();
  if (directory) await rm(directory, { recursive: true, force: true });
});

async function fixture(lineCount = 1) {
  const token = await issuePracticeSession(runtime), auth = await authenticatePracticeSession(runtime, token);
  const captureId = randomUUID(), provenance = { kind: "extracted" as const,
    span: { sourceId: captureId, sourceVersion: 1 as const, start: 5, end: 12 } };
  const saved = await new CaptureRepository(runtime).persist(auth.context, {
    practiceSessionDigest: auth.digest, captureId, text: "JOB: Kitchen\nITEM: Fictional work",
    proposal: { title: { value: "Kitchen", provenance }, materials: [], questions: [],
      lines: Array.from({ length: lineCount }, () => ({ description: { value: "Fictional work", provenance },
        quantity: { value: "3", provenance }, unit: { value: "item", provenance }, unitPricePence: { value: 2500, provenance } })) },
    promptVersion: "synthetic-audit-v1", schemaVersion: "synthetic-audit-v1", model: "fixture-only",
  });
  const app = new CaptureApplication(runtime, token), view = await app.view(saved.job_id);
  const review: ProposalReview = { version: "proposal_review_v1", reviewId: view.reviewId,
    proposalId: view.proposalId, jobId: view.jobId, revision: 0, questions: [],
    lines: view.proposal.lines.map(line => ({ id: line.id, scopeItemId: line.scopeItemId, origin: "proposal",
      description: line.description.value, quantity: line.quantity.value, unit: line.unit.value,
      unitPricePence: line.unitPricePence.value, room: line.room, category: line.category,
      sourceExcerpt: line.sourceExcerpt, disposition: "accepted", dismissalReason: null, parentScopeItemIds: [] })) };
  return { app, review };
}
const saveInput = (review: ProposalReview) => ({ contractVersion: "proposal_review_command_v1", expectedRevision: review.revision, review });
const confirmInput = (revision: number) => ({ contractVersion: "proposal_review_confirm_v1", commandId: randomUUID(), expectedRevision: revision });
async function counts(jobId: string) {
  const totals: Record<string, number> = {};
  for (const [table, predicate] of [
    ["scope_revision", "job_id=$2"], ["command_receipt", "semantic_key LIKE 'job:' || $2 || ':confirm:%'"],
    ["action_authorization", "content_hash IN (SELECT content_hash FROM app.action_authorization a JOIN app.decision d ON (d.tenant_id,d.id)=(a.tenant_id,a.decision_id) WHERE d.subject_ref=$2 AND d.tenant_id=$1)"],
    ["audit_event", "subject_ref=$2"],
  ]) {
    totals[table!] = (await admin.query(`SELECT count(*)::int n FROM app.${table} WHERE tenant_id=$1 AND ${predicate}`, [DEMO_TENANT_ID, jobId])).rows[0].n;
  }
  return totals;
}

describe("night audit capture regressions (real PostgreSQL, dispatcher/CI only)", () => {
  it.each([["3", 2500, 7500], ["2.5", 101, 252]] as const)("capture confirmation calculates exact scope totals: %s × %i", async (quantity, price, total) => {
    const { app, review } = await fixture(); review.lines[0]!.quantity = quantity; review.lines[0]!.unitPricePence = price;
    const saved = await app.save(review.jobId, saveInput(review));
    await app.confirm(review.jobId, confirmInput(saved.review!.revision));
    expect((await admin.query("SELECT total_pence::text total FROM app.scope_revision WHERE tenant_id=$1 AND job_id=$2", [DEMO_TENANT_ID, review.jobId])).rows).toEqual([{ total: String(total) }]);
  });

  it.each(["omitted", "replaced", "relabeled"])("confirmation requires reconciliation of every captured identity: %s", async kind => {
    const { app, review } = await fixture(2);
    if (kind === "omitted") review.lines.pop();
    else if (kind === "replaced") review.lines[1]!.scopeItemId = randomUUID();
    else { review.lines[1]!.origin = "human"; review.lines[1]!.sourceExcerpt = null; }
    await expect(app.save(review.jobId, saveInput(review))).rejects.toMatchObject({ code: "REVIEW_REVISION_CONFLICT" });
    const view = await app.view(review.jobId);
    expect(view.status).toBe("draft"); expect(view.review).toBeNull();
    expect(await counts(review.jobId)).toEqual({ scope_revision: 0, command_receipt: 0, action_authorization: 0, audit_event: 0 });
  });

  it("confirmation rejects a previously stored incomplete review and rolls back its command", async () => {
    const { app, review } = await fixture(2), saved = await app.save(review.jobId, saveInput(review));
    // Reproduce an incomplete draft saved by the preceding implementation, without changing the immutable proposal.
    await admin.query("DELETE FROM app.proposal_review_line WHERE tenant_id=$1 AND review_id=$2 AND id=$3",
      [DEMO_TENANT_ID, review.reviewId, review.lines[1]!.id]);
    await expect(app.confirm(review.jobId, confirmInput(saved.review!.revision))).rejects.toMatchObject({ code: "REVIEW_REVISION_CONFLICT" });
    expect((await app.view(review.jobId)).status).toBe("draft");
    expect(await counts(review.jobId)).toEqual({ scope_revision: 0, command_receipt: 0, action_authorization: 0, audit_event: 0 });
  });

  it.each([null, "1"])("dismissed human additions neither block nor enter canonical scope: quantity %s", async quantity => {
    const { app, review } = await fixture(), scopeItemId = randomUUID();
    review.lines.push({ ...review.lines[0]!, id: randomUUID(), scopeItemId, origin: "human", quantity,
      unit: quantity === null ? null : "item", sourceExcerpt: null, disposition: "dismissed", dismissalReason: "Not required" });
    const saved = await app.save(review.jobId, saveInput(review));
    expect((await app.confirm(review.jobId, confirmInput(saved.review!.revision))).status).toBe("quoting");
    expect((await admin.query("SELECT state FROM app.scope_identity WHERE tenant_id=$1 AND id=$2", [DEMO_TENANT_ID, scopeItemId])).rows).toEqual([{ state: "retired" }]);
    for (const table of ["scope_revision", "scope_progress"]) {
      expect((await admin.query(`SELECT count(*)::int n FROM app.${table} WHERE tenant_id=$1 AND scope_item_id=$2`, [DEMO_TENANT_ID, scopeItemId])).rows[0].n).toBe(0);
    }
  });

  it("confirmation replay survives a lost response", async () => {
    const { app, review } = await fixture(), saved = await app.save(review.jobId, saveInput(review));
    const input = confirmInput(saved.review!.revision), now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    const first = await app.confirm(review.jobId, input);
    clock.mockReturnValue(now + 1000);
    expect(await app.confirm(review.jobId, input)).toEqual(first);
    expect(await counts(review.jobId)).toEqual({ scope_revision: 1, command_receipt: 1, action_authorization: 1, audit_event: 1 });
  });
});
