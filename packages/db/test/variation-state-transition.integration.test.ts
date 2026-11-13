import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { approveVariation, priceVariation, type VariationProposal, type VariationRevision } from "@jobguard/core";
import { approvePricedVariation, insertPricedVariation, insertVariationProposal, migrate,
  VariationRepository, withTenant } from "../src/index.js";
import { closeTestPools, freePort, installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
import { testTenantContext } from "./tenant-context-test-utils.js";

const T = randomUUID(), A = randomUUID(), U = randomUUID(), M = randomUUID(), J = randomUUID(), P = randomUUID();
const context = testTenantContext(T);
let postgres: EmbeddedPostgres, admin: Pool, runtime: Pool, directory: string;
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "variation-state-guard-pg-"));
  const port = await freePort(58200, 200);
  postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password: "synthetic",
    persistent: false, createPostgresUser: process.getuid?.() === 0,
    initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
  await postgres.initialise(); await postgres.start();
  admin = new Pool({ host: "127.0.0.1", port, user: "postgres", password: "synthetic", database: "postgres" });
  // Fresh installation of every migration, including the guard.
  await migrate(admin); await installLegacySyntheticPartyFixtures(admin);
  await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [T]);
  await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [U]);
  await admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Fictional guard builder')", [A, T]);
  await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [M, T, A, U]);
  await admin.query("INSERT INTO app.job(id,tenant_id,title,status) VALUES($1,$2,'Fictional guard job','live')", [J, T]);
  await admin.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')", [P, T, J]);
  await admin.query("CREATE ROLE variation_guard_login LOGIN PASSWORD 'synthetic' NOSUPERUSER NOBYPASSRLS; GRANT jobguard_runtime TO variation_guard_login");
  runtime = new Pool({ host: "127.0.0.1", port, database: "postgres", user: "variation_guard_login", password: "synthetic", max: 2 });
}, 120_000);
afterAll(async () => {
  await closeTestPools(runtime, admin); await postgres?.stop();
  if (directory) await rm(directory, { recursive: true, force: true });
});

async function draft() {
  const proposal: VariationProposal = { version: "variation-proposal.v1", id: randomUUID(), jobId: J,
    scopeItemId: randomUUID(), existingScopeItemId: null, lineageParentScopeItemId: P,
    captureKind: "text", captureText: "Fictional additional socket", description: "Fictional socket", suggestion: null };
  await withTenant(runtime, context, db => insertVariationProposal(db, T, proposal));
  return proposal;
}
async function price(proposal: VariationProposal, previous: VariationRevision | null = null) {
  const revision = priceVariation({ id: randomUUID(), variationId: proposal.id, previous, proposal,
    description: proposal.description, contentHash: "b".repeat(64), confirmed: {
      quantity: "1", unit: "each", unitRatePence: 12500, direction: "addition", confirmedByMembershipId: M,
      rateProvenance: { kind: "human_entered", sourceRef: "fixture://variation-guard", sourceHash: "a".repeat(64), rateVersion: "fixture-v1" },
    } });
  await withTenant(runtime, context, db => insertPricedVariation(db, T, revision));
  return revision;
}
async function approve(revision: VariationRevision) {
  const approval = approveVariation(revision, { id: randomUUID(), revisionId: revision.id, revision: revision.revision,
    contentHash: revision.contentHash, signedDeltaPence: revision.signedDeltaPence, method: "builder_attestation",
    actorMembershipId: M, evidenceId: null, approvedAt: new Date() });
  await withTenant(runtime, context, db => approvePricedVariation(db, T, revision.variationId, approval));
}
async function reject(revision: VariationRevision) {
  await withTenant(runtime, context, db => new VariationRepository(runtime).reject(db, T, {
    id: randomUUID(), variationId: revision.variationId, revisionId: revision.id, actorMembershipId: M,
  }));
}
const snapshot = async (client: PoolClient, id: string) => (await client.query(
  "SELECT state,current_revision_id FROM app.variation WHERE tenant_id=$1 AND id=$2", [T, id])).rows[0];

// Always restore the savepoint before asserting, so both a refusal and a surviving
// mutation leave the fixture intact. The scratch test below uses this SAME oracle.
async function refused(client: PoolClient, id: string, state: string, revisionId: string | null, message: string) {
  const before = await snapshot(client, id);
  await client.query("SAVEPOINT variation_guard_probe");
  let error: unknown;
  try {
    await client.query("UPDATE app.variation SET state=$1,current_revision_id=$2 WHERE tenant_id=$3 AND id=$4",
      [state, revisionId, T, id]);
  } catch (caught) { error = caught; }
  await client.query("ROLLBACK TO SAVEPOINT variation_guard_probe");
  await client.query("RELEASE SAVEPOINT variation_guard_probe");
  expect(error).toMatchObject({ code: "23514", message });
  expect(await snapshot(client, id)).toEqual(before);
}

it("runtime cannot reopen rejected/approved revisions or borrow another extra's revision on the same job", async () => {
  const a = await price(await draft()), b = await price(await draft()), other = await price(await draft());
  await approve(a); await reject(b);
  await withTenant(runtime, context, async db => {
    for (const r of [a, b]) {
      await refused(db.$client, r.variationId, "priced", r.id, "VARIATION_STATE_TRANSITION_REFUSED");
      await refused(db.$client, r.variationId, "priced", other.id, "VARIATION_REVISION_REFUSED");
      await refused(db.$client, r.variationId, r === a ? "approved" : "rejected", null, "VARIATION_STATE_TRANSITION_REFUSED");
    }
    await refused(db.$client, other.variationId, "priced", a.id, "VARIATION_REVISION_REFUSED");
    await refused(db.$client, other.variationId, "draft", other.id, "VARIATION_STATE_TRANSITION_REFUSED");
  });
});

it("normal price, revise, approve, reject and fresh terms after a decision still work", async () => {
  const proposal = await draft(), first = await price(proposal), second = await price(proposal, first);
  await approve(second);
  // Existing writePricedRevision callers permit changed terms after approval/rejection.
  // Only a fresh successor revision may return those variations to priced.
  const third = await price(proposal, second);
  await reject(third);
  const fourth = await price(proposal, third);
  await approve(fourth);
  await withTenant(runtime, context, async db => {
    expect(await snapshot(db.$client, proposal.id)).toEqual({ state: "approved", current_revision_id: fourth.id });
    // Exact same-state/same-pointer writes are harmless, including terminal states.
    await db.$client.query("UPDATE app.variation SET state=state,current_revision_id=current_revision_id WHERE tenant_id=$1 AND id=$2", [T, proposal.id]);
    await refused(db.$client, proposal.id, "priced", first.id, "VARIATION_STATE_TRANSITION_REFUSED");
    await refused(db.$client, proposal.id, "approved", third.id, "VARIATION_STATE_TRANSITION_REFUSED");
  });
  const unpriced = await draft();
  await withTenant(runtime, context, db => db.$client.query(
    "UPDATE app.variation SET state='rejected' WHERE tenant_id=$1 AND id=$2", [T, unpriced.id]));
});

it("allows only the declared state moves when the revision pointer is unchanged", async () => {
  const unpriced = await draft(), priced = await price(await draft());
  const approved = await price(await draft()), rejected = await price(await draft());
  await approve(approved); await reject(rejected);
  const states = ["draft", "priced", "approved", "rejected"];
  const fixtures = [
    { id: unpriced.id, revisionId: null, state: "draft" },
    ...[priced, approved, rejected].map((r, i) => ({ id: r.variationId, revisionId: r.id, state: states[i + 1]! })),
  ];
  await withTenant(runtime, context, async db => {
    for (const f of fixtures) for (const target of states) {
      const allowed = target === f.state || f.state === "draft" && target === "rejected"
        || f.state === "priced" && ["approved", "rejected"].includes(target);
      if (!allowed) {
        await refused(db.$client, f.id, target, f.revisionId, "VARIATION_STATE_TRANSITION_REFUSED");
        continue;
      }
      await db.$client.query("SAVEPOINT allowed_transition");
      await db.$client.query("UPDATE app.variation SET state=$1,current_revision_id=$2 WHERE tenant_id=$3 AND id=$4",
        [target, f.revisionId, T, f.id]);
      expect(await snapshot(db.$client, f.id)).toEqual({ state: target, current_revision_id: f.revisionId });
      await db.$client.query("ROLLBACK TO SAVEPOINT allowed_transition");
      await db.$client.query("RELEASE SAVEPOINT allowed_transition");
    }
  });
});

it("scratch trigger removal makes each security oracle fail; rollback restores the guard", async () => {
  const a = await price(await draft()), b = await price(await draft()), other = await price(await draft());
  await approve(a); await reject(b);
  const client = await admin.connect();
  try {
    await client.query("BEGIN");
    await client.query("DROP TRIGGER variation_state_transition_guard ON app.variation");
    await client.query("SET LOCAL ROLE jobguard_runtime");
    await client.query("SELECT set_config('app.tenant_id',$1,true)", [T]);
    for (const r of [a, b]) {
      await expect(refused(client, r.variationId, "priced", r.id, "VARIATION_STATE_TRANSITION_REFUSED"))
        .rejects.toThrow(/expected/);
    }
    await expect(refused(client, other.variationId, "priced", a.id, "VARIATION_REVISION_REFUSED"))
      .rejects.toThrow(/expected/);
  } finally {
    // Transactional DDL restores the trigger even when the mutation assertion fails.
    await client.query("ROLLBACK"); client.release();
  }
  await withTenant(runtime, context, async db => {
    await refused(db.$client, a.variationId, "priced", a.id, "VARIATION_STATE_TRANSITION_REFUSED");
    await refused(db.$client, b.variationId, "priced", b.id, "VARIATION_STATE_TRANSITION_REFUSED");
    await refused(db.$client, other.variationId, "priced", a.id, "VARIATION_REVISION_REFUSED");
  });
});
