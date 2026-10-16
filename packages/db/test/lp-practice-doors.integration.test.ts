import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedEvidencePackFixture } from "./evidence-pack-fixture.js";
import { installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
import { jobDoorCounts, jobDoorsActor, jobDoorsDatabase, transaction, type JobDoorsDatabase } from "./lp-job-doors-fixtures.js";
let db: JobDoorsDatabase;
beforeAll(async () => { db = await jobDoorsDatabase(); }, 300_000);
afterAll(async () => { await db?.close(); });
describe("LP-2 actor-less practice route database restriction", () => {
  const calls = [
    "SELECT app.configure_recovery_demo($1,$2,'eligible')",
    "SELECT app.approve_synthetic_landing('{}'::jsonb)",
    "SELECT app.reverse_synthetic_landing($1,$2,$2,$2,$2,1,'Fictional reversal')",
    "SELECT app.create_fee_illustration_source($1,$2)",
  ];
  it.each(calls)("[LP2-A11] outside the trusted database %s refuses before effects despite forged practice settings", async sql => {
    const actor = await jobDoorsActor(db.owner), before = await jobDoorCounts(db.owner, actor.tenant);
    await expect(transaction(db.runtime, actor.tenant, async client => {
      await client.query("SELECT set_config('app.deployment_mode','synthetic_demo',true)");
      await client.query("SELECT set_config('app.import_command','enabled',true)");
      return client.query(sql, sql.includes('$1') ? [actor.tenant, randomUUID()] : []);
    })).rejects.toMatchObject({ code: "42501", message: "MODE_FORBIDDEN" });
    expect(await jobDoorCounts(db.owner, actor.tenant)).toEqual(before);
  });
});


describe("LP-2 trusted practice compatibility", () => {
  it("[LP2-A11] the trusted database preserves v1 scenario, landing, reversal and illustration checks", async () => {
    const practice = await jobDoorsDatabase(true);
    try {
      await installLegacySyntheticPartyFixtures(practice.owner);
      const f = await seedEvidencePackFixture(practice.owner);
      await transaction(practice.owner, f.tenantId, async client => {
        const activation = randomUUID();
        await client.query(`INSERT INTO app.job_activation(id,tenant_id,job_id,accepted_document_id,accepted_document_version,
          accepted_document_hash,mode,activation_terms_version,fee_policy_version,actor_membership_id,activated_at)
          SELECT $1,$2,$3,id,document_version,content_hash,'synthetic_demo','synthetic_demo_illustrative.v1',
          'reference_fee_policy_v1',$4,clock_timestamp() FROM app.quote_document_version WHERE tenant_id=$2 AND id=$5`,
        [activation, f.tenantId, f.jobId, f.memberId, f.quoteId]);
        await client.query(`INSERT INTO app.cap_snapshot(id,tenant_id,job_id,activation_id,baseline_quote_version_id,
          accepted_net_value_pence,currency,recovery_cap_pence,fee_policy_version,illustrative)
          VALUES($1,$2,$3,$4,$5,1880000,'GBP',28200,'reference_fee_policy_v1',true)`,
        [randomUUID(), f.tenantId, f.jobId, activation, f.quoteId]);
      });
      await transaction(practice.runtime, f.tenantId, async client => {
        await client.query("SELECT app.configure_recovery_demo($1,$2,'eligible')", [f.jobId, randomUUID()]);
      });
      const selected = (await practice.owner.query("SELECT * FROM app.recovery_demo_selection WHERE tenant_id=$1 AND job_id=$2", [f.tenantId, f.jobId])).rows[0]!;
      const allocation = randomUUID(), derivation = randomUUID();
      const payload = { version: "recovery.landing.approve.v1", policyVersion: "reference_fee_policy_v1", caseId: selected.case_id,
        jobId: f.jobId, receiptId: selected.receipt_id, evidenceId: selected.evidence_id, eligibilityApprovalId: selected.eligibility_approval_id,
        landingApprovalId: selected.landing_approval_id, expectedCaseRevision: 0, allocationId: allocation, derivationId: derivation,
        journalId: randomUUID(), grossPence: 18000, eligibleNetPence: 15000 };
      const before = await jobDoorCounts(practice.owner, f.tenantId);
      await expect(transaction(practice.runtime, f.tenantId, c => c.query("SELECT app.approve_synthetic_landing($1::jsonb)",
        [JSON.stringify({ ...payload, evidenceId: randomUUID() })]))).rejects.toBeDefined();
      expect(await jobDoorCounts(practice.owner, f.tenantId)).toEqual(before);
      await transaction(practice.runtime, f.tenantId, async client => {
        expect((await client.query("SELECT app.approve_synthetic_landing($1::jsonb) id", [JSON.stringify(payload)])).rows).toEqual([{ id: derivation }]);
        await client.query("SELECT app.reverse_synthetic_landing($1,$2,$3,$4,$5,1000,'Fictional reversal')",
          [f.tenantId, randomUUID(), randomUUID(), randomUUID(), allocation]);
        await client.query("SELECT app.create_fee_illustration_source($1,$2)", [f.jobId, randomUUID()]);
      });
      expect((await practice.owner.query("SELECT eligible_net_pence FROM app.landing_allocation WHERE tenant_id=$1 AND id=$2", [f.tenantId, allocation])).rows)
        .toEqual([{ eligible_net_pence: "15000" }]);
      expect((await practice.owner.query("SELECT eligible_net_pence FROM app.landing_reversal WHERE tenant_id=$1 AND allocation_id=$2", [f.tenantId, allocation])).rows)
        .toEqual([{ eligible_net_pence: "1000" }]);
      expect((await practice.owner.query("SELECT count(*)::int n FROM app.fee_illustration_source WHERE tenant_id=$1 AND job_id=$2", [f.tenantId, f.jobId])).rows)
        .toEqual([{ n: 1 }]);
    } finally { await practice.close(); }
  }, 300_000);
});
