import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { ImportedEvidenceProvenanceRepository } from "../src/imported-evidence-provenance-repository.js";
import { readImportedObservationBundle } from "../src/imported-observation-reader.js";
import { testTenantContext } from "./tenant-context-test-utils.js";

const baseline = vi.hoisted(() => vi.fn());
vi.mock("../src/imported-baseline-sources.js", () => ({ readImportedBaselineSources: baseline }));

// Boundary unit controls only. Real PostgreSQL cases are in imported-observation-reader.
// A future B success here is a mutation control, never an accepted source handoff.
describe("CH5-E source-only history bridge isolation", () => {
  const db = {} as Pool, context = testTenantContext("11111111-1111-4111-8111-111111111111");
  const jobId = "c5500000-0000-4000-8000-000000000003", sessionDigest = "a".repeat(64);
  beforeEach(() => { baseline.mockReset(); });
  it("does not auto-enable history when baseline starts returning", async () => {
    baseline.mockResolvedValue({ observations: [], captures: [] });
    await expect(readImportedObservationBundle(db, { context, sessionDigest }, jobId)).rejects.toMatchObject({ code: "IMPORT_HISTORY_SOURCE_HANDOFF_HELD" });
    expect(baseline).toHaveBeenCalledExactlyOnceWith(db, { context, sessionDigest }, jobId, undefined);
    expect(baseline.mock.calls[0]?.[1].context).toBe(context);
  });
  it.each(["read", "adoptWithHistory"] as const)("%s preserves original scope and dependency denials", async method => {
    const failure = new Error("fresh scope denied"); baseline.mockRejectedValue(failure);
    const repository = new ImportedEvidenceProvenanceRepository(db);
    await expect(method === "read" ? repository.read(context, sessionDigest, jobId) : repository.adoptWithHistory(context, sessionDigest, jobId, { approved: true })).rejects.toBe(failure);
    expect(baseline).toHaveBeenCalledExactlyOnceWith(db, { context, sessionDigest }, jobId, undefined);
    expect(baseline.mock.calls[0]?.[1].context).toBe(context);
  });
});
