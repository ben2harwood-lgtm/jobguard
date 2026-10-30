import { fixtureAiSession } from "./fixture-provider.js";
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { jobRecordProposalV1, parseObservation, sha256, type JobRecordProposal } from "@jobguard/core";
import { AiGateway } from "./gateway.js";
import { AiGatewayError } from "./errors.js";
import { FixtureAiProvider } from "./fixture-provider.js";
import { parseCaptureFixture } from "./capture-fixture-parser.js";
import { ShadowFixtureProposer, shadowAiOutputV1, shadowGatewayRequest } from "./shadow-proposal.js";

const text = "JOB: Synthetic repairs\nITEM: Fit door | QTY: 2 | UNIT: each | £10.00";
const sourceId = "capture-source";
const hash = createHash("sha256").update(text).digest("hex");
const request = {
  contractVersion: "ai_gateway_request_v1", fixtureId: "capture", operation: "capture_job_record_proposal",
  promptVersion: "job-record-proposal-v1", schemaVersion: "job-record-proposal-v1",
  sources: [{ tenantId: "tenant-a", visibility: "public", id: sourceId, content: text, sha256: hash }], timeoutMs: 1000, maxOutputTokens: 2048,
};
const proposal = () => parseCaptureFixture(sourceId, text);
const gateway = (output: unknown) => new AiGateway(new FixtureAiProvider({ capture: { output, citations: [] } }), fixtureAiSession);
const fields = ["title", "description", "quantity", "unit", "unitPricePence", "material", "question"] as const;
function field(output: JobRecordProposal, name: typeof fields[number]) {
  if (name === "title") return output.title;
  if (name === "material") return output.materials[0]!.description;
  if (name === "question") return output.questions[0]!.question;
  return output.lines[0]![name];
}

describe("LATER-B3 capture gateway", () => {
  it.each(fields)("L001: rejects invalid nested spans with an empty envelope citation list (%s)", async name => {
    for (const invalid of [
      { sourceId: "absent", start: 0, end: 1 },
      { sourceId, start: 0, end: text.length + 1 },
      { sourceId, start: 4, end: 4 },
      { sourceId, start: 5, end: 4 },
    ]) {
      const output = proposal();
      field(output, name).provenance = { kind: "extracted", span: { ...invalid, sourceVersion: 1 } };
      await expect(gateway(output).generate(request, jobRecordProposalV1)).rejects.toMatchObject({ code: "invalid_citation" });
    }
  });

  it.each(["missing", "out-of-bounds"])("L001: validates repaired nested citations (%s)", async kind => {
    const repaired = proposal();
    repaired.lines[0]!.description.provenance = { kind: "extracted", span: {
      sourceId: kind === "missing" ? "absent" : sourceId, sourceVersion: 1, start: 0,
      end: kind === "missing" ? 1 : text.length + 1,
    } };
    const repair = vi.fn(() => repaired);
    await expect(gateway({}).generate(request, jobRecordProposalV1, { repair })).rejects.toMatchObject({ code: "invalid_citation" });
    expect(repair).toHaveBeenCalledOnce();
  });

  it("L001: accepts valid nested citations without requiring an envelope duplicate", async () => {
    await expect(gateway(proposal()).generate(request, jobRecordProposalV1)).resolves.toMatchObject({
      output: proposal(), citations: [], repairAttempts: 0,
    });
  });

  it("L003: throwing repair returns typed invalid-output failure", async () => {
    const raw = new Error("Internal provider detail must stay private");
    const repair = vi.fn(() => { throw raw; });
    const error = await gateway({}).generate(request, jobRecordProposalV1, { repair }).catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(AiGatewayError);
    expect(error).toMatchObject({ code: "invalid_output", message: "AI output repair failed" });
    expect(String(error)).not.toContain(raw.message);
    expect(error).not.toHaveProperty("cause");
    expect(repair).toHaveBeenCalledOnce();
  });

  it("L003: an invalid repair stops after one attempt", async () => {
    const repair = vi.fn(() => ({}));
    await expect(gateway({}).generate(request, jobRecordProposalV1, { repair })).rejects.toMatchObject({ code: "invalid_output" });
    expect(repair).toHaveBeenCalledOnce();
  });

  it("L003: successful repair preserves the original source and provider provenance", async () => {
    const repair = vi.fn(() => proposal());
    await expect(gateway({}).generate(request, jobRecordProposalV1, { repair })).resolves.toEqual({
      output: proposal(), citations: [], costPence: 0, repairAttempts: 1,
      provenance: { provider: "recorded-fixture", model: "fixture-v1", deployment: "local-only",
        fixtureId: request.fixtureId, promptVersion: request.promptVersion, schemaVersion: request.schemaVersion,
        sourceHashes: { [sourceId]: hash } },
    });
    expect(repair).toHaveBeenCalledOnce();
  });

  it("L001/L003: combined gateway and shadow proposer preserve valid proposals and citation drops", async () => {
    const id = "10000000-0000-4000-8000-000000000001";
    const observation = parseObservation({
      version: "observation.v1", tenantId: id, jobId: id, kind: "note_or_voice",
      evidence: { id, objectVersionId: "synthetic-v1", sha256: "a".repeat(64), serverReceivedAt: "2026-10-01T00:00:00Z" },
      text: "Fitted outside tap.", citations: [{ start: 0, end: 19, quote: "Fitted outside tap." }],
      facts: { workReference: "outside-tap", scopeArea: "garden", description: "outside tap", status: "completed",
        estimatedValuePence: null, safetyImplication: false, customerClearlyRequested: false,
        needsPriorWrittenAgreement: false, significantWork: null, activeDispute: false,
        silenceMateriallyWorsensDispute: false, disclosureDuty: false },
    });
    const candidate = { description: "outside tap", confidenceBand: "low", recommendation: "hold", citation: observation.citations[0] };
    const fixtures = { shadow: { output: { version: "shadow-ai-proposals.v1", proposals: [candidate,
      { ...candidate, citation: { start: 0, end: 19, quote: "unsupported" } },
      { ...candidate, citation: { start: 0, end: 99, quote: "outside source" } },
    ] }, citations: [] } };
    const generated = await new AiGateway(new FixtureAiProvider(fixtures), () => ({ tenantId: observation.tenantId })).generate(shadowGatewayRequest(observation, "shadow"), shadowAiOutputV1);
    expect(generated.output).toEqual(fixtures.shadow.output);
    expect(generated.repairAttempts).toBe(0);
    const result = await new ShadowFixtureProposer(fixtures).propose(observation, "shadow", "2026-10-12T00:00:00Z");
    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0]).toMatchObject({ description: "outside tap", confidenceBand: "low" });
    expect(result.droppedCitations).toBe(2);
    expect(result.provenance).toEqual(generated.provenance);
    expect(result.provenance.sourceHashes).toEqual({ [id]: sha256(observation.text) });
    expect(result.evaluationVersion).toBe("shadow-held-out.v1");
  });
});
