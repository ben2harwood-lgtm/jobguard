import { describe, expect, it } from "vitest";
import { calculateCompletionWorkFindings } from "./enterprise-live-prompts.js";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function input(term = "new vent") {
  return {
    version: "enterprise-completion-input.v1", environment: "synthetic_demo", tenantId: id(1), jobId: id(2),
    baseline: { workOrderId: id(3), revisionId: id(4), sha256: "a".repeat(64), workIds: ["door"] },
    recognition: { version: "fictional-terms.v1", entries: [
      { workId: "door", terms: ["door", "entrance leaf"] }, { workId: "vent", terms: ["new vent"] },
    ] },
    sources: [{ evidenceId: id(5), tenantId: id(1), jobId: id(2), sha256: "b".repeat(64), objectVersion: "version-1",
      status: "verified", invalidated: false, content: { kind: "completion_note", text: `Done: ${term}` } }],
    observations: [{ observationId: id(6), evidenceId: id(5), sha256: "b".repeat(64), objectVersion: "version-1",
      locator: { kind: "text_span", start: 6, end: 6 + term.length, quote: term } }],
  };
}

describe("ENT-8a released rule (a)", () => {
  it("A-01: absent recognized work produces a cited advisory finding bound to the baseline", () => {
    const value = input(); const [finding] = calculateCompletionWorkFindings(value);
    expect(finding).toEqual({ version: "enterprise-completion-finding.v1", rule: "a", ruleVersion: "completion-work-absence.v1",
      tenantId: id(1), jobId: id(2), baseline: value.baseline, recognitionVersion: "fictional-terms.v1",
      observationId: id(6), workId: "vent", citation: value.observations[0] });
  });
  it.each(["door", "entrance leaf"])("A-02: instructed work or an explicit ordered synonym stays silent (%s)", term => {
    expect(calculateCompletionWorkFindings(input(term))).toEqual([]);
  });
  it("A-02: unsupported and ambiguous terms stay silent", () => {
    expect(calculateCompletionWorkFindings(input("possibly ventilation"))).toEqual([]);
    const value = input(); value.recognition.entries.push({ workId: "another-vent", terms: ["new vent"] });
    expect(calculateCompletionWorkFindings(value)).toEqual([]);
  });
  it.each(["upload_pending", "quarantined", "rejected", "superseded"])("A-02: unknown source status %s cannot assert absent work", status => {
    const value = input(); value.sources[0]!.status = status;
    expect(calculateCompletionWorkFindings(value)).toEqual([]);
  });
  it("A-02: invalidated evidence cannot assert absent work", () => {
    const value = input(); value.sources[0]!.invalidated = true;
    expect(calculateCompletionWorkFindings(value)).toEqual([]);
  });
  it("A-01: completion photo tags resolve against exact supplied tags", () => {
    const value = input();
    const photo = { ...value, sources: [{ ...value.sources[0], content: { kind: "completion_photo", tags: ["new vent"] } }],
      observations: [{ ...value.observations[0], locator: { kind: "photo_tag", tag: "new vent" } }] };
    expect(calculateCompletionWorkFindings(photo).map(f => f.workId)).toEqual(["vent"]);
  });
  it("A-01: ordering is deterministic without assigning coalescing identities or mutating inputs", () => {
    const value = input(); value.observations.push({ ...value.observations[0]!, observationId: id(7) });
    const before = JSON.stringify(value); const forward = calculateCompletionWorkFindings(value);
    expect(calculateCompletionWorkFindings({ ...value, observations: [...value.observations].reverse() })).toEqual(forward);
    expect(forward.map(f => f.observationId)).toEqual([id(6), id(7)]);
    expect(JSON.stringify(value)).toBe(before);
    for (const finding of forward) for (const field of ["coalescingKey", "origin", "price", "approval", "fee", "extraId"]) expect(finding).not.toHaveProperty(field);
  });
  it("A-02: an incomplete recognition vocabulary for instructed work refuses rather than asserting absence", () => {
    const value = input(); value.baseline.workIds.push("unknown-work");
    expect(() => calculateCompletionWorkFindings(value)).toThrowError("INVALID_LIVE_PROMPT_INPUT");
  });
});
