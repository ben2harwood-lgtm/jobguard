import { performance } from "node:perf_hooks";
import { describe, expect, it, test } from "vitest";
import { readSpokenJob } from "../context-reader.js";

describe("RT-FIX-1 description trimming", () => {
  it("reads 24 spaces followed by x in under 50 ms", () => {
    readSpokenJob("warmup", "Paint walls for 200");
    const text = `Paint walls${" ".repeat(24)}x`;
    const start = performance.now();
    const job = readSpokenJob("redos", text);
    const elapsedMs = performance.now() - start;
    expect(elapsedMs, "24 spaces followed by x").toBeLessThan(50);
    expect(job.lines[0]!.description.value).toBe(text.slice(0, 500));
  });

  test.fails("F-009 other regexes slow on 5,000 spaces (open, lane RT-06)", () => {
    const text = `Paint walls${" ".repeat(5_000)}x`;
    const start = performance.now();
    readSpokenJob("redos", text);
    const elapsedMs = performance.now() - start;
    expect(elapsedMs, "5,000 spaces followed by x").toBeLessThan(50);
  });

  it("reads 5,000 spaces followed by x in under 2,000 ms", () => {
    const text = `Paint walls${" ".repeat(5_000)}x`;
    const start = performance.now();
    const job = readSpokenJob("redos", text);
    const elapsedMs = performance.now() - start;
    expect(elapsedMs, "5,000 spaces followed by x").toBeLessThan(2_000);
    expect(job.lines[0]!.description.value).toBe(text.slice(0, 500));
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
