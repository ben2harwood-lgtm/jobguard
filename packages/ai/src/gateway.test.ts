import { fixtureAiSession } from "./testing.js";
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AiGatewayError, AiGateway, FixtureAiProvider, createLiveAiProvider } from "./index.js";

const hashContent = (content: string) => createHash("sha256").update(content, "utf8").digest("hex");
const hash = hashContent("Fit five doors. Rate unknown.");
const request = {
  contractVersion: "ai_gateway_request_v1",
  fixtureId: "valid",
  operation: "capture",
  promptVersion: "capture_prompt_v1",
  schemaVersion: "capture_result_v1",
  sources: [{ tenantId: "tenant-a", visibility: "public", id: "walkaround", content: "Fit five doors. Rate unknown.", sha256: hash }],
  timeoutMs: 1_000,
  maxOutputTokens: 500,
} as const;
const outputSchema = z.object({ item: z.string(), ratePence: z.null() });

describe("fixture-only AI gateway", () => {
  it("returns validated fixture output, citations, zero cost, and provenance", async () => {
    const gateway = new AiGateway(new FixtureAiProvider({
      valid: { output: { item: "doors", ratePence: null }, citations: [{ sourceId: "walkaround", start: 4, end: 14 }] },
    }), fixtureAiSession);
    await expect(gateway.generate(request, outputSchema)).resolves.toMatchObject({
      output: { item: "doors", ratePence: null }, costPence: 0, repairAttempts: 0,
      provenance: { provider: "recorded-fixture", deployment: "local-only", sourceHashes: { walkaround: hash } },
    });
  });

  it.each([
    { sourceId: "other", start: 0, end: 2 },
    { sourceId: "walkaround", start: 0, end: request.sources[0].content.length + 1 },
  ])("rejects missing and out-of-bounds citation sources %#", async citation => {
    const gateway = new AiGateway(new FixtureAiProvider({
      valid: { output: { item: "doors", ratePence: null }, citations: [citation] },
    }), fixtureAiSession);
    await expect(gateway.generate(request, outputSchema)).rejects.toMatchObject({ code: "invalid_citation" });
  });

  it.each([
    { name: "wrong-content hash", sources: [{ ...request.sources[0], sha256: hashContent("Different private content") }] },
    { name: "identical duplicate ids", sources: [request.sources[0], request.sources[0]] },
    { name: "different-content duplicate ids", sources: [request.sources[0], {
      ...request.sources[0], content: "Different private content", sha256: hashContent("Different private content"),
    }] },
    { name: "normalized line endings", sources: [{ ...request.sources[0], content: "Fit\r\ndoors", sha256: hashContent("Fit\ndoors") }] },
    { name: "normalized Unicode", sources: [{ ...request.sources[0], content: "Cafe\u0301", sha256: hashContent("Café") }] },
  ])("rejects invalid source provenance before provider or repair: $name", async ({ sources }) => {
    const provider = new FixtureAiProvider({ valid: { output: { item: 3 }, citations: [] } });
    const execute = vi.spyOn(provider, "execute");
    const repair = vi.fn(() => ({ item: "doors", ratePence: null }));
    const error = await new AiGateway(provider, fixtureAiSession).generate(
      { ...request, sources }, outputSchema, { repair },
    ).catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(AiGatewayError);
    expect(error).toMatchObject({ code: "invalid_request", message: "Invalid AI source provenance" });
    expect(error).not.toHaveProperty("cause");
    expect(String(error)).toBe("AiGatewayError: Invalid AI source provenance");
    expect(JSON.stringify(error)).toBe(JSON.stringify(new AiGatewayError("invalid_request", "Invalid AI source provenance")));
    expect(execute).not.toHaveBeenCalled();
    expect(repair).not.toHaveBeenCalled();
  });

  it("preserves exact hashes and citations for distinct sources, shared content, empty content and UTF-8", async () => {
    const sources = [
      request.sources[0],
      { ...request.sources[0], id: "same-content" },
      ...["", "Café 🛠️\nFit doors", "Cafe\u0301\r\nFit doors"].map((content, index) => ({
        ...request.sources[0], id: `source-${index}`, content, sha256: hashContent(content),
      })),
    ];
    // Citation offsets remain UTF-16 code units; hashes cover exact UTF-8 bytes.
    const citations = sources.filter(source => source.content.length > 0).map(source => ({
      sourceId: source.id, start: 0, end: source.content.length,
    }));
    const provider = new FixtureAiProvider({ valid: { output: { item: "doors", ratePence: null }, citations } });
    const execute = vi.spyOn(provider, "execute");
    const result = await new AiGateway(provider, fixtureAiSession).generate({ ...request, sources }, outputSchema);
    expect(result.citations).toEqual(citations);
    expect(result.provenance.sourceHashes).toEqual(Object.fromEntries(sources.map(source => [source.id, source.sha256])));
    expect(execute).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ sources }), undefined);
  });

  it("permits at most one bounded structured-output repair", async () => {
    const repair = vi.fn(() => ({ item: "doors", ratePence: null }));
    const gateway = new AiGateway(new FixtureAiProvider({ valid: { output: { item: 3 }, citations: [] } }), fixtureAiSession);
    await expect(gateway.generate(request, outputSchema, { repair })).resolves.toMatchObject({ repairAttempts: 1 });
    expect(repair).toHaveBeenCalledOnce();
  });

  it("returns a typed error after one unsuccessful repair", async () => {
    const repair = vi.fn((value) => value);
    const gateway = new AiGateway(new FixtureAiProvider({ valid: { output: { item: 3 }, citations: [] } }), fixtureAiSession);
    await expect(gateway.generate(request, outputSchema, { repair })).rejects.toMatchObject({ code: "invalid_output" });
    expect(repair).toHaveBeenCalledOnce();
  });

  it("fails closed for unknown fixtures, cancellation, and the future live seam", async () => {
    const gateway = new AiGateway(new FixtureAiProvider({}), fixtureAiSession);
    await expect(gateway.generate(request, outputSchema)).rejects.toMatchObject({ code: "fixture_not_found" });
    const controller = new AbortController(); controller.abort();
    await expect(gateway.generate(request, outputSchema, { signal: controller.signal })).rejects.toMatchObject({ code: "cancelled" });
    expect(() => createLiveAiProvider()).toThrowError(AiGatewayError);
    expect(() => createLiveAiProvider()).toThrow(/D04/);
  });

  it.each([
    { sources: [{ id: "walkaround", content: request.sources[0].content, sha256: hash }] },
    { sources: [{ ...request.sources[0], tenantId: undefined }] },
    { sources: [{ ...request.sources[0], visibility: undefined }] },
    ...["shadow", "hidden", "pre_lock", "pre-lock"].map(visibility => ({
      sources: [{ ...request.sources[0], visibility }],
    })),
    { sources: [{ ...request.sources[0], tenantId: "tenant-b" }] },
    { tenantId: "tenant-a", sources: [{ ...request.sources[0], tenantId: "tenant-b" }] },
    { tenantId: "tenant-b", sources: [{ ...request.sources[0], tenantId: "tenant-b" }] },
    { tenantId: "tenant-b", sources: request.sources },
  ])("rejects restricted or inconsistently scoped sources for any provider %#", async override => {
    const execute = vi.fn();
    const repair = vi.fn();
    await expect(new AiGateway({ kind: "fixture", execute }, fixtureAiSession).generate(
      { ...request, ...override }, outputSchema, { repair },
    )).rejects.toMatchObject({ code: "invalid_request", message: "AI source is not permitted" });
    expect(execute).not.toHaveBeenCalled();
    expect(repair).not.toHaveBeenCalled();
  });

  it.each([undefined, () => null, () => ({ tenantId: "" }),
    () => { throw new Error("revoked session"); }])("refuses absent or invalid session authority %#", async session => {
    const execute = vi.fn();
    const repair = vi.fn();
    await expect(new AiGateway({ kind: "fixture", execute }, session).generate(
      { ...request, tenantId: "tenant-a" }, outputSchema, { repair },
    )).rejects.toMatchObject({ code: "invalid_request", message: "AI session is not permitted" });
    expect(execute).not.toHaveBeenCalled();
    expect(repair).not.toHaveBeenCalled();
  });

  it("passes the verified session tenant to the provider without a request tenant", async () => {
    const provider = new FixtureAiProvider({ valid: { output: { item: "doors", ratePence: null }, citations: [] } });
    const execute = vi.spyOn(provider, "execute");
    const session = vi.fn(async () => ({ tenantId: "tenant-a" }));
    await new AiGateway(provider, session).generate(request, outputSchema);
    expect(session).toHaveBeenCalledExactlyOnceWith();
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-a" }), undefined);
  });

  it("rechecks session authority on every call", async () => {
    const provider = new FixtureAiProvider({ valid: { output: { item: "doors", ratePence: null }, citations: [] } });
    const execute = vi.spyOn(provider, "execute");
    const session = vi.fn<() => { tenantId: string } | null>().mockReturnValueOnce({ tenantId: "tenant-a" }).mockReturnValue(null);
    const gateway = new AiGateway(provider, session);
    await gateway.generate(request, outputSchema);
    await expect(gateway.generate(request, outputSchema)).rejects.toMatchObject({ code: "invalid_request" });
    expect(execute).toHaveBeenCalledOnce();
  });

  it("rejects malformed requests before provider execution", async () => {
    const execute = vi.fn();
    const gateway = new AiGateway({ kind: "fixture", execute }, fixtureAiSession);
    await expect(gateway.generate({ ...request, timeoutMs: 0 }, outputSchema)).rejects.toMatchObject({ code: "invalid_request" });
    expect(execute).not.toHaveBeenCalled();
  });

  it.each([
    "https://example.invalid/one-time-link?token=secret",
    "session-secret", "csrf-secret", "refresh-secret",
    "jane@example.invalid", "+44 7700 900123", "Jane Synthetic Customer",
  ])("does not echo private fixture/source identifiers or validation keys: %s", async privateValue => {
    const missingFixture = await new FixtureAiProvider({}).execute({ ...request, sources: [...request.sources], fixtureId: privateValue }).catch(error => error);
    expect(missingFixture).toMatchObject({ code: "fixture_not_found", message: "Unknown AI fixture" });
    const gateway = new AiGateway(new FixtureAiProvider({
      valid: { output: { item: "doors", ratePence: null }, citations: [{ sourceId: privateValue, start: 0, end: 2 }] },
    }), fixtureAiSession);
    await expect(gateway.generate(request, outputSchema)).rejects.toMatchObject({ code: "invalid_citation", message: "Citation is outside source bounds" });
    const invalidRequest = await gateway.generate({ ...request, timeoutMs: 0 }, outputSchema).catch(error => error);
    expect(invalidRequest).toMatchObject({ code: "invalid_request", message: "Invalid AI request" });
    expect(invalidRequest.cause).toBeUndefined();
    expect(String(invalidRequest)).not.toContain(privateValue);
    const invalidOutput = await new AiGateway(new FixtureAiProvider({
      valid: { output: { item: "doors", ratePence: null, [privateValue]: true }, citations: [] },
    }), fixtureAiSession).generate(request, outputSchema.strict()).catch(error => error);
    expect(invalidOutput).toMatchObject({ code: "invalid_output", message: "Invalid structured AI output" });
    expect(invalidOutput.cause).toBeUndefined();
    expect(String(invalidOutput)).not.toContain(privateValue);
    const providerFailure = await new AiGateway({ kind: "fixture", execute: async () => { throw new Error(privateValue); } }, fixtureAiSession)
      .generate(request, outputSchema).catch(error => error);
    expect(providerFailure).toMatchObject({ code: "invalid_provider_response", message: "AI provider failed" });
    expect(providerFailure.cause).toBeUndefined();
    const typedFailure = await new AiGateway({ kind: "fixture", execute: async () => {
      throw new AiGatewayError("invalid_output", privateValue, { cause: new Error(privateValue) });
    } }, fixtureAiSession).generate(request, outputSchema).catch(error => error);
    expect(typedFailure).toMatchObject({ code: "invalid_output", message: "AI provider failed" });
    expect(typedFailure.cause).toBeUndefined();
  });
});
