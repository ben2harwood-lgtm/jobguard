import { describe, expect, it } from "vitest";
import { completionWorkInputV1, completionWorkFindingV1, parseCompletionWorkInput, EnterpriseLivePromptError } from "./enterprise-live-prompt-contracts.js";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function input() {
  return { version: "enterprise-completion-input.v1", environment: "synthetic_demo", tenantId: id(1), jobId: id(2),
    baseline: { workOrderId: id(3), revisionId: id(4), sha256: "a".repeat(64), workIds: ["door"] },
    recognition: { version: "fictional-terms.v1", entries: [{ workId: "door", terms: ["door"] }, { workId: "vent", terms: ["vent"] }] },
    sources: [{ evidenceId: id(5), tenantId: id(1), jobId: id(2), sha256: "b".repeat(64), objectVersion: "v1",
      status: "verified", invalidated: false, content: { kind: "completion_note", text: "Done vent" } }],
    observations: [{ observationId: id(6), evidenceId: id(5), sha256: "b".repeat(64), objectVersion: "v1",
      locator: { kind: "text_span", start: 5, end: 9, quote: "vent" } }] };
}
describe("ENT-8a independent strict contracts", () => {
  it("A-03: versioned input is strict at every object boundary", () => {
    const v = input(); expect(completionWorkInputV1.safeParse(v).success).toBe(true);
    for (const changed of [ { ...v, extra: true }, { ...v, baseline: { ...v.baseline, extra: true } },
      { ...v, recognition: { ...v.recognition, extra: true } },
      { ...v, recognition: { ...v.recognition, entries: [{ ...v.recognition.entries[0], extra: true }] } },
      { ...v, sources: [{ ...v.sources[0], extra: true }] },
      { ...v, sources: [{ ...v.sources[0], content: { ...v.sources[0]!.content, extra: true } }] },
      { ...v, observations: [{ ...v.observations[0], extra: true }] },
      { ...v, observations: [{ ...v.observations[0], locator: { ...v.observations[0]!.locator, extra: true } }] },
    ]) expect(completionWorkInputV1.safeParse(changed).success).toBe(false);
  });
  it.each(["version", "environment"])("A-03: forged %s refuses with a typed error", field => {
    expect(() => parseCompletionWorkInput({ ...input(), [field]: "production_billing" })).toThrow(EnterpriseLivePromptError);
  });
  it("A-03: malformed identities, hashes, versions and locators refuse", () => {
    const v = input();
    for (const patch of [{ evidenceId: "absent" }, { sha256: "bad" }, { objectVersion: "" },
      { locator: { kind: "text_span", start: -1, end: 9, quote: "vent" } },
      { locator: { kind: "text_span", start: 5.5, end: 9, quote: "vent" } },
      { locator: { kind: "text_span", start: 9, end: 5, quote: "vent" } },
    ]) expect(() => parseCompletionWorkInput({ ...v, observations: [{ ...v.observations[0], ...patch }] })).toThrow(EnterpriseLivePromptError);
  });
  it("A-03: duplicate source/observation/work identities and duplicate terms refuse", () => {
    const v = input();
    for (const changed of [{ ...v, sources: [...v.sources, ...v.sources] }, { ...v, observations: [...v.observations, ...v.observations] },
      { ...v, baseline: { ...v.baseline, workIds: ["door", "door"] } },
      { ...v, recognition: { ...v.recognition, entries: [...v.recognition.entries, ...v.recognition.entries] } },
      { ...v, recognition: { ...v.recognition, entries: [{ workId: "door", terms: ["door", "door"] }] } },
    ]) expect(() => parseCompletionWorkInput(changed)).toThrowError("INVALID_LIVE_PROMPT_INPUT");
  });
  it("A-04: missing, foreign tenant/job, changed hash/version and unresolved spans refuse", () => {
    const v = input();
    for (const changed of [{ ...v, sources: [] },
      ...[{ tenantId: id(9) }, { jobId: id(9) }, { sha256: "c".repeat(64) }, { objectVersion: "v2" }].map(patch => ({ ...v, sources: [{ ...v.sources[0], ...patch }] })),
      { ...v, observations: [{ ...v.observations[0], locator: { kind: "text_span", start: 0, end: 4, quote: "vent" } }] },
      { ...v, observations: [{ ...v.observations[0], locator: { kind: "text_span", start: 5, end: 900, quote: "vent" } }] },
      { ...v, observations: [{ ...v.observations[0], locator: { kind: "photo_tag", tag: "vent" } }] },
    ]) expect(() => parseCompletionWorkInput(changed)).toThrowError("INVALID_LIVE_PROMPT_CITATION");
  });
  it("A-04: photo citations require an existing exact tag and correct source type", () => {
    const v = input(); const photo = { ...v, sources: [{ ...v.sources[0], content: { kind: "completion_photo", tags: ["vent"] } }],
      observations: [{ ...v.observations[0], locator: { kind: "photo_tag", tag: "other" } }] };
    expect(() => parseCompletionWorkInput(photo)).toThrowError("INVALID_LIVE_PROMPT_CITATION");
    expect(() => parseCompletionWorkInput({ ...photo, observations: v.observations })).toThrowError("INVALID_LIVE_PROMPT_CITATION");
  });
  it("A-03: proposal output rejects commercial and identity authority fields, including nested fields", () => {
    const v = input(); const finding = { version: "enterprise-completion-finding.v1", rule: "a", ruleVersion: "completion-work-absence.v1",
      tenantId: v.tenantId, jobId: v.jobId, baseline: v.baseline, recognitionVersion: v.recognition.version,
      observationId: id(6), workId: "vent", citation: v.observations[0] };
    expect(completionWorkFindingV1.safeParse(finding).success).toBe(true);
    for (const field of ["origin", "price", "approval", "fee", "actorId", "grantId", "coalescingKey", "extraId"]) {
      expect(completionWorkFindingV1.safeParse({ ...finding, [field]: true }).success).toBe(false);
      expect(completionWorkFindingV1.safeParse({ ...finding, citation: { ...finding.citation, [field]: true } }).success).toBe(false);
      expect(completionWorkInputV1.safeParse({ ...v, [field]: true }).success).toBe(false);
    }
    expect(completionWorkFindingV1.safeParse({ ...finding, version: "enterprise-prompt-proposal.v1" }).success).toBe(false);
  });
});
