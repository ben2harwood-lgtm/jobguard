import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import type { TenantTransaction, VerifiedTenantContext } from "@jobguard/db";
import { ctx, fixture, id } from "./test-fixture.js";
const mocks = vi.hoisted(() => ({ withTenant: vi.fn() }));
vi.mock("@jobguard/db", () => mocks);
import { FeeCollectionError, type CollectionBook } from "./contracts.js";
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
      if (sql.startsWith("SELECT app.lock_fee_reservation_book") || sql.startsWith("SELECT book")) return { rows: [{ book: structuredClone(persisted.book) }] };
      if (sql.startsWith("SELECT kind")) return { rows: structuredClone(persisted.archive) };
      // Fake routine response for adapter contracts only. SQL authority, RLS,
      // compaction and chained audit are independently exercised in PostgreSQL CI.
      if (sql.startsWith("SELECT app.replace_fee_reservation_book")) {
        const full = JSON.parse(values![1] as string) as CollectionBook;
        for (const attempt of full.attempts.filter(a => a.state === "released")) {
          const releases = persisted.archive.filter(r => r.kind === "attempt" && r.key.startsWith(`${attempt.commandId}:`));
          if (JSON.stringify(releases.at(-1)?.payload) !== JSON.stringify(attempt))
            persisted.archive.push({ kind: "attempt", key: `${attempt.commandId}:${releases.length}`, payload: structuredClone(attempt) });
        }
        for (const [key, payload] of Object.entries(full.events))
          if (!persisted.archive.some(r => r.kind === "event" && r.key === key)) persisted.archive.push({ kind: "event", key, payload });
        full.audit.forEach((payload, i) => {
          if (!persisted.archive.some(r => r.kind === "audit" && r.key === String(i))) persisted.archive.push({ kind: "audit", key: String(i), payload });
        });
        persisted.book = { version: "fee-reservation-book.v1", attempts: full.attempts.filter(a => a.state !== "released"), events: {}, audit: [] };
      }
      return { rows: [] };
    });
    const db = { $client: { query } } as unknown as TenantTransaction;
    const context = { tenantId: ctx.tenantId } as VerifiedTenantContext;
    mocks.withTenant.mockImplementation(async (_pool, _ctx, work) => work(db));
    const sources = vi.fn(() => ({ collection: async () => fixture().source, credit: async () => fixture().credit }));
    return { persisted, query, db, context, sources, store: new PostgresReservationStore({} as Pool, context, sources) };
  }
  it("binds current sources to the locked transaction and delegates persistence and the final audit lock to one routine", async () => {
    const f = setup();
    expect(await f.store.transaction(ctx.tenantId, async (_book, sources) => sources.collection(id(5), id(6)))).toMatchObject({ tenantId: ctx.tenantId });
    expect(f.sources).toHaveBeenCalledWith(f.db);
    expect(f.query.mock.calls.map(([sql]) => sql.split(" ")[0])).toEqual(["INSERT", "SELECT", "SELECT", "SELECT"]);
    expect(f.query.mock.calls[1]![0]).toContain("app.lock_fee_reservation_book");
    expect(f.query.mock.calls.at(-1)![0]).toContain("$3::jsonb");
  });
  it("uses guarded routines instead of runtime row locks or raw updates", async () => {
    const f = setup();
    await f.store.transaction(ctx.tenantId, async () => undefined);
    const sql = f.query.mock.calls.map(([value]) => value).join("\n");
    expect(sql).toContain("app.lock_fee_reservation_book");
    expect(sql).toContain("app.replace_fee_reservation_book");
    expect(sql).not.toContain("FOR UPDATE");
    expect(sql).not.toContain("UPDATE app.fee_reservation_book");
  });
  it("maps malformed JSON from the authority routine to a typed refusal and preserves unrelated errors", async () => {
    for (const code of ["22P02", "40001"]) {
      const f = setup();
      const error = Object.assign(new Error("routine failure"), { code });
      const query = f.query.getMockImplementation()!;
      f.query.mockImplementation(async (sql, values) => {
        if (sql.startsWith("SELECT app.replace_fee_reservation_book")) throw error;
        return query(sql, values);
      });
      const result = f.store.transaction(ctx.tenantId, async () => undefined);
      if (code === "22P02") {
        await expect(result).rejects.toBeInstanceOf(FeeCollectionError);
        await expect(result).rejects.toMatchObject({ code: "COLLECTION_REFUSED" });
      } else {
        await expect(result).rejects.toBe(error);
      }
    }
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
    expect(f.query.mock.calls.some(([sql]) => sql.includes("append_audit") || sql.includes("INSERT INTO app.fee_reservation_archive"))).toBe(false);
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
    const saved = JSON.parse(f.query.mock.calls.at(-1)![1]![1] as string) as CollectionBook;
    expect(saved.audit).toEqual([{ commandId: reserved.commandId, state: "reserved" }]);
    expect(saved.attempts[0]).toMatchObject({ actorMembershipId: reserved.actorMembershipId, fingerprint: reserved.fingerprint });
    f.persisted.book = { version: "fee-reservation-book.v1", attempts: [reserved], events: {}, audit: [{ commandId: reserved.commandId, state: "reserved" }] };
    f.persisted.archive = [];
    await expect(f.store.transaction(ctx.tenantId, async book => { book.attempts[0]!.amountPence = 1; })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await expect(f.store.transaction(ctx.tenantId, async book => { book.audit = []; })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });
  it("preserves receipt success-fee authority through persistence and refuses rebinding", async () => {
    const f = setup(), sample = fixture();
    const reserved = { ...await sample.executor.reserve(ctx, sample.intent),
      purpose: "receipt_success_fee" as const, authorizationId: id(80) };
    await f.store.transaction(ctx.tenantId, async book => { book.attempts.push(reserved); book.audit.push({ commandId: reserved.commandId, state: "reserved" }); });
    expect(await f.store.transaction(ctx.tenantId, async book => book.attempts[0])).toEqual(reserved);
    for (const change of [{ purpose: undefined }, { authorizationId: id(81) }, { authorizationId: undefined }]) {
      await expect(f.store.transaction(ctx.tenantId, async book => {
        Object.assign(book.attempts[0]!, change);
      })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    }
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
  it("forwards the verified fake result to the authority routine without raw archive or audit writes", async () => {
    const f = executorFixture();
    await f.executor.reserve(ctx, f.intent);
    await f.executor.execute(ctx, id(10));
    const call = f.query.mock.calls.filter(([sql]) => sql.startsWith("SELECT app.replace_fee_reservation_book")).at(-1)!;
    const proof = JSON.parse(call[1]![2] as string) as { body: string; signature: string };
    expect(JSON.parse(proof.body)).toMatchObject({ version: "fake-fee-result.v1", environment: "synthetic_demo", tenantId: ctx.tenantId,
      attempt: { commandId: id(10), state: "provider_accepted" } });
    expect(proof.signature).toBe(f.rail.sign(proof.body));
    expect(f.query.mock.calls.some(([sql]) => sql.startsWith("INSERT INTO app.fee_reservation_archive") || sql.includes("append_audit"))).toBe(false);
  });

  it("maps a malformed-proof check refusal to FeeCollectionError without saving history", async () => {
    const f = setup();
    const before = structuredClone(f.persisted);
    const query = f.query.getMockImplementation()!;
    f.query.mockImplementation(async (sql, values) => {
      if (sql.startsWith("SELECT app.replace_fee_reservation_book"))
        throw Object.assign(new Error("authenticated fee result required"), { code: "23514" });
      return query(sql, values);
    });
    const body = '{"version":';
    const error = await f.store.transaction(ctx.tenantId, async () => undefined,
      () => ({ body, signature: fixture().rail.sign(body) })).catch(error => error);
    expect(error).toBeInstanceOf(FeeCollectionError);
    expect(error).toMatchObject({ code: "COLLECTION_REFUSED" });
    expect(f.persisted).toEqual(before);
  });

  it("continues a webhook batch after a malformed signed store result is refused", async () => {
    const f = executorFixture();
    await f.executor.reserve(ctx, f.intent);
    await f.executor.execute(ctx, id(10));
    const before = structuredClone(f.persisted);
    const bad = f.event(id(10), "collection", id(61));
    const good = f.event(id(10), "collection", id(62));
    Object.assign(f.rail, { verifyWebhookBatch: () => [
      f.rail.verifyWebhook(bad.body, bad.signature), f.rail.verifyWebhook(good.body, good.signature),
    ] });
    const sign = f.rail.signStoreResult.bind(f.rail);
    const body = '{"version":';
    vi.spyOn(f.rail, "signStoreResult").mockImplementationOnce(() => ({ body, signature: f.rail.sign(body) }))
      .mockImplementation(sign);
    const query = f.query.getMockImplementation()!;
    f.query.mockImplementation(async (sql, values) => {
      if (sql.startsWith("SELECT app.replace_fee_reservation_book")) {
        const proof = JSON.parse(values![2] as string) as { body: string; signature: string } | null;
        if (proof?.body === body) {
          expect(proof.signature).toBe(f.rail.sign(body));
          expect(f.persisted).toEqual(before);
          // Deterministic routine contract; real SQLSTATE coverage is in PostgreSQL tests.
          throw Object.assign(new Error("authenticated fee result required"), { code: "23514" });
        }
      }
      return query(sql, values);
    });
    expect(await f.executor.webhook(ctx, "stripe_card", "synthetic batch", "synthetic signature"))
      .toEqual([{ code: "COLLECTION_REFUSED" }, { code: "processed" }]);
    const book = await f.store.transaction(ctx.tenantId, async book => structuredClone(book));
    expect(book.attempts[0]?.state).toBe("settled");
    expect(Object.keys(book.events)).toEqual([`stripe_card:${id(62)}`]);
    expect(book.audit.map(a => a.state)).toEqual(["reserved", "outcome_unknown", "provider_accepted", "settled"]);
    expect(f.rail.signStoreResult).toHaveBeenCalledTimes(2);
  });

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
    let proof: ReturnType<typeof f.rail.signStoreResult> | undefined;
    await f.store.transaction(ctx.tenantId, async book => {
      book.attempts[0]!.paymentState = "cancelled";
      proof = f.rail.signStoreResult(ctx.tenantId, book.attempts[0]!);
    }, () => proof);
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
