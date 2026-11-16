import { afterEach, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { PaymentFeeCollectionRepository, PaymentFeeCollectionSourceError, verifiedTenantContextForQueuedJob } from "@jobguard/db";
import { createSuccessFeeDirectDebitExecutor } from "./success-fee-composition.js";
import { fixture, ctx, id } from "./test-fixture.js";
import type { CollectionBook, LockedCollectionSources, ReservationStore, SignedProviderResult } from "./contracts.js";
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
it.each(["AUTHORITY_DISPUTED", "AUTHORITY_REVOKED", "AUTHORITY_EXPIRED", "AUTHORITY_STALE"] as const)("registers the MON-4A reader and preserves %s", async reason => {
  const standIn = vi.fn(), f = fixture(standIn);
  const read = vi.fn(async () => { throw new PaymentFeeCollectionSourceError(reason); });
  const registration = vi.spyOn(PaymentFeeCollectionRepository.prototype, "withReader")
    .mockImplementation(async (_context, _digest, work) => work(read));
  const context = verifiedTenantContextForQueuedJob(ctx.tenantId);
  const executor = createSuccessFeeDirectDebitExecutor(context, { ownerPool: {} as Pool, digest: "a".repeat(64),
    store: f.store, sessions: f.sessions, rails: [f.rail] });
  await expect(executor.reserve(ctx, { ...f.intent, purpose: "receipt_success_fee" })).rejects.toMatchObject({ reason });
  expect(registration).toHaveBeenCalledWith(context, "a".repeat(64), expect.any(Function));
  expect(read).toHaveBeenCalledWith(f.intent.jobId, f.intent.invoiceId, f.intent.statementHash);
  expect(standIn).not.toHaveBeenCalled(); expect(f.book().attempts).toEqual([]);
});

it("records signed results and executes approved refunds without an owner reader or synthetic owner mode", async () => {
  const f = fixture();
  await f.executor.reserve(ctx, f.intent);
  await f.executor.execute(ctx, f.intent.commandId);
  const connect = vi.fn(async () => { throw new Error("OWNER_UNAVAILABLE"); });
  const registration = vi.spyOn(PaymentFeeCollectionRepository.prototype, "withReader");
  vi.stubEnv("JOBGUARD_ENV", "production");
  const executor = createSuccessFeeDirectDebitExecutor(verifiedTenantContextForQueuedJob(ctx.tenantId), {
    ownerPool: { connect } as unknown as Pool, digest: "a".repeat(64), store: f.store,
    sessions: f.sessions, rails: [f.rail], now: () => new Date("2026-10-29T00:00:00Z"),
  });
  const event = f.event();
  await expect(executor.webhook(ctx, "stripe_card", event.body, "forged")).rejects.toThrow();
  await expect(executor.webhook({ ...ctx, tenantId: id(99) }, "stripe_card", event.body, event.signature)).rejects.toThrow();
  expect(f.book().attempts[0]?.state).toBe("provider_accepted");
  await executor.webhook(ctx, "stripe_card", event.body, event.signature);
  const settled = f.book();
  await executor.webhook(ctx, "stripe_card", event.body, event.signature);
  expect(f.book()).toEqual(settled);
  await executor.reserveRefund(ctx, f.refund);
  await executor.execute(ctx, f.refund.commandId);
  const refund = f.event(f.refund.commandId, "refund", id(31));
  await executor.webhook(ctx, "stripe_card", refund.body, refund.signature);
  expect(f.book().attempts.map(a => a.state)).toEqual(["settled", "settled"]);
  expect(registration).not.toHaveBeenCalled(); expect(connect).not.toHaveBeenCalled();
});

it.each(["mode", "pool"])("still fails closed when a success-fee read lacks %s", async failure => {
  const f = fixture(), connect = vi.fn(async () => { throw new Error("OWNER_UNAVAILABLE"); });
  vi.stubEnv("JOBGUARD_ENV", failure === "mode" ? "production" : "synthetic_demo");
  const executor = createSuccessFeeDirectDebitExecutor(verifiedTenantContextForQueuedJob(ctx.tenantId), {
    ownerPool: { connect } as unknown as Pool, digest: "a".repeat(64), store: f.store,
    sessions: f.sessions, rails: [f.rail],
  });
  await expect(executor.reserve(ctx, { ...f.intent, purpose: "receipt_success_fee" }))
    .rejects.toThrow(failure === "mode" ? "SYNTHETIC_MODE_REQUIRED" : "OWNER_UNAVAILABLE");
  expect(connect).toHaveBeenCalledTimes(failure === "mode" ? 0 : 1);
  expect(f.book().attempts).toEqual([]);
});

// Inspect the composition's store scope directly to pause a callback after its
// source reads. Executor journeys above exercise the public operations unchanged.
function composedStore(executor: ReturnType<typeof createSuccessFeeDirectDebitExecutor>) {
  return (executor as unknown as { store: ReservationStore }).store;
}
function barrier() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
it.each([false, true])("retains one reader until callback completion and rolls back errors: %s", async fail => {
  const f = fixture(), read = vi.fn(async () => ({ fresh: true }));
  const entered = barrier(), resume = barrier();
  let released = false;
  const registration = vi.spyOn(PaymentFeeCollectionRepository.prototype, "withReader")
    .mockImplementation(async (_context, _digest, work) => {
      try { return await work(read); } finally { released = true; }
    });
  const executor = createSuccessFeeDirectDebitExecutor(verifiedTenantContextForQueuedJob(ctx.tenantId), {
    ownerPool: {} as Pool, digest: "a".repeat(64), store: f.store, sessions: f.sessions, rails: [f.rail],
  });
  const failure = new Error("CALLBACK_FAILED");
  const pending = composedStore(executor).transaction(ctx.tenantId, async (book, sources) => {
    await sources.successFee!(id(5), id(6), "a".repeat(64));
    await sources.successFee!(id(5), id(6), "a".repeat(64));
    book.events.test = "a".repeat(64);
    entered.resolve(); await resume.promise;
    if (fail) throw failure;
    return "complete";
  });
  const result = fail ? expect(pending).rejects.toBe(failure) : expect(pending).resolves.toBe("complete");
  await entered.promise;
  expect(released).toBe(false); expect(registration).toHaveBeenCalledTimes(1); expect(read).toHaveBeenCalledTimes(2);
  resume.resolve(); await result;
  expect(released).toBe(true);
  expect(f.book().events.test).toBe(fail ? undefined : "a".repeat(64));
});

it("passes the original lazy provider proof through once after callback completion", async () => {
  const f = fixture(), proof = { body: "signed-result", signature: "signature" };
  let received: (() => SignedProviderResult | undefined) | undefined;
  const store: ReservationStore = { async transaction(tenantId, work, providerResult) {
    received = providerResult;
    const result = await f.store.transaction(tenantId, work);
    expect(providerResult?.()).toBe(proof);
    return result;
  } };
  const executor = createSuccessFeeDirectDebitExecutor(verifiedTenantContextForQueuedJob(ctx.tenantId), {
    ownerPool: {} as Pool, digest: "a".repeat(64), store, sessions: f.sessions, rails: [f.rail],
  });
  let completed = false;
  const supplier = vi.fn(() => { expect(completed).toBe(true); return proof; });
  const callback = vi.fn(async () => { completed = true; return "done"; });
  await expect(composedStore(executor).transaction(ctx.tenantId, callback, supplier)).resolves.toBe("done");
  expect(received).toBe(supplier); expect(supplier).toHaveBeenCalledTimes(1); expect(callback).toHaveBeenCalledTimes(1);
});

it("rolls back the reservation when closing the reader fails without replaying work", async () => {
  const f = fixture(), failure = new Error("READER_COMMIT_FAILED");
  vi.spyOn(PaymentFeeCollectionRepository.prototype, "withReader").mockImplementation(async (_context, _digest, work) => {
    await work(async () => ({ fresh: true }));
    throw failure;
  });
  const executor = createSuccessFeeDirectDebitExecutor(verifiedTenantContextForQueuedJob(ctx.tenantId), {
    ownerPool: {} as Pool, digest: "a".repeat(64), store: f.store, sessions: f.sessions, rails: [f.rail],
  });
  const callback = vi.fn(async (book: CollectionBook, sources: LockedCollectionSources) => {
    await sources.successFee!(id(5), id(6), "a".repeat(64));
    book.events.test = "a".repeat(64);
  });
  await expect(composedStore(executor).transaction(ctx.tenantId, callback)).rejects.toBe(failure);
  expect(callback).toHaveBeenCalledTimes(1); expect(f.book().events).toEqual({});
});
