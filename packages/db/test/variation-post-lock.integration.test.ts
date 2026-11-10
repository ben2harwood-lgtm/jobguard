import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { approveVariation, priceVariation, type VariationRevision } from "@jobguard/core";
import { approvePricedVariation, insertPricedVariation, VariationRepository } from "../src/variation-repository.js";
import { withTenant } from "../src/tenant-context.js";
import {
 addFixtureCapture, asFixtureTenant, closeLockFixture, createLockFixture,
 LOCK_HASH, LOCK_OWNER, prepareLock, seedAccount, type LockFixture,
} from "./final-account-lock.integration.test.js";
import {
 availableFinalCheck, closeFinalCheckFixture, createFinalCheckFixture,
 FINAL_CHECK_ACTOR, seedFinalCheckJob,
} from "./final-check-fixture.js";
import { FinalCheckRepository } from "../src/final-check-repository.js";

const lockedCode = "VARIATION_LOCKED_BY_FINAL_ACCOUNT";
function approval(revision: VariationRevision, actor = LOCK_OWNER) {
 return approveVariation(revision, {
  id: randomUUID(), revisionId: revision.id, revision: revision.revision,
  contentHash: revision.contentHash, signedDeltaPence: revision.signedDeltaPence,
  method: "builder_attestation", actorMembershipId: actor, evidenceId: null, approvedAt: new Date(),
 });
}
function price(proposal: Parameters<typeof priceVariation>[0]["proposal"], previous: VariationRevision | null, actor = LOCK_OWNER, pence = 20000) {
 return priceVariation({
  id: randomUUID(), variationId: proposal.id, previous, proposal, description: proposal.description,
  contentHash: LOCK_HASH,
  confirmed: { quantity: "1", unit: "item", unitRatePence: pence, direction: "addition",
   confirmedByMembershipId: actor, rateProvenance: { kind: "human_entered",
    sourceRef: "synthetic://post-lock", sourceHash: LOCK_HASH, rateVersion: "synthetic.v1" } },
 });
}

describe("ordinary variation prices and approvals stop at the immutable final-account lock", () => {
 let f: LockFixture;
 beforeAll(async () => { f = await createLockFixture(); }, 60000);
 afterAll(async () => { if (f) await closeLockFixture(f); });

 it("revises and approves before lock, then refuses both inserts without changing stored facts", async () => {
  const a = await seedAccount(f.admin), repo = new VariationRepository(f.runtime);
  const variationId = await addFixtureCapture(f, a, null);
  const proposal = { version: "variation-proposal.v1" as const, id: variationId, jobId: a.jobId,
   scopeItemId: (await f.admin.query("SELECT scope_item_id FROM app.variation WHERE tenant_id=$1 AND id=$2", [a.tenantId, variationId])).rows[0].scope_item_id as string,
   existingScopeItemId: null, lineageParentScopeItemId: null, captureKind: "text" as const,
   captureText: "Fictional captured extra", description: "Fictional captured extra", suggestion: null };
  const first = price(proposal, null), revised = price(proposal, first);
  await repo.transact(a.context, db => insertPricedVariation(db, a.tenantId, first));
  const approved = approval(first);
  await repo.transact(a.context, db => approvePricedVariation(db, a.tenantId, variationId, approved));
  await repo.transact(a.context, db => insertPricedVariation(db, a.tenantId, revised));
  await repo.transact(a.context, db => approvePricedVariation(db, a.tenantId, variationId, approval(revised)));
  const pendingId = await addFixtureCapture(f, a, null);
  const pendingScope = (await f.admin.query("SELECT scope_item_id FROM app.variation WHERE tenant_id=$1 AND id=$2", [a.tenantId, pendingId])).rows[0].scope_item_id as string;
  const pending = price({ ...proposal, id: pendingId, scopeItemId: pendingScope }, null);
  await repo.transact(a.context, db => insertPricedVariation(db, a.tenantId, pending));
  const locks = await prepareLock(f, a);
  // As in MIGFIX-5, assemble the baseline plus the latest approved extra before locking.
  const accountRevisionId = randomUUID();
  await asFixtureTenant(f.admin, a.tenantId, async db => {
   await db.query(`INSERT INTO app.final_account_revision(id,tenant_id,job_id,final_account_draft_id,revision,previous_revision_id,source_hash,baseline_quote_version_id,currency,tax_policy_version,net_pence,tax_pence,total_pence,issue_blocked,findings)
    SELECT $1,tenant_id,job_id,final_account_draft_id,2,id,$2,baseline_quote_version_id,currency,tax_policy_version,3380000,676000,4056000,false,findings
    FROM app.final_account_revision WHERE tenant_id=$3 AND id=$4`, [accountRevisionId, "b".repeat(64), a.tenantId, a.revisionId]);
   await db.query(`INSERT INTO app.final_account_line(id,tenant_id,job_id,final_account_revision_id,line_kind,source_id,scope_item_id,commercial_revision_id,approval_id,description,net_pence,ordinal)
    SELECT gen_random_uuid(),tenant_id,job_id,$1,line_kind,source_id,scope_item_id,commercial_revision_id,approval_id,description,net_pence,ordinal
    FROM app.final_account_line WHERE tenant_id=$2 AND final_account_revision_id=$3`, [accountRevisionId, a.tenantId, a.revisionId]);
   await db.query(`INSERT INTO app.final_account_line(id,tenant_id,job_id,final_account_revision_id,line_kind,source_id,scope_item_id,commercial_revision_id,approval_id,description,net_pence,ordinal)
    SELECT gen_random_uuid(),r.tenant_id,r.job_id,$1,'variation',r.id,$2,r.id,x.id,r.description,r.signed_delta_pence,2
    FROM app.variation_revision r JOIN app.variation_approval x ON (x.tenant_id,x.revision_id)=(r.tenant_id,r.id)
    WHERE r.tenant_id=$3 AND r.id=$4`, [accountRevisionId, proposal.scopeItemId, a.tenantId, revised.id]);
   await db.query("UPDATE app.final_account_draft SET current_revision_id=$1,revision=2 WHERE tenant_id=$2 AND id=$3", [accountRevisionId, a.tenantId, a.draftId]);
  });
  await locks.lock(a.context, { ...a.input, finalAccountRevisionId: accountRevisionId, expectedRevision: 2 });
  expect((await f.admin.query("SELECT status FROM app.job WHERE tenant_id=$1 AND id=$2", [a.tenantId, a.jobId])).rows[0].status).toBe("live");
  const facts = async () => (await f.admin.query(`SELECT
   (SELECT count(*)::int FROM app.variation_revision WHERE tenant_id=$1 AND variation_id=$2) revisions,
   (SELECT count(*)::int FROM app.variation_approval WHERE tenant_id=$1 AND variation_id=$2) approvals,
   (SELECT count(*)::int FROM app.variation_rate_observation WHERE tenant_id=$1 AND variation_id=$2) observations,
   (SELECT count(*)::int FROM app.audit_event WHERE tenant_id=$1) audits,
   current_revision_id,state FROM app.variation WHERE tenant_id=$1 AND id=$2`, [a.tenantId, variationId])).rows;
  const before = await facts(), postLock = price(proposal, revised, LOCK_OWNER, 50000);
  await expect(repo.transact(a.context, db => insertPricedVariation(db, a.tenantId, postLock)))
   .rejects.toMatchObject({ name: "VariationRevisionConflict", code: lockedCode });
  expect(await facts()).toEqual(before);
  // A fresh approval id is refused even for an unchanged revision created before lock.
  await expect(repo.transact(a.context, db => approvePricedVariation(db, a.tenantId, variationId, approval(revised))))
   .rejects.toMatchObject({ name: "VariationRevisionConflict", code: lockedCode });
  expect(await facts()).toEqual(before);
  // An unlocked-era revision with no approval cannot gain its first approval either.
  await expect(repo.transact(a.context, db => approvePricedVariation(db, a.tenantId, pendingId, approval(pending))))
   .rejects.toMatchObject({ name: "VariationRevisionConflict", code: lockedCode });
  expect((await f.admin.query("SELECT count(*)::int n FROM app.variation_approval WHERE tenant_id=$1 AND revision_id=$2", [a.tenantId, pending.id])).rows[0].n).toBe(0);
  // Raw SQL callers cannot bypass either trigger or hide behind ON CONFLICT.
  await expect(asFixtureTenant(f.admin, a.tenantId, db => db.query(`INSERT INTO app.variation_revision
   SELECT (jsonb_populate_record(NULL::app.variation_revision,to_jsonb(r)||jsonb_build_object('id',$3::text,'revision',3,'previous_revision_id',r.id))).*
   FROM app.variation_revision r WHERE r.tenant_id=$1 AND r.id=$2`, [a.tenantId, revised.id, randomUUID()])))
   .rejects.toMatchObject({ code: "42501", message: lockedCode });
  await expect(asFixtureTenant(f.admin, a.tenantId, db => db.query(`INSERT INTO app.variation_approval
   SELECT (jsonb_populate_record(NULL::app.variation_approval,to_jsonb(x)||jsonb_build_object('id',$3::text))).*
   FROM app.variation_approval x WHERE x.tenant_id=$1 AND x.revision_id=$2
   ON CONFLICT(tenant_id,revision_id) DO NOTHING`, [a.tenantId, revised.id, randomUUID()])))
   .rejects.toMatchObject({ code: "42501", message: lockedCode });
  expect(await facts()).toEqual(before);
  // An exact committed replay returns history, with no new insert or commercial effect.
  await expect(repo.transact(a.context, db => approvePricedVariation(db, a.tenantId, variationId, approved)))
   .resolves.toMatchObject({ id: approved.id });
  expect(await facts()).toEqual(before);
 });
});

it("a genuine Final Check catch can still receive its first price and approval after lock", async () => {
 const f = await createFinalCheckFixture();
 try {
  const a = await seedFinalCheckJob(f), revealed = await availableFinalCheck(f, a);
  const confirmed = await new FinalCheckRepository(f.runtime).confirmCatch(a.context, a.jobId, a.digest, {
   version: "final-check.catch.v1", commandId: randomUUID(), lockId: revealed.lockId,
   runId: revealed.runId, signalId: revealed.signalId, expectedSignalRevision: 1,
  }) as { variationId: string };
  const row = (await f.admin.query("SELECT scope_item_id,description,origin FROM app.variation WHERE tenant_id=$1 AND id=$2", [a.tenantId, confirmed.variationId])).rows[0];
  expect(row.origin).toBe("jobguard_catch");
  expect((await f.admin.query("SELECT count(*)::int n FROM app.final_account_lock WHERE tenant_id=$1 AND job_id=$2", [a.tenantId, a.jobId])).rows[0].n).toBe(1);
  const proposal = { version: "variation-proposal.v1" as const, id: confirmed.variationId, jobId: a.jobId,
   scopeItemId: row.scope_item_id as string, existingScopeItemId: null, lineageParentScopeItemId: null,
   captureKind: "text" as const, captureText: row.description as string, description: row.description as string, suggestion: null };
  const revision = price(proposal, null, FINAL_CHECK_ACTOR);
  await withTenant(f.runtime, a.context, db => insertPricedVariation(db, a.tenantId, revision));
  await withTenant(f.runtime, a.context, db => approvePricedVariation(db, a.tenantId, confirmed.variationId, approval(revision, FINAL_CHECK_ACTOR)));
  expect((await f.admin.query("SELECT signed_delta_pence FROM app.variation_approval WHERE tenant_id=$1 AND revision_id=$2", [a.tenantId, revision.id])).rows).toEqual([{ signed_delta_pence: "20000" }]);
 } finally { await closeFinalCheckFixture(f); }
}, 60000);
