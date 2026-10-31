// Dispatcher/CI only: needs embedded PostgreSQL. LATER-B25 L144 (populated isolation with valid positive twins).
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
  approvePricedVariation, insertPricedVariation, insertVariationProposal, DEMO_ACCOUNT_ID, DEMO_IDENTITY_USER_ID,
  DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID } from "../src/index.js";
import { closeTestPools, freePort, installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
import { testTenantContext } from "./tenant-context-test-utils.js";

let postgres: EmbeddedPostgres, admin: Pool, runtime: Pool, directory: string;
const oldEnvironment = process.env.JOBGUARD_ENV;
const T2 = "11000000-0000-4000-8000-000000000001", A2 = "21000000-0000-4000-8000-000000000002",
  U2 = "31000000-0000-4000-8000-000000000003", M2 = "41000000-0000-4000-8000-000000000004";
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "later-variation-isolation-pg-"));
  const port = await freePort(58200, 200);
  postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password: "synthetic",
    persistent: false, createPostgresUser: process.getuid?.() === 0,
    initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
  await postgres.initialise(); await postgres.start(); await postgres.createDatabase("jobguard_synthetic_demo");
  admin = new Pool({ host: "127.0.0.1", port, user: "postgres", password: "synthetic", database: "jobguard_synthetic_demo" });
  await migrate(admin); await installLegacySyntheticPartyFixtures(admin);
  await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1),($2)", [DEMO_TENANT_ID, T2]);
  await admin.query("INSERT INTO identity.identity_user(id) VALUES($1),($2)", [DEMO_IDENTITY_USER_ID, U2]);
  await admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Fictional isolation builder'),($3,$4,'Fictional second builder')",
    [DEMO_ACCOUNT_ID, DEMO_TENANT_ID, A2, T2]);
  await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner'),($5,$6,$7,$8,'owner')",
    [DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID, DEMO_ACCOUNT_ID, DEMO_IDENTITY_USER_ID, M2, T2, A2, U2]);
  await admin.query("CREATE ROLE later_isolation_login LOGIN PASSWORD 'synthetic' NOSUPERUSER NOBYPASSRLS; GRANT jobguard_runtime TO later_isolation_login");
  runtime = new Pool({ host: "127.0.0.1", port, database: "jobguard_synthetic_demo", user: "later_isolation_login", password: "synthetic", max: 4 });
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

async function twoJobs() {
  const session = await issuePracticeSession(runtime), auth = await authenticatePracticeSession(runtime, session);
  const app = new VariationApplication(runtime, session);
  const make = async () => {
    const jobId = randomUUID(), parentScopeId = randomUUID();
    await admin.query(`INSERT INTO app.job(id,tenant_id,title,status,practice_session_digest,practice_scenario)
      VALUES($1,$2,'Fictional isolation job','live',$3,'capture')`, [jobId, DEMO_TENANT_ID, auth.digest]);
    await admin.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')", [parentScopeId, DEMO_TENANT_ID, jobId]);
    const id = randomUUID();
    const view = await app.command(jobId, { version: "variation-command.v1", action: "propose", proposalId: id,
      scopeItemId: randomUUID(), existingScopeItemId: null, lineageParentScopeItemId: parentScopeId,
      description: "Fictional extra", captureText: "Fictional extra", price });
    return { jobId, variation: view.variations.find(v => v.id === id)! };
  };
  return { app, auth, a: await make(), b: await make() };
}
const effects = async (variationId: string) => {
  const q = async (sql: string) => (await admin.query(sql, [DEMO_TENANT_ID, variationId])).rows[0].n as number;
  return {
    revisions: await q("SELECT count(*)::int n FROM app.variation_revision WHERE tenant_id=$1 AND variation_id=$2"),
    approvals: await q("SELECT count(*)::int n FROM app.variation_approval WHERE tenant_id=$1 AND variation_id=$2"),
    rejections: await q("SELECT count(*)::int n FROM app.variation_rejection WHERE tenant_id=$1 AND variation_id=$2"),
    audit: await q("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND subject_ref=$2::text"),
  };
};

it("L144 same-tenant other-job probes are refused and change nothing, while their positive twins succeed", async () => {
  const f = await twoJobs(), vA = f.a.variation, vB = f.b.variation, rA = vA.currentRevisionId!;
  const before = await effects(vA.id), beforeB = await effects(vB.id);
  // Populated: job B holds its own priced variation; job A's ids are used against job B's route.
  const probes = [
    () => f.app.command(f.b.jobId, { version: "variation-command.v1", action: "revise", variationId: vA.id, expectedRevisionId: rA,
      revisionId: randomUUID(), description: "Probe", price }),
    () => f.app.command(f.b.jobId, { version: "variation-command.v1", action: "approve", variationId: vA.id, revisionId: rA,
      approvalId: randomUUID(), attestation }),
    () => f.app.command(f.b.jobId, { version: "variation-command.v1", action: "reject", variationId: vA.id, revisionId: rA, rejectionId: randomUUID() }),
  ];
  for (const probe of probes) await expect(probe()).rejects.toThrow("VARIATION_NOT_FOUND");
  expect(await effects(vA.id)).toEqual(before); expect(await effects(vB.id)).toEqual(beforeB);
  expect((await f.app.get(f.b.jobId)).variations.map(v => v.id)).toEqual([vB.id]);
  // Positive twins: the same three commands on the owning job succeed.
  const revised = await f.app.command(f.a.jobId, { version: "variation-command.v1", action: "revise", variationId: vA.id, expectedRevisionId: rA,
    revisionId: randomUUID(), description: "Twin", price: { ...price, unitRatePence: 13000 } });
  const r2 = revised.variations[0]!.currentRevisionId!;
  const approved = await f.app.command(f.a.jobId, { version: "variation-command.v1", action: "approve", variationId: vA.id, revisionId: r2,
    approvalId: randomUUID(), attestation });
  expect(approved.variations[0]).toMatchObject({ state: "approved", currentRevisionId: r2 });
  const rejected = await f.app.command(f.b.jobId, { version: "variation-command.v1", action: "reject", variationId: vB.id,
    revisionId: vB.currentRevisionId!, rejectionId: randomUUID() });
  expect(rejected.variations[0]).toMatchObject({ state: "rejected" });
});

const S2 = randomUUID(), P2 = randomUUID(), J2 = randomUUID(), V2 = randomUUID(), R2 = randomUUID();
function revisionFor(proposal: VariationProposal, id: string, previous: VariationRevision | null, pence: number, membership: string): VariationRevision {
  return priceVariation({ id, variationId: proposal.id, previous, proposal, description: proposal.description,
    contentHash: "c".repeat(64), confirmed: { ...price, unitRatePence: pence, confirmedByMembershipId: membership, rateProvenance: provenance } });
}
it("L144 other-tenant probes see a populated tenant as absent and the same calls succeed in the owning tenant", async () => {
  const ownContext = testTenantContext(T2), foreignContext = testTenantContext(DEMO_TENANT_ID);
  await admin.query("INSERT INTO app.job(id,tenant_id,title,status) VALUES($1,$2,'Fictional tenant two job','live')", [J2, T2]);
  await admin.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')", [P2, T2, J2]);
  const proposal: VariationProposal = { version: "variation-proposal.v1", id: V2, jobId: J2, scopeItemId: S2, existingScopeItemId: null,
    lineageParentScopeItemId: P2, captureKind: "text", captureText: "Fictional tenant two extra", description: "Fictional tenant two extra", suggestion: null };
  await withTenant(runtime, ownContext, db => insertVariationProposal(db, T2, proposal));
  const first = revisionFor(proposal, R2, null, 12500, M2);
  const next = revisionFor(proposal, randomUUID(), first, 14000, M2);
  const approval = (r: VariationRevision) => approveVariation(r, { id: randomUUID(), revisionId: r.id, revision: r.revision,
    contentHash: r.contentHash, signedDeltaPence: r.signedDeltaPence, method: "builder_attestation", actorMembershipId: M2, evidenceId: null, approvedAt: new Date() });
  // Foreign context against tenant two's data (and tenant two's id used in the foreign context): all invisible.
  await expect(withTenant(runtime, foreignContext, db => insertPricedVariation(db, T2, first))).rejects.toThrow();
  await expect(withTenant(runtime, foreignContext, db => insertPricedVariation(db, DEMO_TENANT_ID, first))).rejects.toThrow("VARIATION_NOT_FOUND");
  expect((await admin.query("SELECT count(*)::int n FROM app.variation_revision WHERE tenant_id=$1", [T2])).rows[0].n).toBe(0);
  // Positive twin: the identical call in the owning tenant succeeds, then the foreign tenant probes the now-populated variation.
  await withTenant(runtime, ownContext, db => insertPricedVariation(db, T2, first));
  await withTenant(runtime, ownContext, db => insertPricedVariation(db, T2, next));
  await expect(withTenant(runtime, foreignContext, db => approvePricedVariation(db, DEMO_TENANT_ID, V2, approval(next)))).rejects.toThrow("EXACT_CURRENT_PRICED_REVISION_REQUIRED");
  await expect(withTenant(runtime, foreignContext, db => new VariationRepository(runtime).reject(db, DEMO_TENANT_ID,
    { id: randomUUID(), variationId: V2, revisionId: next.id, actorMembershipId: DEMO_MEMBERSHIP_ID }))).rejects.toThrow("VARIATION_NOT_FOUND");
  await expect(withTenant(runtime, foreignContext, db => db.$client.query("SELECT id FROM app.variation WHERE id=$1", [V2]))
    .then(r => r.rows)).resolves.toEqual([]);
  expect((await admin.query("SELECT state,current_revision_id FROM app.variation WHERE id=$1", [V2])).rows[0]).toEqual({ state: "priced", current_revision_id: next.id });
  await withTenant(runtime, ownContext, db => approvePricedVariation(db, T2, V2, approval(next)));
  expect((await admin.query("SELECT state FROM app.variation WHERE id=$1", [V2])).rows[0].state).toBe("approved");
  expect((await admin.query("SELECT count(*)::int n FROM app.variation_approval WHERE variation_id=$1", [V2])).rows[0].n).toBe(1);
});
