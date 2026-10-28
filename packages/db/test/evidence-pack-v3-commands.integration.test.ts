import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createEvidencePackV3Fixture, closeEvidencePackV3Fixture, type V3Fixture } from "./evidence-pack-v3-fixture.js";
import { requireEvidencePackV3Writer } from "../src/evidence-pack-v3-command.js";
let f: V3Fixture;
beforeAll(async () => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); f = await createEvidencePackV3Fixture(); }, 90_000);
afterAll(async () => { if (f) await closeEvidencePackV3Fixture(f); vi.unstubAllEnvs(); });
it("actual application with runtime database authority refuses v3 without any pack/approval effect", async () => {
  // API build is a CI prerequisite. No mocked provider or application success.
  const url = new URL("../../../apps/api/dist/evidence-pack.application.js", import.meta.url).href;
  const { EvidencePackApplication } = await import(url);
  const app = new EvidencePackApplication(f.runtime), digest = "a".repeat(64);
  const counts = async () => (await f.admin.query(`SELECT
    (SELECT count(*)::int FROM app.evidence_pack_revision WHERE case_id=$1) packs,
    (SELECT count(*)::int FROM app.evidence_pack_attachment_approval WHERE case_id=$1) approvals`, [f.caseId])).rows;
  const before = await counts();
  await expect(app.generate(f.source.sessionToken, f.caseId, { version: "evidence-pack-command.v3", commandId: randomUUID(), format: "TEXT", expectedVisibleSourceRevision: digest })).rejects.toThrow("EVIDENCE_PACK_V3_DEPENDENCY_HELD");
  await expect(app.approveAttachment(f.source.sessionToken, f.caseId, randomUUID(), { version: "evidence-pack-attachment-approval.v3", commandId: randomUUID(), expectedManifestHash: digest, expectedContentHash: digest })).rejects.toThrow("EVIDENCE_PACK_V3_DEPENDENCY_HELD");
  expect(await counts()).toEqual(before);
  expect(requireEvidencePackV3Writer).toThrow("EVIDENCE_PACK_V3_DEPENDENCY_HELD");
});
