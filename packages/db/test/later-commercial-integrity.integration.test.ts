import { randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { D11_POLICY_VERSION, type D11CandidatePolicy } from "@jobguard/core";
import {
  DEMO_TENANT_ID as T, DEMO_MEMBERSHIP_ID as M, getCommercialIntegrityReviewQueue,
  migrate, prepareActivationFixtureV3, QuoteAcceptanceRepository, withTenant,
} from "../src/index.js";
import { closeTestPools, freePort } from "./pool-test-utils.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import * as schema from "../src/schema.js";

const policy: D11CandidatePolicy = {
  version: D11_POLICY_VERSION, materialVarianceBasisPoints: 1_000,
  liveActivityWindowMilliseconds: 100, recoveryLandingWindowMilliseconds: 100,
};
const context = testTenantContext(T), originalEnvironment = process.env.JOBGUARD_ENV;
let pg: EmbeddedPostgres | undefined, admin: Pool, runtime: Pool;

beforeAll(async () => {
  process.env.JOBGUARD_ENV = "synthetic_demo";
  const directory = await mkdtemp(join(tmpdir(), "later-b20-pg-"));
  const port = await freePort(58100, 100), credential = randomUUID();
  pg = new EmbeddedPostgres({
    databaseDir: directory, port, user: "postgres", password: credential, persistent: false,
    createPostgresUser: process.getuid?.() === 0,
    initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined,
  });
  await pg.initialise(); await pg.start();
  admin = new Pool({ host: "127.0.0.1", port, user: "postgres", password: credential });
  await migrate(admin);
  await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [T]);
  const identity = randomUUID(), account = randomUUID();
  await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [identity]);
  await admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Synthetic B20')", [account, T]);
  await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [M, T, account, identity]);
  const login = (await admin.query("SELECT format('CREATE ROLE later_b20_login LOGIN PASSWORD %L NOSUPERUSER NOBYPASSRLS', $1::text) ddl", [credential])).rows[0].ddl;
  await admin.query(login);
  await admin.query("GRANT jobguard_runtime TO later_b20_login");
  runtime = new Pool({ host: "127.0.0.1", port, database: "postgres", user: "later_b20_login", password: credential });
}, 90_000);

afterAll(async () => {
  await closeTestPools(runtime, admin); await pg?.stop();
  if (originalEnvironment === undefined) delete process.env.JOBGUARD_ENV;
  else process.env.JOBGUARD_ENV = originalEnvironment;
});

const queue = () => withTenant(runtime, context, db => getCommercialIntegrityReviewQueue(db, policy, Date.now()));
const variance = async (job: string) => (await queue()).findings.filter(f => f.jobId === job && f.kind === "accepted_value_variance");
const outside = async (job: string) => (await queue()).findings.filter(f => f.jobId === job && f.kind === "recovery_settled_outside_app");

async function value(job: string, kind: "quoted" | "accepted" | "final", pence: number, at = "2026-10-01") {
  await admin.query(`INSERT INTO app.commercial_integrity_value_fact
    (id,tenant_id,job_id,value_kind,net_value_pence,currency,source_ref,occurred_at,synthetic)
    VALUES($1,$2,$3,$4,$5,'GBP',$6,$7,true)`, [randomUUID(), T, job, kind, pence, randomUUID(), at]);
}

async function final(job: string, pence: number) {
  const draft = randomUUID(), revision = randomUUID();
  await admin.query("INSERT INTO app.final_account_draft(id,tenant_id,job_id) VALUES($1,$2,$3)", [draft, T, job]);
  await admin.query(`INSERT INTO app.final_account_revision
    (id,tenant_id,job_id,final_account_draft_id,revision,source_hash,baseline_quote_version_id,
     currency,tax_policy_version,net_pence,tax_pence,total_pence,issue_blocked,findings)
    SELECT $1,$2,$3,$4,1,$5,accepted_quote_version_id,'GBP','candidate_m1_standard_v1',$6,0,$6,false,'[]'
    FROM app.job WHERE tenant_id=$2 AND id=$3`, [revision, T, job, draft, "a".repeat(64), pence]);
  await admin.query("UPDATE app.final_account_draft SET current_revision_id=$1,revision=1 WHERE tenant_id=$2 AND id=$3", [revision, T, draft]);
}

// Isolated projection fixtures only: these deliberately bypass command validation
// during setup, then restore triggers before reading through the actual runtime role.
// They do not claim to verify fee posting, receipt validation or approval routines.
async function recovery(tenant = T, job = randomUUID()) {
  const allocation = randomUUID();
  const client = await admin.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL session_replication_role=replica");
    if (tenant !== T) await client.query("INSERT INTO control_plane.tenant(id) VALUES($1) ON CONFLICT DO NOTHING", [tenant]);
    await client.query("INSERT INTO app.job(id,tenant_id,title,status) VALUES($1,$2,'Synthetic B20 recovery','draft') ON CONFLICT DO NOTHING", [job, tenant]);
    await client.query(`INSERT INTO app.commercial_integrity_activity_fact(id,tenant_id,job_id,activity_kind,occurred_at,synthetic)
      VALUES($1,$2,$3,'outside_app_settlement','2026-10-01',true),($4,$2,$3,'recovery_discussed','2026-09-30',true) ON CONFLICT DO NOTHING`, [randomUUID(), tenant, job, randomUUID()]);
    await client.query(`INSERT INTO app.landing_allocation
      (id,tenant_id,job_id,case_id,receipt_id,evidence_id,eligibility_approval_id,landing_approval_id,
       gross_pence,eligible_net_pence,currency,policy_version)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,10000,10000,'GBP','reference_fee_policy_v1')`,
    [allocation, tenant, job, randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
  return { tenant, job, allocation };
}

async function reverse(fixture: Awaited<ReturnType<typeof recovery>>, pence: number) {
  await admin.query(`INSERT INTO app.landing_reversal(id,tenant_id,job_id,allocation_id,eligible_net_pence,reason)
    VALUES($1,$2,$3,$4,$5,'Synthetic B20 reversal')`, [randomUUID(), fixture.tenant, fixture.job, fixture.allocation, pence]);
}

describe("LATER-B20 commercial integrity projections", () => {
  it("L113 dbsrc-02#1: quote accepted after historical backfill contributes the baseline", async () => {
    const job = await prepareActivationFixtureV3(admin, context, "B20 new acceptance", 80_000, runtime);
    expect((await admin.query("SELECT count(*)::int n FROM app.commercial_integrity_value_fact WHERE tenant_id=$1 AND job_id=$2", [T, job])).rows[0].n).toBe(0);
    await final(job, 110_000);
    expect(await variance(job)).toEqual([expect.objectContaining({ advisory: true, citedNumbers: {
      quotedNetPence: 80_000, acceptedNetPence: 80_000, finalNetPence: 110_000,
      differencePence: 30_000, thresholdBasisPoints: 1_000,
    } })]);
  });

  it("L113: new and historical jobs agree without a new value backfill", async () => {
    const recent = await prepareActivationFixtureV3(admin, context, "B20 recent", 80_000, runtime);
    const historical = await prepareActivationFixtureV3(admin, context, "B20 historical", 80_000, runtime);
    await value(historical, "accepted", 80_000); await value(historical, "quoted", 80_000);
    await final(recent, 110_000); await final(historical, 110_000);
    const a = await variance(recent), b = await variance(historical);
    expect(a).toHaveLength(1); expect(b).toHaveLength(1);
    expect(a[0]!.citedNumbers).toEqual(b[0]!.citedNumbers);
  });

  it("L113: current snapshots override stale larger accepted, quoted and final facts", async () => {
    const job = await prepareActivationFixtureV3(admin, context, "B20 stale facts", 80_000, runtime);
    await value(job, "accepted", 200_000); await value(job, "quoted", 200_000); await value(job, "final", 200_000);
    await final(job, 110_000);
    expect(await variance(job)).toEqual([expect.objectContaining({ citedNumbers: expect.objectContaining({
      quotedNetPence: 80_000, acceptedNetPence: 80_000, finalNetPence: 110_000, differencePence: 30_000,
    }) })]);
  });

  it("L113: historical fallback uses the latest value rather than the largest value", async () => {
    const job = randomUUID();
    await admin.query("INSERT INTO app.job(id,tenant_id,title,status) VALUES($1,$2,'Synthetic B20 legacy','draft')", [job, T]);
    await value(job, "accepted", 80_000); await value(job, "quoted", 80_000);
    await value(job, "final", 200_000); await value(job, "final", 110_000, "2026-10-02");
    expect(await variance(job)).toEqual([expect.objectContaining({ citedNumbers: expect.objectContaining({ finalNetPence: 110_000, differencePence: 30_000 }) })]);
  });

  it("L113: cancellation removes historical acceptance from the won-job count", async () => {
    const job = await prepareActivationFixtureV3(admin, context, "B20 cancelled", 80_000, runtime);
    const repo = new QuoteAcceptanceRepository(runtime), acceptance = (await repo.view(context, job)).activeAcceptance!;
    const before = await queue();
    await repo.disposition(context, job, { commandId: randomUUID(), documentId: acceptance.documentId,
      documentVersion: acceptance.documentVersion, documentHash: acceptance.documentHash,
      kind: "acceptance_cancelled", occurredAt: new Date().toISOString() });
    const after = await queue();
    expect(after.aggregate.wonJobs).toBe(before.aggregate.wonJobs - 1);
    expect(after.findings.filter(f => f.jobId === job)).toEqual([]);
  });

  it("L114 dbsrc-02#2: fully reversed landing no longer suppresses the integrity finding", async () => {
    const fixture = await recovery();
    expect(await outside(fixture.job)).toEqual([]);
    await reverse(fixture, 10_000);
    expect(await outside(fixture.job)).toEqual([expect.objectContaining({ advisory: true, jobId: fixture.job, kind: "recovery_settled_outside_app" })]);
  });

  it("L114: partial reversal retains only the remaining qualifying effect", async () => {
    const fixture = await recovery();
    await reverse(fixture, 9_999);
    expect(await outside(fixture.job)).toEqual([]);
    // A second fully reversed allocation on this job leaves the remaining penny.
    const other = await recovery(T, fixture.job); await reverse(other, 10_000);
    expect(await outside(fixture.job)).toEqual([]);
  });

  it("L114: all allocations must be fully reversed before the finding returns", async () => {
    const first = await recovery(), second = await recovery(T, first.job);
    await reverse(first, 10_000);
    expect(await outside(first.job)).toEqual([]);
    await reverse(second, 10_000);
    expect(await outside(first.job)).toHaveLength(1);
  });

  it("L113 L114: tenant/job-qualified reads do not mix other jobs or tenants", async () => {
    const ours = await recovery(), sameTenant = await recovery(), foreign = await recovery(randomUUID());
    await reverse(ours, 10_000); await reverse(foreign, 10_000);
    const result = await queue();
    expect(result.findings.filter(f => f.jobId === ours.job && f.kind === "recovery_settled_outside_app")).toHaveLength(1);
    expect(result.findings.filter(f => f.jobId === sameTenant.job)).toEqual([]);
    expect(result.findings.filter(f => f.jobId === foreign.job)).toEqual([]);
    const otherQueue = await withTenant(runtime, testTenantContext(foreign.tenant), db => getCommercialIntegrityReviewQueue(db, policy, Date.now()));
    expect(otherQueue.findings.map(f => f.jobId)).toEqual([foreign.job]);
  });

  it("L113 L114: running checks changes no commercial state", async () => {
    const fixture = await recovery(); await reverse(fixture, 10_000);
    const client = await runtime.connect();
    try {
      await client.query("BEGIN READ ONLY");
      await client.query("SELECT set_config('app.tenant_id',$1,true)", [T]);
      const snapshot = async () => (await admin.query(`SELECT c.relname,
        (xpath('/table/row/n/text()',query_to_xml(format('SELECT count(*) AS n FROM app.%I',c.relname),false,true,'')))[1]::text n
        FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
        WHERE ns.nspname='app' AND c.relkind='r' ORDER BY c.relname`)).rows;
      const before = await snapshot();
      const db = Object.assign(drizzle(client, { schema }), { $client: client });
      const first = await getCommercialIntegrityReviewQueue(db, policy, 2_000);
      expect(await getCommercialIntegrityReviewQueue(db, policy, 2_000)).toEqual(first);
      expect(await snapshot()).toEqual(before);
    } finally { await client.query("ROLLBACK"); client.release(); }
  });
});
