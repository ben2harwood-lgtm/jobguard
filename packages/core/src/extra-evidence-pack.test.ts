import { expect, it } from "vitest";
import { sha256, type EvidenceSource } from "./evidence-pack.js";
import { buildExtraSourcePack, inspectExtraSourcePack, verifyExtraSourcePack } from "./extra-evidence-pack.js";
const sources: EvidenceSource[] = [{ sourceId: "extra_origin:extra-1", version: 1, jobId: "job-1", kind: "variation", content: "actual record text", label: "Persisted origin" }];
it("E5-18 partial extra sources and shared verifier", () => {
  const pack = buildExtraSourcePack("job-1", "extra-1", sources, ["Required approval sources HELD"]);
  expect(pack.subject).toEqual({ kind: "extra", jobId: "job-1", extraId: "extra-1" });
  const intact = verifyExtraSourcePack(JSON.stringify(pack));
  expect(intact.contentMatches).toBe(false); // explicit omissions mean no complete claim
  expect(intact.completeApprovalPack).toBe(false);
  expect(intact.findings).toContain("Checkpoint not independently trusted");
  expect(inspectExtraSourcePack(pack, [{ ...sources[0]!, content: "tampered" }]).findings).toContain("Content hash mismatch");
  expect(inspectExtraSourcePack(pack, []).findings).toContain("Missing original source");
  expect(inspectExtraSourcePack(pack, [{ ...sources[0]!, version: 2 }]).findings).toContain("Wrong source version");
  expect(inspectExtraSourcePack(pack, [{ ...sources[0]!, jobId: "other-job" }]).findings).toContain("Wrong source version");
});
it("E5-20 existing verifier uses an integrity key without creating a recovery subject", () => {
  const pack = buildExtraSourcePack("job-1", "extra-1", sources, []);
  const report = verifyExtraSourcePack(JSON.stringify(pack));
  expect(report.findings).toContain("Missing original source"); // foundation always labels held sources
  expect(report.manifestHash).toMatch(/^[a-f0-9]{64}$/);
  expect(() => verifyExtraSourcePack(JSON.stringify({ ...pack, subject: { ...pack.subject, extraId: "other-extra" } }))).toThrow();
  expect(() => buildExtraSourcePack("other-job", "extra-1", sources, [])).toThrow();
  expect(sha256(sources[0]!.content)).not.toBe(sha256("tampered"));
});
it("E5-19 optional absence and confirmation limits are explicit in source artifacts", () => {
  const pack = buildExtraSourcePack("job-1", "extra-1", sources, ["Optional photo absent", "Optional confirmation absent"]);
  expect(pack.integrity.manifest.omissions).toContain("Optional photo absent");
  expect(pack.completeApprovalPack).toBe(false);
  expect(() => verifyExtraSourcePack(JSON.stringify({ ...pack, completeApprovalPack: true }))).toThrow();
});
