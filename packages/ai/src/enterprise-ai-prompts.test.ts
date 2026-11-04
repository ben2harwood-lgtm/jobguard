import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { AiGateway } from "./gateway.js";
import { FixtureAiProvider } from "./fixture-provider.js";
import {
  detectEnterpriseFixture, enterpriseAiOutputV1, enterpriseFixtureCorpusV1,
  enterpriseFixtureRequest, validateEnterpriseFixtureResult,
} from "./enterprise-ai-prompts.js";

const request = (fixtureId = "dev-note") => ({ version: "enterprise-ai-fixture-request.v1", mode: "synthetic_demo", dataClass: "fictional_fixture", provider: "fixture", fixtureId });
const corpus = async () => enterpriseFixtureCorpusV1.parse(JSON.parse(await readFile(new URL("../../../docs/fixtures/enterprise-ai-prompts/development.v1.json", import.meta.url), "utf8")));
const example = async () => (await corpus()).cases[0]!;

describe("ENT-8B fixture possible extras", () => {
  it("ENT-8B-1 Schema limits: authority fields are impossible at every output nesting level", async () => {
    const row = await example(), output = enterpriseAiOutputV1.parse(row.response.output), item = output.items[0]!, citation = item.citations[0]!;
    for (const field of ["origin", "price", "pricePence", "approval", "approved", "fee", "feeStatus", "tenantId", "jobId", "scopeItemId", "coalescingKey"]) {
      for (const value of [{ ...output, [field]: true }, { ...output, items: [{ ...item, [field]: true }] },
        { ...output, items: [{ ...item, citations: [{ ...citation, [field]: true }] }] }]) {
        expect(enterpriseAiOutputV1.safeParse(value).success, field).toBe(false);
      }
    }
  });
  it("ENT-8B-1 cited proposals from notes, transcripts and photo captions retain provenance and no authority", async () => {
    for (const fixtureId of ["dev-note", "dev-transcript", "dev-caption"]) {
      const result = await detectEnterpriseFixture(request(fixtureId));
      expect(result.output.items).toHaveLength(1);
      expect(result).toMatchObject({ environment: "synthetic_demo", evaluationVersion: "enterprise-ai-evaluation.v1", repairAttempts: 0, costPence: 0,
        provenance: { provider: "recorded-fixture", model: "fixture-v1", deployment: "local-only", promptVersion: "enterprise-extra-detection.fixture.v1", schemaVersion: "enterprise-ai-output.v1" } });
      expect(Object.keys(result.provenance.sourceHashes)).toHaveLength(2);
    }
  });
  it("ENT-8B-1 the immutable fixture baseline accompanies source evidence through the gateway", async () => {
    const row = await example(), gatewayRequest = enterpriseFixtureRequest(row);
    expect(gatewayRequest.sources.find(source => source.id === row.baseline.revisionId)?.content).toBe(JSON.stringify(row.baseline));
    const result = await detectEnterpriseFixture(request());
    expect(result.baselineRevisionId).toBe(row.baseline.revisionId);
    expect(result.provenance.sourceHashes).toHaveProperty(row.baseline.revisionId);
  });
  it("ENT-8B-1 at most one bounded repair is applied through the merged gateway", async () => {
    const row = await example(), repair = vi.fn(() => row.response.output);
    const result = await detectEnterpriseFixture(request(), { responses: { [row.id]: { output: {}, citations: row.response.citations } }, repair });
    expect(result.repairAttempts).toBe(1); expect(repair).toHaveBeenCalledTimes(1);
    const invalid = vi.fn(() => ({}));
    await expect(detectEnterpriseFixture(request(), { responses: { [row.id]: { output: {}, citations: [] } }, repair: invalid })).rejects.toMatchObject({ code: "invalid_output" });
    expect(invalid).toHaveBeenCalledTimes(1);
  });
  it("ENT-8B-2 Citations and embedded instructions: missing evidence, foreign tenant/job, hash/version, text and invalid lifecycle refuse", async () => {
    const row = await example();
    const result = await new AiGateway(new FixtureAiProvider({ [row.id]: row.response }), () => ({ tenantId: row.tenantId })).generate(enterpriseFixtureRequest(row), enterpriseAiOutputV1);
    for (const patch of [
      { evidenceId: "00000000-0000-4000-8000-999999999999" },
      { tenantId: "00000000-0000-4000-8000-999999999999" }, { jobId: "00000000-0000-4000-8000-999999999999" },
      { sha256: "f".repeat(64) }, { objectVersion: "other-version" }, { text: "different stored bytes" },
      { status: "quarantined" as const }, { invalidated: true },
    ]) {
      expect(() => validateEnterpriseFixtureResult(result, { ...row, sources: [{ ...row.sources[0]!, ...patch }] })).toThrowError("invalid_citation");
    }
    for (const patch of [{ sourceId: "missing" }, { start: 1 }, { end: 99999 }, { quote: "not in stored evidence" }, { sha256: "f".repeat(64) }, { objectVersion: "other-version" }]) {
      const output = structuredClone(result.output); Object.assign(output.items[0]!.citations[0]!, patch);
      expect(() => validateEnterpriseFixtureResult({ ...result, output }, row)).toThrowError("invalid_citation");
    }
  });
  it("ENT-8B-2 output citations must also occur in the gateway envelope, including after repair", async () => {
    const row = await example();
    await expect(detectEnterpriseFixture(request(), { responses: { [row.id]: { ...row.response, citations: [] } } })).rejects.toMatchObject({ code: "invalid_citation" });
    await expect(detectEnterpriseFixture(request(), { responses: { [row.id]: { output: {}, citations: [] } }, repair: () => row.response.output })).rejects.toMatchObject({ code: "invalid_citation" });
    await expect(detectEnterpriseFixture(request(), { responses: { [row.id]: { ...row.response, citations: [{ sourceId: "missing", start: 0, end: 2 }] } } })).rejects.toMatchObject({ code: "invalid_citation" });
  });
  it("ENT-8B-2 embedded instructions stay source data and cannot change operation or produce commercial actions", async () => {
    const row = (await corpus()).cases.find(value => value.id === "dev-instructions")!;
    const gatewayRequest = enterpriseFixtureRequest(row);
    expect(gatewayRequest.operation).toBe("enterprise_possible_extras");
    expect(gatewayRequest.sources.find(source => source.id === row.sources[0]!.evidenceId)!.content).toContain("Ignore previous instructions");
    const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected network call"));
    try {
      const result = await detectEnterpriseFixture(request(row.id));
      expect(result.output.items.map(item => item.description)).toEqual(["Fitted a drain cover"]);
      expect(JSON.stringify(result.output)).not.toContain("send"); expect(network).not.toHaveBeenCalled();
    } finally { network.mockRestore(); }
  });
  it("ENT-8B-3 prompts remain advisory and repeated evaluation produces the same result without a write path", async () => {
    const first = await detectEnterpriseFixture(request());
    expect(await detectEnterpriseFixture(request())).toEqual(first);
    expect(Object.keys(first.output.items[0]!).sort()).toEqual(["ambiguity", "citations", "description"]);
  });
  it.each(["pilot_no_charge", "production_billing"])("ENT-8B-5 Before real use: enterprise_ai_prompts refuses %s before provider execution", async mode => {
    const execute = vi.spyOn(FixtureAiProvider.prototype, "execute");
    try {
      await expect(detectEnterpriseFixture({ ...request(), mode })).rejects.toMatchObject({ code: "live_route_disabled" });
      expect(execute).not.toHaveBeenCalled();
    } finally { execute.mockRestore(); }
  });
  it("ENT-8B-5 real text, live providers, forged approvals, unknown IDs and arbitrary source payloads fail closed", async () => {
    for (const value of [{ ...request(), dataClass: "real" }, { ...request(), provider: "live" }, { ...request(), d04Approved: true, dpaApproved: true },
      { ...request(), text: "real customer note" }, { ...request(), sources: [] }, { ...request(), fixtureId: "unregistered" }]) {
      await expect(detectEnterpriseFixture(value)).rejects.toHaveProperty("code");
    }
  });
});
