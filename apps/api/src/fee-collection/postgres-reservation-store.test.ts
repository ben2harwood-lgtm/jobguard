import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import type { TenantTransaction, VerifiedTenantContext } from "@jobguard/db";
import { ctx, fixture, id } from "./test-fixture.js";
const mocks = vi.hoisted(() => ({ withTenant: vi.fn(), appendAuditBatch: vi.fn() }));
vi.mock("@jobguard/db", () => mocks);
import { PostgresReservationStore } from "./postgres-reservation-store.js";

// Deterministic adapter contract tests, not evidence of PostgreSQL locking or RLS.
describe("PostgresReservationStore transaction adapter", () => {
  beforeEach(() => vi.clearAllMocks());
  function setup() {
    const book = { version: "fee-reservation-book.v1", attempts: [], events: {}, audit: [] };
    const query = vi.fn(async (sql: string) => ({ rows: sql.startsWith("SELECT book") ? [{ book }] : [] }));
    const db = { $client: { query } } as unknown as TenantTransaction;
    const context = { tenantId: ctx.tenantId } as VerifiedTenantContext;
    mocks.withTenant.mockImplementation(async (_pool, _ctx, work) => work(db));
    const sources = vi.fn(() => ({ collection: async () => fixture().source, credit: async () => fixture().credit }));
    const resolve = vi.fn(async () => context);
    return { query, db, context, resolve, sources, store: new PostgresReservationStore({} as Pool, resolve, sources) };
  }
  it("binds current sources to the locked transaction and persists before the final audit lock", async () => {
    const f = setup();
    expect(await f.store.transaction(ctx.tenantId, async (_book, sources) => sources.collection(id(5), id(6)))).toMatchObject({ tenantId: ctx.tenantId });
    expect(f.sources).toHaveBeenCalledWith(f.db, f.context);
    expect(f.query.mock.calls.map(([sql]) => sql.split(" ")[0])).toEqual(["INSERT", "SELECT", "UPDATE"]);
    expect(f.query.mock.calls[1]![0]).toContain("FOR UPDATE");
    expect(f.query.mock.invocationCallOrder.at(-1)!).toBeLessThan(mocks.appendAuditBatch.mock.invocationCallOrder[0]!);
  });
  it("refuses a mismatched verified tenant before starting a transaction", async () => {
    const f = setup();
    await expect(f.store.transaction(id(90), async () => undefined)).rejects.toMatchObject({ code: "COLLECTION_REFUSED" });
    expect(mocks.withTenant).not.toHaveBeenCalled();
  });
  it("propagates a source refusal without saving book or audit", async () => {
    const f = setup();
    await expect(f.store.transaction(ctx.tenantId, async () => { throw new Error("stale source"); })).rejects.toThrow("stale source");
    expect(f.query).toHaveBeenCalledTimes(2);
    expect(mocks.appendAuditBatch).not.toHaveBeenCalled();
  });
  it("refuses corrupt persisted state before invoking the callback", async () => {
    const f = setup(), work = vi.fn();
    f.query.mockResolvedValue({ rows: [{ book: { version: "unsupported" } } as never] });
    await expect(f.store.transaction(ctx.tenantId, work)).rejects.toMatchObject({ code: "COLLECTION_REFUSED" });
    expect(work).not.toHaveBeenCalled();
  });
  it("persists reservation and audit with immutable action bindings", async () => {
    const f = setup(), sample = fixture();
    const reserved = await sample.executor.reserve(ctx, sample.intent);
    await f.store.transaction(ctx.tenantId, async book => {
      book.attempts.push(structuredClone(reserved));
      book.audit.push({ commandId: reserved.commandId, state: "reserved" });
    });
    expect(mocks.appendAuditBatch.mock.calls[0]![1]).toEqual([expect.objectContaining({
      actorRef: reserved.actorMembershipId, subjectRef: reserved.commandId, eventType: "fee.collection.reserved",
    })]);
    f.query.mockResolvedValue({ rows: [{ book: { version: "fee-reservation-book.v1", attempts: [reserved], events: {}, audit: [{ commandId: reserved.commandId, state: "reserved" }] } } as never] });
    await expect(f.store.transaction(ctx.tenantId, async book => { book.attempts[0]!.amountPence = 1; })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await expect(f.store.transaction(ctx.tenantId, async book => { book.audit = []; })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });
  it("does not allow an existing event fingerprint to be removed", async () => {
    const f = setup();
    f.query.mockResolvedValue({ rows: [{ book: { version: "fee-reservation-book.v1", attempts: [], audit: [], events: { prior: "a".repeat(64) } } } as never] });
    await expect(f.store.transaction(ctx.tenantId, async book => { book.events = {}; })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expect(f.query).toHaveBeenCalledTimes(2);
  });
});
