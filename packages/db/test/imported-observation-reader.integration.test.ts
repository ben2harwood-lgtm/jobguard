import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readImportedObservationBundle } from "../src/imported-observation-reader.js";
import { ImportedEvidenceProvenanceRepository } from "../src/imported-evidence-provenance-repository.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { D, J, T, scriptedImportPool, createImportFixture, closeWorkFixture, importState, type ImportFixture } from "./job-import-v3-fixtures.js";
import { seedWorkPractice } from "./job-work-state-fixtures.js";

describe("CH5-E source-only scripted boundary (not PostgreSQL proof)", () => {
  const previous = process.env.JOBGUARD_ENV;
  beforeAll(() => { process.env.JOBGUARD_ENV = "synthetic_demo"; });
  afterAll(() => { if (previous === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV = previous; });
  it("repository history/read cannot create authority, including after revocation", async () => {
    const f = scriptedImportPool(), repository = new ImportedEvidenceProvenanceRepository(f.pool);
    for (const command of [undefined, {}, { historyManifest: [], approved: true }, { historyManifest: [{ classification: "post_adoption_evidence" }] }])
      await expect(repository.adoptWithHistory(f.context, D, J, command)).rejects.toMatchObject({ code: "IMPORTED_BASELINE_SOURCE_HANDOFF_HELD" });
    await expect(repository.read(f.context, D, J)).rejects.toMatchObject({ code: "IMPORTED_BASELINE_SOURCE_HANDOFF_HELD" });
    f.state.authenticated = false;
    await expect(repository.adoptWithHistory(f.context, D, J, {})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(repository.read(f.context, D, J)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(f.query.mock.calls.some(([sql]) => /INSERT|UPDATE|DELETE|shadow_signal|adopt_in_flight/u.test(sql))).toBe(false);
  });
  it("checks scoped authority then refuses without a source or effects", async () => {
    const f = scriptedImportPool();
    await expect(readImportedObservationBundle(f.pool, { context: f.context, sessionDigest: D }, J.toUpperCase())).rejects.toMatchObject({ code: "IMPORTED_BASELINE_SOURCE_HANDOFF_HELD" });
    expect(f.query.mock.calls.find(([sql]) => sql.includes("authenticate_practice_session"))?.[1]).toEqual([D, T]);
    expect(f.query.mock.calls.find(([sql]) => sql.includes("FROM practice_owned_job WHERE"))?.[1]).toEqual([T, J, D]);
    expect(f.query.mock.calls.some(([sql]) => /INSERT|UPDATE|DELETE|shadow_signal|job_party_current|imported_job_baseline/u.test(sql))).toBe(false);
    expect(f.query.mock.calls.some(([sql]) => sql === "ROLLBACK")).toBe(true);
    expect(f.release).toHaveBeenCalledOnce();
  });
  it.each(["authenticated", "owns"] as const)("refuses missing %s before reporting capability", async flag => {
    const f = scriptedImportPool(); f.state[flag] = false;
    await expect(readImportedObservationBundle(f.pool, { context: f.context, sessionDigest: D }, J)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("rechecks revocation on each call and retains no session", async () => {
    const f = scriptedImportPool(), scope = { context: f.context, sessionDigest: D };
    await expect(readImportedObservationBundle(f.pool, scope, J)).rejects.toMatchObject({ code: "IMPORTED_BASELINE_SOURCE_HANDOFF_HELD" });
    f.state.authenticated = false;
    await expect(readImportedObservationBundle(f.pool, scope, J)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("refuses malformed digest/job before connecting", async () => {
    const f = scriptedImportPool();
    for (const [sessionDigest, jobId] of [["bad", J], [D, "bad"]])
      await expect(readImportedObservationBundle(f.pool, { context: f.context, sessionDigest: sessionDigest! }, jobId!)).rejects.toMatchObject({ code: "INVALID_SOURCE_SCOPE" });
    expect(f.query).not.toHaveBeenCalled();
  });
  it("preserves original verified context identity", async () => {
    const f = scriptedImportPool();
    await expect(readImportedObservationBundle(f.pool, { context: { ...f.context }, sessionDigest: D }, J)).rejects.toMatchObject({ code: "INVALID_TENANT_CONTEXT" });
    expect(f.query).not.toHaveBeenCalled();
  });
  it.each(["production", "pilot_no_charge", undefined])("refuses mode %s", async mode => {
    const f = scriptedImportPool();
    if (mode === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV = mode;
    try {
      await expect(readImportedObservationBundle(f.pool, { context: f.context, sessionDigest: D }, J)).rejects.toMatchObject({ code: "SYNTHETIC_MODE_REQUIRED" });
      expect(f.query).not.toHaveBeenCalled();
    } finally { process.env.JOBGUARD_ENV = "synthetic_demo"; }
  });
});

describe("CH5-E PostgreSQL authority and held source — CI only", () => {
  let f: ImportFixture;
  const previous = process.env.JOBGUARD_ENV;
  beforeAll(async () => { f = await createImportFixture(); }, 60000);
  afterAll(async () => { await closeWorkFixture(f); if (previous === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV = previous; });
  it("authorized source has no success projection and no persisted effects", async () => {
    const before = await importState(f), { auth, jobId } = f.practice;
    for (const _attempt of [1, 2, 3])
      await expect(readImportedObservationBundle(f.runtime, { context: auth.context, sessionDigest: auth.digest }, jobId)).rejects.toMatchObject({ code: "IMPORTED_BASELINE_SOURCE_HANDOFF_HELD" });
    expect(await importState(f)).toEqual(before);
  });
  it("denies another session/job, unknown job, foreign tenant, expired/revoked sessions and pool leakage", async () => {
    const other = await seedWorkPractice(f), { auth, jobId } = f.practice;
    for (const scope of [{ context: auth.context, sessionDigest: other.auth.digest }, { context: testTenantContext(randomUUID()), sessionDigest: auth.digest }])
      await expect(readImportedObservationBundle(f.runtime, scope, jobId)).rejects.toMatchObject({ code: "FORBIDDEN" });
    for (const target of [other.jobId, randomUUID()])
      await expect(readImportedObservationBundle(f.runtime, { context: auth.context, sessionDigest: auth.digest }, target)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await f.admin.query("UPDATE control_plane.practice_session SET expires_at=clock_timestamp()-interval '1 second' WHERE token_digest=$1", [other.auth.digest]);
    await expect(readImportedObservationBundle(f.runtime, { context: other.auth.context, sessionDigest: other.auth.digest }, other.jobId)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await f.admin.query("UPDATE control_plane.practice_session SET revoked_at=clock_timestamp() WHERE token_digest=$1", [auth.digest]);
    await expect(readImportedObservationBundle(f.runtime, { context: auth.context, sessionDigest: auth.digest }, jobId)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await f.runtime.query("SELECT nullif(current_setting('app.tenant_id',true),'') t")).rows[0].t).toBeNull();
  });
});
