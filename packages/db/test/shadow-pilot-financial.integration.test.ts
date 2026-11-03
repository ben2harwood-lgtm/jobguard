// Synthetic only. Real PostgreSQL books through existing fake-rail command helpers.
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { shadowPilotFinancialCounts, shadowPilotFinancialHash } from "@jobguard/core";
import { ShadowPilotFinancialReader } from "../src/shadow-pilot-financial-reader.js";
import { SimulationFeeStatementRepository } from "../src/simulation-fee-statement-repository.js";
import { SimulationFeeCollectionRepository } from "../src/simulation-fee-collection-repository.js";
import { createFinalCheckFixture, closeFinalCheckFixture, seedFinalCheckJob, type FinalCheckFixture } from "./final-check-fixture.js";
import { catchFeeFixture } from "./success-fee-catch-fixture.js";
import { testTenantContext } from "./tenant-context-test-utils.js";

let f: FinalCheckFixture, research: Pool, reader: ShadowPilotFinancialReader;
beforeAll(async () => {
  f = await createFinalCheckFixture();
  // SET ROLE drops the superuser's bypass: FORCE RLS and tenant policies really apply.
  research = new Pool({ ...f.admin.options, options: "-c role=jobguard_migration" });
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
});
