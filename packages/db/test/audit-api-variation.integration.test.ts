// Dispatcher/CI only: the builder sandbox cannot start PostgreSQL or bind a listener.
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
  directory = await mkdtemp(join(tmpdir(), "audit-api-variation-pg-"));
  const port = await freePort(56600, 200);
  postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password: "synthetic",
    persistent: false, createPostgresUser: process.getuid?.() === 0,
    initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
  await postgres.initialise(); await postgres.start();
  admin = new Pool({ host: "127.0.0.1", port, user: "postgres", password: "synthetic" });
  await migrate(admin); await installLegacySyntheticPartyFixtures(admin);
  await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [DEMO_TENANT_ID]);
  await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [DEMO_IDENTITY_USER_ID]);
  await admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Fictional audit builder')", [DEMO_ACCOUNT_ID, DEMO_TENANT_ID]);
  await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')",
    [DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID, DEMO_ACCOUNT_ID, DEMO_IDENTITY_USER_ID]);
  // Disposable test login inherits the existing runtime role; no new object grants.
  await admin.query("CREATE ROLE audit_variation_login LOGIN PASSWORD 'synthetic' NOSUPERUSER NOBYPASSRLS; GRANT jobguard_runtime TO audit_variation_login");
  runtime = new Pool({ host: "127.0.0.1", port, database: "postgres", user: "audit_variation_login", password: "synthetic", max: 4 });
  process.env.JOBGUARD_ENV = "synthetic_demo";
}, 60000);
afterAll(async () => {
  if (oldEnvironment === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV = oldEnvironment;
  await closeTestPools(runtime, admin); await postgres?.stop();
  if (directory) await rm(directory, { recursive: true, force: true });
});
const price = { quantity: "1", unit: "item", unitRatePence: 12500, direction: "addition" as const };
const attestation = "Builder-recorded practice acceptance — not an authenticated customer signature";
async function fixture() {
  const session = await issuePracticeSession(runtime), auth = await authenticatePracticeSession(runtime, session);
  const jobId = randomUUID(), parentScopeId = randomUUID();
  await admin.query(`INSERT INTO app.job(id,tenant_id,title,status,practice_session_digest,practice_scenario)
    VALUES($1,$2,'Fictional variation audit','live',$3,'capture')`, [jobId, DEMO_TENANT_ID, auth.digest]);
  await admin.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')", [parentScopeId, DEMO_TENANT_ID, jobId]);
  const app = new VariationApplication(runtime, session), repo = new VariationRepository(runtime);
  const propose = async (priced = true) => {
    const id = randomUUID();
    const view = await app.command(jobId, { version: "variation-command.v1", action: "propose", proposalId: id,
      scopeItemId: randomUUID(), existingScopeItemId: null, lineageParentScopeItemId: parentScopeId,
      description: "Fictional extra", captureText: "Fictional extra", price: priced ? price : null });
    return view.variations.find(v => v.id === id)!;
  };
  const approve = (variationId: string, revisionId: string) => app.command(jobId, { version: "variation-command.v1",
    action: "approve", variationId, revisionId, approvalId: randomUUID(), attestation });
  const reject = (variationId: string, revisionId: string) => app.command(jobId, { version: "variation-command.v1",
    action: "reject", variationId, revisionId, rejectionId: randomUUID() });
  const revise = (variationId: string, expectedRevisionId: string | null, unitRatePence: number) => app.command(jobId,
    { version: "variation-command.v1", action: "revise", variationId, expectedRevisionId, revisionId: randomUUID(),
      description: "Fictional revised extra", price: { ...price, unitRatePence } });
  const rejections = async () => (await admin.query("SELECT id FROM app.variation_rejection WHERE tenant_id=$1 AND job_id=$2", [DEMO_TENANT_ID, jobId])).rows;
  // Exact approved source predicate used by FinalAccountCommandService. This tests persisted eligibility,
  // rather than claiming a full invoice/assembly journey without its baseline and proof fixtures.
  const eligibleSources = async () => (await withTenant(runtime, auth.context, db => db.$client.query(`SELECT r.id,r.signed_delta_pence::text pence
    FROM app.variation_approval a JOIN app.variation_revision r ON(r.tenant_id,r.id)=(a.tenant_id,a.revision_id)
    JOIN app.variation v ON(v.tenant_id,v.id)=(a.tenant_id,a.variation_id)
    WHERE a.tenant_id=$1 AND a.job_id=$2 AND v.state='approved' AND v.current_revision_id=a.revision_id ORDER BY r.id`, [DEMO_TENANT_ID, jobId]))).rows;
  return { auth, app, repo, jobId, propose, approve, reject, revise, rejections, eligibleSources };
}

it("reject cannot cancel an approved revision", async () => {
  const f = await fixture(), v = await f.propose(), r = v.currentRevisionId!;
  await f.approve(v.id, r);
  await expect(f.reject(v.id, r)).rejects.toMatchObject({ code: "VARIATION_REVISION_CONFLICT" });
  expect(await f.rejections()).toEqual([]); expect(await f.eligibleSources()).toEqual([{ id: r, pence: "12500" }]);
  expect((await f.app.get(f.jobId)).variations[0]).toMatchObject({ state: "approved", currentRevisionId: r });
});

it("reject requires the targeted variation's current revision", async () => {
  const f = await fixture(), a = await f.propose(), b = await f.propose();
  await expect(f.reject(a.id, b.currentRevisionId!)).rejects.toMatchObject({ code: "VARIATION_REVISION_CONFLICT" });
  expect(await f.rejections()).toEqual([]);
  const view = await f.app.get(f.jobId); expect(view.pendingExtrasPence).toBe(25000);
  expect(view.variations.map(v => v.state)).toEqual(["priced", "priced"]);
});

it("prices an existing unpriced capture without replacing scope or origin", async () => {
  const f = await fixture(), v = await f.propose(false);
  const originBefore = (await admin.query("SELECT * FROM app.extra_origin WHERE tenant_id=$1 AND variation_id=$2", [DEMO_TENANT_ID, v.id])).rows;
  const view = await f.revise(v.id, null, 12500), priced = view.variations[0]!;
  await f.approve(v.id, priced.currentRevisionId!);
  expect(priced).toMatchObject({ id: v.id, scopeItemId: v.scopeItemId, lineageParentScopeItemId: v.lineageParentScopeItemId });
  expect(priced.revisions.map(r => [r.revision, r.signedDeltaPence])).toEqual([[1, 12500]]);
  expect((await admin.query("SELECT * FROM app.extra_origin WHERE tenant_id=$1 AND variation_id=$2", [DEMO_TENANT_ID, v.id])).rows).toEqual(originBefore);
  expect(await f.eligibleSources()).toEqual([{ id: priced.currentRevisionId, pence: "12500" }]);
});

it("stale revise preserves newer approval", async () => {
  const f = await fixture(), v = await f.propose(), r1 = v.currentRevisionId!;
  const newer = await f.revise(v.id, r1, 20000), r2 = newer.variations[0]!.currentRevisionId!;
  await f.approve(v.id, r2);
  await expect(f.revise(v.id, r1, 11000)).rejects.toMatchObject({ code: "VARIATION_REVISION_CONFLICT" });
  expect((await f.app.get(f.jobId)).variations[0]).toMatchObject({ currentRevisionId: r2, state: "approved" });
  expect((await admin.query("SELECT revision FROM app.variation_revision WHERE tenant_id=$1 AND variation_id=$2 ORDER BY revision", [DEMO_TENANT_ID, v.id])).rows).toEqual([{ revision: 1 }, { revision: 2 }]);
  expect(await f.eligibleSources()).toEqual([{ id: r2, pence: "20000" }]);
});

function deferred() { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; }
it("a revise waiting on the row lock rechecks the pointer after newer approval commits", async () => {
  const f = await fixture(), v = await f.propose(), current = v.revisions[0]!;
  const proposal: VariationProposal = { version: "variation-proposal.v1", id: v.id, jobId: f.jobId, scopeItemId: v.scopeItemId,
    existingScopeItemId: v.existingScopeItemId, lineageParentScopeItemId: v.lineageParentScopeItemId,
    captureKind: "text", captureText: v.captureText, description: v.description, suggestion: null };
  const provenance = { kind: "human_entered" as const, sourceRef: "synthetic://builder-entered", sourceHash: "8".repeat(64), rateVersion: "builder-price-v1" };
  const previous: VariationRevision = { ...current, variationId: v.id, previousRevisionId: null, scopeItemId: v.scopeItemId,
    confirmedByMembershipId: DEMO_MEMBERSHIP_ID, rateProvenance: provenance, state: "priced" };
  const revision = (pence: number) => priceVariation({ id: randomUUID(), variationId: v.id, previous, proposal,
    description: v.description, contentHash: "a".repeat(64), confirmed: { ...price, unitRatePence: pence,
      confirmedByMembershipId: DEMO_MEMBERSHIP_ID, rateProvenance: provenance } });
  const r2 = revision(20000), stale = revision(11000), holding = deferred(), release = deferred(), attempted = deferred();
  const winner = withTenant(runtime, f.auth.context, async db => {
    await insertPricedVariation(db, DEMO_TENANT_ID, r2);
    await approvePricedVariation(db, DEMO_TENANT_ID, v.id, approveVariation(r2, { id: randomUUID(), revisionId: r2.id,
      revision: r2.revision, contentHash: r2.contentHash, signedDeltaPence: r2.signedDeltaPence,
      method: "builder_attestation", actorMembershipId: DEMO_MEMBERSHIP_ID, evidenceId: null, approvedAt: new Date() }));
    holding.resolve(); await release.promise;
  });
  await Promise.race([holding.promise, winner]);
  let loserPid: number | undefined;
  const loser = withTenant(runtime, f.auth.context, async db => {
    loserPid = (await db.$client.query("SELECT pg_backend_pid() pid")).rows[0].pid;
    const original = db.$client.query.bind(db.$client);
    db.$client.query = ((sql: string, values: unknown[]) => { const pending = original(sql, values);
      if (sql.includes("FOR UPDATE")) attempted.resolve(); return pending; }) as typeof db.$client.query;
    try { return await insertPricedVariation(db, DEMO_TENANT_ID, stale); }
    finally { db.$client.query = original; }
  });
  const refused = expect(loser).rejects.toMatchObject({ code: "VARIATION_REVISION_CONFLICT" });
  try {
    await Promise.race([attempted.promise, loser.then(() => undefined)]);
    let blocked = false;
    const deadline = Date.now() + 2000;
    while (!blocked && Date.now() < deadline) {
      blocked = (await admin.query(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity
        WHERE pid=$1 AND wait_event_type='Lock' AND cardinality(pg_blocking_pids(pid))>0) blocked`, [loserPid])).rows[0].blocked;
      if (!blocked) await new Promise(resolve => setTimeout(resolve, 10));
    }
    expect(blocked).toBe(true);
  }
  finally { release.resolve(); }
  await winner; await refused;
  expect(await f.eligibleSources()).toEqual([{ id: r2.id, pence: "20000" }]);
  expect((await admin.query("SELECT count(*)::int n FROM app.variation_rate_observation WHERE tenant_id=$1 AND variation_id=$2", [DEMO_TENANT_ID, v.id])).rows[0].n).toBe(2);
});
