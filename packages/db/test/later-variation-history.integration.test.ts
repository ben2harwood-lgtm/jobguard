// Dispatcher/CI only: needs embedded PostgreSQL. LATER-B25 L145, L150, L151, L153.
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { approveVariation, priceVariation, type VariationProposal, type VariationRevision } from "@jobguard/core";
import { VariationApplication } from "../../../apps/api/src/variation/variation.application.js";
import { authenticatePracticeSession, issuePracticeSession, migrate, withTenant, VariationRepository,
  approvePricedVariation, insertPricedVariation, DEMO_ACCOUNT_ID, DEMO_IDENTITY_USER_ID,
  DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID } from "../src/index.js";
import { closeTestPools, freePort, installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";

let postgres: EmbeddedPostgres, admin: Pool, runtime: Pool, directory: string;
const oldEnvironment = process.env.JOBGUARD_ENV;
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "later-variation-history-pg-"));
  const port = await freePort(58400, 200);
  postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password: "synthetic",
    persistent: false, createPostgresUser: process.getuid?.() === 0,
    initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
  await postgres.initialise(); await postgres.start();
  admin = new Pool({ host: "127.0.0.1", port, user: "postgres", password: "synthetic" });
  await migrate(admin); await installLegacySyntheticPartyFixtures(admin);
  await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [DEMO_TENANT_ID]);
  await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [DEMO_IDENTITY_USER_ID]);
  await admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Fictional history builder')", [DEMO_ACCOUNT_ID, DEMO_TENANT_ID]);
  await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')",
    [DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID, DEMO_ACCOUNT_ID, DEMO_IDENTITY_USER_ID]);
  await admin.query("CREATE ROLE later_history_login LOGIN PASSWORD 'synthetic' NOSUPERUSER NOBYPASSRLS; GRANT jobguard_runtime TO later_history_login");
  runtime = new Pool({ host: "127.0.0.1", port, database: "postgres", user: "later_history_login", password: "synthetic", max: 4 });
  process.env.JOBGUARD_ENV = "synthetic_demo";
}, 60000);
afterAll(async () => {
  if (oldEnvironment === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV = oldEnvironment;
  await closeTestPools(runtime, admin); await postgres?.stop();
  if (directory) await rm(directory, { recursive: true, force: true });
});
const price = { quantity: "1", unit: "item", unitRatePence: 12500, direction: "addition" as const };
const attestation = "Builder-recorded practice acceptance — not an authenticated customer signature";
const provenance = { kind: "human_entered" as const, sourceRef: "synthetic://builder-entered", sourceHash: "8".repeat(64), rateVersion: "builder-price-v1" };

async function fixture() {
  const session = await issuePracticeSession(runtime), auth = await authenticatePracticeSession(runtime, session);
  const jobId = randomUUID(), parentScopeId = randomUUID();
  await admin.query(`INSERT INTO app.job(id,tenant_id,title,status,practice_session_digest,practice_scenario)
    VALUES($1,$2,'Fictional variation history','live',$3,'capture')`, [jobId, DEMO_TENANT_ID, auth.digest]);
  await admin.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')", [parentScopeId, DEMO_TENANT_ID, jobId]);
  await admin.query("INSERT INTO app.scope_progress(tenant_id,job_id,scope_item_id) VALUES($1,$2,$3)", [DEMO_TENANT_ID, jobId, parentScopeId]);
  const app = new VariationApplication(runtime, session);
  const propose = async (priced = true, existing = false) => {
    const id = randomUUID(), scopeItemId = existing ? parentScopeId : randomUUID();
    const view = await app.command(jobId, { version: "variation-command.v1", action: "propose", proposalId: id, scopeItemId,
      existingScopeItemId: existing ? parentScopeId : null, lineageParentScopeItemId: existing ? null : parentScopeId,
      description: "Fictional extra", captureText: "Fictional extra", price: priced ? price : null });
    return view.variations.find(v => v.id === id)!;
  };
  const approve = (variationId: string, revisionId: string, approvalId = randomUUID()) => app.command(jobId, { version: "variation-command.v1",
    action: "approve", variationId, revisionId, approvalId, attestation });
  const reject = (variationId: string, revisionId: string, rejectionId = randomUUID()) => app.command(jobId, { version: "variation-command.v1",
    action: "reject", variationId, revisionId, rejectionId });
  const progress = async (scopeItemId: string) => (await admin.query(
    "SELECT stage,revision FROM app.scope_progress WHERE tenant_id=$1 AND job_id=$2 AND scope_item_id=$3", [DEMO_TENANT_ID, jobId, scopeItemId])).rows;
  return { auth, app, jobId, parentScopeId, propose, approve, reject, progress };
}
const auditCount = async (variationId: string, eventType: string) => (await admin.query(
  "SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND subject_ref=$2::text AND event_type=$3", [DEMO_TENANT_ID, variationId, eventType])).rows[0].n as number;

function pricing(f: Awaited<ReturnType<typeof fixture>>, v: { id: string; scopeItemId: string; description: string }, pence: number) {
  const proposal: VariationProposal = { version: "variation-proposal.v1", id: v.id, jobId: f.jobId, scopeItemId: v.scopeItemId,
    existingScopeItemId: null, lineageParentScopeItemId: f.parentScopeId, captureKind: "text", captureText: v.description, description: v.description, suggestion: null };
  return priceVariation({ id: randomUUID(), variationId: v.id, previous: null, proposal, description: v.description, contentHash: "d".repeat(64),
    confirmed: { ...price, unitRatePence: pence, confirmedByMembershipId: DEMO_MEMBERSHIP_ID, rateProvenance: provenance } });
}

it("L145 pricing and rejection each append exactly one audit event; a rolled-back transaction leaves neither effect nor audit", async () => {
  const f = await fixture(), unpriced = await f.propose(false), pending = await f.propose(true);
  const priced = pricing(f, unpriced, 12500);
  const boom = new Error("ROLLBACK_PROBE");
  await expect(withTenant(runtime, f.auth.context, async db => { await insertPricedVariation(db, DEMO_TENANT_ID, priced); throw boom; })).rejects.toBe(boom);
  expect((await admin.query("SELECT count(*)::int n FROM app.variation_revision WHERE variation_id=$1", [unpriced.id])).rows[0].n).toBe(0);
  expect(await auditCount(unpriced.id, "variation.priced")).toBe(0);
  await withTenant(runtime, f.auth.context, db => insertPricedVariation(db, DEMO_TENANT_ID, priced));
  expect((await admin.query("SELECT count(*)::int n FROM app.variation_revision WHERE variation_id=$1", [unpriced.id])).rows[0].n).toBe(1);
  expect(await auditCount(unpriced.id, "variation.priced")).toBe(1);
  const rejection = { id: randomUUID(), variationId: pending.id, revisionId: pending.currentRevisionId!, actorMembershipId: DEMO_MEMBERSHIP_ID };
  const repo = new VariationRepository(runtime);
  await expect(withTenant(runtime, f.auth.context, async db => { await repo.reject(db, DEMO_TENANT_ID, rejection); throw boom; })).rejects.toBe(boom);
  expect((await admin.query("SELECT count(*)::int n FROM app.variation_rejection WHERE variation_id=$1", [pending.id])).rows[0].n).toBe(0);
  expect((await admin.query("SELECT state FROM app.variation WHERE id=$1", [pending.id])).rows[0].state).toBe("priced");
  expect(await auditCount(pending.id, "variation.rejected")).toBe(0);
  await withTenant(runtime, f.auth.context, db => repo.reject(db, DEMO_TENANT_ID, rejection));
  expect((await admin.query("SELECT count(*)::int n FROM app.variation_rejection WHERE variation_id=$1", [pending.id])).rows[0].n).toBe(1);
  expect(await auditCount(pending.id, "variation.rejected")).toBe(1);
});

it("L150 approved new scope gains exactly one operational progress identity; pending, rejected and existing scope do not gain another", async () => {
  const f = await fixture(), approved = await f.propose(), pending = await f.propose(), rejected = await f.propose(), existing = await f.propose(true, true);
  expect(await f.progress(approved.scopeItemId)).toEqual([]);
  await f.approve(approved.id, approved.currentRevisionId!);
  await f.reject(rejected.id, rejected.currentRevisionId!);
  expect(await f.progress(approved.scopeItemId)).toEqual([{ stage: "not_started", revision: 0 }]);
  expect(await f.progress(pending.scopeItemId)).toEqual([]);
  expect(await f.progress(rejected.scopeItemId)).toEqual([]);
  await f.approve(existing.id, existing.currentRevisionId!);
  expect(await f.progress(f.parentScopeId)).toEqual([{ stage: "not_started", revision: 0 }]);
  // A second approval command for the same revision is a no-op for progress.
  await f.approve(approved.id, approved.currentRevisionId!);
  expect(await f.progress(approved.scopeItemId)).toHaveLength(1);
});

it("L151 returned approval fields come from the stored immutable approval, never the caller's spread", async () => {
  const f = await fixture(), v = await f.propose(), revisionId = v.currentRevisionId!, current = v.revisions[0]!;
  const stored: VariationRevision = { ...current, variationId: v.id, previousRevisionId: null, scopeItemId: v.scopeItemId,
    confirmedByMembershipId: DEMO_MEMBERSHIP_ID, rateProvenance: provenance, state: "priced" };
  const firstAt = new Date("2026-10-01T10:00:00.000Z"), laterAt = new Date("2026-10-02T10:00:00.000Z");
  const make = (id: string, approvedAt: Date) => approveVariation(stored, { id, revisionId, revision: stored.revision, contentHash: stored.contentHash,
    signedDeltaPence: stored.signedDeltaPence, method: "builder_attestation", actorMembershipId: DEMO_MEMBERSHIP_ID, evidenceId: null, approvedAt });
  const original = make(randomUUID(), firstAt);
  const first = await withTenant(runtime, f.auth.context, db => approvePricedVariation(db, DEMO_TENANT_ID, v.id, original));
  const row = (await admin.query("SELECT id,revision_id,revision,content_hash,signed_delta_pence::text p,method,actor_membership_id,evidence_id,approved_at FROM app.variation_approval WHERE revision_id=$1", [revisionId])).rows[0];
  expect(first).toEqual({ id: row.id, revisionId: row.revision_id, revision: row.revision, contentHash: row.content_hash, signedDeltaPence: Number(row.p),
    method: row.method, actorMembershipId: row.actor_membership_id, evidenceId: row.evidence_id, approvedAt: row.approved_at });
  // Same revision, a second caller id with a later time and an injected extra property: the stored approval is what comes back.
  const second = await withTenant(runtime, f.auth.context, db => approvePricedVariation(db, DEMO_TENANT_ID, v.id,
    { ...make(randomUUID(), laterAt), injected: "caller-field" } as unknown as ReturnType<typeof make>));
  expect(second).toEqual(first); expect(second).not.toHaveProperty("injected");
  expect(second.approvedAt.toISOString()).toBe(firstAt.toISOString());
  expect((await admin.query("SELECT count(*)::int n FROM app.variation_approval WHERE revision_id=$1", [revisionId])).rows[0].n).toBe(1);
});

async function setStatus(jobId: string, status: string) {
  // Fixture-only status change by the owner role; replica mode skips the lifecycle triggers the transition routine owns.
  const client = await admin.connect();
  try {
    await client.query("BEGIN"); await client.query("SET LOCAL session_replication_role='replica'");
    await client.query("UPDATE app.job SET status=$1 WHERE tenant_id=$2 AND id=$3", [status, DEMO_TENANT_ID, jobId]); await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

it("L153 history stays readable after the job is paid, and every new write is still refused", async () => {
  const f = await fixture(), approved = await f.propose(), pending = await f.propose();
  await f.approve(approved.id, approved.currentRevisionId!);
  const before = await f.app.get(f.jobId);
  for (const status of ["invoiced", "paid"]) {
    await setStatus(f.jobId, status);
    const history = await f.app.get(f.jobId);
    expect(history.variations.map(v => [v.id, v.state, v.revisions.map(r => r.id)])).toEqual(before.variations.map(v => [v.id, v.state, v.revisions.map(r => r.id)]));
    expect(history).toMatchObject({ approvedAdditionsPence: before.approvedAdditionsPence, pendingExtrasPence: before.pendingExtrasPence });
    const counts = async () => (await admin.query(`SELECT (SELECT count(*) FROM app.variation WHERE job_id=$1)::int v,(SELECT count(*) FROM app.variation_revision WHERE job_id=$1)::int r,
      (SELECT count(*) FROM app.variation_approval WHERE job_id=$1)::int a,(SELECT count(*) FROM app.variation_rejection WHERE job_id=$1)::int x`, [f.jobId])).rows[0];
    const snapshot = await counts();
    await expect(f.app.command(f.jobId, { version: "variation-command.v1", action: "revise", variationId: pending.id, expectedRevisionId: pending.currentRevisionId!,
      revisionId: randomUUID(), description: "Late", price })).rejects.toThrow("ACTIVATION_REQUIRED");
    await expect(f.approve(pending.id, pending.currentRevisionId!)).rejects.toThrow("ACTIVATION_REQUIRED");
    await expect(f.reject(pending.id, pending.currentRevisionId!)).rejects.toThrow("ACTIVATION_REQUIRED");
    await expect(f.app.command(f.jobId, { version: "variation-command.v1", action: "propose", proposalId: randomUUID(), scopeItemId: randomUUID(),
      existingScopeItemId: null, lineageParentScopeItemId: f.parentScopeId, description: "Late extra", captureText: "Late extra", price })).rejects.toBeDefined();
    expect(await counts()).toEqual(snapshot);
  }
});
