import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FeeIllustrationRepository, DEMO_TENANT_ID, DEMO_MEMBERSHIP_ID } from "../src/index.js";
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
