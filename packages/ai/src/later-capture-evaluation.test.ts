import { describe, expect, it } from "vitest";
import { parseCaptureFixture } from "./capture-fixture-parser.js";
import { evaluateCapture, type WalkaroundLabel, type WalkaroundSource } from "./capture-evaluation.js";

const source: WalkaroundSource = { id: "repeated-occurrences", tags: ["synthetic"],
  text: "JOB: Synthetic repeats\nITEM: Fit door | £10.00\nITEM: Fit door | £10.00" };
const label: WalkaroundLabel = { id: source.id, title: "Synthetic repeats",
  lines: [1, 2].map(index => ({ description: "Fit door", pricePence: 1000, quantity: "1", unit: "item", intents: [`door-${index}`] })),
  requiredQuestions: ["Confirm disposal and waste allowance"] };

describe("LATER-B3 capture occurrence coverage", () => {
  it("L002: duplicating occurrence one does not cover occurrence two", () => {
    const output = parseCaptureFixture(source.id, source.text);
    output.lines[1] = structuredClone(output.lines[0]!);
    const result = evaluateCapture(source, label, output, source.id);
    expect(result.passed).toBe(false);
    expect(result.scopeIntentRecall).toEqual({ numerator: 1, denominator: 2 });
    expect(result.errors).toContain("Missing scope: Fit door");
    expect(result.errors).toContain("Unsupported or duplicate scope: Fit door");
  });

  it("L002: valid repeated occurrences still pass in either output order", () => {
    const output = parseCaptureFixture(source.id, source.text);
    for (const lines of [output.lines, [...output.lines].reverse()]) {
      const result = evaluateCapture(source, label, { ...output, lines }, source.id);
      expect(result.passed).toBe(true);
      expect(result.scopeIntentRecall).toEqual({ numerator: 2, denominator: 2 });
      expect(result.errors).toEqual([]);
    }
  });

  it("L002: an omitted occurrence remains visible", () => {
    const output = parseCaptureFixture(source.id, source.text);
    output.lines.pop();
    const result = evaluateCapture(source, label, output, source.id);
    expect(result.passed).toBe(false);
    expect(result.scopeIntentRecall).toEqual({ numerator: 1, denominator: 2 });
  });

  it.each(["wrong source", "wrong version", "out-of-bounds", "uncited", "wrong text"])("L002: unsupported spans cannot earn occurrence recall (%s)", kind => {
    const output = parseCaptureFixture(source.id, source.text);
    const description = output.lines[1]!.description;
    if (kind === "uncited") description.provenance = { kind: "inferred", note: "Synthetic suggestion" };
    else if (description.provenance.kind === "extracted") {
      const span = description.provenance.span;
      if (kind === "wrong source") span.sourceId = "absent";
      if (kind === "wrong version") Object.assign(span, { sourceVersion: 2 });
      if (kind === "out-of-bounds") span.end = source.text.length + 1;
      if (kind === "wrong text") { span.start = 0; span.end = description.value.length; }
    }
    const result = evaluateCapture(source, label, output, source.id);
    expect(result.passed).toBe(false);
    expect(result.scopeIntentRecall).toEqual({ numerator: 1, denominator: 2 });
  });
});
