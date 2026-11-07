// CI only: PostgreSQL, fictional jobs and settled synthetic feed movements.
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, expect, it } from "vitest";
import { FinalAccountLockRepository } from "../src/final-account-lock-repository.js";
import { FinalCheckCompletionRepository } from "../src/shadow-detection-repository.js";
import {
  availableFinalCheck, closeFinalCheckFixture, createFinalCheckFixture,
  FINAL_CHECK_ACTOR, finalCheckTenant, seedFinalCheckJob, type FinalCheckFixture,
} from "./final-check-fixture.js";
import { realReceiptFixture } from "./stored-receipt-case-fixture.js";

let f: FinalCheckFixture;
const environment = process.env.JOBGUARD_ENV;
beforeAll(async () => { f = await createFinalCheckFixture(); }, 120000);
afterAll(async () => {
  await closeFinalCheckFixture(f);
  if (environment === undefined) delete process.env.JOBGUARD_ENV;
  else process.env.JOBGUARD_ENV = environment;
});

async function withdraw(tenantId: string, evidenceId: string, actor: string) {
  // Owner fixture inserts the same append-only C135 withdrawal fact; no trigger
  // is disabled and no certificate, lock, invoice or proof row is rewritten.
  await finalCheckTenant(f.admin, tenantId, db => db.query(
    `INSERT INTO app.evidence_invalidation(id,tenant_id,evidence_id,actor_membership_id,reason_code)
     VALUES($1,$2,$3,$4,'object_revoked')`, [randomUUID(), tenantId, evidenceId, actor],
  ));
}
const receiptGate = (tenantId: string, jobId: string, callerTenant = tenantId) =>
  finalCheckTenant(f.admin, callerTenant, db => db.query(
    "SELECT app.require_receipt_final_check($1,$2)", [tenantId, jobId],
  ));

it("an issued final invoice permits exactly one later receipt allocation after withdrawal; supplementary billing stays blocked", async () => {
  let withdrawnProof = "";
  // Retain the invoice's valid line proof: withdrawing another manifest-bound
  // proof must not weaken the separate receipt-line evidence requirements.
  const x = await realReceiptFixture(f, "F7", 3360000, false, false, async ({ context, jobId }) => {
    const upload = randomUUID(); withdrawnProof = randomUUID();
    await finalCheckTenant(f.admin, context.tenantId, async db => {
      await db.query(`INSERT INTO app.evidence_upload(id,tenant_id,job_id,scope_item_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,expires_at,state,object_version_id,server_verified_at)
        SELECT $1,tenant_id,job_id,scope_item_id,$2,expected_sha256,expected_content_type,maximum_bytes,retention_class,expires_at,state,object_version_id,server_verified_at
        FROM app.evidence_upload WHERE tenant_id=$3 AND job_id=$4 LIMIT 1`, [upload, `synthetic/receipt-gate/${upload}`, context.tenantId, jobId]);
      await db.query(`INSERT INTO app.evidence_object(id,tenant_id,upload_id,job_id,scope_item_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at)
        SELECT $1,tenant_id,$2,job_id,scope_item_id,kind,'completion_photo',$3,object_version_id,sha256,byte_length,content_type,retention_class,clock_timestamp(),server_verified_at
        FROM app.evidence_object WHERE tenant_id=$4 AND job_id=$5 LIMIT 1`, [withdrawnProof, upload, `synthetic/receipt-gate/${upload}`, context.tenantId, jobId]);
    });
  }, { partial: true });
  expect((await f.admin.query(`SELECT count(*)::int n FROM app.final_check_manifest_source
    WHERE tenant_id=$1 AND job_id=$2 AND evidence_id=$3`, [x.context.tenantId, x.jobId, withdrawnProof])).rows).toEqual([{ n: 1 }]);
  await receiptGate(x.context.tenantId, x.jobId);
  await withdraw(x.context.tenantId, withdrawnProof, x.actor.membershipId);
  await expect(finalCheckTenant(f.admin, x.context.tenantId, db => db.query(
    "SELECT app.require_authoritative_final_check($1,$2)", [x.context.tenantId, x.jobId],
  ))).rejects.toThrow("FINAL_CHECK_NOT_COMPLETE");

  const before = (await f.admin.query("SELECT count(*)::int n FROM app.customer_payment WHERE tenant_id=$1 AND job_id=$2", [x.context.tenantId, x.jobId])).rows[0].n;
  const paymentId = await x.receipt(48000, "receipt-480-b");

  // Scratch mutation: restore the former call in this transaction only and
  // prove that the same newly settled receipt fails. ROLLBACK restores 0692.
  const migration = await readFile(new URL("../migrations/0692_final_check_post_invoice_receipt_gate.sql", import.meta.url), "utf8");
  const start = migration.indexOf("CREATE OR REPLACE FUNCTION app.receipt_fact_proposal(");
  const end = migration.indexOf("END $$;", start) + "END $$;".length;
  expect(start).toBeGreaterThan(0);
  const scratch = migration.slice(start, end).replace("PERFORM app.require_receipt_final_check(t,j);", "PERFORM app.require_authoritative_final_check(t,j);");
  const db = await f.admin.connect();
  try {
    await db.query("BEGIN");
    await db.query("SELECT set_config('app.tenant_id',$1,true)", [x.context.tenantId]);
    await db.query(scratch);
    await expect(db.query("SELECT app.receipt_fact_proposal($1,$2,$3::jsonb)", [x.context.tenantId, x.jobId, { action: "review", paymentId }])).rejects.toThrow("FINAL_CHECK_NOT_COMPLETE");
  } finally { await db.query("ROLLBACK"); db.release(); }

  const saved = await x.produce(paymentId);
  expect(await x.producer.command(x.context, x.actor, x.auth.digest, x.jobId, {
    version: "receipt-line-facts-command.v1", action: "approve", commandId: saved.commandId,
    expectedSourceRevision: saved.sourceRevision, reviewId: saved.reviewId, approvalHash: saved.approvalHash,
  })).toEqual({ ...saved, replayed: true });
  expect((await f.admin.query("SELECT count(*)::int n FROM app.customer_payment WHERE tenant_id=$1 AND job_id=$2", [x.context.tenantId, x.jobId])).rows).toEqual([{ n: before + 1 }]);
  expect((await f.admin.query("SELECT count(*)::int n FROM app.receipt_allocation_fact_revision WHERE tenant_id=$1 AND job_id=$2 AND payment_id=$3 AND direction='receipt'", [x.context.tenantId, x.jobId, paymentId])).rows).toEqual([{ n: 1 }]);
  const revision = (await f.admin.query("SELECT id,source_hash FROM app.final_account_revision WHERE tenant_id=$1 AND job_id=$2 ORDER BY revision DESC LIMIT 1", [x.context.tenantId, x.jobId])).rows[0];
  await expect(new FinalAccountLockRepository(x.scoped).issueInvoice(x.context, {
    jobId: x.jobId, actorMembershipId: x.actor.membershipId, commandId: randomUUID(),
    finalAccountRevisionId: revision.id, expectedSourceHash: revision.source_hash,
    invoiceKind: "supplementary", recipient: "fictional@example.invalid", issuedOn: "2026-10-28",
  })).rejects.toMatchObject({ code: "FINAL_CHECK_NOT_COMPLETE" });
  await expect(receiptGate(x.context.tenantId, x.jobId, randomUUID())).rejects.toMatchObject({ code: "42501" });
  await expect(finalCheckTenant(f.runtime, x.context.tenantId, db => db.query(
    "SELECT app.require_receipt_final_check($1,$2)", [x.context.tenantId, x.jobId],
  ))).rejects.toMatchObject({ code: "42501" });
});

it("without an issued final invoice the receipt gate still rejects withdrawn manifest proof", async () => {
  const a = await seedFinalCheckJob(f), checked = await availableFinalCheck(f, a);
  await new FinalCheckCompletionRepository(f.shadow).publish(a.context, {
    version: "final-check-publication.v1", jobId: a.jobId, runId: checked.runId, checkId: randomUUID(),
  });
  await receiptGate(a.tenantId, a.jobId);
  await withdraw(a.tenantId, checked.manifest.sources[0]!.evidenceId!, FINAL_CHECK_ACTOR);
  expect((await f.admin.query("SELECT count(*)::int n FROM app.customer_invoice WHERE tenant_id=$1 AND job_id=$2", [a.tenantId, a.jobId])).rows).toEqual([{ n: 0 }]);
  await expect(receiptGate(a.tenantId, a.jobId)).rejects.toThrow("FINAL_CHECK_NOT_COMPLETE");
});

it("without a lock the receipt gate still requires FINAL_ACCOUNT_LOCK_REQUIRED", async () => {
  const a = await seedFinalCheckJob(f);
  await expect(receiptGate(a.tenantId, a.jobId)).rejects.toThrow("FINAL_ACCOUNT_LOCK_REQUIRED");
});
