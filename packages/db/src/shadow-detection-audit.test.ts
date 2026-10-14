import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { parseObservation, proposalFromObservation, shadowCaptureV1 } from "@jobguard/core";
import { ShadowDetectionRepository } from "./shadow-detection-repository.js";
import { verifiedTenantContextForQueuedJob } from "./tenant-context.js";

const tenantId = randomUUID(), jobId = randomUUID();
const baselineId = "f0000000-0000-4000-8000-000000000001";
const variationId = "10000000-0000-4000-8000-000000000001";
const variationScopeId = "20000000-0000-4000-8000-000000000001";
const at = "2026-10-01T00:00:00Z";
const observation = parseObservation({
  version: "observation.v1", tenantId, jobId, kind: "completion_photo",
  evidence: { id: randomUUID(), objectVersionId: "synthetic-v1", sha256: "a".repeat(64), serverReceivedAt: at },
  text: "Fitted outside tap.", citations: [{ start: 0, end: 19, quote: "Fitted outside tap." }],
  facts: { workReference: randomUUID(), scopeArea: "job", description: "outside tap", status: "completed",
    estimatedValuePence: null, safetyImplication: false, customerClearlyRequested: false,
    needsPriorWrittenAgreement: false, significantWork: null, activeDispute: false,
    silenceMateriallyWorsensDispute: false, disclosureDuty: false },
});
const proposal = proposalFromObservation(observation, "ai_proposal", "synthetic.v1", at,
  { lock: "before_lock", adoption: "after_adoption" });
const capture = (baseline: boolean, state: string | null = null) => shadowCaptureV1.parse({
  version: "shadow-capture.v1", tenantId, jobId, id: baseline ? baselineId : variationId,
  scopeItemId: baseline ? baselineId : variationScopeId,
  revisionId: baseline ? baselineId : variationId, serverRecordedAt: at, valuePence: null,
  kind: baseline ? "baseline" : "log_extra", state, scopeArea: "job", description: "outside tap",
  recordedPhase: "pre_lock", aiStructured: false, sourceRef: baseline ? baselineId : variationId,
});

// Adapter contract only: this records the real repository's SQL bindings. It does
// not emulate PostgreSQL constraints, RLS or concurrency; the companion test does.
async function bindings(captures: ReturnType<typeof capture>[]) {
  const query = vi.fn(async (_sql: string, _values?: unknown[]) => ({ rows: [], rowCount: 1 }));
  const client = { query, release: vi.fn() };
  const pool = { connect: async () => client } as unknown as Pool;
  await new ShadowDetectionRepository(pool).persist(verifiedTenantContextForQueuedJob(tenantId), {
    version: "shadow-detection-batch.v1", jobId, proposals: [proposal], observations: [observation], captures,
  });
  return query.mock.calls.find(([sql]) => sql.includes("matched_scope_item_id=$5"))![1];
}

describe("AUDIT-FIX-DBSRC-14 match reference binding", () => {
  it.each(["draft", "priced", "approved", "rejected", "withdrawn"])(
    "mixed match stores the baseline reference alongside a %s extra", async state => {
      const values = await bindings([capture(false, state), capture(true)]);
      expect(values?.slice(3)).toEqual(["already_in_original_scope", baselineId, null]);
    },
  );
  it("a capture-only match keeps its variation identity, not its separate scope identity", async () => {
    const values = await bindings([capture(false, "draft")]);
    expect(values?.slice(3)).toEqual(["builder_captured", null, variationId]);
  });
  it("an unmatched proposal keeps both references empty", async () => {
    const values = await bindings([]);
    expect(values?.slice(3)).toEqual([null, null, null]);
  });
});
