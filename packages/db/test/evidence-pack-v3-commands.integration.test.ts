// CI-only PostgreSQL: actual activated request and checked writer boundaries.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createEvidencePackV3Fixture, closeEvidencePackV3Fixture, type V3Fixture } from "./evidence-pack-v3-fixture.js";
import { EvidencePackV3Repository, EvidencePackV3WorkerRepository } from "../src/evidence-pack-v3-repository.js";
import { FinalAccountLockRepository } from "../src/final-account-lock-repository.js";
import { asFixtureTenant } from "./recovery-attribution-fixture.js";
let f: V3Fixture;
beforeAll(async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); f = await createEvidencePackV3Fixture();
  await new FinalAccountLockRepository(f.runtime).acceptTerms(f.auth.context, { actorMembershipId: f.auth.membershipId, commandId: randomUUID(), termsVersion: "synthetic_final_check_terms.v1" });
}, 90_000);
afterAll(async () => { if (f) await closeEvidencePackV3Fixture(f); vi.unstubAllEnvs(); });
it("generation, replay and approval create one exact artifact and one approval", async () => {
  const repo = new EvidencePackV3Repository(f.runtime), worker = new EvidencePackV3WorkerRepository(f.shadow);
  const before = await repo.read(f.auth.context, f.caseId, f.auth.digest), commandId = randomUUID();
  const command = { version: "evidence-pack-command.v3", commandId, format: "TEXT", expectedVisibleSourceRevision: before.visibleSourceRevision };
  await repo.request(f.auth.context, f.caseId, f.auth.digest, command);
  await repo.request(f.auth.context, f.caseId, f.auth.digest, command);
  const prepared = await worker.prepare(f.auth.context, commandId);
  await expect(worker.finish(f.auth.context, commandId, prepared.material)).rejects.toThrow("EVIDENCE_PACK_V3_DEPENDENCY_HELD");
  await worker.completeMustSurface(f.auth.context, commandId, prepared.visibleRevision);
  const { assembleEvidencePackV3 } = await import("@jobguard/core");
  const packInput = assembleEvidencePackV3(prepared.material);
  for (const artifact of [packInput.artifactText + "\n", packInput.artifactText.replace('"binding":"synthetic-records"', '"binding":"unbound-specimen"')]) {
    await expect(asFixtureTenant(f.shadow, f.source.tenantId, db => db.query("SELECT app.finish_evidence_pack_v3($1,$2,$3::jsonb,$4,$5)", [f.source.tenantId, commandId, JSON.stringify(prepared.material), artifact, packInput.manifestHash]))).rejects.toThrow("EVIDENCE_PACK_CONTENT_MISMATCH");
  }
  await worker.finish(f.auth.context, commandId, prepared.material);
  await worker.finish(f.auth.context, commandId, prepared.material);
  const pack = (await repo.read(f.auth.context, f.caseId, f.auth.digest)).packs[0]!;
  expect(pack).toMatchObject({ id: commandId, contentMatches: true, attachmentApprovalRecorded: false });
  const approval = { version: "evidence-pack-attachment-approval.v3", commandId: randomUUID(), packId: pack.id, expectedManifestHash: pack.manifestHash, expectedContentHash: pack.contentHash };
  await repo.request(f.auth.context, f.caseId, f.auth.digest, approval);
  const checked = await worker.prepare(f.auth.context, approval.commandId);
  await worker.completeMustSurface(f.auth.context, approval.commandId, checked.visibleRevision);
  await worker.finish(f.auth.context, approval.commandId, checked.material);
  await worker.finish(f.auth.context, approval.commandId, checked.material);
  expect((await repo.read(f.auth.context, f.caseId, f.auth.digest)).packs).toMatchObject([{ attachmentApprovalRecorded: true }]);
  await expect(repo.request(f.auth.context, f.caseId, f.auth.digest, { ...command, expectedVisibleSourceRevision: "a".repeat(64) })).rejects.toThrow("EVIDENCE_PACK_COMMAND_CONFLICT");
  for (const table of ["evidence_pack_v3", "evidence_pack_v3_approval", "shadow_commercial_signal"])
    await expect(f.runtime.query(`SELECT * FROM app.${table}`)).rejects.toThrow(/permission denied/u);
});
it("another command family cannot reuse a queued pack command ID", async () => {
  const repo = new EvidencePackV3Repository(f.runtime), before = await repo.read(f.auth.context, f.caseId, f.auth.digest), commandId = randomUUID();
  await asFixtureTenant(f.admin, f.source.tenantId, db => db.query(`INSERT INTO app.command_receipt
    (tenant_id,command_id,command_type,semantic_key,request_hash,status,result,actor_membership_id,completed_at)
    VALUES($1,$2::uuid,'other.family',$2::text,$3,'succeeded','{}',$4,clock_timestamp())`, [f.source.tenantId, commandId, "a".repeat(64), f.auth.membershipId]));
  await expect(repo.request(f.auth.context, f.caseId, f.auth.digest, { version: "evidence-pack-command.v3", commandId, format: "TEXT", expectedVisibleSourceRevision: before.visibleSourceRevision })).rejects.toThrow("EVIDENCE_PACK_COMMAND_CONFLICT");
});
