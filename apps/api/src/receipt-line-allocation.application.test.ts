import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
// Test-only source loading avoids requiring coordinator-owned package exports.
// Production code must wait for that integration; this is not a replacement barrel.
type HeldRepository = {
 view(context: unknown, actor: unknown, digest: string, jobId: string, query?: unknown): Promise<never>;
 command(context: unknown, actor: unknown, digest: string, jobId: string, raw: unknown): Promise<never>;
 readCurrent(context: unknown, actor: unknown, digest: string, selector: unknown): Promise<never>;
 readCurrentInTransaction(db: unknown, scope: unknown, selector: unknown, expected?: unknown): Promise<never>;
};
const { RecoveryLineAllocationRepository } = await vi.importActual<{
 RecoveryLineAllocationRepository: new(pool: Pool, environment: string) => HeldRepository;
}>("../../../packages/db/src/receipt-line-allocation-repository.js");

// Held boundary tests, written before implementation. No mock success is a saved distribution.
const jobId = randomUUID(), context = Object.freeze({ tenantId: randomUUID() });
const actor = { membershipId: randomUUID(), identityUserId: randomUUID() };
const digest = "a".repeat(64);
function fixture(environment = "synthetic_demo") {
 const pool = { connect: vi.fn() };
 return { pool, repository: new RecoveryLineAllocationRepository(pool as unknown as Pool, environment) };
}
describe("M48-B1 held source boundary (no persistence proof)", () => {
 it.each(["production", "pilot_no_charge", "unconfigured", "development"])("A2/A6: refuses %s before database access", async environment => {
  const { repository, pool } = fixture(environment);
  await expect(repository.view(context, actor, digest, jobId)).rejects.toMatchObject({ code: "RECEIPT_LINE_SYNTHETIC_ONLY" });
  await expect(repository.command(context, actor, digest, jobId, {})).rejects.toMatchObject({ code: "RECEIPT_LINE_SYNTHETIC_ONLY" });
  expect(pool.connect).not.toHaveBeenCalled();
 });
 it.each(["", "raw-session", "g".repeat(64)])("A2: refuses malformed session digest", async session => {
  const { repository, pool } = fixture();
  await expect(repository.readCurrent(context, actor, session, { jobId })).rejects.toMatchObject({ code: "RECEIPT_LINE_FORBIDDEN" });
  expect(pool.connect).not.toHaveBeenCalled();
 });
 it("A1/A2: rejects invalid actor and selector identities before looking up sources", async () => {
  const { repository, pool } = fixture();
  await expect(repository.view(context, { ...actor, membershipId: "client" }, digest, jobId)).rejects.toMatchObject({ code: "RECEIPT_LINE_FORBIDDEN" });
  await expect(repository.readCurrent(context, actor, digest, { jobId, invoiceId: "invalid" })).rejects.toMatchObject({ code: "INVALID_RECEIPT_LINE_QUERY" });
  expect(pool.connect).not.toHaveBeenCalled();
 });
 it("A7: supplied view queries are strict; omitted query has the server default", async () => {
  const { repository, pool } = fixture();
  await expect(repository.view(context, actor, digest, jobId, {})).rejects.toMatchObject({ code: "INVALID_RECEIPT_LINE_QUERY" });
  await expect(repository.view(context, actor, digest, jobId, { version: "receipt-line-allocation-query.v1", tenantId: context.tenantId })).rejects.toMatchObject({ code: "INVALID_RECEIPT_LINE_QUERY" });
  expect(pool.connect).not.toHaveBeenCalled();
 });
});

describe("M48-B1 caller-owned transaction boundary", () => {
 it("A3/A6: uses only the supplied transaction and refuses even fabricated database success", async () => {
  const { repository, pool } = fixture();
  const query = vi.fn().mockResolvedValueOnce({ rowCount: 1 }).mockResolvedValueOnce({}).mockResolvedValueOnce({ rows: [{ result: { revision: 1, rows: [] } }] });
  await expect(repository.readCurrentInTransaction({ $client: { query } }, { context, actor, sessionDigest: digest }, { jobId }, { revision: 2, sourceHash: "b".repeat(64) }))
   .rejects.toMatchObject({ code: "RECEIPT_LINE_SOURCE_HANDOFF_REQUIRED" });
  expect(pool.connect).not.toHaveBeenCalled();
  expect(query).toHaveBeenCalledTimes(3);
  expect(query.mock.calls[2]?.[1]).toEqual([context.tenantId, jobId, digest, JSON.stringify({ jobId }), JSON.stringify({ revision: 2, sourceHash: "b".repeat(64) })]);
  expect(JSON.stringify(query.mock.calls)).not.toContain("set_config('app.tenant_id'");
  expect(JSON.stringify(query.mock.calls)).not.toContain("set_config('app.practice_material_digest'");
 });
 it("A2: rechecks current owner/session before touching the held source routine", async () => {
  const { repository, pool } = fixture();
  const query = vi.fn().mockResolvedValue({ rowCount: 0 });
  await expect(repository.readCurrentInTransaction({ $client: { query } }, { context, actor, sessionDigest: digest }, { jobId })).rejects.toMatchObject({ code: "RECEIPT_LINE_FORBIDDEN" });
  expect(query).toHaveBeenCalledOnce(); expect(pool.connect).not.toHaveBeenCalled();
 });
 it("A3: preserves an unknown database failure without labelling it a definite refusal", async () => {
  const { repository } = fixture(), unavailable = new Error("connection lost");
  const query = vi.fn().mockResolvedValueOnce({ rowCount: 1 }).mockResolvedValueOnce({}).mockRejectedValueOnce(unavailable);
  await expect(repository.readCurrentInTransaction({ $client: { query } }, { context, actor, sessionDigest: digest }, { jobId })).rejects.toBe(unavailable);
 });
 it("A3: rejects malformed expected watermarks before reading", async () => {
  const { repository } = fixture(), query = vi.fn();
  await expect(repository.readCurrentInTransaction({ $client: { query } }, { context, actor, sessionDigest: digest }, { jobId }, { revision: 0, sourceHash: "bad" })).rejects.toMatchObject({ code: "INVALID_RECEIPT_LINE_QUERY" });
  expect(query).not.toHaveBeenCalled();
 });
});
