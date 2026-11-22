// Synthetic only. Real PostgreSQL books through existing fake-rail command helpers.
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { shadowPilotFinancialCounts, shadowPilotFinancialHash, shadowPilotSubscriptionCounts } from "@jobguard/core";
import { ShadowPilotFinancialReader } from "../src/shadow-pilot-financial-reader.js";
import { SimulationFeeStatementRepository } from "../src/simulation-fee-statement-repository.js";
import { SimulationFeeCollectionRepository } from "../src/simulation-fee-collection-repository.js";
import { createFinalCheckFixture, closeFinalCheckFixture, seedFinalCheckJob, finalCheckTenant, FINAL_CHECK_ACTOR, type FinalCheckFixture } from "./final-check-fixture.js";
import { catchFeeFixture } from "./success-fee-catch-fixture.js";
import { bindTestClient, testBoundTenantContext, testTenantContext } from "./tenant-context-test-utils.js";
import { preparedPeriod } from "./subscription-persistence-fixtures.js";

let f: FinalCheckFixture, research: Pool, reader: ShadowPilotFinancialReader;
beforeAll(async () => {
  f = await createFinalCheckFixture();
  // SET ROLE drops the superuser's bypass: FORCE RLS and tenant policies really apply.
  research = new Pool({ ...f.admin.options, password: f.admin.options.password, options: "-c role=jobguard_migration" });
  reader = new ShadowPilotFinancialReader(research);
}, 120_000);
afterAll(async () => { if (research) await research.end(); if (f) await closeFinalCheckFixture(f); });

function reportInput(tenantId: string, jobId: string) {
  const lockId = randomUUID();
  return {
    access: { tenantId, jobId, lockId, audience: "synthetic_researcher", environment: "synthetic_demo" },
    input: {
      version: "shadow-pilot-report-input.v1", environment: "synthetic_demo",
      immutableObservationSetRef: "synthetic:observations",
      measurement: { version: "shadow-pilot-measurement.v1", environment: "synthetic_demo", tenantId, jobId, lockId,
        snapshotRef: "synthetic:snapshot", immutableRecordSetRef: "synthetic:records", captures: [],
        lockedLineIds: [], signals: [], receipts: [], allocations: [], mustSurface: [], subscriptionScenario: null },
      reveal: null, fairness: null, harm: null,
    },
  };
}

it("reads a clean job set with stable sources/hash and rejects caller financial assertions", async () => {
  const a = await seedFinalCheckJob(f), b = await seedFinalCheckJob(f);
  const record = await reader.read(a.context, [b.jobId, a.jobId, a.jobId]);
  expect(record.jobIds).toEqual([a.jobId, b.jobId].sort());
  expect(record.sources).toEqual([]);
  expect(Object.isFrozen(record)).toBe(true);
  expect(Object.isFrozen(record.sources)).toBe(true);
  const { sourceHash, ...source } = record;
  expect(sourceHash).toBe(shadowPilotFinancialHash(source));
  expect(await reader.read(a.context, [a.jobId, b.jobId])).toEqual(record);
  const { input, access } = reportInput(a.tenantId, a.jobId);
  const report = await reader.report(a.context, record.jobIds, input, access);
  expect(report.effects).toEqual({ accruals: 0, invoices: 0, collections: 0 });
  expect(report.financialRecord).toEqual(record);
  for (const assertion of [{ financialEffects: { accruals: 0, invoices: 0, collections: 0 } }, { financialRecord: record }])
    await expect(reader.report(a.context, record.jobIds, { ...input, ...assertion }, access)).rejects.toThrow("INVALID_PILOT_REPORT");
  await expect(new ShadowPilotFinancialReader(f.runtime).read(a.context, [a.jobId])).rejects.toMatchObject({ code: "42501" });
});

it("refuses and names gross accrual, invoice and collection rows as each is stored", async () => {
  const x = await catchFeeFixture(f), { input, access } = reportInput(x.context.tenantId, x.jobId);
  const clean = await reader.read(x.context, [x.jobId]);
  expect(clean.sources).toEqual([]);
  const review = await x.execute();
  await x.execute({ version: "success-fee-command.v1", action: "approve", commandId: randomUUID(),
    expectedPostingRevision: 0, reviewId: review.reviewId, statementHash: review.statementHash });
  const accrual = await reader.read(x.context, [x.jobId]);
  expect(shadowPilotFinancialCounts(accrual)).toEqual({ accruals: 1, invoices: 0, collections: 0 });
  await expect(reader.report(x.context, [x.jobId], input, access)).rejects.toThrow(accrual.sources[0]!.rowId);
  const statements = new SimulationFeeStatementRepository(f.runtime);
  const issued = await statements.command(x.context, x.jobId, x.auth.digest,
    { version: "simulation-fee-statement-command.v1", action: "issue", commandId: randomUUID() });
  const invoice = await reader.read(x.context, [x.jobId]);
  expect(shadowPilotFinancialCounts(invoice)).toEqual({ accruals: 1, invoices: 1, collections: 0 });
  await expect(reader.report(x.context, [x.jobId], input, access)).rejects.toThrow(issued.statementId);
  const attempt = await new SimulationFeeCollectionRepository(f.runtime).command(x.context, x.jobId, x.auth.digest,
    { version: "simulation-fee-collection-command.v1", action: "collect", commandId: randomUUID(),
      statementId: issued.statementId, statementHash: issued.documentHash, amountPence: 8000 });
  const collection = await reader.read(x.context, [x.jobId]);
  expect(shadowPilotFinancialCounts(collection)).toEqual({ accruals: 1, invoices: 1, collections: 1 });
  await expect(reader.report(x.context, [x.jobId], input, access)).rejects.toThrow(attempt.attemptId);
  expect(collection.sourceHash).not.toBe(clean.sourceHash);
  expect(clean.sources).toEqual([]); // Previously returned snapshot cannot change under a caller.

  const otherTenant = testTenantContext(randomUUID());
  await expect(reader.read(otherTenant, [x.jobId])).rejects.toThrow("INVALID_PILOT_REPORT");
  const role = await research.query("SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user");
  expect(role.rows).toEqual([{ rolsuper: false, rolbypassrls: false }]);
  const client = await research.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.tenant_id',$1,true)", [otherTenant.tenantId]);
    for (const table of ["success_fee_journal", "platform_fee_statement", "platform_fee_attempt"])
      expect((await client.query(`SELECT id FROM app.${table} WHERE job_id=$1`, [x.jobId])).rows).toEqual([]);
    await client.query("ROLLBACK");
  } finally { client.release(); }

  await finalCheckTenant(f.admin, x.context.tenantId, async db => {
    await db.query("SELECT set_config('app.practice_material_digest',$1,true)", [x.auth.digest]);
    await bindTestClient(f.admin, db, x.context.tenantId, x.actor.membershipId);
    await db.query("SELECT app.write_platform_fee_collection($1,$2,$3::jsonb)", [x.jobId, x.auth.digest, {
      version: "simulation-fee-collection-command.v1", action: "settle", commandId: randomUUID(), attemptId: attempt.attemptId,
    }]);
  });
  await x.invoices.reverseReceipt(x.context, {
    jobId: x.jobId, invoiceId: x.invoiceId, paymentId: x.paymentId, actorMembershipId: x.actor.membershipId,
    commandId: randomUUID(), reason: "Fictional payment reversal",
  });
  const correction = await statements.command(x.context, x.jobId, x.auth.digest,
    { version: "simulation-fee-statement-command.v1", action: "issue", commandId: randomUUID() });
  const refund = await new SimulationFeeCollectionRepository(f.runtime).command(x.context, x.jobId, x.auth.digest,
    { version: "simulation-fee-collection-command.v1", action: "refund", commandId: randomUUID(),
      statementId: correction.statementId, statementHash: correction.documentHash, amountPence: 8000 });
  expect(shadowPilotFinancialCounts(await reader.read(x.context, [x.jobId]))).toEqual({ accruals: 1, invoices: 2, collections: 2 });
  await expect(reader.report(x.context, [x.jobId], input, access)).rejects.toThrow(refund.attemptId);
});

it("refuses tenant-wide subscription activation and period effects even when the selected job books are empty", async () => {
  const { a } = await preparedPeriod(f);
  const { input, access } = reportInput(a.tenantId, a.jobId);
  const record = await reader.read(a.context, [a.jobId]);
  expect(record.sources).toEqual([]);
  expect(shadowPilotSubscriptionCounts(record)).toEqual({ activations: 1, effects: 2 });
  expect(record.subscriptionSources?.map(row => row.table)).toEqual([
    "subscription_agreement_revision", "platform_statement", "subscription_period",
  ]);
  await expect(reader.report(a.context, [a.jobId], input, access)).rejects.toMatchObject({
    message: expect.stringContaining("subscription_agreement_revision"), financialSources: record.subscriptionSources,
  });
  const clean = await seedFinalCheckJob(f);
  expect(shadowPilotSubscriptionCounts(await reader.read(clean.context, [clean.jobId]))).toEqual({ activations: 0, effects: 0 });
});

it("exports only the counts of an existing pilot lock and refuses earlier or foreign reads", async () => {
  const a = await seedFinalCheckJob(f);
  const offline = await testBoundTenantContext(f.admin, a.tenantId, FINAL_CHECK_ACTOR);
  const denial = { message: "INVALID_PILOT_REPORT", financialSources: [] };
  await expect(reader.pilotReport(offline, a.jobId)).rejects.toMatchObject(denial);
  await a.lock();
  await expect(reader.pilotReport(offline, a.jobId)).rejects.toMatchObject(denial);

  // Model a stored pilot lock inside the isolated fixture. The production reader never changes a lock.
  const marker = "fictional-private-capture@example.invalid";
  const fixture = await f.admin.connect();
  try {
    await fixture.query("BEGIN");
    await fixture.query("SET LOCAL session_replication_role = replica");
    await fixture.query("UPDATE app.job SET practice_session_digest=NULL,practice_scenario=NULL WHERE (tenant_id,id)=($1,$2)", [a.tenantId, a.jobId]);
    await fixture.query(`UPDATE app.job_commercial_track SET environment='pilot_no_charge',provenance='pilot_capture'
      WHERE (tenant_id,job_id)=($1,$2)`, [a.tenantId, a.jobId]);
    await fixture.query(`UPDATE app.final_account_lock SET onboarding_terms_version='pilot_final_check_terms.v2',
      snapshot=s.value,snapshot_digest=app.final_lock_hash(s.value),capture_register_hash=app.final_lock_hash(s.value->'captureRegister')
      FROM (SELECT jsonb_set(snapshot,'{captureRegister}',jsonb_build_array(jsonb_build_object('id',$3::uuid,'description',$4::text))) value
        FROM app.final_account_lock WHERE (tenant_id,job_id)=($1,$2)) s
      WHERE (tenant_id,job_id)=($1,$2)`, [a.tenantId, a.jobId, randomUUID(), marker]);
    await fixture.query("COMMIT");
  } finally {
    await fixture.query("ROLLBACK");
    fixture.release();
  }
  const result = await reader.pilotReport(offline, a.jobId);
  expect(result.report).toMatchObject({
    usage: { capturesPerJob: { status: "observed", value: 1, denominator: 1 } },
    missing: expect.arrayContaining(["signalsRemainingAtLock", "fairness", "recoveredAmount"]),
    effects: { accruals: 0, invoices: 0, collections: 0 }, subscriptionEffects: { activations: 0, effects: 0 },
    randomisedArm: "disabled",
  });
  expect(JSON.stringify(result.report)).not.toMatch(/[a-f0-9]{8}-[a-f0-9]{4}-|[a-f0-9]{64}|@/u);
  expect(JSON.stringify(result)).not.toContain(marker);
  expect(await reader.pilotReport(offline, a.jobId)).toEqual(result);
  await expect(reader.pilotReport(testTenantContext(randomUUID()), a.jobId)).rejects.toMatchObject(denial);
  await expect(new ShadowPilotFinancialReader(f.runtime).pilotReport(offline, a.jobId)).rejects.toMatchObject({ code: "42501" });
});
