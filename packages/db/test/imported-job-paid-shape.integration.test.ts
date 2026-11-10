import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { JobImportV3Repository } from "../src/job-import-v3-repository.js";
import { createWorkFixture, closeWorkFixture, seedWorkJob, workTenant, type WorkFixture } from "./job-work-state-fixtures.js";
import { historicalAgreement, meterCompany } from "./subscription-persistence-fixtures.js";

const oldMigration = readFileSync(new URL("../migrations/0534_import_work_admission.sql", import.meta.url), "utf8");
const oldConstraint = oldMigration.slice(oldMigration.indexOf("ALTER TABLE app.job DROP CONSTRAINT job_baseline_shape;"),
  oldMigration.indexOf("\n);", oldMigration.indexOf("ALTER TABLE app.job DROP CONSTRAINT job_baseline_shape;")) + 3);
const migration = readFileSync(new URL("../migrations/0669_imported_job_paid_shape.sql", import.meta.url), "utf8");

describe("LATER-SAFETY-119 source-only migration scope", () => {
  it("copies the latest validated constraint, adding only paid to imported v3 statuses", () => {
    expect(migration).toBe(`BEGIN;\n${oldConstraint.replace("status IN('draft','live','invoiced')", "status IN('draft','live','invoiced','paid')")}\nCOMMIT;\n`);
  });
});

describe("LATER-SAFETY-119 imported job paid shape — PostgreSQL", () => {
  let f: WorkFixture;
  const originalMode = process.env.JOBGUARD_ENV;
  beforeAll(async () => {
    process.env.JOBGUARD_ENV = "synthetic_demo";
    f = await createWorkFixture();
  }, 60_000);
  afterAll(async () => {
    await closeWorkFixture(f);
    if (originalMode === undefined) delete process.env.JOBGUARD_ENV;
    else process.env.JOBGUARD_ENV = originalMode;
  });

  it("imports live, invoices, reproduces old 23514 in a rolled-back scratch definition, then settles", async () => {
    const a = await meterCompany(f);
    await historicalAgreement(f, a);
    const repo = new JobImportV3Repository(f.runtime);
    const binding = (await f.admin.query("SELECT binding_id FROM app.job_party_current WHERE tenant_id=$1 AND job_id=$2",
      [a.tenantId, a.jobId])).rows[0].binding_id as string;
    const preview = await repo.preview(a.context, a.digest, a.jobId, {
      version: "job-import-preview.v3", expectedBindingId: binding,
      fixtureId: "fictional-extension-v3", lifecyclePoint: "live",
    });
    const imported = await repo.adopt(a.context, a.digest, a.jobId, {
      version: "job-parties-import.v3", commandId: randomUUID(), expectedBindingId: binding,
      fixtureId: "fictional-extension-v3", lifecyclePoint: "live", previewHash: preview.previewHash, attest: true,
    });
    const jobId = String(imported.jobId);
    await workTenant(f.admin, a.tenantId, async db => {
      const job = (await db.query("SELECT * FROM app.job WHERE tenant_id=$1 AND id=$2", [a.tenantId, jobId])).rows[0];
      expect(job).toMatchObject({ status: "live", provenance: "imported", fee_policy_version: "reference_fee_policy_v3",
        recovery_cap_pence: null, baseline_quote_version_id: null, accepted_net_value_pence: "300000" });
      const invoiced = (await db.query("SELECT * FROM app.transition_job($1,$2,$3,'invoiced','issue_invoice')",
        [a.tenantId, jobId, job.revision])).rows[0];
      expect(invoiced.status).toBe("invoiced");
      const definition = async () => (await db.query("SELECT pg_get_constraintdef(oid) body,convalidated FROM pg_constraint WHERE conrelid='app.job'::regclass AND conname='job_baseline_shape'")).rows;
      const fixed = await definition();
      expect(fixed[0].convalidated).toBe(true);
      // Isolated fixture database only: rollback restores both DDL and the failed update.
      // No historical migration file is edited, and no scratch constraint is committed.
      // Fire the invoice transition's deferred checks first; ALTER TABLE refuses pending trigger events.
      await db.query("SET CONSTRAINTS ALL IMMEDIATE");
      await db.query("SAVEPOINT scratch_definition");
      try {
        await db.query(oldConstraint);
        await expect(db.query("SELECT * FROM app.transition_job($1,$2,$3,'paid','balance_settled')",
          [a.tenantId, jobId, invoiced.revision])).rejects.toMatchObject({ code: "23514", constraint: "job_baseline_shape" });
      } finally {
        await db.query("ROLLBACK TO SAVEPOINT scratch_definition");
        await db.query("RELEASE SAVEPOINT scratch_definition");
      }
      expect(await definition()).toEqual(fixed);
      const paid = (await db.query("SELECT * FROM app.transition_job($1,$2,$3,'paid','balance_settled')",
        [a.tenantId, jobId, invoiced.revision])).rows[0];
      expect(paid).toMatchObject({ status: "paid", revision: invoiced.revision + 1, recovery_cap_pence: null });
    });
    // Owner-level UPDATE isolates the CHECK from the transition routine's own edge rejection.
    await expect(workTenant(f.admin, a.tenantId, db => db.query("UPDATE app.job SET status='quoting' WHERE tenant_id=$1 AND id=$2",
      [a.tenantId, jobId]))).rejects.toMatchObject({ code: "23514", constraint: "job_baseline_shape" });
    expect((await f.admin.query("SELECT status FROM app.job WHERE tenant_id=$1 AND id=$2", [a.tenantId, jobId])).rows).toEqual([{ status: "paid" }]);
  });

  it("keeps a non-imported job's empty baseline valid and partial baseline refused", async () => {
    const a = await seedWorkJob(f);
    await workTenant(f.admin, a.tenantId, async db => {
      const rows = (await db.query("UPDATE app.job SET title='Fictional unchanged baseline' WHERE tenant_id=$1 AND id=$2 RETURNING provenance,baseline_quote_version_id,accepted_net_value_pence,fee_policy_version,recovery_cap_pence",
        [a.tenantId, a.jobId])).rows;
      expect(rows).toEqual([{ provenance: "system_generated_quote", baseline_quote_version_id: null,
        accepted_net_value_pence: null, fee_policy_version: null, recovery_cap_pence: null }]);
    });
    await expect(workTenant(f.admin, a.tenantId, db => db.query("UPDATE app.job SET accepted_net_value_pence=300000 WHERE tenant_id=$1 AND id=$2",
      [a.tenantId, a.jobId]))).rejects.toMatchObject({ code: "23514", constraint: "job_baseline_shape" });
    expect((await f.admin.query("SELECT accepted_net_value_pence FROM app.job WHERE tenant_id=$1 AND id=$2",
      [a.tenantId, a.jobId])).rows).toEqual([{ accepted_net_value_pence: null }]);
  });
});
