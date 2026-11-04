import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { RateSuggestionRepository, storedRateAcceptanceV1, storedRateQueryV1 } from "../src/rate-suggestion-repository.js";
import { testTenantContext } from "./tenant-context-test-utils.js";

const tenantId = randomUUID(), scopeItemId = randomUUID(), jobId = randomUUID(), currentRevisionId = randomUUID();
const query = { version: "rate-query.v1", asOf: "2026-11-01T00:00:00.000Z", unit: "each", taxBasis: "standard_rate_20", category: "paint", region: "london" };
const command = () => ({ version: "rate-suggestion-accept.v1", commandId: randomUUID(), query, jobId, scopeItemId,
  currentRevisionId, acceptedRatePence: 100, baselineHash: "a".repeat(64) });
function observation(ratePrincipalPence = 100, extra = {}) {
  return { version: "rate-observation.v1", id: randomUUID(), tenantId, jobId, scopeItemId,
    sourceScopeRevisionId: randomUUID(), effectiveAt: "2026-10-30T00:00:00.000Z", unit: "each", ratePrincipalPence,
    currency: "GBP", taxBasis: query.taxBasis, category: query.category, region: query.region, provenance: "entered", kind: "rate", traced: true, ...extra };
}
function transport(observations = [observation(), observation(), observation()]) {
  const result = { id: randomUUID(), actorId: randomUUID(), recordHash: "b".repeat(64), provenance: "suggestion_accepted" };
  const sql = vi.fn(async (text: string) => {
    if (text.includes("WITH stored")) return { rows: [{ observations, baseline_hash: "a".repeat(64) }] };
    if (text.includes("app.accept_rate_suggestion")) return { rows: [{ result }] };
    return { rows: [] };
  });
  const release = vi.fn(), pool = { connect: async () => ({ query: sql, release }) } as unknown as Pool;
  return { repo: new RateSuggestionRepository(pool), sql, result };
}
const context = testTenantContext(tenantId), actor = { kind: "human", sessionDigest: "c".repeat(64) };
describe("M5-6 stored baseline application behavior (SQL transport only)", () => {
  it("maps stored traced revisions, with sparse unknown and named exclusions", async () => {
    const bad = observation(100, { traced: false }), duplicate = observation();
    const rows = [duplicate, { ...duplicate, id: randomUUID() }, observation(101), observation(100), observation(9000), observation(100, { unit: "kg" }), bad];
    const { repo, sql } = transport(rows), baseline = await repo.read(context, query);
    expect(baseline.rate?.pence).toBe(100);
    expect(baseline.sources).toHaveLength(3);
    expect(baseline.sources.every(source => rows.some(row => row.id === source.observationId && row.sourceScopeRevisionId === source.sourceScopeRevisionId))).toBe(true);
    expect(baseline.exclusions.map(row => row.reason).sort()).toEqual(["duplicate", "not_comparable", "outlier", "untraced_source"].sort());
    expect(sql.mock.calls.some(([text]) => text.includes("rate_suggestion_acceptance"))).toBe(false);
    const sparse = await transport(rows.slice(0, 2)).repo.read(context, query);
    expect(sparse).toMatchObject({ status: "unknown", rate: null, sampleCount: 1 });
  });
  it("uses session-derived SQL actor and a strict command, never caller identity or tenant", async () => {
    const { repo, sql, result } = transport();
    expect(await repo.accept(context, actor, command())).toEqual(result);
    const write = sql.mock.calls.find(([text]) => text.includes("app.accept_rate_suggestion"));
    expect(write).toBeDefined();
    for (const property of ["tenantId", "actorId", "enabled", "environment"]) {
      expect(storedRateAcceptanceV1.safeParse({ ...command(), [property]: randomUUID() }).success).toBe(false);
      expect(storedRateQueryV1.safeParse({ ...query, [property]: true }).success).toBe(false);
    }
    await expect(repo.accept(context, { kind: "system", sessionDigest: actor.sessionDigest }, command())).rejects.toThrow();
  });
  it("fails closed if a foreign tenant row reaches the pure baseline", async () => {
    await expect(transport([observation(100, { tenantId: randomUUID() })]).repo.read(context, query)).rejects.toThrow("MIXED_TENANT");
  });
  it("rolls back if the core rejects a changed accepted amount despite a faulty SQL transport", async () => {
    const { repo, sql } = transport();
    await expect(repo.accept(context, actor, { ...command(), acceptedRatePence: 101 })).rejects.toThrow("INVALID_ACCEPTANCE");
    expect(sql.mock.calls.map(([text]) => text)).toContain("ROLLBACK");
  });
});

it("reads checked job history with the session digest and rejects malformed/foreign result rows", async () => {
  const stored = { id: randomUUID(), jobId, scopeItemId, previousRevisionId: currentRevisionId,
    acceptedRatePence: 100, unit: "each", taxBasis: query.taxBasis, category: "paint", region: "london",
    actorId: randomUUID(), acceptedAt: "2026-11-01T00:00:00.000Z", recordHash: "b".repeat(64), baselineHash: "a".repeat(64),
    policyVersion: "rate-baseline.v1", provenance: "suggestion_accepted", environment: "synthetic_demo",
    sources: Array.from({ length: 3 }, () => ({ observationId: randomUUID(), jobId, scopeItemId,
      sourceScopeRevisionId: randomUUID(), provenance: "entered" })) };
  let result: unknown = [stored];
  const sql = vi.fn(async () => ({ rows: [{ result }] }));
  const repo = new RateSuggestionRepository({ connect: async () => ({ query: sql, release: vi.fn() }) } as unknown as Pool);
  expect(await repo.readAcceptances(context, actor, jobId)).toEqual([stored]);
  expect(sql).toHaveBeenCalledWith("SELECT app.read_rate_suggestion_acceptances($1,$2) result", [actor.sessionDigest, jobId]);
  result = [{ ...stored, jobId: randomUUID() }];
  await expect(repo.readAcceptances(context, actor, jobId)).rejects.toThrow("INVALID_ACCEPTANCE_HISTORY");
  result = [{ ...stored, sources: [], extra: "forged" }];
  await expect(repo.readAcceptances(context, actor, jobId)).rejects.toThrow();
});
