import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { FinalAccountLockRepository } from "../src/final-account-lock-repository.js";
import { practiceMaterialPool } from "../src/practice-session.js";
import { publishFixtureCompletion } from "./sv5pre-fixtures.js";
import {
  createFinalCheckFixture, closeFinalCheckFixture, seedFinalCheckJob,
  insertFinalCheckEvidence, finalCheckTenant, FINAL_CHECK_ACTOR,
  type FinalCheckFixture, type FinalCheckJob,
} from "./final-check-fixture.js";

let f: FinalCheckFixture;
beforeAll(async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  // The shared fixture migrates an empty real embedded PostgreSQL database.
  f = await createFinalCheckFixture();
}, 60_000);
afterAll(async () => { await closeFinalCheckFixture(f); vi.unstubAllEnvs(); });

function invalidate(db: PoolClient, a: FinalCheckJob, evidenceId: string) {
  return db.query(`INSERT INTO app.evidence_invalidation
    (id,tenant_id,evidence_id,actor_membership_id,reason_code)
    VALUES($1,$2,$3,$4,'verification_invalid')`,
  [randomUUID(), a.tenantId, evidenceId, FINAL_CHECK_ACTOR]);
}
async function expectLocked(a: FinalCheckJob, evidenceId: string) {
  await expect(finalCheckTenant(f.runtime, a.tenantId, db => invalidate(db, a, evidenceId)))
    .rejects.toMatchObject({ code: "55000", message: "FINAL_CHECK_VERIFIED_SOURCE_LOCKED" });
  expect((await f.admin.query(`SELECT id FROM app.evidence_invalidation
    WHERE tenant_id=$1 AND evidence_id=$2`, [a.tenantId, evidenceId])).rows).toEqual([]);
}
async function completedJob() {
  const a = await seedFinalCheckJob(f), evidenceId = await insertFinalCheckEvidence(f, a);
  await a.lock();
  const checkId = await publishFixtureCompletion(f.shadow, f.admin, a.tenantId, a.jobId);
  expect((await f.admin.query(`SELECT status FROM app.final_account_lock_check
    WHERE tenant_id=$1 AND job_id=$2 AND id=$3`, [a.tenantId, a.jobId, checkId])).rows)
    .toEqual([{ status: "completed" }]);
  return { a, evidenceId };
}

it("refuses locked manifest evidence after completion without stranding final invoice issue", async () => {
  const { a, evidenceId } = await completedJob();
  await expectLocked(a, evidenceId);
  const invoices = new FinalAccountLockRepository(practiceMaterialPool(f.runtime, a.digest));
  const issued = await invoices.issueInvoice(a.context, {
    jobId: a.jobId, actorMembershipId: FINAL_CHECK_ACTOR, commandId: randomUUID(),
    finalAccountRevisionId: a.revisionId, expectedSourceHash: "a".repeat(64),
    invoiceKind: "final", recipient: "fictional@example.invalid", issuedOn: "2026-11-06",
  });
  expect(issued).toMatchObject({ invoiceKind: "final", netPence: 100000, totalPence: 120000 });
  expect((await f.admin.query(`SELECT id FROM app.customer_invoice
    WHERE tenant_id=$1 AND job_id=$2 AND id=$3`, [a.tenantId, a.jobId, issued.invoiceId])).rowCount).toBe(1);
});

it("keeps invalidation of the same kind of evidence before lock unchanged", async () => {
  const a = await seedFinalCheckJob(f), evidenceId = await insertFinalCheckEvidence(f, a);
  expect((await finalCheckTenant(f.runtime, a.tenantId, db => invalidate(db, a, evidenceId))).rowCount).toBe(1);
});

it("refuses manifest evidence as soon as the locked manifest exists, before completion", async () => {
  const a = await seedFinalCheckJob(f), evidenceId = await insertFinalCheckEvidence(f, a);
  await a.lock();
  const { FinalCheckRepository } = await import("../src/final-check-repository.js");
  await new FinalCheckRepository(f.shadow).begin(a.context, a.jobId);
  await expectLocked(a, evidenceId);
});

it("allows same-job evidence outside the locked manifest and another job's evidence", async () => {
  const { a, evidenceId } = await completedJob(), previewId = randomUUID();
  await finalCheckTenant(f.admin, a.tenantId, db => db.query(`INSERT INTO app.evidence_object
    (id,tenant_id,job_id,scope_item_id,kind,original_evidence_id,evidence_type,
     object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at)
    SELECT $1::uuid,tenant_id,job_id,scope_item_id,'preview',id,evidence_type,
     $2,$1::uuid::text,sha256,byte_length,content_type,retention_class,clock_timestamp(),clock_timestamp()
    FROM app.evidence_object WHERE tenant_id=$3 AND id=$4`,
  [previewId, `synthetic/preview/${previewId}`, a.tenantId, evidenceId]));
  expect((await f.admin.query(`SELECT id FROM app.final_check_manifest_source
    WHERE tenant_id=$1 AND job_id=$2 AND evidence_id=$3`, [a.tenantId, a.jobId, previewId])).rows).toEqual([]);
  expect((await finalCheckTenant(f.runtime, a.tenantId, db => invalidate(db, a, previewId))).rowCount).toBe(1);
  const other = await seedFinalCheckJob(f), otherEvidence = await insertFinalCheckEvidence(f, other);
  expect((await finalCheckTenant(f.runtime, other.tenantId, db => invalidate(db, other, otherEvidence))).rowCount).toBe(1);
  await expectLocked(a, evidenceId);
});

it("fresh migration installs 0666 and the refusal depends on its trigger (rolled-back scratch mutation)", async () => {
  expect((await f.admin.query(`SELECT migration_name FROM public.jobguard_schema_migration
    WHERE migration_name='0666_final_check_invalidation_after_lock.sql'`)).rowCount).toBe(1);
  const { a, evidenceId } = await completedJob();
  const db = await f.admin.connect();
  try {
    await db.query("BEGIN");
    await db.query("SELECT set_config('app.tenant_id',$1,true)", [a.tenantId]);
    // Transaction-local scratch catalogue: neither the DROP nor its inserted row commits.
    await db.query("DROP TRIGGER b_final_check_locked_invalidation ON app.evidence_invalidation");
    await expect(expect(invalidate(db, a, evidenceId)).rejects.toMatchObject({
      code: "55000", message: "FINAL_CHECK_VERIFIED_SOURCE_LOCKED",
    })).rejects.toThrow();
    expect((await db.query(`SELECT id FROM app.evidence_invalidation
      WHERE tenant_id=$1 AND evidence_id=$2`, [a.tenantId, evidenceId])).rowCount).toBe(1);
  } finally {
    await db.query("ROLLBACK");
    db.release();
  }
  await expectLocked(a, evidenceId);
});
