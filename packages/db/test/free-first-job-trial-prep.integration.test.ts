// DEMO-S-TRIAL-PREP: CI PostgreSQL proof of fictional parents, not company web authority.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { evaluateDraftQuote } from "@jobguard/core";
import { FinalAccountCommandService } from "../src/final-account-repository.js";
import { createWorkFixture, closeWorkFixture, type WorkFixture } from "./free-first-job-admission-fixtures.js";
import { preparedTrialFixture } from "./free-first-job-lifecycle-fixtures.js";

const finalAccountTables = ["final_account_draft", "final_account_revision", "final_account_line", "final_account_proof"];
const heldResultTables = ["final_account_lock", "final_check_run_binding", "shadow_final_check_run_binding", "shadow_reconciliation_run",
 "recovery_attribution_revision", "recovery_attribution_command", "recovery_attribution_reassessment",
 "recovery_fee_journal", "success_fee_journal", "success_fee_derivation", "success_fee_review",
 "success_fee_source", "payment_fee_statement", "platform_statement"];
let f: WorkFixture;
const environment = process.env.JOBGUARD_ENV;
beforeAll(async () => {
 process.env.JOBGUARD_ENV = "synthetic_demo";
 f = await createWorkFixture();
}, 120000);
afterAll(async () => {
 await closeWorkFixture(f);
 if (environment === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV = environment;
});
async function expectEmpty(tenantId: string, tables: string[]) {
 for (const table of tables) {
  expect((await f.admin.query(`SELECT count(*)::int n FROM app.${table} WHERE tenant_id=$1`, [tenantId])).rows,
   table).toEqual([{ n: 0 }]);
 }
}

describe("DEMO-S prepared company trial sources", () => {
 it("prepares the exact accepted baseline and complete proof parents without seeding results, then assembles via the tenant repository", async () => {
  const a = await preparedTrialFixture(f);
  expect((await f.admin.query(`SELECT s.state,r.id revision_id,r.scope_item_id,r.total_pence::int total_pence
   FROM app.scope_identity s JOIN app.scope_revision r ON(r.tenant_id,r.job_id,r.scope_item_id)=(s.tenant_id,s.job_id,s.id)
   WHERE s.tenant_id=$1 AND s.job_id=$2`, [a.tenantId,a.jobId])).rows).toEqual([
   { state: "confirmed", revision_id: a.scopeRevisionId, scope_item_id: a.scopeId, total_pence: 100000 },
  ]);
  const lines = (await f.admin.query(`SELECT l.* FROM app.quote_draft d
   JOIN app.quote_revision r ON(r.tenant_id,r.job_id,r.quote_draft_id)=(d.tenant_id,d.job_id,d.id)
   JOIN app.quote_line l ON(l.tenant_id,l.job_id,l.quote_revision_id)=(r.tenant_id,r.job_id,r.id)
   WHERE d.tenant_id=$1 AND d.job_id=$2 AND d.id=$3 AND r.id=$4 ORDER BY l.ordinal`,
   [a.tenantId,a.jobId,a.draftId,a.revisionId])).rows;
  expect(lines).toHaveLength(1);
  expect(lines[0]).toMatchObject({ id: a.lineId, scope_item_id: a.scopeId,
   scope_revision_id: a.scopeRevisionId, included: true });
  const quote = evaluateDraftQuote({ currency: "GBP", taxPolicyVersion: "candidate_m1_standard_v1",
   lines: lines.map(l => ({ id: l.id, scopeItemId: l.scope_item_id, scopeRevisionId: l.scope_revision_id,
    description: l.description, origin: l.origin, included: l.included, exclusionReason: l.exclusion_reason,
    quantity: l.quantity_decimal, unit: l.unit, unitRatePence: Number(l.unit_rate_pence),
    discountPercent: l.discount_decimal, taxTreatment: l.tax_treatment, rateProvenance: l.rate_provenance,
    category: l.category, region: l.region })) });
  expect(quote.issuable).toBe(true);
  expect(quote.totals).toMatchObject({ net: { pence: 100000, currency: "GBP" },
   tax: { pence: 20000, currency: "GBP" }, total: { pence: 120000, currency: "GBP" } });
  expect((await f.admin.query(`SELECT j.status,j.practice_session_digest,j.baseline_quote_version_id,
   d.quote_revision_id,d.snapshot->>'netPence' snapshot_net,d.parties_snapshot IS NOT NULL parties,
   r.net_pence::int net_pence,r.total_pence::int total_pence,v.net_value_pence::int accepted_net,
   c.id acceptance_id,c.accepted_total_pence::int accepted_total,s.id send_id,
   x.id activation_id,t.id trial_id
   FROM app.job j JOIN app.quote_document_version d ON(d.tenant_id,d.job_id,d.id)=(j.tenant_id,j.id,j.baseline_quote_version_id)
   JOIN app.quote_revision r ON(r.tenant_id,r.job_id,r.id)=(d.tenant_id,d.job_id,d.quote_revision_id)
   JOIN app.quote_version v ON(v.tenant_id,v.job_id,v.id)=(d.tenant_id,d.job_id,d.id)
   JOIN app.quote_acceptance c ON(c.tenant_id,c.job_id,c.document_id,c.document_version,c.document_hash)=(d.tenant_id,d.job_id,d.id,d.document_version,d.content_hash)
   JOIN app.quote_send s ON(s.tenant_id,s.job_id,s.document_id,s.content_hash)=(d.tenant_id,d.job_id,d.id,d.content_hash)
   JOIN app.job_activation x ON(x.tenant_id,x.job_id,x.accepted_document_id,x.accepted_document_version,x.accepted_document_hash)=(d.tenant_id,d.job_id,d.id,d.document_version,d.content_hash)
   JOIN app.trial_start t ON(t.tenant_id,t.job_id,t.activation_id)=(x.tenant_id,x.job_id,x.id)
   WHERE j.tenant_id=$1 AND j.id=$2 AND j.accepted_quote_version_id=d.id AND d.content_hash=$3`,
   [a.tenantId,a.jobId,a.contentHash])).rows).toEqual([{
   status: "live", practice_session_digest: null, baseline_quote_version_id: a.documentId,
   quote_revision_id: a.revisionId, snapshot_net: "100000", parties: true,
   net_pence: 100000, total_pence: 120000, accepted_net: 100000,
   acceptance_id: a.acceptanceId, accepted_total: 120000, send_id: a.sendId,
   activation_id: a.activation.activationId, trial_id: a.activation.snapshotId,
  }]);
  expect(a.proofs).toHaveLength(1);
  for (const proof of a.proofs) {
   expect((await f.admin.query(`SELECT u.state,u.object_version_id upload_version,
    u.expected_sha256=e.sha256 hash_matches,u.server_verified_at IS NOT NULL upload_verified,
    e.id evidence_id,e.kind,e.evidence_type,e.object_key,e.object_version_id,e.sha256,e.byte_length::int byte_length,
    e.server_verified_at IS NOT NULL object_verified,l.required_evidence_type,s.stage,s.id completion_id
    FROM app.scope_identity scope JOIN app.evidence_upload u ON(u.tenant_id,u.job_id,u.scope_item_id)=(scope.tenant_id,scope.job_id,scope.id)
    JOIN app.evidence_object e ON(e.tenant_id,e.job_id,e.scope_item_id,e.upload_id)=(u.tenant_id,u.job_id,u.scope_item_id,u.id)
    JOIN app.evidence_link l ON(l.tenant_id,l.job_id,l.scope_item_id,l.evidence_id)=(e.tenant_id,e.job_id,e.scope_item_id,e.id)
    JOIN app.stage_completion s ON(s.tenant_id,s.job_id,s.scope_item_id,s.evidence_link_id)=(l.tenant_id,l.job_id,l.scope_item_id,l.id)
    WHERE scope.tenant_id=$1 AND scope.job_id=$2 AND scope.id=$3 AND scope.state='confirmed'`,
    [a.tenantId,a.jobId,proof.scopeId])).rows).toEqual([{
    state: "verified", upload_version: proof.objectVersionId, hash_matches: true, upload_verified: true,
    evidence_id: proof.evidenceId, kind: "original", evidence_type: "electrical_certificate",
    object_key: proof.objectKey, object_version_id: proof.objectVersionId, sha256: proof.sha256,
    byte_length: proof.byteLength, object_verified: true, required_evidence_type: "electrical_certificate",
    stage: "electrical-stage", completion_id: proof.completionId,
   }]);
   expect(await a.storage.readExactVersion(proof.objectKey, proof.objectVersionId)).toMatchObject({ byteLength: proof.byteLength });
  }
  await expectEmpty(a.tenantId, ["evidence_invalidation", ...finalAccountTables, ...heldResultTables]);
  // This is an existing tenant-scoped repository call, not a practice or company HTTP action.
  const service = new FinalAccountCommandService(f.runtime);
  const assembled = await service.assemble(a.context, { version: "final-account.assemble.v1", commandId: randomUUID(),
   actorMembershipId: a.actorId, jobId: a.jobId, expectedRevision: 0 });
  expect(assembled).toMatchObject({ revision: 1, issueBlocked: false,
   totals: { net: { pence: 100000 }, tax: { pence: 20000 }, total: { pence: 120000 } },
   lines: [{ kind: "baseline", sourceId: a.lineId, scopeItemId: a.scopeId, netPence: 100000 }] });
  expect(await service.read(a.context, a.jobId)).toMatchObject({ id: assembled.id, totals: assembled.totals,
   proof: a.proofs.map(p => ({ evidenceId: p.evidenceId, objectVersionId: p.objectVersionId,
    scopeItemId: p.scopeId, evidenceType: "electrical_certificate", sha256: p.sha256, mandatory: true })) });
  await expectEmpty(a.tenantId, heldResultTables);
 });
});
