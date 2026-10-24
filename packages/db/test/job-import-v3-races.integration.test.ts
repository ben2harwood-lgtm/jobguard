import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { JobImportV3Repository } from "../src/job-import-v3-repository.js";
import { createImportFixture, closeWorkFixture, importState, freshIntent, type ImportFixture } from "./job-import-v3-fixtures.js";

describe("CH5-P concurrent held imports — CI only; positive capacity races STOP", () => {
  let f: ImportFixture;
  beforeAll(async () => { f = await createImportFixture(); }, 60000);
  afterAll(async () => { await closeWorkFixture(f); });
  it.each(["live", "invoiced"] as const)("concurrent %s attempts create no receipt, approval, job or meter effect", async lifecyclePoint => {
    const repo = new JobImportV3Repository(f.runtime), { auth } = f.practice;
    const p = await repo.preview(auth.context, auth.digest, f.practice.jobId, { ...f.request, lifecyclePoint });
    const request = freshIntent(f.request.expectedBindingId, p.previewHash, lifecyclePoint), before = await importState(f);
    // Exact duplicate and distinct command IDs all fail. No supplied-input oracle,
    // fake successful MON1 response, or isolated precheck is a capacity proof.
    const outcomes = await Promise.allSettled([request, request, { ...request, commandId: freshIntent(f.request.expectedBindingId, p.previewHash).commandId }]
      .map(input => repo.adopt(auth.context, auth.digest, f.practice.jobId, input)));
    expect(outcomes).toHaveLength(3);
    for (const result of outcomes) {
      expect(result.status).toBe("rejected");
      if (result.status === "rejected") expect(result.reason).toMatchObject({ code: "METER_PLACE_SOURCE_HANDOFF_HELD" });
    }
    expect(await importState(f)).toEqual(before);
  });
});
