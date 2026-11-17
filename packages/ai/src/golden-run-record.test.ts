import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { runCaptureEvaluation } from "./evaluation-runner.js";
import { createGoldenRunRecord, GOLDEN_TARGETS, verifyGoldenRunRecord } from "./golden-run-record.js";
import { createLiveAiProvider } from "./fixture-provider.js";
import { liveEvaluationMain } from "./live-evaluation-cli.js";

describe("fixture golden-run gate", () => {
  let report: Awaited<ReturnType<typeof runCaptureEvaluation>>;
  let recorded: Awaited<ReturnType<typeof createGoldenRunRecord>>;
  beforeAll(async () => {
    report = await runCaptureEvaluation();
    recorded = JSON.parse(await readFile(new URL("../../../docs/fixtures/ai/golden-run.v1.json", import.meta.url), "utf8"));
  });
  it("matches the checked-in record and retains counts, provenance and per-case failures", async () => {
    await expect(verifyGoldenRunRecord(report, recorded)).resolves.toBeUndefined();
    expect(recorded.deployment).toEqual({ provider: "recorded-fixture", model: "fixture-v1", deployment: "local-only" });
    expect(recorded.costPence).toBe(0);
    expect(recorded.releaseDecision).toBe("NOT_AUTHORIZED");
    expect(recorded.results).toHaveLength(32);
    expect(recorded.targets).toEqual(GOLDEN_TARGETS);
    const failed = await createGoldenRunRecord(await runCaptureEvaluation("money"));
    expect(failed.status).toBe("FAIL");
    expect(failed.results[0]!.errors).toContain("Scope 0: unsupported monetary fact");
    await expect(verifyGoldenRunRecord(await runCaptureEvaluation("money"), recorded)).rejects.toThrow();
  });
  it.each(["scopeIntentRecallPercent", "validCitationsPercent", "unsupportedMonetaryFacts", "designatedAmbiguities"] as const)(
    "rejects weakening %s even if both report and record are edited", async key => {
      const changed = structuredClone(report);
      Object.assign(changed.targets, { [key]: key === "designatedAmbiguities" ? "SOME" : key === "unsupportedMonetaryFacts" ? 1 : 90 });
      await expect(createGoldenRunRecord(changed)).rejects.toThrow("Invalid fixture golden run");
    });
  it("pins the proposed targets independently of record generation", () => {
    expect(GOLDEN_TARGETS).toMatchObject({ scopeIntentRecallPercent: 95, unsupportedMonetaryFacts: 0,
      validCitationsPercent: 100, designatedAmbiguities: "ALL" });
  });
  it("rejects empty predictions, zero denominators and duplicate cases", async () => {
    for (const mutate of [
      (r: typeof report) => { r.results = []; },
      (r: typeof report) => { r.results[0]!.output.lines = []; },
      (r: typeof report) => { r.results[0]!.scopeIntentRecall.denominator = 0; },
      (r: typeof report) => { r.results[1] = structuredClone(r.results[0]!); },
    ]) {
      const changed = structuredClone(report); mutate(changed);
      await expect(createGoldenRunRecord(changed)).rejects.toThrow();
    }
  });
  it.each(["fixtureRoute", "prompt", "parser", "schema"] as const)("requires a new record after a %s change", async key => {
    const changed = structuredClone(report); Object.assign(changed.versions, { [key]: "changed" });
    await expect(verifyGoldenRunRecord(changed, recorded)).rejects.toThrow("Golden run changed");
  });
  it("rejects stale implementation bytes even if versions did not change", async () => {
    const stale = structuredClone(recorded);
    stale.implementationSha256["packages/core/src/capture.ts"] = "0".repeat(64);
    await expect(verifyGoldenRunRecord(report, stale)).rejects.toThrow("Golden run changed");
  });
  it("refuses live execution while D04 is unapproved and never calls fetch", () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    try {
      expect(createLiveAiProvider).toThrow(/D04/u);
      let output = "";
      expect(liveEvaluationMain(text => { output += text; })).toBe(1);
      expect(JSON.parse(output)).toMatchObject({ status: "BLOCKED", costPence: 0, releaseDecision: "NOT_AUTHORIZED" });
      expect(fetch).not.toHaveBeenCalled();
    } finally { fetch.mockRestore(); }
  });
});
