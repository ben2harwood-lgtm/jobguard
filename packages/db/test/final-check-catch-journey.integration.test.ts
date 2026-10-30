// SV-5 Q2: real application commands and PostgreSQL; synthetic data only.
// Customer approval is the small-builder customer_evidence method, not contractor 0158.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { FinalCheckApplication } from "../../../apps/api/src/final-check.application.js";
import { VariationApplication } from "../../../apps/api/src/variation/variation.application.js";
import { FinalCheckRepository } from "../src/final-check-repository.js";
import { withTenant } from "../src/tenant-context.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import {
  createFinalCheckFixture, closeFinalCheckFixture, seedFinalCheckJob,
  insertFinalCheckEvidence, finalCheckProposal, finalCheckTenant, FINAL_CHECK_ACTOR,
  type FinalCheckFixture,
} from "./final-check-fixture.js";

let f: FinalCheckFixture;
beforeAll(async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  f = await createFinalCheckFixture();
}, 60_000);
afterAll(async () => { await closeFinalCheckFixture(f); vi.unstubAllEnvs(); });

async function revealedCatches() {
  const job = await seedFinalCheckJob(f);
  const signals: string[] = [];
  for (let n = 0; n < 2; n++) {
    const evidence = await insertFinalCheckEvidence(f, job);
    signals.push(await finalCheckProposal(f, job, evidence));
  }
  await job.lock();
  const worker = new FinalCheckRepository(f.shadow), manifest = await worker.begin(job.context, job.jobId);
  for (const source of manifest.sources) {
    const signal = manifest.signals.find(s => s.evidenceIds.includes(source.evidenceId!))!;
    await worker.record(job.context, job.jobId, manifest.id, source.id, randomUUID(), {
      version: "final-check.source-result.v1", inputHash: source.inputHash,
      status: "detected", failureCode: null, signalIds: [signal.signalId],
    });
  }
  const result = await worker.reconcile(job.context, job.jobId, manifest.id, signals.map(signalId => ({
    signalId, expectedRevision: 0, outcome: "reveal" as const, references: [],
    comparisons: { baselineItemIds: [job.scopeItemId], captureIds: [], lockedLineIds: [job.lineId] },
  }))) as { lockId: string; runId: string };
  const app = new FinalCheckApplication(f.runtime, job.sessionId);
  const commands = signals.map(signalId => ({
    version: "final-check.catch.v1", commandId: randomUUID(), lockId: result.lockId, runId: result.runId,
    signalId, expectedSignalRevision: 1,
  }));
  return { job, app, commands, variations: new VariationApplication(f.runtime, job.sessionId) };
}

const price = (variationId: string, unitRatePence: number, direction = "addition", previous: string | null = null) => ({
  version: "variation-command.v1", action: "revise", variationId,
  revisionId: randomUUID(), expectedRevisionId: previous, description: "Fictional missing extra",
  price: { quantity: "1", unit: "item", unitRatePence, direction },
});
const cases = async (tenant: string, job: string) => (await f.admin.query(
  "SELECT id,state,claim_pence,source_refs FROM app.recovery_case WHERE tenant_id=$1 AND job_id=$2 ORDER BY claim_pence",
  [tenant, job],
)).rows;
const claims = async (tenant: string, job: string) => (await f.admin.query(
  "SELECT case_id,revision,claimed_net_pence FROM app.recovery_claim_revision WHERE tenant_id=$1 AND job_id=$2",
  [tenant, job],
)).rows;

it("shadow-30000 step 6: two app-confirmed catches priced at £500/£300 then customer-approved with written evidence create exactly two cases with claim revision 1", async () => {
  const { job: a, app, commands, variations } = await revealedCatches();
  for (const command of commands) {
    const result = await app.confirmCatch(a.jobId, command);
    expect(result).toMatchObject({ disposition: "confirmed_extra", variationId: command.commandId });
    expect(await app.confirmCatch(a.jobId, command)).toEqual(result);
  }
  expect(await cases(a.tenantId, a.jobId)).toEqual([]);
  expect(await claims(a.tenantId, a.jobId)).toEqual([]);
  const before = await variations.get(a.jobId);
  expect(before.variations).toHaveLength(2);
  expect(before.variations.every(v => v.state === "draft" && v.revisions.length === 0)).toBe(true);
  for (const [index, amount] of [50_000, 30_000].entries()) {
    const command = price(commands[index]!.commandId, amount);
    const result = await variations.command(a.jobId, command);
    expect(await variations.command(a.jobId, command)).toEqual(result);
  }
  const opened = await cases(a.tenantId, a.jobId);
  expect(opened).toHaveLength(2);
  expect(opened.map(c => ({ state: c.state, pence: c.claim_pence }))).toEqual([
    { state: "identified", pence: "30000" }, { state: "identified", pence: "50000" },
  ]);
  for (const command of commands) {
    expect(opened.filter(c => c.source_refs.includes(`variation:${command.commandId}`))).toHaveLength(1);
  }
  expect(await claims(a.tenantId, a.jobId)).toEqual([]);
  for (const [index, amount] of [50_000, 30_000].entries()) {
    const variation = (await variations.get(a.jobId)).variations.find(v => v.id === commands[index]!.commandId)!;
    // Fixture evidence represents the customer's own written yes, received after pricing.
    const evidenceId = await insertFinalCheckEvidence(f, a, "message", "text/plain");
    const approval = { version: "variation-command.v1", action: "approve", variationId: variation.id,
      revisionId: variation.currentRevisionId, approvalId: randomUUID(), method: "customer_evidence", evidenceId };
    const result = await variations.command(a.jobId, approval);
    expect(await variations.command(a.jobId, approval)).toEqual(result);
    const stored = (await f.admin.query(
      "SELECT method,evidence_id,signed_delta_pence FROM app.variation_approval WHERE tenant_id=$1 AND id=$2",
      [a.tenantId, approval.approvalId],
    )).rows;
    expect(stored).toEqual([{ method: "customer_evidence", evidence_id: evidenceId, signed_delta_pence: String(amount) }]);
  }
  const finalCases = await cases(a.tenantId, a.jobId);
  expect(finalCases).toEqual(opened);
  const finalClaims = await claims(a.tenantId, a.jobId);
  expect(finalClaims).toHaveLength(2);
  for (const c of finalCases) {
    expect(finalClaims.filter(claim => claim.case_id === c.id)).toEqual([
      { case_id: c.id, revision: 1, claimed_net_pence: c.claim_pence },
    ]);
  }
});

it("runtime direct case/claim writes remain held, including after legitimate app pricing", async () => {
  const { job: a, app, commands, variations } = await revealedCatches();
  await app.confirmCatch(a.jobId, commands[0]!);
  await expect(withTenant(f.runtime, a.context, db => db.$client.query(
    "INSERT INTO app.recovery_case(id,tenant_id,job_id,claim_pence,currency,state,revision,synthetic,case_type) VALUES($1,$2,$3,50000,'GBP','identified',0,true,'missed_variation_final_account')",
    [randomUUID(), a.tenantId, a.jobId],
  ))).rejects.toThrow(/FINAL_CHECK_CONFIRMATION_HELD/u);
  await variations.command(a.jobId, price(commands[0]!.commandId, 50_000));
  const opened = await cases(a.tenantId, a.jobId);
  expect(opened).toHaveLength(1);
  await expect(withTenant(f.runtime, a.context, db => db.$client.query(
    "INSERT INTO app.recovery_claim_revision(id,tenant_id,job_id,case_id,revision,claimed_net_pence,currency,reviewer_ref,subject_hash) VALUES($1,$2,$3,$4,1,50000,'GBP','membership:forged',$5)",
    [randomUUID(), a.tenantId, a.jobId, opened[0]!.id, "f".repeat(64)],
  ))).rejects.toThrow(/FINAL_CHECK_CONFIRMATION_HELD/u);
  expect(await claims(a.tenantId, a.jobId)).toEqual([]);
});

it("zero/negative prices open no case; later positive pricing and re-pricing create only one case", async () => {
  const { job: a, app, commands, variations } = await revealedCatches();
  await app.confirmCatch(a.jobId, commands[0]!);
  let previous: string | null = null;
  for (const [amount, direction] of [[0, "addition"], [100, "omission"], [50_000, "addition"], [30_000, "addition"]] as const) {
    const command = price(commands[0]!.commandId, amount, direction, previous);
    await variations.command(a.jobId, command);
    previous = command.revisionId;
    expect(await cases(a.tenantId, a.jobId)).toHaveLength(amount > 100 ? 1 : 0);
    expect(await claims(a.tenantId, a.jobId)).toEqual([]);
  }
});

it("another tenant cannot confirm, replay or price this job's catch", async () => {
  const { job: a, app, commands, variations } = await revealedCatches(), repo = new FinalCheckRepository(f.runtime);
  const foreign = testTenantContext(randomUUID());
  await expect(repo.confirmCatch(foreign, a.jobId, a.digest, commands[0]!)).rejects.toBeDefined();
  await app.confirmCatch(a.jobId, commands[0]!);
  await expect(repo.confirmCatch(foreign, a.jobId, a.digest, commands[0]!)).rejects.toBeDefined();
  const other = await seedFinalCheckJob(f);
  await expect(new VariationApplication(f.runtime, other.sessionId).command(a.jobId, price(commands[0]!.commandId, 50_000))).rejects.toBeDefined();
  expect(await cases(a.tenantId, a.jobId)).toEqual([]);
  expect((await variations.get(a.jobId)).variations[0]!.revisions).toEqual([]);
});


it("0282 treats builder attestation the same for claim creation, while preserving its recorded method", async () => {
  const { job: a, app, commands, variations } = await revealedCatches();
  await app.confirmCatch(a.jobId, commands[0]!);
  const priced = price(commands[0]!.commandId, 50_000);
  await variations.command(a.jobId, priced);
  const approval = { version: "variation-command.v1", action: "approve", variationId: commands[0]!.commandId,
    revisionId: priced.revisionId, approvalId: randomUUID(),
    attestation: "Builder-recorded practice acceptance — not an authenticated customer signature" };
  const result = await variations.command(a.jobId, approval);
  expect(await variations.command(a.jobId, approval)).toEqual(result);
  expect((await f.admin.query("SELECT method,evidence_id FROM app.variation_approval WHERE tenant_id=$1 AND id=$2", [a.tenantId, approval.approvalId])).rows)
    .toEqual([{ method: "builder_attestation", evidence_id: null }]);
  const opened = await cases(a.tenantId, a.jobId);
  expect(opened).toHaveLength(1);
  // The existing 0282 trigger has no method filter: it creates the same claim.
  // This does not relabel the attestation as the customer's written approval.
  expect(await claims(a.tenantId, a.jobId)).toEqual([{ case_id: opened[0]!.id, revision: 1, claimed_net_pence: "50000" }]);
});

it("customer-evidence approval refuses missing, wrong-job and invalidated evidence without creating a claim", async () => {
  const { job: a, app, commands, variations } = await revealedCatches();
  await app.confirmCatch(a.jobId, commands[0]!);
  const priced = price(commands[0]!.commandId, 50_000);
  await variations.command(a.jobId, priced);
  const other = await seedFinalCheckJob(f);
  const wrongJob = await insertFinalCheckEvidence(f, other, "message", "text/plain");
  const invalidated = await insertFinalCheckEvidence(f, a, "message", "text/plain");
  await finalCheckTenant(f.admin, a.tenantId, db => db.query(
    "INSERT INTO app.evidence_invalidation(id,tenant_id,evidence_id,actor_membership_id,reason_code) VALUES($1,$2,$3,$4,'verification_invalid')",
    [randomUUID(), a.tenantId, invalidated, FINAL_CHECK_ACTOR],
  ));
  for (const evidenceId of [randomUUID(), wrongJob, invalidated]) {
    await expect(variations.command(a.jobId, {
      version: "variation-command.v1", action: "approve", variationId: commands[0]!.commandId,
      revisionId: priced.revisionId, approvalId: randomUUID(), method: "customer_evidence", evidenceId,
    })).rejects.toThrow("CUSTOMER_EVIDENCE_REQUIRED");
  }
  expect(await claims(a.tenantId, a.jobId)).toEqual([]);
  expect((await variations.get(a.jobId)).variations[0]!.state).toBe("priced");
});
