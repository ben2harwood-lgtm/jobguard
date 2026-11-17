import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { MeterLifecycleRepository, meterLifecycleCaptureV1, meterLifecycleReadRequestV1, meterLifecycleRebuildV1 } from "./meter-lifecycle-repository.js";
import { projectStoredMeterLifecycle, verifyCapturedMeterTrips } from "./meter-lifecycle-source.js";
import { verifiedTenantContextFromMembership, type TenantTransaction } from "./tenant-context.js";

const tenant = randomUUID(), digest = "d".repeat(64), computationId = randomUUID(), sourceId = randomUUID();
const context = () => verifiedTenantContextFromMembership({ tenantId: tenant, identityUserId: randomUUID(), membershipId: randomUUID() } as Parameters<typeof verifiedTenantContextFromMembership>[0]);
function stored() {
  const asOf = "2026-10-15T12:00:00.123456Z", startDate = "2026-10-01", endDateExclusive = "2026-11-01";
  return { version: "meter-lifecycle-stored.v1", sourceId, computationId, sourceHash: "a".repeat(64), sourceRevision: 1,
    source: { version: "meter-lifecycle-source.v1", tenantId: tenant, scopeId: randomUUID(), provenance: "actual_normal_company.v1",
      plan: "Solo", agreementId: randomUUID(), agreementRevision: 1, asOf, startDate, endDateExclusive, links: [], tripObservations: [],
      jobs: [{ version: "meter-lifecycle-input.v1", tenantId: tenant, jobId: randomUUID(), sourceRevision: 1,
        activation: { id: randomUUID(), at: "2026-10-01T09:00:00.000001Z", termsId: randomUUID(), termsRevision: 1,
          track: "small_builder", partyBindingId: randomUUID(), customerId: randomUUID(), siteId: randomUUID(), small: true },
        events: [], lock: null, trip: null, trial: { status: "unavailable" },
        policy: { version: "meter-lifecycle-policy.v1", revision: "specified-foundation.v1", clockStatus: "held" }, asOf, startDate, endDateExclusive }] }, alerts: [] };
}
function pool(result: unknown, fail?: Error) {
  const calls: { sql: string; values: unknown[] | undefined }[] = [];
  let released = false;
  const client = { query: async (sql: string, values?: unknown[]) => {
    calls.push({ sql, values });
    if (sql.includes("app.mon1_lifecycle_")) { if (fail) throw fail; return { rows: [{ result }] }; }
    return { rows: [] };
  }, release: () => { released = true; } };
  return { value: { connect: async () => client } as unknown as Pool, calls, released: () => released };
}
describe("MON1-S normal-company lifecycle source adapter", () => {
  it("discovers lifecycle migration after repaired MON1-T on fresh installs", async () => {
    const { MIGRATION_URLS } = await import("./migrate.js");
    const names = MIGRATION_URLS.map(url => url.pathname.split("/").at(-1));
    const index = names.indexOf("0239_meter_lifecycle_source.sql");
    expect(index).toBeGreaterThan(0);
    expect(names.slice(0, index)).toContain("0208_meter_small_trip.sql");
    expect(names).not.toContain("0209_meter_lifecycle_source.sql");
    expect(names).not.toContain("0207_meter_lifecycle_source.sql");
  });
  it("replays canonical event identities through the stored-source adapter", () => {
    const raw = stored(), job = raw.source.jobs[0]!;
    const first = { version: "job-work-state-event.v1", id: "abcdefab-0000-4000-8000-000000000010",
      jobId: job.jobId, sequence: 1, kind: "first_site_evidence", factAt: "2026-10-05T12:00:00.000001Z",
      recordedAt: "2026-10-05T12:00:00.000002Z", sourceReceiptId: randomUUID(), commandId: null,
      predecessorId: null, closeReason: null, closeNote: null };
    const envelope = (events: unknown[]) => ({ ...raw, source: { ...raw.source, jobs: [{ ...job, events }] } });
    expect(projectStoredMeterLifecycle(tenant, envelope([first, { ...first, id: first.id.toUpperCase() }])))
      .toEqual(projectStoredMeterLifecycle(tenant, envelope([first])));
    expect(() => projectStoredMeterLifecycle(tenant, envelope([first, { ...first, id: first.id.toUpperCase(), sequence: 2 }])))
      .toThrow("METER_PROJECTION_MISMATCH");
  });
  it("projects immutable actual sources through MON1-L and keeps every count held", async () => {
    const raw = stored(), p = pool(raw);
    const read = await new MeterLifecycleRepository(p.value).read(context(), digest, { version: "meter-lifecycle-read.v1", computationId });
    expect(read.provenance).toBe("actual_normal_company.v1");
    expect(read.result.days).toHaveLength(31);
    expect(read.result.days.every(day => day.places === null && day.countedPlaces === null)).toBe(true);
    expect(read.result.days.every(day => day.candidateAllowance.rawPlaces === null && day.candidateAllowance.freeSmallPlaces === null && day.candidateAllowance.countedPlaces === null)).toBe(true);
    expect(read.result.timelines[0]?.asOf).toBe("2026-10-15T12:00:00.123456Z");
    expect(read.resultHash).toBe(projectStoredMeterLifecycle(tenant, raw).resultHash);
    expect(read.corrections).toEqual([]);
    expect(p.calls[2]?.values).toEqual([tenant, digest, computationId]);
    expect(p.calls.at(-1)?.sql).toBe("COMMIT");
    expect(p.released()).toBe(true);
  });
  it("capture and rebuild use checked routines without supplied projection or trip table reads", async () => {
    const p = pool(stored()), repository = new MeterLifecycleRepository(p.value);
    await repository.capture(context(), digest, { version: "meter-lifecycle-capture.v1", commandId: computationId, periodStart: "2026-10-01", expectedSourceRevision: 0 });
    await repository.rebuild(context(), digest, { version: "meter-lifecycle-rebuild.v1", sourceId });
    expect(p.calls.find(call => call.sql.includes("mon1_lifecycle_capture"))?.values).toEqual([tenant, digest, computationId, "2026-10-01", 0]);
    expect(p.calls.find(call => call.sql.includes("mon1_lifecycle_rebuild"))?.values).toEqual([tenant, digest, sourceId]);
    expect(p.calls.some(call => /shadow|fixture|job_small_trip/u.test(call.sql))).toBe(false);
  });
  it("retains captured trip classification and event microseconds without querying mutable source state", async () => {
    const raw = stored(), job = raw.source.jobs[0]!;
    const eventId = randomUUID();
    const source = { ...raw.source, jobs: [{ ...job,
      trip: { id: randomUUID(), at: "2026-10-10T23:59:59.999999Z" },
      events: [{ version: "job-work-state-event.v1", id: eventId, jobId: job.jobId, sequence: 1,
        kind: "first_site_evidence", factAt: "2026-10-05T12:00:00.000001Z", recordedAt: "2026-10-05T12:00:00.000002Z",
        sourceReceiptId: randomUUID(), commandId: null, predecessorId: null, closeReason: null, closeNote: null }] }] };
    const p = pool({ ...raw, source });
    const read = await new MeterLifecycleRepository(p.value).rebuild(context(), digest, { version: "meter-lifecycle-rebuild.v1", sourceId });
    expect(read.result.timelines[0]?.start).toEqual({ at: "2026-10-05T12:00:00.000001Z", cause: "first_site_evidence", sourceIds: [eventId] });
    expect(read.result.days.find(day => day.date === "2026-10-10")?.classifications[0]?.small).toBe(true);
    expect(read.result.days.find(day => day.date === "2026-10-11")?.classifications[0]?.small).toBe(false);
    expect(p.calls.filter(call => call.sql.includes("app.mon1_lifecycle_"))).toHaveLength(1);
  });
  it("rejects browser authority/count/trial fields before connecting", async () => {
    const capture = { version: "meter-lifecycle-capture.v1", commandId: computationId, periodStart: "2026-10-01", expectedSourceRevision: 0 };
    for (const field of ["tenantId", "scopeId", "sessionId", "jobs", "actor", "trial", "small", "count", "price", "policy", "sourceTimestamp"]) {
      expect(meterLifecycleCaptureV1.safeParse({ ...capture, [field]: true }).success).toBe(false);
    }
    expect(meterLifecycleReadRequestV1.safeParse({ version: "meter-lifecycle-read.v1", computationId, scopeId: sourceId }).success).toBe(false);
    expect(meterLifecycleRebuildV1.safeParse({ version: "meter-lifecycle-rebuild.v1", sourceId, trial: false }).success).toBe(false);
    const p = pool(stored());
    await expect(new MeterLifecycleRepository(p.value).capture(context(), "invalid", capture)).rejects.toMatchObject({ code: "INVALID_METER_LIFECYCLE_INPUT" });
    expect(p.calls).toEqual([]);
  });
  it("refuses foreign tenant, supplied fixture, trial and malformed source envelopes", () => {
    const valid = stored();
    const invalid = [
      { ...valid, source: { ...valid.source, tenantId: randomUUID() } },
      { ...valid, source: { ...valid.source, provenance: "meter-persisted-fixture.v1" } },
      { ...valid, source: { ...valid.source, sessionId: randomUUID() } },
      { ...valid, source: { ...valid.source, jobs: [] } },
      { ...valid, source: { ...valid.source, links: [{ id: randomUUID(), predecessorJobId: valid.source.jobs[0]!.jobId,
        successorJobId: randomUUID(), linkedAt: valid.source.asOf, sourceHash: "a".repeat(64) }] } },
      { ...valid, source: { ...valid.source, jobs: [{ ...valid.source.jobs[0], trial: { status: "active" } }] } },
      { ...valid, source: { ...valid.source, jobs: [{ ...valid.source.jobs[0], sourceRevision: 2 }] } },
      { ...valid, source: { ...valid.source, jobs: [{ ...valid.source.jobs[0], tenantId: randomUUID() }] } },
      { ...valid, alerts: ["METER_CACHE_MISMATCH", "METER_CACHE_MISMATCH"] },
    ];
    for (const raw of invalid) expect(() => projectStoredMeterLifecycle(tenant, raw)).toThrow("METER_PROJECTION_MISMATCH");
  });
  it("propagates checked refusals and rolls back unavailable or invalid storage", async () => {
    for (const code of ["METER_FORBIDDEN", "METER_SOURCE_REVISION_CONFLICT", "METER_COMMAND_CONFLICT", "METER_CORRECTION_PERIOD_CLOSED", "METER_LIFECYCLE_CONFLICT", "METER_LIFECYCLE_TERMS_UNAVAILABLE", "METER_LIFECYCLE_SOURCE_UNAVAILABLE", "METER_LIFECYCLE_PLAN_CHANGE_HELD", "METER_LIFECYCLE_SOURCE_INVALID"]) {
      const p = pool(null, new Error(code));
      await expect(new MeterLifecycleRepository(p.value).read(context(), digest, { version: "meter-lifecycle-read.v1", computationId })).rejects.toMatchObject({ code });
      expect(p.calls.at(-1)?.sql).toBe("ROLLBACK");
    }
    for (const [result, failure, code] of [[null, undefined, "METER_PROJECTION_MISMATCH"], [null, new Error("sensitive backend detail"), "METER_UNAVAILABLE"]] as const) {
      const p = pool(result, failure);
      await expect(new MeterLifecycleRepository(p.value).read(context(), digest, { version: "meter-lifecycle-read.v1", computationId })).rejects.toMatchObject({ code });
      expect(p.calls.at(-1)?.sql).toBe("ROLLBACK");
    }
  });
  it("consumes MON1-T only at the internal authorized transaction seam", async () => {
    const source = stored().source;
    const queries: string[] = [];
    const transaction = { $client: { query: async (sql: string) => { queries.push(sql); return { rows: [] }; } } } as unknown as TenantTransaction;
    await verifyCapturedMeterTrips(transaction, source as Parameters<typeof verifyCapturedMeterTrips>[1]);
    expect(queries).toHaveLength(1);
    expect(queries[0]).toContain("app.job_small_trip_event");
  });
});
