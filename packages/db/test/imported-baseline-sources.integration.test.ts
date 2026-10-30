import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readImportedBaselineSources } from "../src/imported-baseline-sources.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { D, J, T, scriptedImportPool, createImportFixture, closeWorkFixture, importState, type ImportFixture } from "./job-import-v3-fixtures.js";
import { seedWorkPractice } from "./job-work-state-fixtures.js";

describe("CH5-B source-only scripted boundary (not PostgreSQL proof)", () => {
  const previous = process.env.JOBGUARD_ENV;
  beforeAll(() => { process.env.JOBGUARD_ENV = "synthetic_demo"; });
  afterAll(() => { if (previous === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV = previous; });
  it("checks scoped authority then refuses without a source or effects", async () => {
    const f = scriptedImportPool();
    await expect(readImportedBaselineSources(f.pool, { context: f.context, sessionDigest: D }, J.toUpperCase(), {})).rejects.toMatchObject({ code: "IMPORTED_BASELINE_SOURCE_HANDOFF_HELD" });
    expect(f.query.mock.calls.find(([sql]) => sql.includes("authenticate_practice_session"))?.[1]).toEqual([D, T]);
    expect(f.query.mock.calls.find(([sql]) => sql.includes("FROM practice_owned_job WHERE"))?.[1]).toEqual([T, J, D]);
    expect(f.query.mock.calls.some(([sql]) => /INSERT|UPDATE|DELETE|shadow_signal|job_party_current|imported_job_baseline/u.test(sql))).toBe(false);
    expect(f.query.mock.calls.some(([sql]) => sql === "ROLLBACK")).toBe(true);
    expect(f.release).toHaveBeenCalledOnce();
  });
  it.each(["authenticated", "owns"] as const)("refuses missing %s before reporting capability", async flag => {
    const f = scriptedImportPool(); f.state[flag] = false;
    await expect(readImportedBaselineSources(f.pool, { context: f.context, sessionDigest: D }, J, null)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("rechecks revocation on each call and retains no session", async () => {
    const f = scriptedImportPool(), scope = { context: f.context, sessionDigest: D };
    await expect(readImportedBaselineSources(f.pool, scope, J, null)).rejects.toMatchObject({ code: "IMPORTED_BASELINE_SOURCE_HANDOFF_HELD" });
    f.state.authenticated = false;
    await expect(readImportedBaselineSources(f.pool, scope, J, null)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("refuses malformed digest/job before connecting", async () => {
    const f = scriptedImportPool();
    for (const [sessionDigest, jobId] of [["bad", J], [D, "bad"]])
      await expect(readImportedBaselineSources(f.pool, { context: f.context, sessionDigest: sessionDigest! }, jobId!, null)).rejects.toMatchObject({ code: "INVALID_SOURCE_SCOPE" });
    expect(f.query).not.toHaveBeenCalled();
  });
  it("preserves original verified context identity", async () => {
    const f = scriptedImportPool();
    await expect(readImportedBaselineSources(f.pool, { context: { ...f.context }, sessionDigest: D }, J, null)).rejects.toMatchObject({ code: "INVALID_TENANT_CONTEXT" });
    expect(f.query).not.toHaveBeenCalled();
  });
  it.each(["production", "pilot_no_charge", undefined])("refuses mode %s", async mode => {
    const f = scriptedImportPool();
    if (mode === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV = mode;
    try {
      await expect(readImportedBaselineSources(f.pool, { context: f.context, sessionDigest: D }, J, null)).rejects.toMatchObject({ code: "SYNTHETIC_MODE_REQUIRED" });
      expect(f.query).not.toHaveBeenCalled();
    } finally { process.env.JOBGUARD_ENV = "synthetic_demo"; }
  });
});

describe("CH5-B PostgreSQL authority and held source — CI only", () => {
  let f: ImportFixture;
  const previous = process.env.JOBGUARD_ENV;
  beforeAll(async () => { f = await createImportFixture(); }, 60000);
  afterAll(async () => { await closeWorkFixture(f); if (previous === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV = previous; });
  it("authorized source has no success projection and no persisted effects", async () => {
    const before = await importState(f), { auth, jobId } = f.practice;
    for (const ref of [null, {}, randomUUID()])
      await expect(readImportedBaselineSources(f.runtime, { context: auth.context, sessionDigest: auth.digest }, jobId, ref)).rejects.toMatchObject({ code: "IMPORTED_BASELINE_SOURCE_HANDOFF_HELD" });
    expect(await importState(f)).toEqual(before);
  });
  it("denies another session/job, unknown job, foreign tenant, expired/revoked sessions and pool leakage", async () => {
    const other = await seedWorkPractice(f), { auth, jobId } = f.practice;
    for (const scope of [{ context: auth.context, sessionDigest: other.auth.digest }, { context: testTenantContext(randomUUID()), sessionDigest: auth.digest }])
      await expect(readImportedBaselineSources(f.runtime, scope, jobId, null)).rejects.toMatchObject({ code: "FORBIDDEN" });
    for (const target of [other.jobId, randomUUID()])
      await expect(readImportedBaselineSources(f.runtime, { context: auth.context, sessionDigest: auth.digest }, target, null)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await f.admin.query("UPDATE control_plane.practice_session SET expires_at=clock_timestamp()-interval '1 second' WHERE token_digest=$1", [other.auth.digest]);
    await expect(readImportedBaselineSources(f.runtime, { context: other.auth.context, sessionDigest: other.auth.digest }, other.jobId, null)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await f.admin.query("UPDATE control_plane.practice_session SET revoked_at=clock_timestamp() WHERE token_digest=$1", [auth.digest]);
    await expect(readImportedBaselineSources(f.runtime, { context: auth.context, sessionDigest: auth.digest }, jobId, null)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await f.runtime.query("SELECT nullif(current_setting('app.tenant_id',true),'') t")).rows[0].t).toBeNull();
  });
});
