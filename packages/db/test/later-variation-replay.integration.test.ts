// Dispatcher/CI only: needs embedded PostgreSQL. LATER-B25 L149 (replay before stale checks, typed conflict, one effect under concurrency).
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { VariationApplication } from "../../../apps/api/src/variation/variation.application.js";
import { authenticatePracticeSession, issuePracticeSession, migrate, DEMO_ACCOUNT_ID, DEMO_IDENTITY_USER_ID,
  DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID } from "../src/index.js";
import { closeTestPools, freePort, installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";

let postgres: EmbeddedPostgres, admin: Pool, runtime: Pool, directory: string;
const oldEnvironment = process.env.JOBGUARD_ENV;
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "later-variation-replay-pg-"));
  const port = await freePort(58600, 200);
  postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password: "synthetic",
    persistent: false, createPostgresUser: process.getuid?.() === 0,
    initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
  await postgres.initialise(); await postgres.start(); await postgres.createDatabase("jobguard_synthetic_demo");
  admin = new Pool({ host: "127.0.0.1", port, user: "postgres", password: "synthetic", database: "jobguard_synthetic_demo" });
  await migrate(admin); await installLegacySyntheticPartyFixtures(admin);
  await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [DEMO_TENANT_ID]);
  await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [DEMO_IDENTITY_USER_ID]);
  await admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Fictional replay builder')", [DEMO_ACCOUNT_ID, DEMO_TENANT_ID]);
  await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')",
    [DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID, DEMO_ACCOUNT_ID, DEMO_IDENTITY_USER_ID]);
  await admin.query("CREATE ROLE later_replay_login LOGIN PASSWORD 'synthetic' NOSUPERUSER NOBYPASSRLS; GRANT jobguard_runtime TO later_replay_login");
  runtime = new Pool({ host: "127.0.0.1", port, database: "jobguard_synthetic_demo", user: "later_replay_login", password: "synthetic", max: 4 });
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
    VALUES($1,$2,'Fictional variation replay','live',$3,'capture')`, [jobId, DEMO_TENANT_ID, auth.digest]);
  await admin.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')", [parentScopeId, DEMO_TENANT_ID, jobId]);
  const app = new VariationApplication(runtime, session), second = new VariationApplication(runtime, session);
  const propose = async () => {
    const id = randomUUID();
    const view = await app.command(jobId, { version: "variation-command.v1", action: "propose", proposalId: id, scopeItemId: randomUUID(),
      existingScopeItemId: null, lineageParentScopeItemId: parentScopeId, description: "Fictional extra", captureText: "Fictional extra", price });
    return view.variations.find(v => v.id === id)!;
  };
  const revise = (variationId: string, expectedRevisionId: string | null, revisionId: string, pence: number, who = app) => who.command(jobId, {
    version: "variation-command.v1", action: "revise", variationId, expectedRevisionId, revisionId, description: "Fictional revised extra", price: { ...price, unitRatePence: pence } });
  const approve = (variationId: string, revisionId: string, approvalId: string, who = app) => who.command(jobId, { version: "variation-command.v1",
    action: "approve", variationId, revisionId, approvalId, attestation });
  const reject = (variationId: string, revisionId: string, rejectionId: string, who = app) => who.command(jobId, { version: "variation-command.v1",
    action: "reject", variationId, revisionId, rejectionId });
  const counts = async (variationId: string) => {
    const q = async (sql: string) => (await admin.query(sql, [DEMO_TENANT_ID, variationId])).rows[0].n as number;
    return {
      revisions: await q("SELECT count(*)::int n FROM app.variation_revision WHERE tenant_id=$1 AND variation_id=$2"),
      observations: await q("SELECT count(*)::int n FROM app.variation_rate_observation WHERE tenant_id=$1 AND variation_id=$2"),
      approvals: await q("SELECT count(*)::int n FROM app.variation_approval WHERE tenant_id=$1 AND variation_id=$2"),
      rejections: await q("SELECT count(*)::int n FROM app.variation_rejection WHERE tenant_id=$1 AND variation_id=$2"),
      audit: await q("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND subject_ref=$2::text"),
    };
  };
  return { app, second, jobId, propose, revise, approve, reject, counts };
}
const conflict = { code: "VARIATION_COMMAND_CONFLICT" };

it("L149 an exact committed revise replays before the stale-write check, even after a newer revision", async () => {
  const f = await fixture(), v = await f.propose(), r1 = v.currentRevisionId!, r2 = randomUUID(), r3 = randomUUID();
  await f.revise(v.id, r1, r2, 20000);
  const afterFirst = await f.counts(v.id);
  const replay = await f.revise(v.id, r1, r2, 20000);
  expect(replay.variations[0]!.currentRevisionId).toBe(r2); expect(await f.counts(v.id)).toEqual(afterFirst);
  await f.revise(v.id, r2, r3, 30000);
  const afterNewer = await f.counts(v.id);
  // r1 is no longer current, so a fresh command on it is stale, yet the committed r2 command still replays.
  const stale = await f.revise(v.id, r1, r2, 20000);
  expect(stale.variations[0]!.currentRevisionId).toBe(r3); expect(await f.counts(v.id)).toEqual(afterNewer);
  await expect(f.revise(v.id, r1, randomUUID(), 11000)).rejects.toMatchObject({ code: "VARIATION_REVISION_CONFLICT" });
});

it("L149 a revise id reused with a changed payload is a typed conflict with no effect", async () => {
  const f = await fixture(), v = await f.propose(), r1 = v.currentRevisionId!, r2 = randomUUID();
  await f.revise(v.id, r1, r2, 20000);
  const before = await f.counts(v.id);
  await expect(f.revise(v.id, r1, r2, 21000)).rejects.toMatchObject(conflict);
  await expect(f.revise(v.id, null, r2, 20000)).rejects.toMatchObject(conflict);
  expect(await f.counts(v.id)).toEqual(before);
});

it("L149 an exact committed approve replays after a newer revision; a changed approval payload conflicts", async () => {
  const f = await fixture(), v = await f.propose(), r1 = v.currentRevisionId!, approval = randomUUID();
  await f.approve(v.id, r1, approval);
  const afterFirst = await f.counts(v.id);
  expect((await f.approve(v.id, r1, approval)).variations[0]).toMatchObject({ state: "approved", currentRevisionId: r1 });
  expect(await f.counts(v.id)).toEqual(afterFirst);
  const r2 = randomUUID();
  await f.revise(v.id, r1, r2, 20000);
  const afterNewer = await f.counts(v.id);
  expect((await f.approve(v.id, r1, approval)).variations[0]).toMatchObject({ currentRevisionId: r2 });
  expect(await f.counts(v.id)).toEqual(afterNewer);
  // The same approval id aimed at a different revision is not the committed command.
  await expect(f.approve(v.id, r2, approval)).rejects.toMatchObject(conflict);
  expect(await f.counts(v.id)).toEqual(afterNewer);
});

it("L149 an exact committed reject replays; the same rejection id for another revision conflicts", async () => {
  const f = await fixture(), v = await f.propose(), other = await f.propose(), r1 = v.currentRevisionId!, rejection = randomUUID();
  await f.reject(v.id, r1, rejection);
  const afterFirst = await f.counts(v.id);
  expect((await f.reject(v.id, r1, rejection)).variations.find(x => x.id === v.id)).toMatchObject({ state: "rejected" });
  expect(await f.counts(v.id)).toEqual(afterFirst);
  await expect(f.reject(other.id, other.currentRevisionId!, rejection)).rejects.toMatchObject(conflict);
  expect(await f.counts(other.id)).toMatchObject({ rejections: 0 });
});

it("L149 concurrent identical commands have exactly one effect and both callers succeed", async () => {
  const f = await fixture(), v = await f.propose(), r1 = v.currentRevisionId!, r2 = randomUUID(), approval = randomUUID();
  const before = await f.counts(v.id);
  const revised = await Promise.all([f.revise(v.id, r1, r2, 20000, f.app), f.revise(v.id, r1, r2, 20000, f.second)]);
  expect(revised.map(view => view.variations[0]!.currentRevisionId)).toEqual([r2, r2]);
  const afterRevise = await f.counts(v.id);
  expect(afterRevise).toMatchObject({ revisions: before.revisions + 1, observations: before.observations + 1 });
  expect(afterRevise.audit).toBe(before.audit + 1);
  const approved = await Promise.all([f.approve(v.id, r2, approval, f.app), f.approve(v.id, r2, approval, f.second)]);
  expect(approved.map(view => view.variations[0]!.state)).toEqual(["approved", "approved"]);
  const afterApprove = await f.counts(v.id);
  expect(afterApprove).toMatchObject({ approvals: 1, revisions: afterRevise.revisions });
  expect(afterApprove.audit).toBe(afterRevise.audit + 1);
});
