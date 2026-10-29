import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AiGatewayError, AiGateway, FixtureAiProvider, createLiveAiProvider } from "./index.js";

const hash = "a".repeat(64);
const request = {
  contractVersion: "ai_gateway_request_v1",
  fixtureId: "valid",
  operation: "capture",
  promptVersion: "capture_prompt_v1",
  schemaVersion: "capture_result_v1",
  sources: [{ id: "walkaround", content: "Fit five doors. Rate unknown.", sha256: hash }],
  timeoutMs: 1_000,
  maxOutputTokens: 500,
} as const;
const outputSchema = z.object({ item: z.string(), ratePence: z.null() });

describe("fixture-only AI gateway", () => {
  it("returns validated fixture output, citations, zero cost, and provenance", async () => {
    const gateway = new AiGateway(new FixtureAiProvider({
      valid: { output: { item: "doors", ratePence: null }, citations: [{ sourceId: "walkaround", start: 4, end: 14 }] },
    }));
    await expect(gateway.generate(request, outputSchema)).resolves.toMatchObject({
      output: { item: "doors", ratePence: null }, costPence: 0, repairAttempts: 0,
      provenance: { provider: "recorded-fixture", deployment: "local-only", sourceHashes: { walkaround: hash } },
    });
  });

  it("rejects missing and out-of-bounds citation sources", async () => {
    const gateway = new AiGateway(new FixtureAiProvider({
      valid: { output: { item: "doors", ratePence: null }, citations: [{ sourceId: "other", start: 0, end: 2 }] },
    }));
    await expect(gateway.generate(request, outputSchema)).rejects.toMatchObject({ code: "invalid_citation" });
  });

  it("permits at most one bounded structured-output repair", async () => {
    const repair = vi.fn(() => ({ item: "doors", ratePence: null }));
    const gateway = new AiGateway(new FixtureAiProvider({ valid: { output: { item: 3 }, citations: [] } }));
    await expect(gateway.generate(request, outputSchema, { repair })).resolves.toMatchObject({ repairAttempts: 1 });
    expect(repair).toHaveBeenCalledOnce();
  });

  it("returns a typed error after one unsuccessful repair", async () => {
    const repair = vi.fn((value) => value);
    const gateway = new AiGateway(new FixtureAiProvider({ valid: { output: { item: 3 }, citations: [] } }));
    await expect(gateway.generate(request, outputSchema, { repair })).rejects.toMatchObject({ code: "invalid_output" });
    expect(repair).toHaveBeenCalledOnce();
  });

  it("fails closed for unknown fixtures, cancellation, and the future live seam", async () => {
    const gateway = new AiGateway(new FixtureAiProvider({}));
    await expect(gateway.generate(request, outputSchema)).rejects.toMatchObject({ code: "fixture_not_found" });
    const controller = new AbortController(); controller.abort();
    await expect(gateway.generate(request, outputSchema, { signal: controller.signal })).rejects.toMatchObject({ code: "cancelled" });
    expect(() => createLiveAiProvider()).toThrowError(AiGatewayError);
    expect(() => createLiveAiProvider()).toThrow(/D04/);
  });

  it.each([
    { tenantId: "tenant-a", sources: request.sources },
    { sources: [{ ...request.sources[0], tenantId: "tenant-a" }] },
    ...["shadow", "hidden", "pre_lock", "pre-lock"].map(visibility => ({
      sources: [{ ...request.sources[0], visibility }],
    })),
    { tenantId: "tenant-a", sources: [{ ...request.sources[0], tenantId: "tenant-b" }] },
  ])("rejects restricted or inconsistently scoped sources for any provider %#", async override => {
    const execute = vi.fn();
    const repair = vi.fn();
    await expect(new AiGateway({ kind: "fixture", execute }).generate(
      { ...request, ...override }, outputSchema, { repair },
    )).rejects.toMatchObject({ code: "invalid_request", message: "AI source is not permitted" });
    expect(execute).not.toHaveBeenCalled();
    expect(repair).not.toHaveBeenCalled();
  });

  it("rejects malformed requests before provider execution", async () => {
    const execute = vi.fn();
    const gateway = new AiGateway({ kind: "fixture", execute });
    await expect(gateway.generate({ ...request, timeoutMs: 0 }, outputSchema)).rejects.toMatchObject({ code: "invalid_request" });
    expect(execute).not.toHaveBeenCalled();
  });
});
