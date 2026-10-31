import { expect, it } from "vitest";
import { assembleEvidencePackV3 } from "./evidence-pack-v3-assembly.js";
import { verifyStandalonePackV3, renderStandalonePackV3 } from "./evidence-pack-v3.js";
const owner = { tenantId: "11111111-1111-4111-8111-111111111111", jobId: "11111111-1111-4111-8111-111111111112", caseId: "11111111-1111-4111-8111-111111111113" };
const at = "2026-10-28T12:00:00.123456Z";
const record = (kind: string, content = "Original bytes\r\n£0.00") => ({ kind, sourceId: kind + ":1", recordedAt: at, content });
it("ordinary exports have no section or lifecycle placeholders and refuse hidden material", () => {
  const pack = assembleEvidencePackV3({ ...owner, lifecycle: { state: "pre_lock" }, records: [record("ordinary")] });
  expect(pack.manifest.sections).toEqual([]);
  expect(pack.manifest.lifecycle).toEqual({ state: "pre_lock" });
  expect(pack.sources[0]!.content).toBe("Original bytes\r\n£0.00");
  for (const kind of ["lock", "reveal", "settlement", "source_observations"]) expect(() => assembleEvidencePackV3({ ...owner, lifecycle: { state: "pre_lock" }, records: [record(kind)] })).toThrow();
});
it("all eight sections retain exact row bytes, rationals and microseconds deterministically", () => {
  const kinds = ["ordinary", "lock", "capture_snapshot", "source_observations", "reconciliation", "reveal", "disposition", "attribution_revision", "settlement"];
  const material = { ...owner, lifecycle: { state: "post_lock", lockedAt: at, evidenceCutoff: at }, records: kinds.map(k => record(k, '{"numerator":"30000","denominator":"1","recordedAt":"2026-10-28T12:00:00.123456Z"}')) };
  const pack = assembleEvidencePackV3(material);
  expect(assembleEvidencePackV3({ ...material, records: [...material.records].reverse() }).artifactText).toBe(pack.artifactText);
  expect(pack.manifest.sections).toHaveLength(8);
  expect(pack.manifest.sections.every(s => s.status === "present")).toBe(true);
  expect(verifyStandalonePackV3(pack.artifactText)).toMatchObject({ contentMatches: true, checkpointTrusted: false, complete: false });
  expect(verifyStandalonePackV3(pack.artifactText, { trustedManifestDigest: pack.manifestHash })).toMatchObject({ contentMatches: true, checkpointTrusted: true, complete: true, producerBindings: "synthetic-records" });
  const changed = pack.sources.map((s,i) => i ? s : { ...s, content: "substituted" });
  expect(verifyStandalonePackV3(renderStandalonePackV3(pack.manifest, changed)).contentMatches).toBe(false);
  expect(verifyStandalonePackV3(renderStandalonePackV3(pack.manifest, pack.sources.slice(1))).contentMatches).toBe(false);
  expect(() => assembleEvidencePackV3({ ...material, records: [...material.records, material.records[0]] })).toThrow();
  expect(() => assembleEvidencePackV3({ ...material, records: material.records.map(r => r.kind === "source_observations" ? { ...r, recordedAt: "2026-10-28T12:00:00.123457Z" } : r) })).toThrow();
});
it("missing later sections are explicit, and no unpaid record becomes a settlement", () => {
  const pack = assembleEvidencePackV3({ ...owner, lifecycle: { state: "post_lock", lockedAt: at, evidenceCutoff: at }, records: [record("lock")] });
  expect(pack.manifest.sections.find(s => s.kind === "settlement")).toEqual({ kind: "settlement", status: "absent", reason: "unpaid" });
});
