import { randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "../src/migrate.js";
import { DEMO_TENANT_ID } from "../src/demo-seed.js";
import { RecoveryDemoRepository } from "../src/recovery-demo-repository.js";
import { PostgresRecoveryOutcomePostingPort } from "../src/recovery-repository.js";
import { withTenant } from "../src/tenant-context.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { closeTestPools, freePort } from "./pool-test-utils.js";

// CI only: real PostgreSQL, isolated made-up v1 records. No new schema or grants
// on application tables. Fixture setup uses the test administrator, never runtime.
let postgres: EmbeddedPostgres | undefined, admin: Pool | undefined, runtime: Pool;
const tenant = DEMO_TENANT_ID, context = testTenantContext(tenant);
beforeAll(async () => {
  const directory = await mkdtemp(join(tmpdir(), "later-b17-pg-"));
  const port = await freePort(57800, 100), credential = randomUUID();
  postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password: credential,
    persistent: true, createPostgresUser: process.getuid?.() === 0,
    initdbFlags: ["--lc-messages=C"], onLog: () => undefined });
  await postgres.initialise(); await postgres.start(); await postgres.createDatabase("jobguard_synthetic_demo");
  admin = new Pool({ host: "127.0.0.1", port, user: "postgres", password: credential, database: "jobguard_synthetic_demo" });
  await migrate(admin);
  await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [tenant]);
  // This isolated test role inherits the existing runtime privileges only.
  await admin.query(`CREATE ROLE later_b17_login LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '${credential}'; GRANT jobguard_runtime TO later_b17_login`);
  runtime = new Pool({ host: "127.0.0.1", port, database: "jobguard_synthetic_demo", user: "later_b17_login", password: credential, max: 2 });
}, 120_000);
afterAll(async () => { await closeTestPools(runtime, admin); await postgres?.stop(); });

async function fixture() {
  const job = randomUUID(), activation = randomUUID(), upload = randomUUID(), evidence = randomUUID();
  const caseId = randomUUID(), receipt = randomUUID(), eligibility = randomUUID(), landing = randomUUID();
  const client = await admin!.connect();
  try {
    await client.query("BEGIN");
    // These records represent already-existing historical v1 jobs, which current
    // activation commands deliberately no longer create. No production override.
    await client.query("SET LOCAL session_replication_role=replica");
    await client.query("INSERT INTO app.job(id,tenant_id,title,status,revision) VALUES($1,$2,'Made-up historical recovery','live',1)", [job, tenant]);
    await client.query(`INSERT INTO app.job_activation(id,tenant_id,job_id,accepted_document_id,accepted_document_version,accepted_document_hash,mode,activation_terms_version,fee_policy_version,actor_membership_id,activated_at)
      VALUES($1,$2,$3,$4,1,$5,'synthetic_demo','synthetic_demo_illustrative.v1','reference_fee_policy_v1',$6,now())`,
    [activation, tenant, job, randomUUID(), "a".repeat(64), randomUUID()]);
    await client.query(`INSERT INTO app.cap_snapshot(id,tenant_id,job_id,activation_id,baseline_quote_version_id,accepted_net_value_pence,currency,recovery_cap_pence,fee_policy_version,illustrative)
      VALUES($1,$2,$3,$4,$5,1880000,'GBP',28200,'reference_fee_policy_v1',true)`, [randomUUID(), tenant, job, activation, randomUUID()]);
    await client.query(`INSERT INTO app.evidence_upload(id,tenant_id,job_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,state,object_version_id,server_verified_at,expires_at)
      VALUES($1,$2,$3,$4,$5,'application/pdf',1,'standard_evidence','verified','v1',now(),now()+interval '1 hour')`, [upload, tenant, job, `synthetic/${upload}`, "b".repeat(64)]);
    await client.query(`INSERT INTO app.evidence_object(id,tenant_id,upload_id,job_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at)
      VALUES($1,$2,$3,$4,'original','synthetic_bank_receipt',$5,'v1',$6,1,'application/pdf','standard_evidence',now(),now())`, [evidence, tenant, upload, job, `synthetic/${evidence}`, "b".repeat(64)]);
    await client.query("INSERT INTO app.recovery_case(id,tenant_id,job_id,claim_pence,currency,state,revision,synthetic) VALUES($1,$2,$3,150000,'GBP','active',0,true)", [caseId, tenant, job]);
    await client.query(`INSERT INTO app.synthetic_recovery_receipt(id,tenant_id,job_id,source_identity,reconciliation_identity,status,gross_pence,currency,synthetic,settled_at)
      VALUES($1,$2,$3,$4,$4,'settled',180000,'GBP',true,now())`, [receipt, tenant, job, `made-up:${receipt}`]);
    for (const [id, kind] of [[eligibility, "eligibility"], [landing, "landing"]]) {
      await client.query(`INSERT INTO app.recovery_approval(id,tenant_id,job_id,case_id,kind,expected_case_revision,status,policy_version,expires_at,command_id)
        VALUES($1,$2,$3,$4,$5,0,'approved','reference_fee_policy_v1',now()+interval '1 hour',$6)`, [id, tenant, job, caseId, kind, randomUUID()]);
    }
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
  return {
    version: "recovery.landing.approve.v1", commandId: randomUUID(), jobId: job,
    caseId, receiptId: receipt, evidenceId: evidence, eligibilityApprovalId: eligibility, landingApprovalId: landing,
    allocationId: randomUUID(), derivationId: randomUUID(), journalId: randomUUID(),
    grossPence: 180000, eligibleNetPence: 150000, currency: "GBP",
    policyVersion: "reference_fee_policy_v1", expectedCaseRevision: 0,
  };
}

describe("LATER-B17 historical v1 PostgreSQL boundaries", () => {
  it("L104 posts the complete strict envelope through the existing controlled routine", async () => {
    const input = await fixture();
    expect(await new PostgresRecoveryOutcomePostingPort(runtime).approveSyntheticLanding(context, input)).toBe(input.derivationId);
    const stored = await withTenant(runtime, context, db => db.$client.query(
      "SELECT source_allocation_id,posting_delta_pence::text FROM app.recovery_fee_derivation WHERE tenant_id=$1 AND id=$2", [tenant, input.derivationId],
    ));
    expect(stored.rows).toEqual([{ source_allocation_id: input.allocationId, posting_delta_pence: "15000" }]);
  });

  it("L119 displays only the second landing delta after a prior net posting", async () => {
    const input = await fixture(), repository = new RecoveryDemoRepository(runtime);
    await new PostgresRecoveryOutcomePostingPort(runtime).approveSyntheticLanding(context, input);
    await repository.select(input.jobId, randomUUID(), "eligible");
    const view = await repository.approve(input.jobId, randomUUID());
    expect(view).toMatchObject({ approved: true, additionalFeePence: 1500 });
    const stored = await withTenant(runtime, context, db => db.$client.query(
      "SELECT liability_pence::text,posting_delta_pence::text FROM app.recovery_fee_derivation WHERE tenant_id=$1 AND source_allocation_id=$2", [tenant, view.allocationId],
    ));
    expect(stored.rows).toEqual([{ liability_pence: "16500", posting_delta_pence: "1500" }]);
  });
});
