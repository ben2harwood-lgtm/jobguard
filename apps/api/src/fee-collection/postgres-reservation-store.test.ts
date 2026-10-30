import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import type { TenantTransaction, VerifiedTenantContext } from "@jobguard/db";
import { ctx, fixture, id } from "./test-fixture.js";
const mocks = vi.hoisted(() => ({ withTenant: vi.fn(), appendAuditBatch: vi.fn() }));
vi.mock("@jobguard/db", () => mocks);
import { DarkFeeCollectionExecutor } from "./executor.js";
import { PostgresReservationStore } from "./postgres-reservation-store.js";

// Deterministic adapter contract tests, not evidence of PostgreSQL locking or RLS.
describe("PostgresReservationStore transaction adapter", () => {
  beforeEach(() => vi.clearAllMocks());
  function setup() {
    const persisted: { book: unknown; archive: { kind: string; key: string; payload: unknown }[] } = {
      book: { version: "fee-reservation-book.v1", attempts: [], events: {}, audit: [] }, archive: [],
    };
    const query = vi.fn(async (sql: string, values?: unknown[]) => {
      if (sql.startsWith("SELECT book")) return { rows: [{ book: structuredClone(persisted.book) }] };
      if (sql.startsWith("SELECT kind")) return { rows: structuredClone(persisted.archive) };
      if (sql.startsWith("INSERT INTO app.fee_reservation_archive")) persisted.archive.push(...JSON.parse(values![1] as string));
      if (sql.startsWith("UPDATE")) persisted.book = JSON.parse(values![1] as string);
      return { rows: [] };
    });
    const db = { $client: { query } } as unknown as TenantTransaction;
    const context = { tenantId: ctx.tenantId } as VerifiedTenantContext;
    mocks.withTenant.mockImplementation(async (_pool, _ctx, work) => work(db));
    const sources = vi.fn(() => ({ collection: async () => fixture().source, credit: async () => fixture().credit }));
    const resolve = vi.fn(async () => context);
    return { persisted, query, db, context, resolve, sources, store: new PostgresReservationStore({} as Pool, resolve, sources) };
  }
  it("binds current sources to the locked transaction and persists before the final audit lock", async () => {
    const f = setup();
    expect(await f.store.transaction(ctx.tenantId, async (_book, sources) => sources.collection(id(5), id(6)))).toMatchObject({ tenantId: ctx.tenantId });
    expect(f.sources).toHaveBeenCalledWith(f.db, f.context);
    expect(f.query.mock.calls.map(([sql]) => sql.split(" ")[0])).toEqual(["INSERT", "SELECT", "SELECT", "UPDATE"]);
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
    expect(f.query).toHaveBeenCalledTimes(3);
    expect(mocks.appendAuditBatch).not.toHaveBeenCalled();
  });
  it("refuses corrupt persisted state before invoking the callback", async () => {
    const f = setup(), work = vi.fn();
    f.persisted.book = { version: "unsupported" };
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
    f.persisted.book = { version: "fee-reservation-book.v1", attempts: [reserved], events: {}, audit: [{ commandId: reserved.commandId, state: "reserved" }] };
    f.persisted.archive = [];
    await expect(f.store.transaction(ctx.tenantId, async book => { book.attempts[0]!.amountPence = 1; })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await expect(f.store.transaction(ctx.tenantId, async book => { book.audit = []; })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });
  it("does not allow an existing event fingerprint to be removed", async () => {
    const f = setup();
    f.persisted.book = { version: "fee-reservation-book.v1", attempts: [], audit: [], events: { prior: "a".repeat(64) } };
    await expect(f.store.transaction(ctx.tenantId, async book => { book.events = {}; })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expect(f.query).toHaveBeenCalledTimes(3);
  });
  function executorFixture() {
    const f = setup(), sample = fixture();
    const executor = new DarkFeeCollectionExecutor(f.store, [sample.rail], () => new Date("2026-10-29T00:00:00Z"), sample.sessions);
    return { ...sample, ...f, executor };
  }
  it("archives repeated replacements without growing the active book or losing command replays", async () => {
    const f = executorFixture();
    f.rail.definiteFailure = true;
    for (let i = 0; i < 12; i++) {
      const intent = { ...f.intent, commandId: id(100 + i) };
      await f.executor.reserve(ctx, intent);
      await f.executor.execute(ctx, intent.commandId);
      expect(await f.executor.reserve(ctx, intent)).toMatchObject({ state: "released" });
      await expect(f.executor.execute(ctx, intent.commandId)).rejects.toMatchObject({ code: "RECONCILIATION_REQUIRED" });
      expect(f.persisted.book).toEqual({ version: "fee-reservation-book.v1", attempts: [], events: {}, audit: [] });
    }
    const book = await f.store.transaction(ctx.tenantId, async book => structuredClone(book));
    expect(book.attempts).toHaveLength(12);
    expect(book.audit.filter(a => a.state === "released")).toHaveLength(12);
    expect(f.persisted.archive.filter(r => r.kind === "attempt")).toHaveLength(12);
    await expect(f.executor.reserve(ctx, { ...f.intent, commandId: id(100), rail: "direct_debit" })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await f.executor.reserve(ctx, { ...f.intent, commandId: id(120) });
    await expect(f.executor.reserve(ctx, { ...f.intent, commandId: id(121) })).rejects.toMatchObject({ code: "COLLECTION_REFUSED" });
  });
  it("restores archived webhook fingerprints and revives a late settlement as reconciliation", async () => {
    const f = executorFixture();
    await f.executor.reserve(ctx, f.intent); await f.executor.execute(ctx, id(10));
    const failure = f.event(id(10), "collection", id(51), "definite_failure");
    await f.executor.webhook(ctx, "stripe_card", failure.body, failure.signature);
    const archived = structuredClone(f.persisted.archive);
    await f.executor.webhook(ctx, "stripe_card", failure.body, failure.signature);
    expect(f.persisted.archive).toEqual(archived);
    await f.executor.reserve(ctx, { ...f.intent, commandId: id(11) });
    const late = f.event();
    await f.executor.webhook(ctx, "stripe_card", late.body, late.signature);
    await f.executor.webhook(ctx, "stripe_card", late.body, late.signature);
    const book = await f.store.transaction(ctx.tenantId, async book => book);
    expect(book.attempts.find(a => a.commandId === id(10))?.state).toBe("reconciliation_required");
    expect(book.audit.filter(a => a.state === "released")).toHaveLength(1);
    expect(book.audit.filter(a => a.state === "reconciliation_required")).toHaveLength(1);
    await expect(f.executor.execute(ctx, id(11))).rejects.toMatchObject({ code: "RECONCILIATION_REQUIRED" });
    const changed = failure.body.replace('"definite_failure"', '"settled"');
    await expect(f.executor.webhook(ctx, "stripe_card", changed, f.rail.sign(changed))).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });
  it("retains settled principal while replacing an archived failed refund", async () => {
    const f = executorFixture();
    await f.executor.reserve(ctx, f.intent); await f.executor.execute(ctx, id(10));
    const settled = f.event();
    await f.executor.webhook(ctx, "stripe_card", settled.body, settled.signature);
    await f.executor.reserveRefund(ctx, f.refund);
    f.rail.definiteFailure = true;
    await f.executor.execute(ctx, id(20));
    const replacement = { ...f.refund, commandId: id(23) };
    await f.executor.reserveRefund(ctx, replacement);
    await expect(f.executor.reserveRefund(ctx, { ...replacement, commandId: id(24) })).rejects.toMatchObject({ code: "COLLECTION_REFUSED" });
    const book = await f.store.transaction(ctx.tenantId, async book => book);
    expect(book.attempts.find(a => a.commandId === id(10))?.state).toBe("settled");
    expect(book.attempts.find(a => a.commandId === id(20))?.state).toBe("released");
    expect(book.audit.filter(a => a.commandId === id(20) && a.state === "released")).toHaveLength(1);
  });
  it("rejects removal or rewriting of archived command identities", async () => {
    const f = executorFixture(); f.rail.definiteFailure = true;
    await f.executor.reserve(ctx, f.intent); await f.executor.execute(ctx, id(10));
    await expect(f.store.transaction(ctx.tenantId, async book => { book.attempts = []; })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await expect(f.store.transaction(ctx.tenantId, async book => { book.attempts[0]!.amountPence = 1; })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });
  it("archives later lifecycle facts for a released attempt without rewriting prior snapshots", async () => {
    const f = executorFixture(); f.rail.definiteFailure = true;
    await f.executor.reserve(ctx, f.intent); await f.executor.execute(ctx, id(10));
    const first = structuredClone(f.persisted.archive.find(r => r.kind === "attempt"));
    await f.store.transaction(ctx.tenantId, async book => { book.attempts[0]!.paymentState = "cancelled"; });
    const restored = await f.store.transaction(ctx.tenantId, async book => book);
    expect(restored.attempts[0]?.paymentState).toBe("cancelled");
    expect(f.persisted.archive.filter(r => r.kind === "attempt")).toHaveLength(2);
    expect(f.persisted.archive.find(r => r.key === first?.key)).toEqual(first);
    expect(f.persisted.book).toMatchObject({ attempts: [] });
    expect(restored.audit.filter(a => a.state === "released")).toHaveLength(1);
  });
  it("compacts a populated predecessor book without rewriting its history", async () => {
    const f = executorFixture();
    await f.settle();
    // This history was produced by the real executor in the predecessor test store.
    const legacy = f.book();
    f.persisted.book = { version: "fee-reservation-book.v1", ...structuredClone(legacy) };
    expect(await f.store.transaction(ctx.tenantId, async book => book)).toEqual({ version: "fee-reservation-book.v1", ...legacy });
    expect(await f.store.transaction(ctx.tenantId, async book => book)).toEqual({ version: "fee-reservation-book.v1", ...legacy });
    expect(f.persisted.archive.filter(r => r.kind === "audit")).toHaveLength(legacy.audit.length);
  });

});
