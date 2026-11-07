import { expect, it } from "vitest";
import { buildEvidenceManifest, renderStandalonePack, sha256, type EvidenceSource } from "./evidence-pack.js";
import { buildExtraSourcePack, inspectExtraSourcePack, verifyExtraSourcePack } from "./extra-evidence-pack.js";
const timing = { version: "extra-pack-timing.v1", workTiming: { source: "site_visit", visitId: "visit-1",
  startedAt: "2026-11-03T09:00:00.000001Z", finishedAt: "2026-11-03T10:00:00.000002Z", uncertainty: "during_this_visit" },
  doneWithoutRequiredPreapproval: true, approvalTimings: [{ stepIndex: 0, timing: "after_work" }] };
const timingSource: EvidenceSource = { sourceId: "extra_approval_timing:extra-1", version: 2, jobId: "job-1", kind: "approval", label: "Server timing", content: JSON.stringify(timing) };
const sources: EvidenceSource[] = [{ sourceId: "extra_origin:extra-1", version: 1, jobId: "job-1", kind: "variation", content: "actual record text", label: "Persisted origin" }, timingSource];
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

it.each(["Extra work timing HELD", "Approval requirement, steps and extra work timing HELD"])("preserves unchanged legacy artifact: %s", omission => {
  const originalSources = sources.slice(0, 1);
  const manifest = buildEvidenceManifest("extra:extra-1", "job-1", originalSources, [omission]);
  const legacy = JSON.stringify({ version: "extra-source-pack.v1", subject: { kind: "extra", jobId: "job-1", extraId: "extra-1" },
    completeApprovalPack: false, integrity: JSON.parse(renderStandalonePack(manifest, originalSources)) });
  const before = JSON.parse(legacy);
  expect(verifyExtraSourcePack(legacy).completeApprovalPack).toBe(false);
  expect(verifyExtraSourcePack(legacy).findings).not.toContain("Content hash mismatch");
  expect(JSON.parse(legacy)).toEqual(before);
});
it.each([
  timing,
  { ...timing, workTiming: null, doneWithoutRequiredPreapproval: "not_derived", approvalTimings: [] },
  { ...timing, workTiming: { ...timing.workTiming, finishedAt: null }, doneWithoutRequiredPreapproval: "uncertain" },
  { ...timing, doneWithoutRequiredPreapproval: false },
])("new artifacts seal projection fields unchanged: %j", projection => {
  const input = [sources[0]!, { ...timingSource, content: JSON.stringify(projection) }];
  const pack = buildExtraSourcePack("job-1", "extra-1", input, []);
  expect(JSON.parse(pack.integrity.sources[1]!.content)).toEqual(projection);
  expect(pack.integrity.manifest.omissions).toEqual(["Client access HELD", "Export and send HELD"]);
  expect(verifyExtraSourcePack(JSON.stringify(pack)).findings).not.toContain("Content hash mismatch");
});
it("detects edits to every timing field after sealing", () => {
  const pack = buildExtraSourcePack("job-1", "extra-1", sources, []);
  const changes = [
    { ...timing, version: "forged" }, { ...timing, workTiming: null },
    ...Object.entries({ source: "forged", visitId: "visit-2", startedAt: "changed", finishedAt: null, uncertainty: "forged" })
      .map(([key, value]) => ({ ...timing, workTiming: { ...timing.workTiming, [key]: value } })),
    { ...timing, doneWithoutRequiredPreapproval: false },
    { ...timing, approvalTimings: [{ stepIndex: 1, timing: "after_work" }] },
    { ...timing, approvalTimings: [{ stepIndex: 0, timing: "uncertain" }] },
  ];
  for (const change of changes) {
    const edited = structuredClone(pack);
    edited.integrity.sources[1]!.content = JSON.stringify(change);
    if (JSON.stringify(change).includes('"forged"')) expect(() => verifyExtraSourcePack(JSON.stringify(edited))).toThrow();
    else expect(verifyExtraSourcePack(JSON.stringify(edited)).findings).toContain("Content hash mismatch");
  }
  expect(() => buildExtraSourcePack("job-1", "extra-1", sources.slice(0, 1), [])).toThrow();
});

const approvalSources: EvidenceSource[] = [
  ...sources,
  { sourceId: "extra_approval_request:request-1", version: 1, jobId: "job-1", kind: "approval", label: "Frozen requirement", content: JSON.stringify({ tenant_id: "tenant-1", job_id: "job-1", variation_id: "extra-1", id: "request-1", requirement: { steps: [{ index: 0, role: "supervisor" }, { index: 1, role: "client_approver" }] } }) },
  ...["member", "client_approver"].map((actor, index): EvidenceSource => ({ sourceId: `extra_approval_step_fact:step-${index}`, version: 1, jobId: "job-1", kind: "approval", label: `Step ${index}`, content: JSON.stringify({ tenant_id: "tenant-1", job_id: "job-1", variation_id: "extra-1", request_id: "request-1", step_index: index, actor_kind: actor }) })),
];
it("detects edited requirements and steps, missing steps and cross-subject substitutions through shared verifiers", () => {
  const pack = buildExtraSourcePack("job-1", "extra-1", approvalSources, []);
  for (const index of [2, 3, 4]) {
    const altered = structuredClone(pack);
    altered.integrity.sources[index]!.content += "edited";
    expect(verifyExtraSourcePack(JSON.stringify(altered)).findings).toContain("Content hash mismatch");
    expect(inspectExtraSourcePack(pack, approvalSources.filter((_, i) => i !== index)).findings).toContain("Missing original source");
  }
  for (const changed of [{ tenant_id: "other-tenant" }, { job_id: "other-job" }, { variation_id: "other-extra" }, { request_id: "request-2" }]) {
    const substituted = approvalSources.map((s, i) => i === 4 ? { ...s, content: JSON.stringify({ ...JSON.parse(s.content), ...changed }) } : s);
    expect(inspectExtraSourcePack(pack, substituted).findings).toContain("Content hash mismatch");
    const exported = structuredClone(pack);
    exported.integrity.sources = substituted;
    expect(verifyExtraSourcePack(JSON.stringify(exported)).findings).toContain("Content hash mismatch");
  }
  const later = approvalSources.map(s => s.sourceId.startsWith("extra_approval_request:") ? { ...s, sourceId: "extra_approval_request:request-2", version: 2 } : s);
  expect(inspectExtraSourcePack(pack, later).findings).toContain("Missing original source");
});
it("source array order carries no authority; changing recorded step order does", () => {
  const pack = buildExtraSourcePack("job-1", "extra-1", approvalSources, []);
  expect(inspectExtraSourcePack(pack, [...approvalSources].reverse()).findings).not.toContain("Content hash mismatch");
  const reordered = approvalSources.map(s => s.sourceId.startsWith("extra_approval_step_fact:") ? { ...s, content: JSON.stringify({ ...JSON.parse(s.content), step_index: 99 }) } : s);
  expect(inspectExtraSourcePack(pack, reordered).findings).toContain("Content hash mismatch");
});
it("a self-consistently rewritten export fails comparison to persisted sources and an independent digest", async () => {
  const { manifestDigest } = await import("./evidence-pack.js");
  const original = buildExtraSourcePack("job-1", "extra-1", approvalSources, []);
  const edited = buildExtraSourcePack("job-1", "extra-1", approvalSources.map((s, i) => i === 4 ? { ...s, content: "forged approval" } : s), []);
  expect(inspectExtraSourcePack(edited, approvalSources).findings).toContain("Content hash mismatch");
  expect(verifyExtraSourcePack(JSON.stringify(edited), { trustedManifestDigest: manifestDigest(original.integrity.manifest) }).checkpointTrusted).toBe(false);
});
