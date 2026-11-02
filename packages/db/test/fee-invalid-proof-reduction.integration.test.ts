// CI ONLY: real PostgreSQL, fictional proof, normal allocation and financial writers.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createFinalCheckFixture, closeFinalCheckFixture, finalCheckTenant, type FinalCheckFixture } from "./final-check-fixture.js";
import { recoveryFeeFixture } from "./success-fee-recovery-fixture.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { SimulationFeeStatementRepository } from "../src/simulation-fee-statement-repository.js";
import { SimulationFeeCollectionRepository } from "../src/simulation-fee-collection-repository.js";
let f: FinalCheckFixture;
beforeAll(async () => { f = await createFinalCheckFixture(); }, 120000);
afterAll(async () => { if (f) await closeFinalCheckFixture(f); });
type Fixture = Awaited<ReturnType<typeof recoveryFeeFixture>>;
const invalidate = (x: Fixture) => finalCheckTenant(f.admin, x.context.tenantId, db => db.query(
 "INSERT INTO app.evidence_invalidation(id,tenant_id,evidence_id,actor_membership_id,reason_code) VALUES($1,$2,$3,$4,'verification_invalid')",
 [randomUUID(), x.context.tenantId, x.evidence, x.actor.membershipId]));
const issue = () => ({ version: "simulation-fee-statement-command.v1", action: "issue", commandId: randomUUID() });
const settle = (attemptId: string) => ({ version: "simulation-fee-demo-settle-command.v1", commandId: randomUUID(), attemptId });
const journals = async (x: Fixture) => (await f.admin.query(
 "SELECT amount_pence,reverses_journal_id FROM app.success_fee_journal WHERE tenant_id=$1 AND job_id=$2 ORDER BY amount_pence",
 [x.context.tenantId, x.jobId])).rows;
// A second fictional finalized source, independently invalidatable; no accounting rows seeded.
async function otherProof(x: Fixture) {
 const id = randomUUID(), upload = randomUUID();
 await finalCheckTenant(f.admin, x.context.tenantId, async db => {
  await db.query(`INSERT INTO app.evidence_upload(id,tenant_id,job_id,scope_item_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,expires_at,state,object_version_id,server_verified_at)
   SELECT $1,u.tenant_id,u.job_id,u.scope_item_id,'synthetic/'||$1::text,u.expected_sha256,u.expected_content_type,u.maximum_bytes,u.retention_class,u.expires_at,u.state,u.object_version_id,u.server_verified_at
   FROM app.evidence_upload u JOIN app.evidence_object e ON(e.tenant_id,e.upload_id)=(u.tenant_id,u.id) WHERE e.tenant_id=$2 AND e.id=$3`, [upload, x.context.tenantId, x.evidence]);
  await db.query(`INSERT INTO app.evidence_object(id,tenant_id,upload_id,job_id,scope_item_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at)
   SELECT $1,tenant_id,$2,job_id,scope_item_id,kind,evidence_type,'synthetic/'||$2::text,object_version_id,sha256,byte_length,content_type,retention_class,clock_timestamp(),server_verified_at
   FROM app.evidence_object WHERE tenant_id=$3 AND id=$4`, [id, upload, x.context.tenantId, x.evidence]);
 });
 return id;
}
it("finding 1: invalidation refuses pending collection settlement atomically, including repeated commands", async () => {
 const x = await recoveryFeeFixture(f), statements = new SimulationFeeStatementRepository(f.runtime), collection = new SimulationFeeCollectionRepository(f.runtime);
 await x.allocate(0); await x.approve(await x.review());
 const s = await statements.command(x.context, x.jobId, x.auth.digest, issue());
 const a = await collection.command(x.context, x.jobId, x.auth.digest, { version: "simulation-fee-collection-command.v1", action: "collect", commandId: randomUUID(), statementId: s.statementId, statementHash: s.documentHash, amountPence: 3200 });
 await invalidate(x);
 const command = settle(a.attemptId);
 for (let n = 0; n < 2; n++) await expect(collection.demoSettle(x.context, x.jobId, x.auth.digest, command)).rejects.toThrow("SUCCESS_FEE_SOURCE_CHANGED");
 await x.approve(await x.review(1)); // A newer compensation must not revive the old collection.
 await expect(collection.demoSettle(x.context, x.jobId, x.auth.digest, command)).rejects.toThrow("SUCCESS_FEE_SOURCE_CHANGED");
 expect((await f.admin.query("SELECT state FROM app.platform_fee_attempt_event WHERE tenant_id=$1 AND attempt_id=$2 ORDER BY revision", [x.context.tenantId, a.attemptId])).rows).toEqual([{ state: "pending" }]);
 expect((await f.admin.query("SELECT count(*)::int n FROM app.platform_fee_collection_command WHERE tenant_id=$1 AND command_id=$2", [x.context.tenantId, command.commandId])).rows).toEqual([{ n: 0 }]);
});
it("finding 2: a fully reversed invalid landing never permits positive growth on remaining valid proof", async () => {
 const x = await recoveryFeeFixture(f), valid = await otherProof(x);
 await x.allocate(0); await x.approve(await x.review()); await x.allocate(1, valid);
 await x.reverse(0); await invalidate(x);
 await expect(x.review(1)).rejects.toThrow("SUCCESS_FEE_SOURCE_CHANGED");
 expect(await journals(x)).toHaveLength(1);
});
it("finding 3: held money loses entitlement, retaining only valid proof; reductions replay once and refund", async () => {
 const x = await recoveryFeeFixture(f), valid = await otherProof(x);
 const statements = new SimulationFeeStatementRepository(f.runtime), collection = new SimulationFeeCollectionRepository(f.runtime);
 await x.allocate(0); await x.allocate(1, valid); const original = await x.approve(await x.review());
 const s = await statements.command(x.context, x.jobId, x.auth.digest, issue());
 const a = await collection.command(x.context, x.jobId, x.auth.digest, { version: "simulation-fee-collection-command.v1", action: "collect", commandId: randomUUID(), statementId: s.statementId, statementHash: s.documentHash, amountPence: 28200 });
 const settlement = settle(a.attemptId), settled = await collection.demoSettle(x.context, x.jobId, x.auth.digest, settlement);
 await invalidate(x);
 // Replaying an already completed command returns history, never adds settlement.
 expect(await collection.demoSettle(x.context, x.jobId, x.auth.digest, settlement)).toEqual({ ...settled, replayed: true });
 const command = { version: "success-fee-command.v1", action: "review", commandId: randomUUID(), expectedPostingRevision: 1 };
 const review = await x.fees.command(x.context, x.jobId, x.auth.digest, command);
 expect(review.statement).toMatchObject({ feePence: 25000, priorPence: 28200, deltaPence: -3200 });
 expect(await x.fees.command(x.context, x.jobId, x.auth.digest, command)).toEqual({ ...review, replayed: true });
 const approval = { ...command, action: "approve", commandId: randomUUID(), reviewId: review.reviewId, statementHash: review.statementHash };
 await expect(x.fees.command(testTenantContext(randomUUID()), x.jobId, x.auth.digest, approval)).rejects.toThrow("SUCCESS_FEE_FORBIDDEN");
 await expect(x.fees.command(x.context, randomUUID(), x.auth.digest, approval)).rejects.toThrow("SUCCESS_FEE_FORBIDDEN");
 const posted = await x.fees.command(x.context, x.jobId, x.auth.digest, approval);
 expect(await x.fees.command(x.context, x.jobId, x.auth.digest, approval)).toEqual({ ...posted, replayed: true });
 expect(await journals(x)).toEqual([{ amount_pence: "-3200", reverses_journal_id: original.journalId }, { amount_pence: "28200", reverses_journal_id: null }]);
 await expect(x.review(2)).rejects.toThrow("SUCCESS_FEE_SOURCE_CHANGED"); // Invalid proof cannot authorize zero or positive movement.
 const correction = await statements.command(x.context, x.jobId, x.auth.digest, issue());
 const refund = await collection.command(x.context, x.jobId, x.auth.digest, { version: "simulation-fee-collection-command.v1", action: "refund", commandId: randomUUID(), statementId: correction.statementId, statementHash: correction.documentHash, amountPence: 3200 });
 await collection.demoSettle(x.context, x.jobId, x.auth.digest, settle(refund.attemptId));
 expect(await collection.view(x.context, x.jobId, x.auth.digest)).toMatchObject({ settledPrincipal: 28200, refundedPrincipal: 3200, retainedPrincipal: 25000, refundDue: 0 });
});
it("a pre-invalidation review cannot approve changed reduction sources", async () => {
 const x = await recoveryFeeFixture(f); await x.allocate(0); await x.approve(await x.review());
 const review = await x.review(1); await invalidate(x);
 await expect(x.approve(review)).rejects.toThrow("SUCCESS_FEE_STALE");
 expect(await journals(x)).toHaveLength(1);
});
