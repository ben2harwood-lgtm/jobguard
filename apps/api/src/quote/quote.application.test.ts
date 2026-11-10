import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterEach, expect, it, vi } from "vitest";
import { QuoteDeliveryRepository, type QuoteDeliveryView } from "@jobguard/db";
import { PracticeAccess } from "../practice-access.js";
import { QuoteApplication } from "./quote.application.js";

const jobId = randomUUID();
const input = { version: "quote-send-command.v1", commandId: randomUUID(), documentId: randomUUID(), contentHash: "a".repeat(64), recipient: "customer@fictional.invalid" };
const saved: QuoteDeliveryView = { documentId: input.documentId, documentVersion: 1, quoteRevision: 1, contentHash: input.contentHash, recipient: input.recipient, status: "queued", attempts: 0, receiptCount: 0, effects: { platformDebt: 0, chargeAttempts: 0, realExternalActions: 0 } };
function fixture(blank = true) {
  const principal = { context: { tenantId: randomUUID() }, digest: "b".repeat(64), membershipId: randomUUID(), identityUserId: randomUUID() } as never;
  const access = vi.spyOn(PracticeAccess.prototype, "job").mockResolvedValue(principal);
  const query = vi.fn().mockResolvedValue({ rows: [{ blank }] });
  const pool = { query } as unknown as Pool;
  const issue = vi.spyOn(QuoteDeliveryRepository.prototype, "issue").mockResolvedValue(saved);
  const delivered = { ...saved, status: "simulated_delivery" as const, attempts: 1, receiptCount: 1 };
  const execute = vi.spyOn(QuoteDeliveryRepository.prototype, "execute").mockResolvedValue(delivered);
  return { app: new QuoteApplication(pool, randomUUID()), access, query, issue, execute, delivered, principal };
}
afterEach(() => vi.restoreAllMocks());
it("waits for committed issue, identifies the authenticated digest and rechecks access before exact execution", async () => {
  const f = fixture();
  let commit!: (value: QuoteDeliveryView) => void;
  f.issue.mockReturnValueOnce(new Promise(resolve => { commit = resolve; }));
  const pending = f.app.issue(jobId, input);
  await vi.waitFor(() => expect(f.issue).toHaveBeenCalledTimes(1));
  expect(f.query).not.toHaveBeenCalled(); expect(f.execute).not.toHaveBeenCalled();
  commit(saved);
  expect(await pending).toEqual(f.delivered);
  expect(f.query).toHaveBeenCalledWith("SELECT app.is_blank_practice_company($1) blank", ["b".repeat(64)]);
  expect(f.access).toHaveBeenCalledTimes(2);
  const current = { ...f.principal as object, context: { tenantId: randomUUID() } } as never;
  f.access.mockResolvedValueOnce(f.principal).mockResolvedValueOnce(current);
  await f.app.issue(jobId, input);
  expect(f.execute).toHaveBeenLastCalledWith((current as { context: unknown }).context, jobId, input.documentId, "success");
});
it("keeps nonblank practice on the manual path", async () => {
  const f = fixture(false);
  expect(await f.app.issue(jobId, input)).toEqual(saved);
  expect(f.execute).not.toHaveBeenCalled(); expect(f.access).toHaveBeenCalledTimes(1);
});
it.each(["simulated_delivery", "outcome_unknown", "cancelled", "previewed"] as const)("returns saved %s without execution or reconciliation", async status => {
  const f = fixture(), result = { ...saved, status };
  f.issue.mockResolvedValue(result);
  expect(await f.app.issue(jobId, input)).toEqual(result);
  expect(f.execute).not.toHaveBeenCalled();
});
it("refuses a reset/revoked session between commit and execution", async () => {
  const f = fixture(); f.access.mockRejectedValueOnce(new Error("UNAUTHENTICATED"));
  await expect(f.app.issue(jobId, input)).rejects.toThrow("UNAUTHENTICATED");
  expect(f.issue).not.toHaveBeenCalled();
  f.access.mockResolvedValueOnce(f.principal).mockRejectedValueOnce(new Error("UNAUTHENTICATED"));
  await expect(f.app.issue(jobId, input)).rejects.toThrow("UNAUTHENTICATED");
  expect(f.execute).not.toHaveBeenCalled();
});
it("propagates exact-issue refusal and executor failure without manufacturing success", async () => {
  const f = fixture(); f.issue.mockRejectedValueOnce(new Error("QUOTE_CHANGED"));
  await expect(f.app.issue(jobId, input)).rejects.toThrow("QUOTE_CHANGED"); expect(f.execute).not.toHaveBeenCalled();
  f.execute.mockRejectedValueOnce(new Error("EXECUTION_FAILED"));
  await expect(f.app.issue(jobId, input)).rejects.toThrow("EXECUTION_FAILED");
});
it("returns an executor's saved unknown result honestly", async () => {
  const f = fixture(), unknown = { ...saved, status: "outcome_unknown" as const, attempts: 1 };
  f.execute.mockResolvedValueOnce(unknown);
  expect(await f.app.issue(jobId, input)).toEqual(unknown);
  expect(f.execute).toHaveBeenCalledTimes(1);
});
it("rejects client flags and changed command versions before issuing", async () => {
  const f = fixture();
  for (const extra of [{ blank: true }, { tenantId: randomUUID() }, { version: "v2" }])
    await expect(f.app.issue(jobId, { ...input, ...extra })).rejects.toThrow("INVALID_QUOTE");
  expect(f.issue).not.toHaveBeenCalled(); expect(f.execute).not.toHaveBeenCalled();
});
