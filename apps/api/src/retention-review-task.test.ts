import { describe, expect, it, vi } from "vitest";
import type { TaskList, JobHelpers } from "graphile-worker";
import { registerRetentionReviewTasks } from "./retention-review-task.js";
const append = vi.fn().mockResolvedValue(1);
const tenantId = "10000000-0000-4000-8000-000000000001";
describe("synthetic retention timer registration", () => {
  it.each(["disabled", "production", "pilot_no_charge", "test", "synthetic"])("registers nothing in %s", environment => {
    const tasks: TaskList = {};
    expect(registerRetentionReviewTasks(tasks, environment, append)).toBe("");
    expect(tasks).toEqual({});
  });
  it("discovers identifiers only and uses one tenant/time-bucket key", async () => {
    const tasks: TaskList = {};
    expect(registerRetentionReviewTasks(tasks, "synthetic_demo", append)).toContain("discover_retention_reviews");
    const query = vi.fn().mockResolvedValue({ rows: [{ tenant_id: tenantId, bucket: "23" }] });
    const addJob = vi.fn();
    const helpers = { withPgClient: (fn: (client: unknown) => unknown) => fn({ query }), addJob } as unknown as JobHelpers;
    await tasks.discover_retention_reviews!({}, helpers);
    await tasks.discover_retention_reviews!({}, helpers);
    expect(addJob.mock.calls[0]).toEqual(["raise_retention_reviews", { version: "retention-review-task.v1", tenantId },
      { jobKey: `retention-review:${tenantId}:23`, jobKeyMode: "preserve_run_at" }]);
    expect(addJob.mock.calls[1]).toEqual(addJob.mock.calls[0]);
  });
  it("rejects actor/date/record injection and delegates only a scoped context", async () => {
    append.mockClear();
    try {
      const tasks: TaskList = {};
      registerRetentionReviewTasks(tasks, "synthetic_demo", append);
      const payload = { version: "retention-review-task.v1", tenantId };
      for (const extra of [{ actor: tenantId }, { raisedOn: "2026-11-04" }, { record: {} }, { tenantId: "bad" }]) {
        await expect(tasks.raise_retention_reviews!({ ...payload, ...extra }, {} as JobHelpers)).rejects.toThrow();
      }
      expect(append).not.toHaveBeenCalled();
      await tasks.raise_retention_reviews!(payload, {} as JobHelpers);
      expect(append).toHaveBeenCalledWith(tenantId);
    } finally { append.mockClear(); }
  });
});

// Exercise the real repository/core path without pretending these doubles prove PostgreSQL locks or RLS.
import { RetentionRecordRepository, verifiedTenantContextForQueuedJob as testTenantContext } from "@jobguard/db";
import type { Pool } from "pg";
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function storedTimer(recordsOverride?: unknown[]) {
 const source = { kind: "contract_profile", profileVersion: "fictional.v1", clause: "fictional" };
 const records: unknown[] = recordsOverride ?? [{ version: "retention.profile.v1", id: id(3), tenantId, jobId: id(2), revision: 1, previousProfileId: null,
  fixtureApprovalId: id(4), contractProfileVersion: "fictional.v1", taxTreatmentVersion: "fictional.v1",
  retained: { netPence: 100, taxPence: 20 }, alreadyBilled: { netPence: 0, taxPence: 0 },
  conditions: [
   { id: id(5), milestone: "completion", description: "Fictional", source, dateSource: source, dueDate: "2000-01-01", cumulativeLimit: { netPence: 50, taxPence: 10 } },
   { id: id(6), milestone: "defects", description: "Fictional", source, dateSource: source, dueDate: "9999-12-31", cumulativeLimit: { netPence: 100, taxPence: 20 } },
  ] }];
 const query = vi.fn(async (sql: string, values?: unknown[]) => {
  if (!sql.includes("app.retention_timer")) return { rows: [] };
  if (values?.length === 1) return { rows: [{ result: [id(2)] }] };
  if (values?.[2]) records.push(JSON.parse(values[2] as string));
  return { rows: [{ result: { actorId: null, records: [...records], bookHash: "a".repeat(64), today: "2026-11-04" } }] };
 });
 const pool = { connect: async () => ({ query, release: vi.fn() }) } as unknown as Pool;
 return { repo: new RetentionRecordRepository(pool), query, records };
}
describe("timer repository and core unit boundary", () => {
 it("uses database date, appends only a due review, skips future conditions and committed retries", async () => {
  const f = storedTimer(), context = testTenantContext(tenantId);
  expect(await f.repo.raiseTimerReviews(context)).toEqual({ appended: 1, refused: 0 });
  expect(await f.repo.raiseTimerReviews(context)).toEqual({ appended: 0, refused: 0 });
  expect(f.records).toHaveLength(2);
  expect(f.records[1]).toMatchObject({ trigger: "timer", raisedOn: "2026-11-04", profileId: id(3), conditionId: id(5), owner: "retention-release-review-v1" });
  expect(f.records[1]).not.toHaveProperty("conditionSatisfied");
  expect(f.query.mock.calls.filter(([sql, values]) => sql.includes("app.retention_timer") && values?.[2])).toHaveLength(1);
 });
 it("refuses altered stored data before any timer append", async () => {
  const f = storedTimer([{ version: "retention.profile.v1", tenantId: id(9) }]);
  expect(await f.repo.raiseTimerReviews(testTenantContext(tenantId))).toEqual({ appended: 0, refused: 1 });
  expect(f.query.mock.calls.filter(([sql, values]) => sql.includes("app.retention_timer") && values?.[2])).toHaveLength(0);
  expect(f.query).toHaveBeenLastCalledWith("ROLLBACK");
 });
});

it("refuses one invalid book and continues to the next job, but retries outages", async () => {
 const f = storedTimer(), original = f.query.getMockImplementation()!;
 f.query.mockImplementation(async (sql, values) => {
  if (values?.length === 1) return { rows: [{ result: [id(9), id(2)] }] };
  if (values?.[1] === id(9)) throw new Error("RETENTION_CONFLICT");
  return original(sql, values);
 });
 const refused = vi.fn();
 expect(await f.repo.raiseTimerReviews(testTenantContext(tenantId), refused)).toEqual({ appended: 1, refused: 1 });
 expect(refused).toHaveBeenCalledExactlyOnceWith({ jobId: id(9), code: "RETENTION_CONFLICT" });
 const outage = storedTimer(), normal = outage.query.getMockImplementation()!;
 outage.query.mockImplementation(async (sql, values) => {
  if (values?.length !== 1 && sql.includes("retention_timer")) throw new Error("private connection detail");
  return normal(sql, values);
 });
 await expect(outage.repo.raiseTimerReviews(testTenantContext(tenantId))).rejects.toThrow("RETENTION_UNAVAILABLE");
});

it("wires retention raises to the business pool without an infrastructure business reader", async () => {
 const { readFileSync } = await import("node:fs");
 const source = readFileSync(new URL("./worker.ts", import.meta.url), "utf8");
 expect(source).toContain("new RetentionRecordRepository(runtimePool)");
 expect(source).not.toContain("retentionPool");
});
