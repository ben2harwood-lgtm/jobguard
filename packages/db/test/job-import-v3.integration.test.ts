import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { JobImportV3Repository, AdoptInFlightJobV3Mutation } from "../src/job-import-v3-repository.js";
import { importFixtureV3, importPublicRequestHashV3, importTargetJobIdV3 } from "../src/job-import-v3-fixtures.js";
import { importActionHashV3 } from "../../core/dist/job-import-v3.js";
import { withTenant } from "../src/tenant-context.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { T, J, M, D, parties, preview, approved, intent, command, scriptedImportPool, createImportFixture, closeWorkFixture, importState, freshIntent, type ImportFixture } from "./job-import-v3-fixtures.js";

// The source-only describe can run locally by name without entering DB hooks.
describe("CH5-P source-only application boundary (scripted transport)", () => {
  const originalMode = process.env.JOBGUARD_ENV;
  beforeAll(() => { process.env.JOBGUARD_ENV = "synthetic_demo"; });
  afterAll(() => { if (originalMode === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV = originalMode; });
  it("preview uses server snapshot and discloses held availability without writes", async () => {
    const f = scriptedImportPool(), result = await new JobImportV3Repository(f.pool).preview(f.context, D, J.toUpperCase(), { ...preview, expectedBindingId: parties.bindingId.toUpperCase() });
    expect(result.snapshot).toEqual(approved); expect(result.previewHash).toBe(intent.previewHash);
    expect(result).toMatchObject({ availability: { code: "METER_PLACE_SOURCE_HANDOFF_HELD", status: "held" }, realExternalActions: 0 });
    expect(f.query.mock.calls.some(([sql]) => /INSERT|UPDATE|DELETE|pg_advisory/u.test(sql))).toBe(false);
    expect(f.query.mock.calls.find(([sql]) => sql.includes("FROM practice_owned_job"))?.[1]).toEqual([T, J, D]);
  });
  it.each(["live"] as const)("%s adoption refuses before receipt or authorization creation", async lifecyclePoint => {
    const f = scriptedImportPool(), input = importFixtureV3(J, parties, lifecyclePoint, preview.fixtureId);
    await expect(new JobImportV3Repository(f.pool).adopt(f.context, D, J, { ...intent, lifecyclePoint, previewHash: importActionHashV3(input) })).rejects.toMatchObject({ code: "METER_PLACE_SOURCE_HANDOFF_HELD" });
    expect(f.query.mock.calls.some(([sql]) => /INSERT|UPDATE|DELETE|adopt_in_flight|mon1_admit_place/u.test(sql))).toBe(false);
    expect(f.query.mock.calls.filter(([sql]) => sql === "BEGIN")).toHaveLength(2);
  });
  it.each(["revoked", "unowned"])("%s authorization is checked before informative input errors", async kind => {
    const f = scriptedImportPool(); if (kind === "revoked") f.state.authenticated = false; else f.state.owns = false;
    const repo = new JobImportV3Repository(f.pool);
    for (const action of [() => repo.preview(f.context, D, J, {}), () => repo.adopt(f.context, D, J, {}), () => repo.read(f.context, D, J)])
      await expect(action()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(f.query.mock.calls.some(([sql]) => sql.includes("job_party_current"))).toBe(false);
  });
  it("strict request, binding and preview hash cannot be overridden", async () => {
    const f = scriptedImportPool(), repo = new JobImportV3Repository(f.pool);
    await expect(repo.preview(f.context, D, J, { ...preview, tenantId: T })).rejects.toMatchObject({ code: "INVALID_IMPORT" });
    await expect(repo.preview(f.context, D, J, { ...preview, fixtureId: "missing" })).rejects.toMatchObject({ code: "INVALID_IMPORT" });
    await expect(repo.preview(f.context, D, J, { ...preview, expectedBindingId: randomUUID() })).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    await expect(repo.adopt(f.context, D, J, { ...intent, previewHash: "b".repeat(64) })).rejects.toThrow("IMPORT_INTENT_SNAPSHOT_MISMATCH");
    await expect(repo.adopt(f.context, D, J, { ...intent, actor: M })).rejects.toMatchObject({ code: "INVALID_IMPORT" });
    await expect(repo.preview(f.context, "not-a-digest", J, preview)).rejects.toThrow();
    await expect(repo.preview(f.context, D, "not-a-uuid", preview)).rejects.toThrow();
  });
  it("client grace claims, count overrides and locked-bill references cannot authorize an import", async () => {
    const f = scriptedImportPool(), repo = new JobImportV3Repository(f.pool);
    for (const extra of [{ gracePlace: true }, { countedPlaces: 0 }, { plan: "Builder" }, { finalAccountRevisionId: randomUUID() }, { baselineId: randomUUID() }])
      await expect(repo.adopt(f.context, D, J, { ...intent, ...extra })).rejects.toMatchObject({ code: "INVALID_IMPORT" });
    expect(f.query.mock.calls.some(([sql]) => /INSERT|UPDATE|DELETE/u.test(sql))).toBe(false);
  });
  it("production/pilot reject all entrypoints before SQL", async () => {
    const f = scriptedImportPool(), repo = new JobImportV3Repository(f.pool);
    try { for (const mode of ["production", "pilot_no_charge"]) {
      process.env.JOBGUARD_ENV = mode;
      for (const action of [() => repo.preview(f.context, D, J, preview), () => repo.adopt(f.context, D, J, intent), () => repo.read(f.context, D, J)])
        await expect(action()).rejects.toMatchObject({ code: "SYNTHETIC_MODE_REQUIRED" });
    } } finally { process.env.JOBGUARD_ENV = "synthetic_demo"; }
    expect(f.query).not.toHaveBeenCalled();
  });
  it("direct mutation and lock both stay held; actor and complete snapshot checked", async () => {
    const f = scriptedImportPool(), mutation = new AdoptInFlightJobV3Mutation(T, D, J, intent, approved);
    await withTenant(f.pool, f.context, async db => {
      await expect(mutation.lock(db, { ...command, actorMembershipId: M.toUpperCase(), subjectRef: command.subjectRef.toUpperCase() })).rejects.toMatchObject({ code: "METER_PLACE_SOURCE_HANDOFF_HELD" });
      await expect(mutation.mutate(db, command)).rejects.toMatchObject({ code: "METER_PLACE_SOURCE_HANDOFF_HELD" });
      await expect(mutation.lock(db, { ...command, actorMembershipId: randomUUID() })).rejects.toMatchObject({ code: "FORBIDDEN" });
      for (const altered of [
        { ...command, commandId: randomUUID() }, { ...command, subjectRef: randomUUID() }, { ...command, commandType: "forged" },
        { ...command, subjectType: "case" }, { ...command, action: { ...command.action, recipient: "x.invalid" } },
        ...["actionType", "contentHash", "aggregateRevision", "amountPence", "currency", "policyVersion"].map(key => ({ ...command, action: { ...command.action, [key]: key.endsWith("Pence") || key === "aggregateRevision" ? 1 : "forged" } })),
      ]) await expect(mutation.lock(db, altered as typeof command)).rejects.toMatchObject({ code: "EXACT_IMPORT_AUTHORIZATION_MISMATCH" });
      const history = { ...approved, historyManifest: [{ sourceId: randomUUID(), sourceLineId: null, evidenceId: randomUUID(), objectVersionId: "fictional-v1", sha256: "e".repeat(64), byteLength: 12, sourceOccurredAt: null }] };
      await expect(new AdoptInFlightJobV3Mutation(T, D, J, intent, history).lock(db, command)).rejects.toMatchObject({ code: "IMPORT_HISTORY_ADAPTER_REQUIRED" });
      const alteredSnapshot = { ...approved, attestation: { ...approved.attestation, wording: "Changed" } };
      await expect(new AdoptInFlightJobV3Mutation(T, D, J, { ...intent, previewHash: importActionHashV3(alteredSnapshot) }, alteredSnapshot).lock(db, command)).rejects.toMatchObject({ code: "EXACT_IMPORT_AUTHORIZATION_MISMATCH" });
    });
  });
  it("session revocation between preparation and dispatcher preflight is rechecked before replay", async () => {
    const f = scriptedImportPool();
    f.pool.connect = (async () => {
      if (f.query.mock.calls.some(([sql]) => sql === "COMMIT")) f.state.authenticated = false;
      return { query: f.query, release: f.release };
    }) as unknown as typeof f.pool.connect;
    await expect(new JobImportV3Repository(f.pool).adopt(f.context, D, J, intent)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(f.query.mock.calls.some(([sql]) => /INSERT|command_receipt/u.test(sql))).toBe(false);
  });
  it("read refuses a missing persisted result", async () => {
    const f = scriptedImportPool(); await expect(new JobImportV3Repository(f.pool).read(f.context, D, J)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("invoiced mutation and replay preserve the original checked writer result and exclusion identity", async () => {
    const f = scriptedImportPool(), originalQuery = f.query.getMockImplementation()!;
    const value = importFixtureV3(J, parties, "invoiced", preview.fixtureId);
    const input = { ...intent, lifecyclePoint: "invoiced", previewHash: importActionHashV3(value) };
    const exactCommand = { ...command, authorizationId: randomUUID(), action: { ...command.action, contentHash: input.previewHash } };
    const result = { version: "job-import-result.v3", importId: randomUUID(), jobId: command.subjectRef, termsId: randomUUID(), baselineId: randomUUID(),
      provenance: "imported", lineageStrength: "builder_attested_weaker", lifecyclePoint: "invoiced", linkedJobIds: [J], meterResultRef: randomUUID(),
      actionHash: input.previewHash, environment: "synthetic_demo", realExternalActions: 0,
      baseline: { acceptedNetPence: value.baseline.acceptedNetPence, lines: value.baseline.lines.map(line => ({ sourceLineId: line.sourceLineId,
        scopeItemId: randomUUID(), netPence: line.netPence, origin: "builder_baseline" })) } };
    const publicHash = importPublicRequestHashV3(T, D, J, input);
    f.query.mockImplementation(async (sql, values) => {
      if (sql.includes("app.adopt_invoiced_job_v3")) return { rows: [{ result }], rowCount: 1 };
      if (sql.includes("FROM app.job_import_v3")) return { rows: [{ result, snapshot: value, public_request_hash: publicHash, adopted_at: new Date("2026-10-28T18:00:00Z") }], rowCount: 1 };
      return originalQuery(sql, values);
    });
    const mutation = new AdoptInFlightJobV3Mutation(T, D, J, input, value);
    await withTenant(f.pool, f.context, async db => expect(await mutation.mutate(db, exactCommand)).toEqual(result));
    expect(f.query.mock.calls.find(([sql]) => sql.includes("app.adopt_invoiced_job_v3"))?.[1]).toEqual([
      T, J, D, input.commandId, exactCommand.authorizationId, JSON.stringify(value), publicHash,
    ]);
    const repo = new JobImportV3Repository(f.pool);
    expect(await repo.adopt(f.context, D, J, input)).toEqual(result);
    expect((await repo.read(f.context, D, command.subjectRef)).result).toEqual(result);
    expect(f.query.mock.calls.some(([sql]) => sql.includes("INSERT INTO app.command_receipt"))).toBe(false);
    f.state.authenticated = false;
    await expect(repo.adopt(f.context, D, J, input)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("public hash binds every intent field and path/scope; UUID case is canonical", () => {
    const hash = importPublicRequestHashV3(T, D, J, intent);
    expect(importPublicRequestHashV3(T.toUpperCase(), D, J.toUpperCase(), { ...intent, commandId: intent.commandId.toUpperCase(), expectedBindingId: intent.expectedBindingId.toUpperCase() })).toBe(hash);
    for (const changed of [{ ...intent, commandId: randomUUID() }, { ...intent, fixtureId: "other" }, { ...intent, lifecyclePoint: "invoiced" }, { ...intent, expectedBindingId: randomUUID() }, { ...intent, previewHash: "b".repeat(64) }])
      expect(importPublicRequestHashV3(T, D, J, changed)).not.toBe(hash);
    expect(importPublicRequestHashV3(T, D, randomUUID(), intent)).not.toBe(hash);
    expect(importPublicRequestHashV3(randomUUID(), D, J, intent)).not.toBe(hash);
    expect(importPublicRequestHashV3(T, "b".repeat(64), J, intent)).not.toBe(hash);
    expect(importTargetJobIdV3(T, D, intent.commandId.toUpperCase())).toBe(command.subjectRef);
    expect(importTargetJobIdV3(T, D, randomUUID())).not.toBe(command.subjectRef);
    expect(importTargetJobIdV3(T, "b".repeat(64), intent.commandId)).not.toBe(command.subjectRef);
  });
});

describe("CH5-P PostgreSQL held boundary — CI only", () => {
  let f: ImportFixture;
  beforeAll(async () => { f = await createImportFixture(); }, 60000);
  afterAll(async () => { await closeWorkFixture(f); });
  it("fresh session preview and repeat live/invoiced refusals preserve all effects", async () => {
    const { auth } = f.practice, repo = new JobImportV3Repository(f.runtime), before = await importState(f);
    for (const lifecyclePoint of ["live"] as const) {
      const p = await repo.preview(auth.context, auth.digest, f.practice.jobId, { ...f.request, lifecyclePoint });
      const request = freshIntent(f.request.expectedBindingId, p.previewHash, lifecyclePoint);
      for (let n = 0; n < 2; n++) await expect(repo.adopt(auth.context, auth.digest, f.practice.jobId, request)).rejects.toMatchObject({ code: "METER_PLACE_SOURCE_HANDOFF_HELD" });
    }
    expect(await importState(f)).toEqual(before);
  });
  it("same-tenant swapped session, foreign tenant, revoked session and pool reuse fail closed", async () => {
    const other = await seedOtherSession(f), repo = new JobImportV3Repository(f.runtime), { auth } = f.practice;
    await expect(repo.preview(auth.context, other.auth.digest, f.practice.jobId, {})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(repo.preview(testTenantContext(randomUUID()), auth.digest, f.practice.jobId, {})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await f.admin.query("UPDATE control_plane.practice_session SET revoked_at=clock_timestamp() WHERE token_digest=$1", [other.auth.digest]);
    await expect(repo.preview(other.auth.context, other.auth.digest, other.jobId, f.request)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await f.runtime.query("SELECT nullif(current_setting('app.tenant_id',true),'') t")).rows[0].t).toBeNull();
    await expect(repo.read(auth.context, auth.digest, randomUUID())).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("private SQL entrypoint has fixed owner/path, no runtime/public/worker privileges, cannot be enabled by GUC", async () => {
    const signature = "app.adopt_in_flight_job_v3(uuid,uuid,text,uuid,uuid,jsonb)";
    const row = (await f.admin.query(`SELECT prosecdef,proconfig,pg_get_userbyid(proowner) owner,
      has_function_privilege('jobguard_runtime',oid,'EXECUTE') runtime,has_function_privilege('jobguard_meter',oid,'EXECUTE') meter,
      has_function_privilege('jobguard_infrastructure',oid,'EXECUTE') infrastructure,has_function_privilege('jobguard_shadow',oid,'EXECUTE') shadow
      FROM pg_proc WHERE oid=$1::regprocedure`, [signature])).rows[0];
    expect(row).toEqual({ prosecdef: true, proconfig: ["search_path=pg_catalog"], owner: "jobguard_migration", runtime: false, meter: false, infrastructure: false, shadow: false });
    expect((await f.admin.query("SELECT count(*)::int n FROM pg_proc p,LATERAL aclexplode(p.proacl) a WHERE p.oid=$1::regprocedure AND a.grantee=0", [signature])).rows[0].n).toBe(0);
    await expect(withTenant(f.runtime, f.practice.auth.context, async db => {
      await db.$client.query("SELECT set_config('app.import_v3_approved','true',true)");
      return db.$client.query("SELECT app.adopt_in_flight_job_v3($1,$2,$3,$4,$5,$6)", [T, f.practice.jobId, f.practice.auth.digest, randomUUID(), randomUUID(), approved]);
    })).rejects.toThrow("permission denied");
    await expect(f.runtime.query("SET ROLE jobguard_migration")).rejects.toThrow("permission denied");
    await expect(f.admin.query("SELECT app.adopt_in_flight_job_v3($1,$2,$3,$4,$5,$6)", [T, f.practice.jobId, f.practice.auth.digest, randomUUID(), randomUUID(), approved])).rejects.toThrow("METER_PLACE_SOURCE_HANDOFF_HELD");
  });
});
async function seedOtherSession(f: ImportFixture) { const { seedWorkPractice } = await import("./job-work-state-fixtures.js"); return seedWorkPractice(f); }
