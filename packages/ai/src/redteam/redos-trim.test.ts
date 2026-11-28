import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { readSpokenJob } from "../context-reader.js";

describe("RT-FIX-1 description trimming", () => {
  it("reads 24 and 5,000 spaces followed by x in under 50 ms each", () => {
    readSpokenJob("warmup", "Paint walls for 200");
    // Fail on the short attack first, before attempting the much larger input.
    for (const spaces of [24, 5_000]) {
      const text = `Paint walls${" ".repeat(spaces)}x`;
      const start = performance.now();
      const job = readSpokenJob("redos", text);
      const elapsedMs = performance.now() - start;
      expect(elapsedMs, `${spaces} spaces followed by x`).toBeLessThan(50);
      expect(job.lines[0]!.description.value).toBe(text.slice(0, 500));
    }
  });

  it.each([
    ["Paint walls for 200", "Paint walls"],
    ["Paint walls at 200", "Paint walls"],
    ["Paint walls FOR AT for 200", "Paint walls"],
    ["Paint walls\tfor\u00a0AT 200", "Paint walls"],
    ["Paint walls for at", "Paint walls"],
    ["Paint walls format for 200", "Paint walls format"],
    ["Paint walls atfor 200", "Paint walls atfor 200"],
    ["Paint walls x", "Paint walls x"],
  ])("preserves the description and citation for %j", (text, description) => {
    const job = readSpokenJob("trim", text);
    expect(job.lines).toHaveLength(1);
    expect(job.lines[0]!.description).toEqual({
      value: description,
      provenance: { kind: "extracted", span: {
        sourceId: "trim", sourceVersion: 1, start: 0, end: description.length,
      } },
    });
  });
});
