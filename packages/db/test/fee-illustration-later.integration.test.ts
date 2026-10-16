import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FeeIllustrationRepository, PracticeActivationRepository, QuoteRepository, QuoteDeliveryRepository, QuoteAcceptanceRepository, DEMO_TENANT_ID, DEMO_MEMBERSHIP_ID } from "../src/index.js";
import { FeeIllustrationApplication } from "../../../apps/api/src/workspace/fee-illustration.application.js";
import { createWorkFixture, closeWorkFixture, seedWorkPractice, workTenant, type WorkFixture } from "./job-work-state-fixtures.js";
import { proofBefore, proofDifferences, rolledBack } from "./upgrade-proof-utils.js";

let f: WorkFixture, owner: Awaited<ReturnType<typeof seedWorkPractice>>, repo: FeeIllustrationRepository;
const previousEnvironment = process.env.JOBGUARD_ENV;
beforeAll(async () => {
  process.env.JOBGUARD_ENV = "synthetic_demo";
  f = await createWorkFixture(); owner = await seedWorkPractice(f); repo = new FeeIllustrationRepository(f.runtime);
}, 120000);
afterAll(async () => {
  if (previousEnvironment === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV = previousEnvironment;
  await closeWorkFixture(f);
});

describe("LATER-B18 persisted synthetic illustration", () => {
  it("r1 replays a v1 no_charge practice illustration without changing journals, obligations, statements or receipts", async () => {
    const practice = await seedWorkPractice(f), context = practice.auth.context;
    const jobId = (await f.admin.query("SELECT id FROM app.job WHERE tenant_id=$1 AND practice_session_digest=$2 AND saved_v1_sample", [DEMO_TENANT_ID, practice.auth.digest])).rows[0].id as string;
    const scopeId = randomUUID(), revisionId = randomUUID();
    // Prepare fictional confirmed scope on the session's saved v1 sample; use real commands thereafter.
    await workTenant(f.admin, DEMO_TENANT_ID, async db => {
      await db.query("UPDATE app.job SET status='quoting' WHERE tenant_id=$1 AND id=$2", [DEMO_TENANT_ID, jobId]);
      await db.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')", [scopeId, DEMO_TENANT_ID, jobId]);
      await db.query("INSERT INTO app.scope_revision(id,tenant_id,job_id,scope_item_id,revision,description,quantity_decimal,unit,unit_price_pence,total_pence) VALUES($1,$2,$3,$4,1,'Fictional decorating','1','item',1880000,1880000)", [revisionId, DEMO_TENANT_ID, jobId, scopeId]);
    });
    await new QuoteRepository(f.runtime).saveDraft(context, {
      jobId, draftId: randomUUID(), expectedRevision: 0, currency: "GBP", taxPolicyVersion: "candidate_m1_standard_v1", blockingQuestions: [], effectiveAt: new Date(),
      lines: [{ id: randomUUID(), scopeItemId: scopeId, scopeRevisionId: revisionId, description: "Fictional decorating", origin: "captured", included: true, exclusionReason: null, quantity: "1", unit: "item", unitRatePence: 1880000, discountPercent: "0", taxTreatment: "standard_rate_20", rateProvenance: "entered", category: "Work", region: null }],
    });
    const delivery = new QuoteDeliveryRepository(f.runtime), recipient = "fixture-customer@example.invalid";
    const preview = await delivery.preview(context, jobId, recipient);
    await delivery.issue(context, jobId, { commandId: randomUUID(), documentId: preview.documentId, contentHash: preview.hash, recipient });
    await delivery.execute(context, jobId, preview.documentId, "success");
    await new QuoteAcceptanceRepository(f.runtime).accept(context, jobId, {
      commandId: randomUUID(), documentId: preview.documentId, documentHash: preview.hash, documentVersion: preview.document.documentVersion,
      statedCustomerName: "Practice Customer", statedMethod: "email", acceptedAt: new Date().toISOString(),
    });
    const live = await new PracticeActivationRepository(f.runtime).start(context, jobId, { commandId: randomUUID(), scenario: "no_charge" });
    expect(live).toMatchObject({ jobStatus: "live", activation: { policyVersion: "reference_fee_policy_v1", scenario: "no_charge" } });
    expect((await f.admin.query("SELECT job_track,environment FROM app.job_commercial_track WHERE tenant_id=$1 AND job_id=$2", [DEMO_TENANT_ID, jobId])).rows).toEqual([{ job_track: "small_builder", environment: "pilot_no_charge" }]);
    expect((await f.admin.query("SELECT mode FROM app.job_activation WHERE tenant_id=$1 AND job_id=$2", [DEMO_TENANT_ID, jobId])).rows).toEqual([{ mode: "pilot_no_charge" }]);

    // Activation legitimately writes receipts; snapshot after setup and compare after both illustration calls.
    const extra = (await f.admin.query("SELECT 'app.'||tablename name FROM pg_tables WHERE schemaname='app' AND (tablename LIKE '%statement%' OR tablename LIKE '%receipt%' OR tablename LIKE '%obligation%')")).rows.map(row => row.name as string);
    const tracked = [...new Set(["app.journal", "app.journal_line", "app.synthetic_obligation", "app.command_receipt", ...extra])];
    const allRows = async () => Promise.all(tracked.map(async table => (await f.admin.query(`SELECT row_to_json(t)::text bytes FROM ${table} t ORDER BY row_to_json(t)::text COLLATE "C"`)).rows));
    const before = await allRows();
    const application = new FeeIllustrationApplication(f.runtime, practice.sessionId);
    const input = { version: "fee-illustration-source.v1", commandId: randomUUID(), fixture: "recovery-18800" };
    const created = await application.create(jobId, input);
    // Fixed v1 fixture counters are hypothetical; the snapshots prove no actual financial rows change.
    expect(created).toMatchObject({ label: "Illustration — proposed policy; principal only, VAT excluded", source: { statementIssuedCount: 1, ledgerEntryCount: 1 } });
    expect(await allRows()).toEqual(before);
    const sourceRows = async () => (await f.admin.query("SELECT row_to_json(s)::text bytes FROM app.fee_illustration_source s WHERE tenant_id=$1 AND job_id=$2", [DEMO_TENANT_ID, jobId])).rows;
    const persisted = await sourceRows();
    expect(persisted).toHaveLength(1);
    expect(await application.create(jobId, input)).toEqual(created);
    expect(await application.read(jobId)).toEqual(created);
    expect(await sourceRows()).toEqual(persisted);
    expect(await allRows()).toEqual(before);

    const contractorJobId = randomUUID();
    await workTenant(f.admin, DEMO_TENANT_ID, async db => {
      await db.query("INSERT INTO app.job(id,tenant_id,title) VALUES($1,$2,'Fictional contractor job')", [contractorJobId, DEMO_TENANT_ID]);
      await db.query("INSERT INTO app.job_commercial_track(tenant_id,job_id,job_track,environment,provenance) VALUES($1,$2,'contractor','synthetic_demo','work_order_import')", [DEMO_TENANT_ID, contractorJobId]);
    });
    await expect(repo.create(contractorJobId, randomUUID())).rejects.toMatchObject({ code: "42501", message: "FEE_ILLUSTRATION_FORBIDDEN" });
  });

  it("L101 concurrent identical creation returns one persisted illustration; stable replay", async () => {
    const commandId = randomUUID();
    const replies = await Promise.all(Array.from({ length: 4 }, () => repo.create(owner.jobId, commandId)));
    expect(replies[0]).not.toBeNull();
    for (const reply of replies) expect(reply).toEqual(replies[0]);
    expect(await repo.create(owner.jobId, commandId)).toEqual(replies[0]);
    const rows = (await f.admin.query("SELECT command_id,source_ids FROM app.fee_illustration_source WHERE tenant_id=$1 AND job_id=$2", [DEMO_TENANT_ID, owner.jobId])).rows;
    expect(rows).toHaveLength(1); expect(rows[0].command_id).toBe(commandId);
    expect(rows[0].source_ids).toEqual(replies[0]!.sourceIds);
    await expect(repo.create(owner.jobId, randomUUID())).rejects.toMatchObject({ code: "23505", message: "FEE_ILLUSTRATION_CONFLICT" });
    const another = await seedWorkPractice(f);
    await expect(repo.create(another.jobId, commandId)).rejects.toMatchObject({ code: "23505", message: "FEE_ILLUSTRATION_CONFLICT" });
  });

  it("L101 changed job/content under same ID conflicts; no hidden financial effect", async () => {
    const another = await seedWorkPractice(f);
    const tables = ["app.journal", "app.journal_line", "app.synthetic_obligation", "app.command_receipt", "app.audit_event"];
    // Include every statement/receipt/obligation table, regardless of whether this fixture populates it.
    const extra = (await f.admin.query("SELECT 'app.'||tablename name FROM pg_tables WHERE schemaname='app' AND (tablename LIKE '%statement%' OR tablename LIKE '%receipt%' OR tablename LIKE '%obligation%')")).rows.map(row => row.name as string);
    const tracked = [...new Set([...tables, ...extra])];
    const allRows = async () => Promise.all(tracked.map(async table => (await f.admin.query(`SELECT row_to_json(t)::text bytes FROM ${table} t ORDER BY row_to_json(t)::text COLLATE "C"`)).rows));
    // Session issuance is fixture setup; take the financial snapshot after it.
    const afterSetup = await allRows(), snapshot = await proofBefore(f.admin, tracked);
    const id = randomUUID(); await repo.create(another.jobId, id);
    await expect(repo.create(owner.jobId, id)).rejects.toMatchObject({ code: "23505" });
    const app = new FeeIllustrationApplication(f.runtime, owner.sessionId);
    for (const eligibleNetPence of [0, 282000, 1000000000000]) {
      const body = { version: "fee-what-if.v1", acceptedNetPence: 1880000, eligibleNetPence, settledBasePlanPence: 7900 };
      expect(app.whatIf(body).policyVersion).toBe("reference_fee_policy_v1");
      expect(() => app.whatIf({ ...body, eligibleNetPence: 0.5 })).toThrow();
    }
    expect(await proofDifferences(f.admin, snapshot)).toEqual({ rows: [], types: [] });
    expect(await allRows()).toEqual(afterSetup);
  });

  it("L101 checked writer rechecks owner role before job lookup; runtime has no direct illustration writes", async () => {
    const rights = (await f.admin.query("SELECT has_table_privilege('jobguard_runtime','app.fee_illustration_source','INSERT,UPDATE,DELETE,TRUNCATE') writable")).rows[0];
    expect(rights.writable).toBe(false);
    for (const jobId of [owner.jobId, randomUUID()]) await rolledBack(f.admin, async db => {
      await db.query("SELECT set_config('app.tenant_id',$1,true)", [DEMO_TENANT_ID]);
      await db.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2", [DEMO_TENANT_ID, DEMO_MEMBERSHIP_ID]);
      await db.query("SET LOCAL ROLE jobguard_runtime");
      await expect(db.query("SELECT app.create_fee_illustration_source($1,$2)", [jobId, randomUUID()])).rejects.toMatchObject({ code: "42501", message: "FEE_ILLUSTRATION_FORBIDDEN" });
    });
    await expect(workTenant(f.runtime, DEMO_TENANT_ID, db =>
      db.query("SELECT app.create_fee_illustration_source($1,$2)", [owner.jobId, null]))).rejects.toMatchObject({ code: "22023" });
    await expect(f.runtime.query("SELECT app.create_fee_illustration_source($1,$2)", [owner.jobId, randomUUID()]))
      .rejects.toMatchObject({ code: "42501", message: "FEE_ILLUSTRATION_FORBIDDEN" });
  });

  it("L101 concurrent changed commands on one job create one source and one typed conflict", async () => {
    const another = await seedWorkPractice(f);
    const outcomes = await Promise.allSettled([repo.create(another.jobId, randomUUID()), repo.create(another.jobId, randomUUID())]);
    expect(outcomes.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const refused = outcomes.find(result => result.status === "rejected");
    expect(refused).toMatchObject({ status: "rejected", reason: { code: "23505", message: "FEE_ILLUSTRATION_CONFLICT" } });
    expect((await f.admin.query("SELECT 1 FROM app.fee_illustration_source WHERE tenant_id=$1 AND job_id=$2", [DEMO_TENANT_ID, another.jobId])).rowCount).toBe(1);
  });
});
