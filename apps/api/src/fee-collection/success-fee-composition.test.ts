import { afterEach, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { PaymentFeeCollectionRepository, PaymentFeeCollectionSourceError, verifiedTenantContextForQueuedJob } from "@jobguard/db";
import { createSuccessFeeDirectDebitExecutor } from "./success-fee-composition.js";
import { fixture, ctx } from "./test-fixture.js";
afterEach(() => vi.restoreAllMocks());
it.each(["AUTHORITY_DISPUTED", "AUTHORITY_REVOKED", "AUTHORITY_EXPIRED"] as const)("registers the MON-4A reader and preserves %s", async reason => {
  const standIn = vi.fn(), f = fixture(standIn);
  const read = vi.fn(async () => { throw new PaymentFeeCollectionSourceError(reason); });
  const registration = vi.spyOn(PaymentFeeCollectionRepository.prototype, "withReader")
    .mockImplementation(async (_context, _digest, work) => work(read));
  const context = verifiedTenantContextForQueuedJob(ctx.tenantId);
  const executor = createSuccessFeeDirectDebitExecutor({ ownerPool: {} as Pool, context, digest: "a".repeat(64),
    store: f.store, sessions: f.sessions, rails: [f.rail] });
  await expect(executor.reserve(ctx, { ...f.intent, purpose: "receipt_success_fee" })).rejects.toMatchObject({ reason });
  expect(registration).toHaveBeenCalledWith(context, "a".repeat(64), expect.any(Function));
  expect(read).toHaveBeenCalledWith(f.intent.jobId, f.intent.invoiceId, f.intent.statementHash);
  expect(standIn).not.toHaveBeenCalled(); expect(f.book().attempts).toEqual([]);
});
