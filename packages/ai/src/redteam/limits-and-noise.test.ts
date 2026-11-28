import { describe, expect, it } from "vitest";
import { CAPTURE_CONTRACT_VERSION, captureRequestV1 } from "@jobguard/core";
import { CaptureFixtureError, parseCaptureFixture } from "../capture-fixture-parser.js";
import { extractCaptureFixture } from "../capture.js";
import { readSpokenJob } from "../context-reader.js";

const id = "00000000-0000-4000-8000-000000000001";
const request = (text: string, local: boolean) => ({
  contractVersion: CAPTURE_CONTRACT_VERSION, requested_tenant_id: id, captureId: id,
  fixtureId: "rt06-boundary",
  source: local ? { kind: "browser_local_transcript", text, acquisition: {
    contractVersion: "browser_local_dictation_v1", language: "en-GB", processLocally: true,
    audioUploaded: false, audioStored: false, rawFinalText: text, humanEdited: false,
  } } : { kind: "text", text },
});

// Empty sources cannot enter the corpus's nonempty transcript schema. These are
// contract/parser checks, not a claim about UI messages or persisted source bytes.
describe("RT-06 capture boundaries and source fidelity", () => {
  it.each(["", " ", "\t", "\r\n", "\u00a0", "\u202f", " \t\r\n "])(
    "refuses empty/silent source %j through the typed capture error", text => {
      expect(() => parseCaptureFixture(id, text)).toThrow(CaptureFixtureError);
      expect(() => parseCaptureFixture(id, text)).toThrow("INVALID_FIXTURE_SOURCE");
    });
  for (const local of [false, true]) {
    it.each([49_999, 50_000, 50_001])(`checks the original length for ${local ? "local speech" : "text"}: %i`, length => {
      const text = "Fit the latch for £25.".padEnd(length, " ");
      const result = captureRequestV1.safeParse(request(text, local));
      expect(result.success).toBe(length <= 50_000);
      if (!result.success) expect(result.error.issues).toContainEqual(expect.objectContaining({
        code: "too_big", maximum: 50_000, path: ["source", "text"],
      }));
      if (length > 50_000) expect(() => parseCaptureFixture(id, text)).toThrow("INVALID_FIXTURE_SOURCE");
      else expect(parseCaptureFixture(id, text).lines[0]!.unitPricePence.value).toBe(2500);
    });
    it(`refuses an empty ${local ? "local speech" : "text"} request`, () => {
      expect(captureRequestV1.safeParse(request("", local)).success).toBe(false);
    });
  }
  it("checks raw local recognition length independently of the edited text", () => {
    const value = request("Fit the latch", true);
    if (value.source.kind !== "browser_local_transcript") throw new Error("Wrong test request");
    value.source.acquisition!.rawFinalText = "a".repeat(50_001);
    expect(captureRequestV1.safeParse(value).success).toBe(false);
  });
  it.each([100, 101])("keeps %i distinct items or returns a typed cap refusal without a partial result", count => {
    const text = Array.from({ length: count }, (_, n) => `Fit panel tagged P${n} for £10.`).join(" ");
    for (const read of [parseCaptureFixture, readSpokenJob]) {
      if (count === 101) expect(() => read(id, text)).toThrow("FIXTURE_STRUCTURE_REQUIRED");
      else expect(read(id, text).lines).toHaveLength(count);
    }
  });
  it.each(["Łukasz", "Siân", "A\u0301ine", "🔔", "A\x00B", "A\ud800B", "A\udfffB"])(
    "keeps original source code units and citations through the fixture gateway: %j", async label => {
      const text = `Fit the plaque labelled ${label} for £35.`;
      const requestText = captureRequestV1.parse(request(text, false)).source.text;
      expect(requestText).toBe(text);
      const capture = await extractCaptureFixture(id, requestText, "rt06-unicode");
      for (const output of [capture, readSpokenJob(id, requestText)]) {
        const field = output.lines[0]!.description;
        expect(field.value).toContain(label);
        expect(field.provenance.kind).toBe("extracted");
        if (field.provenance.kind === "extracted") {
          const { start, end } = field.provenance.span;
          expect(requestText.slice(start, end)).toBe(field.value);
        }
      }
    });
});
