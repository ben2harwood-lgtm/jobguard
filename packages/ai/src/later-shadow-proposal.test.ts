import { describe, expect, it, vi } from "vitest";
import { groupShadowProposals, parseObservation, sha256 } from "@jobguard/core";
import { AiGatewayError } from "./errors.js";
import { ShadowFixtureProposer } from "./shadow-proposal.js";

const id = "10000000-0000-4000-8000-000000000001";
const at = "2026-10-16T00:00:00Z";
const text = "Fitted outside tap and garden light.";
const observation = parseObservation({
  version: "observation.v1", tenantId: id, jobId: id, kind: "note_or_voice", text,
  evidence: { id, objectVersionId: "synthetic-v1", sha256: sha256(text), serverReceivedAt: at },
  citations: [{ start: 0, end: text.length, quote: text }],
  facts: { workReference: "garden-work", scopeArea: "garden", description: "garden work", status: "completed",
    estimatedValuePence: null, safetyImplication: true, customerClearlyRequested: false,
    needsPriorWrittenAgreement: false, significantWork: null, activeDispute: false,
    silenceMateriallyWorsensDispute: false, disclosureDuty: false },
});
const candidate = { description: "outside tap", confidenceBand: "low", recommendation: "hold",
  citation: { start: 0, end: text.length, quote: text } };
const fixture = (proposals: unknown[]) => ({ f: { output: { version: "shadow-ai-proposals.v1", proposals }, citations: [] } });

describe("LATER-B6 fixture proposals", () => {
  it("L123: distinct proposals from one observation have stable distinct IDs", async () => {
    const candidates = [candidate, { ...candidate, confidenceBand: "high" },
      { ...candidate, description: "garden light" }, { ...candidate, recommendation: "suggest" },
      { ...candidate, citation: { start: 7, end: 18, quote: "outside tap" } }];
    const provider = new ShadowFixtureProposer(fixture([...candidates, candidate]));
    const result = await provider.propose(observation, "f", at);
    expect(new Set(result.proposals.map(p => p.signalId)).size).toBe(candidates.length);
    expect(result.proposals).toHaveLength(candidates.length);
    expect(await provider.propose(observation, "f", at)).toEqual(result);
    const reversed = await new ShadowFixtureProposer(fixture([...candidates].reverse())).propose(observation, "f", "2026-10-17T00:00:00Z");
    expect(reversed.proposals.map(p => p.signalId).sort()).toEqual(result.proposals.map(p => p.signalId).sort());
    for (const proposal of result.proposals) {
      expect(proposal.evidence.every(e => e.signalId === proposal.signalId && e.workId === proposal.workId)).toBe(true);
      expect(proposal.estimatedValuePence).toBeNull();
    }
    const groups = groupShadowProposals([...result.proposals, ...result.proposals], [observation], []);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.duplicates).toHaveLength(candidates.length - 1);
    expect(groups[0]!.firings).toEqual([expect.objectContaining({ rule: "safety" })]);
  });

  it("L123: combined gateway-plus-shadow regression validates fixture output and citations", async () => {
    const network = vi.spyOn(globalThis, "fetch");
    try {
      const invalid = new ShadowFixtureProposer(fixture([{ ...candidate, mustSurfaceNow: false }]));
      await expect(invalid.propose(observation, "f", at)).rejects.toMatchObject({ code: "invalid_output" });
      const outOfBounds = new ShadowFixtureProposer({ f: { ...fixture([candidate]).f,
        citations: [{ sourceId: id, start: 0, end: text.length + 1 }] } });
      await expect(outOfBounds.propose(observation, "f", at)).rejects.toMatchObject({ code: "invalid_citation" });
      await expect(new ShadowFixtureProposer({}).propose(observation, "missing", at)).rejects.toBeInstanceOf(AiGatewayError);
      const result = await new ShadowFixtureProposer(fixture([candidate, { ...candidate,
        citation: { start: 0, end: text.length, quote: "invalid quoted text" } }])).propose(observation, "f", at);
      expect(result.proposals).toHaveLength(1);
      expect(result.droppedCitations).toBe(1);
      expect(result.provenance).toMatchObject({ provider: "recorded-fixture", model: "fixture-v1", deployment: "local-only",
        sourceHashes: { [id]: sha256(text) } });
      expect(groupShadowProposals(result.proposals, [observation], [])[0]!.firings).toHaveLength(1);
      expect(network).not.toHaveBeenCalled();
    } finally { network.mockRestore(); }
  });
});
