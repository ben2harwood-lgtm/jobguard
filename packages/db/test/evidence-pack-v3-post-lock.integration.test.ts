// CI-only real PostgreSQL. Fresh source fixture inputs; all commercial effects use real writers.
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, expect, it } from "vitest";
import { assembleEvidencePackV3, evidencePackMaterialV3, verifyStandalonePackV3 } from "@jobguard/core";
import { createFinalCheckFixture, closeFinalCheckFixture, finalCheckTenant, type FinalCheckFixture } from "./final-check-fixture.js";
import { shadowPackCatch } from "./evidence-pack-v3-catch-fixture.js";
import { EvidencePackV3Repository, EvidencePackV3WorkerRepository } from "../src/evidence-pack-v3-repository.js";
import { StoredReceiptCaseAllocationRepository } from "../src/stored-receipt-case-allocation-repository.js";
import { issuePracticeSession } from "../src/practice-session.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { createHash } from "node:crypto";
let f: FinalCheckFixture;
const previous = process.env.JOBGUARD_ENV;
beforeAll(async () => { process.env.JOBGUARD_ENV = "synthetic_demo"; f = await createFinalCheckFixture(); }, 120000);
afterAll(async () => { await closeFinalCheckFixture(f); if (previous === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV = previous; });
it("shadow-30000 traces exact source, lock, catch revision, supplementary invoice and settled allocation; approvals go stale on reversal", async () => {
  const x = await shadowPackCatch(f), runtime = new EvidencePackV3Repository(f.runtime), worker = new EvidencePackV3WorkerRepository(f.shadow);
  expect(x.attribution.assessmentOutcome).toBe("eligible_for_review");
  const generate = async () => {
    const view = await runtime.read(x.context, x.caseId, x.auth.digest), commandId = randomUUID();
    await runtime.request(x.context, x.caseId, x.auth.digest, { version: "evidence-pack-command.v3", commandId, format: "TEXT", expectedVisibleSourceRevision: view.visibleSourceRevision });
    const prepared = await worker.prepare(x.context, commandId);
    await expect(worker.finish(x.context, commandId, { ...(prepared.material as object), jobId: randomUUID() })).rejects.toThrow("EVIDENCE_PACK_V3_SOURCE_CONFLICT");
    await worker.finish(x.context, commandId, prepared.material);
    return (await runtime.read(x.context, x.caseId, x.auth.digest)).packs.find(p => p.id === commandId)!;
  };
  // Allocation capacity cannot be reopened by creating another pack or interpretation.
  await expect(new StoredReceiptCaseAllocationRepository(f.runtime, "synthetic_demo").command(x.context, x.jobId, x.auth.digest, {
    version: "stored-receipt-case-command.v1", commandId: randomUUID(), action: "review", factLineId: x.fact.lineAllocationId, caseId: x.caseId, workId: x.workId,
    expectedCaseRevision: (await f.admin.query("SELECT revision FROM app.recovery_case_current WHERE tenant_id=$1 AND id=$2", [x.context.tenantId, x.caseId])).rows[0].revision,
  })).rejects.toThrow("RECEIPT_LINE_CAPACITY_EXCEEDED");
  const first = await generate();
  expect(first.manifest.sections).toHaveLength(8);
  expect(first.manifest.sections.every(s => s.status === "present")).toBe(true);
  for (const sourceId of [`stored_receipt_case_allocation:${x.allocation.allocationId}`, `receipt_allocation_fact_line:${x.fact.lineAllocationId}`, `customer_payment:${x.paymentId}`, `recovery_attribution_revision:${x.attribution.assessmentId}`])
    expect(first.sources.map(s => s.sourceId)).toContain(sourceId);
  const line = JSON.parse(first.sources.find(s => s.sourceId === `final_account_line:${x.line}`)!.content);
  const revision = JSON.parse(first.sources.find(s => s.sourceId === `variation_revision:${line.source_id}`)!.content);
  expect(revision.variation_id).toBe((await f.admin.query("SELECT source_refs FROM app.recovery_case WHERE tenant_id=$1 AND id=$2", [x.context.tenantId, x.caseId])).rows[0].source_refs.find((s: string) => s.startsWith("variation:")).slice(10));
  expect(line.final_account_revision_id).not.toBe(x.lock.finalAccountRevisionId);
  const invoiceBinding = JSON.parse(first.sources.find(s => s.sourceId === `final_account_invoice_binding:${x.invoiceId}`)!.content);
  expect(invoiceBinding).toMatchObject({ invoice_kind: "supplementary", lock_id: x.lock.id, revision_id: line.final_account_revision_id });
  expect(invoiceBinding.check_id).toEqual(expect.any(String));

  expect(await generate()).toMatchObject({ artifactText: first.artifactText, manifestHash: first.manifestHash, contentHash: first.contentHash });
  expect(await runtime.inspect(x.context, x.caseId, x.auth.digest, first.id)).toMatchObject(verifyStandalonePackV3(first.artifactText));
  const approval = { version: "evidence-pack-attachment-approval.v3", commandId: randomUUID(), packId: first.id, expectedManifestHash: first.manifestHash, expectedContentHash: first.contentHash };
  await runtime.request(x.context, x.caseId, x.auth.digest, approval);
  await x.invoices.reverseReceipt(x.context, { jobId: x.jobId, invoiceId: x.invoiceId, paymentId: x.paymentId, actorMembershipId: x.actor.membershipId, commandId: randomUUID(), reason: "Fictional reversal" });
  await x.assess(1);
  const changed = await worker.prepare(x.context, approval.commandId);
  await expect(worker.finish(x.context, approval.commandId, changed.material)).rejects.toThrow("EVIDENCE_PACK_STALE_APPROVAL");
  const next = await generate();
  expect(next.sources.some(s => s.sourceId.startsWith("customer_payment_reversal:"))).toBe(true);
  expect(next.sources.filter(s => s.kind === "attribution_revision")).toHaveLength(2);
  expect((await runtime.read(x.context, x.caseId, x.auth.digest)).packs.find(p => p.id === first.id)!.artifactText).toBe(first.artifactText);
  const stranger = createHash("sha256").update(await issuePracticeSession(f.runtime)).digest("hex");
  await expect(runtime.read(x.context, x.caseId, stranger)).rejects.toThrow("NOT_FOUND");
  await expect(runtime.read(testTenantContext(randomUUID()), x.caseId, x.auth.digest)).rejects.toThrow();
});
it("SQL canonicaliser equals renderStandalonePackV3 byte for byte across escaping, Unicode and eight-section envelopes", async () => {
  for (const state of ["pre_lock", "post_lock"] as const) {
    const at = "2026-10-28T12:00:00.123456Z";
    const kinds = state === "pre_lock" ? ["ordinary"] : ["ordinary", "lock", "capture_snapshot", "source_observations", "reconciliation", "reveal", "disposition", "attribution_revision", "settlement"];
    const pack = assembleEvidencePackV3({ tenantId: randomUUID(), jobId: randomUUID(), caseId: randomUUID(), lifecycle: state === "pre_lock" ? { state } : { state, lockedAt: at, evidenceCutoff: at },
      records: kinds.map((kind, n) => ({ kind, sourceId: `${kind}:${n}`, recordedAt: at, content: '£ \\"\r\n\t\b\f 😀 \u2028 \u2029 e\u0301 <>& / {"n":"12345678901234567890/7"}' })) });
    const sql = await finalCheckTenant(f.admin, pack.material.tenantId, db => db.query("SELECT app.canonical_evidence_pack_v3($1::jsonb) text, encode(sha256(convert_to(app.canonical_evidence_pack_v3($2::jsonb),'UTF8')),'hex') hash", [pack.artifactText, JSON.stringify(pack.manifest)]));
    expect(Buffer.from(sql.rows[0].text)).toEqual(Buffer.from(pack.artifactText));
    expect(sql.rows[0].hash).toBe(pack.manifestHash);
  }
});
it("a case pack excludes unrevealed findings and the second catch in the same completed run", async () => {
  const { realReceiptFixture } = await import("./stored-receipt-case-fixture.js");
  const x = await realReceiptFixture(f, "F7", 3000000, true);
  const runtime = new EvidencePackV3Repository(f.runtime), worker = new EvidencePackV3WorkerRepository(f.shadow);
  // Negative control: the real reconciler persisted all three proof rows, including
  // not_enough_evidence; the second revealed catch also has its own disposition.
  const proofs = (await f.admin.query(`SELECT p.signal_id,c.outcome FROM app.final_check_reveal_proof p
    JOIN app.shadow_signal_classification c ON(c.tenant_id,c.job_id,c.id)=(p.tenant_id,p.job_id,p.classification_id)
    WHERE p.tenant_id=$1 AND p.job_id=$2 AND p.run_id=$3 ORDER BY p.signal_id`, [x.context.tenantId, x.jobId, x.run.runId])).rows;
  expect(proofs).toHaveLength(3);
  expect(proofs).toContainEqual({ signal_id: x.hiddenSignal, outcome: "not_enough_evidence" });
  expect(proofs).toContainEqual({ signal_id: x.otherCatchSignal, outcome: "reveal" });
  const before = await runtime.read(x.context, x.caseId, x.auth.digest), commandId = randomUUID();
  await runtime.request(x.context, x.caseId, x.auth.digest, { version: "evidence-pack-command.v3", commandId, format: "TEXT", expectedVisibleSourceRevision: before.visibleSourceRevision });
  const prepared = await worker.prepare(x.context, commandId);
  const material = evidencePackMaterialV3.parse(prepared.material);
  const ownProof = material.records.find(r => r.kind === "reveal")!;
  await expect(worker.finish(x.context, commandId, { ...material, records: [...material.records,
    { ...ownProof, sourceId: `final_check_reveal_proof:${x.hiddenSignal}`, content: "attempted hidden proof injection" },
  ] })).rejects.toThrow("EVIDENCE_PACK_V3_SOURCE_CONFLICT");
  await worker.finish(x.context, commandId, prepared.material);
  const pack = (await runtime.read(x.context, x.caseId, x.auth.digest)).packs[0]!;
  expect(pack.sources.filter(s => s.kind === "reveal").map(s => JSON.parse(s.content).signal_id)).toEqual([x.signal]);
  expect(pack.sources.filter(s => s.kind === "disposition").map(s => JSON.parse(s.content).signal_id)).toEqual([x.signal]);
  for (const source of pack.sources.filter(s => ["source_observations", "reconciliation"].includes(s.kind))) {
    expect(Object.keys(JSON.parse(source.content)).sort()).toEqual(source.sourceId.startsWith("final_check_processing_source:")
      ? ["id", "input_hash", "manifest_id"] : source.sourceId.startsWith("final_check_source_attempt:")
      ? ["id", "input_hash", "result_hash", "source_id"] : ["lock_id", "manifest_hash", "manifest_id", "result_hash", "run_id"]);
  }
  expect(pack.artifactText).not.toContain("CH8-R1 unrevealed description");
  expect(pack.artifactText).not.toContain("CH8-R1 other catch proof");
  expect(pack.artifactText).not.toContain(x.hiddenSignal);
  expect(pack.artifactText).not.toContain(x.otherCatchSignal);
  expect(pack.artifactText).not.toMatch(/"(?:frozen_input|signal_ids|classifications)"/u);
  expect(verifyStandalonePackV3(pack.artifactText).contentMatches).toBe(true);
  const { RecoveryCaseRepository } = await import("../src/recovery-case-repository.js");
  const ordinaryCase = await new RecoveryCaseRepository(x.scoped).command(x.context, x.jobId, {
    version: "recovery-case-command.v1", action: "open", commandId: randomUUID(), expectedRevision: 0,
    caseType: "withheld_customer_payment", counterparty: "Fictional ordinary case", book: "builder_customer",
    sourceType: "customer_invoice", sourceRefs: [x.invoiceId], claimedNetPence: 80000,
  }, x.actor);
  const ordinaryBefore = await runtime.read(x.context, ordinaryCase.id, x.auth.digest), ordinaryCommand = randomUUID();
  await runtime.request(x.context, ordinaryCase.id, x.auth.digest, { version: "evidence-pack-command.v3", commandId: ordinaryCommand, format: "TEXT", expectedVisibleSourceRevision: ordinaryBefore.visibleSourceRevision });
  const ordinaryPrepared = await worker.prepare(x.context, ordinaryCommand);
  await worker.finish(x.context, ordinaryCommand, ordinaryPrepared.material);
  const ordinaryPack = (await runtime.read(x.context, ordinaryCase.id, x.auth.digest)).packs[0]!;
  expect(ordinaryPack.sources.filter(s => ["reveal", "disposition"].includes(s.kind))).toEqual([]);
  for (const id of [x.signal, x.hiddenSignal, x.otherCatchSignal]) expect(ordinaryPack.artifactText).not.toContain(id);

});
