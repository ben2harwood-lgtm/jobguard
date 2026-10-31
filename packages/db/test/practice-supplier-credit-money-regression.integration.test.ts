import { randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { migrate, issuePracticeSession, authenticatePracticeSession, practiceMaterialPool, RecoveryCaseRepository, RecoveryEligibilityV3Repository, PracticeFeedRepository, withTenant } from "../src/index.js";
import { DEMO_TENANT_ID as T, DEMO_ACCOUNT_ID as A, DEMO_MEMBERSHIP_ID as M, DEMO_IDENTITY_USER_ID as U } from "../src/demo-seed.js";
import { seedSyntheticPartyFixture } from "../src/synthetic-party-fixture.js";
import { closeTestPools, freePort } from "./pool-test-utils.js";
import { testTenantContext } from "./tenant-context-test-utils.js";

let postgres: EmbeddedPostgres, admin: Pool, runtime: Pool;
const previousEnvironment = process.env.JOBGUARD_ENV;
const context = testTenantContext(T), actor = { membershipId: M, identityUserId: U };
beforeAll(async () => {
  process.env.JOBGUARD_ENV = "synthetic_demo";
  const directory = await mkdtemp(join(tmpdir(), "jg-pf1b-money-")), port = await freePort(62000, 100), value = randomUUID();
  postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password: value, persistent: true, createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
  await postgres.initialise(); await postgres.start(); await postgres.createDatabase("jobguard_synthetic_demo");
  admin = new Pool({ host: "127.0.0.1", port, database: "jobguard_synthetic_demo", user: "postgres", password: value });
  await migrate(admin);
  await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [T]);
  await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [U]);
  await admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Fictional PF1B money regression')", [A, T]);
  await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [M, T, A, U]);
  await admin.query(`CREATE ROLE pf1b_money_login LOGIN PASSWORD '${value}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`);
  await admin.query("GRANT jobguard_runtime TO pf1b_money_login");
  runtime = new Pool({ host: "127.0.0.1", port, database: "jobguard_synthetic_demo", user: "pf1b_money_login", password: value });
});
afterAll(async () => {
  await closeTestPools(runtime, admin); if (postgres) await postgres.stop();
  if (previousEnvironment === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV = previousEnvironment;
});

async function fixture(insurer: boolean) {
  const session = await issuePracticeSession(runtime), auth = await authenticatePracticeSession(runtime, session), jobId = randomUUID();
  await admin.query("INSERT INTO app.job(id,tenant_id,title,practice_session_digest,practice_scenario) VALUES($1,$2,'Fictional money regression',$3,'capture')", [jobId, T, auth.digest]);
  await withTenant(admin, context, db => seedSyntheticPartyFixture(db.$client, T, jobId));
  if (insurer) {
    const party = (await admin.query("SELECT b.paying_party_id FROM app.job_party_binding b JOIN app.job_party_current c ON(c.tenant_id,c.binding_id)=(b.tenant_id,b.id) WHERE b.tenant_id=$1 AND b.job_id=$2", [T, jobId])).rows[0];
    const revision = randomUUID(), binding = randomUUID();
    // Administrative source fixture only: retain immutable payer revisions.
    await admin.query("INSERT INTO app.customer_revision(tenant_id,id,customer_id,revision,payload) VALUES($1,$2,$3,2,$4)", [T, revision, party.paying_party_id, JSON.stringify({ version: "customer.v1", name: "Practice Insurer", type: "insurer" })]);
    await admin.query("INSERT INTO app.job_party_binding(tenant_id,id,job_id,revision,customer_id,customer_revision_id,paying_party_id,paying_party_revision_id,site_id,site_revision_id,provenance) SELECT tenant_id,$3,job_id,revision+1,customer_id,customer_revision_id,paying_party_id,$4,site_id,site_revision_id,'backfilled_synthetic_fixture' FROM app.job_party_binding WHERE tenant_id=$1 AND job_id=$2 ORDER BY revision DESC LIMIT 1", [T, jobId, binding, revision]);
    await admin.query("UPDATE app.job_party_current SET binding_id=$3 WHERE tenant_id=$1 AND job_id=$2", [T, jobId, binding]);
  }
  const pool = practiceMaterialPool(runtime, auth.digest), cases = new RecoveryCaseRepository(pool), feed = new PracticeFeedRepository(runtime, "synthetic_demo");
  await feed.command(context, actor, auth.digest, jobId, { version: "practice-feed-command.v1", commandId: randomUUID(), action: "connect", expectedRevision: 0 });
  const c = await cases.command(context, jobId, { version: "recovery-case-command.v1", commandId: randomUUID(), action: "open", caseType: "withheld_customer_payment", claimedNetPence: 250000, counterparty: "Fictional debtor", book: "builder_customer", sourceType: "customer_invoice", sourceRefs: ["Generated customer invoice INV-18800"], expectedRevision: 0 }, actor);
  await feed.command(context, actor, auth.digest, jobId, { version: "practice-feed-command.v1", commandId: randomUUID(), action: "advance", movement: "receipt-3000", step: "settled", expectedRevision: 1 });
  return { auth, jobId, c, feed, repo: new RecoveryEligibilityV3Repository(pool, "synthetic_demo") };
}

it("0188 preserves 0142 insurer exclusion, 0186 unpaid interest, and F19's released reason", async () => {
  expect((await admin.query("SELECT migration_name FROM public.jobguard_schema_migration WHERE migration_name='0188_practice_supplier_credit.sql'")).rows).toHaveLength(1);
  for (const [insurer, name] of [[true, "F19"], [false, "F18"], [false, "F19"]] as const) {
    const f = await fixture(insurer);
    if (name === "F18") await f.feed.factsCommand(context, actor, f.auth.digest, f.jobId, { version: "practice-facts-command.v1", commandId: randomUUID(), action: "advance", movement: "receipt-interest-120", step: "pending", expectedRevision: 2 });
    const command = { version: "recovery-eligibility-command.v3", action: "review", commandId: randomUUID(), caseId: f.c.id, fixture: name, expectedCaseRevision: f.c.revision, expectedReviewRevision: 0 };
    const saved = await f.repo.review(context, f.jobId, command, actor, f.auth.digest);
    const reason = insurer ? "Insurer proceeds never qualify" : name === "F18" ? "Pending money cannot qualify" : "Fixed statutory compensation is not part of the fee base";
    expect(saved.result).toMatchObject({ qualifyingPrincipal: { pence: insurer ? 0 : 250000 }, reason, reasonHeld: false });
    expect(saved.result.lines).toMatchObject([
      { kind: "principal", qualifyingPrincipal: { pence: insurer ? 0 : 250000 }, reason: insurer ? reason : null, reasonHeld: false },
      { kind: "statutory_interest", qualifyingPrincipal: { pence: 0 }, reason: insurer ? reason : name === "F18" ? reason : "Late-payment interest only counts when a business paid it. This customer is a private individual, so this interest isn’t counted as recovered money and there’s no fee on it.", reasonHeld: false },
      { kind: "fixed_compensation", qualifyingPrincipal: { pence: 0 }, reason: insurer ? reason : "Fixed statutory compensation is not part of the fee base", reasonHeld: false },
    ]);
    expect((await admin.query("SELECT result FROM app.recovery_eligibility_v3_review WHERE tenant_id=$1 AND id=$2", [T, saved.id])).rows[0].result).toEqual(saved.result);
    expect(await f.repo.review(context, f.jobId, command, actor, f.auth.digest)).toEqual(saved);
  }
});
