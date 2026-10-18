import { describe, expect, it, vi } from "vitest";
import { AiGatewayError, ShadowFixtureProposer, type AiGatewayErrorCode } from "@jobguard/ai";
import { detectShadowObservations, groupShadowProposals, parseObservation, sha256 } from "@jobguard/core";
import { ShadowDetectionWorker, type ShadowWorkerPorts } from "./shadow-detection.worker.js";

const { testTenantContext } = await import(new URL("../../../packages/db/test/tenant-context-test-utils.ts", import.meta.url).href);
const tenantId = "10000000-0000-4000-8000-000000000001", jobId = "10000000-0000-4000-8000-000000000002";
const at = "2026-10-16T00:00:00Z", context = testTenantContext(tenantId);
const task = { version: "shadow-detection-task.v1", tenantId, jobId };
const text = "Unsafe garden wiring.";
const observation = parseObservation({ version: "observation.v1", tenantId, jobId, kind: "note_or_voice", text,
  evidence: { id: jobId, objectVersionId: "synthetic-v1", sha256: sha256(text), serverReceivedAt: at },
  citations: [{ start: 0, end: text.length, quote: text }],
  facts: { workReference: "garden-wiring", scopeArea: "garden", description: "garden wiring", status: "unknown",
    estimatedValuePence: null, safetyImplication: true, customerClearlyRequested: false, needsPriorWrittenAgreement: false,
    significantWork: null, activeDispute: false, silenceMateriallyWorsensDispute: false, disclosureDuty: false } });
const ports = (): ShadowWorkerPorts => ({ assertTermsRelation: vi.fn(async () => undefined),
  hasAcceptedTerms: vi.fn(async () => true), read: vi.fn(async () => ({ observations: [observation], captures: [] })),
  propose: vi.fn(async () => ({ proposals: [] })), persist: vi.fn(async () => undefined) });

describe("LATER-B6 deterministic findings survive fixture AI failure", () => {
  it.each<AiGatewayErrorCode>(["fixture_not_found", "invalid_provider_response", "invalid_output", "invalid_citation"])(
    "L126: AI failure does not discard deterministic must-surface findings (%s)", async code => {
      const p = ports(), failure = new AiGatewayError(code, "Fixture AI failed");
      vi.mocked(p.propose).mockRejectedValue(failure);
      const worker = new ShadowDetectionWorker(p, "synthetic_demo", () => at);
      // Persist via the established sink, then reject so the scheduler records failure honestly.
      await expect(worker.execute(context, task)).rejects.toBe(failure);
      expect(p.persist).toHaveBeenCalledExactlyOnceWith(context, { version: "shadow-detection-batch.v1", jobId,
        observations: [observation], captures: [], proposals: detectShadowObservations([observation], [], at) });
      const batch = vi.mocked(p.persist).mock.calls[0]![1];
      expect(groupShadowProposals(batch.proposals, batch.observations, batch.captures)[0]!.firings)
        .toEqual([expect.objectContaining({ rule: "safety" })]);
    });

  it("L126: combined gateway-plus-shadow failure persists deterministic results and duplicate replay stays stable", async () => {
    const p = ports(), proposer = new ShadowFixtureProposer({});
    p.propose = (o, id, time) => proposer.propose(o, id, time);
    const worker = new ShadowDetectionWorker(p, "synthetic_demo", () => at);
    for (let i = 0; i < 2; i++) await expect(worker.execute(context, task)).rejects.toMatchObject({ code: "fixture_not_found" });
    expect(p.persist).toHaveBeenCalledTimes(2);
    expect(vi.mocked(p.persist).mock.calls[0]).toEqual(vi.mocked(p.persist).mock.calls[1]);
  });

  it("L126: a failed observation does not discard later successful AI proposals", async () => {
    const p = ports(), second = parseObservation({ ...observation,
      evidence: { ...observation.evidence, id: tenantId }, facts: { ...observation.facts, workReference: "second-work" } });
    vi.mocked(p.read).mockResolvedValue({ observations: [observation, second], captures: [] });
    const failure = new AiGatewayError("invalid_output", "Invalid fixture output");
    vi.mocked(p.propose).mockRejectedValueOnce(failure).mockResolvedValueOnce({ proposals: detectShadowObservations([second], [], at) });
    await expect(new ShadowDetectionWorker(p, "synthetic_demo", () => at).execute(context, task)).rejects.toBe(failure);
    expect(p.propose).toHaveBeenCalledTimes(2);
    expect(vi.mocked(p.persist).mock.calls[0]![1].proposals).toHaveLength(3);
  });

  it("L126: persistence, authorization and invariant failures are never swallowed", async () => {
    const p = ports(), worker = new ShadowDetectionWorker(p, "synthetic_demo", () => at);
    const aiFailure = new AiGatewayError("invalid_output", "Fixture AI failed"), sinkFailure = new Error("PERSISTENCE_FAILED");
    vi.mocked(p.propose).mockRejectedValue(aiFailure);
    vi.mocked(p.persist).mockRejectedValue(sinkFailure);
    await expect(worker.execute(context, task)).rejects.toBe(sinkFailure);
    for (const failure of [new Error("INVARIANT_FAILED"), new AiGatewayError("invalid_request", "Invalid authority fields"),
      new AiGatewayError("cancelled", "Cancelled"), new AiGatewayError("live_route_disabled", "Disabled")]) {
      const other = ports(); vi.mocked(other.propose).mockRejectedValue(failure);
      await expect(new ShadowDetectionWorker(other, "synthetic_demo", () => at).execute(context, task)).rejects.toBe(failure);
      expect(other.persist).not.toHaveBeenCalled();
    }
    const denied = ports(); vi.mocked(denied.hasAcceptedTerms).mockResolvedValue(false);
    await expect(new ShadowDetectionWorker(denied, "synthetic_demo").execute(context, task)).rejects.toMatchObject({ code: "SHADOW_TERMS_NOT_ACCEPTED" });
    expect(denied.read).not.toHaveBeenCalled(); expect(denied.propose).not.toHaveBeenCalled(); expect(denied.persist).not.toHaveBeenCalled();
    const readFailure = ports(); vi.mocked(readFailure.read).mockRejectedValue(sinkFailure);
    await expect(new ShadowDetectionWorker(readFailure, "synthetic_demo").execute(context, task)).rejects.toBe(sinkFailure);
    expect(readFailure.persist).not.toHaveBeenCalled();
  });
});
