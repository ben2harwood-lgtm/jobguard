import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ReceiptCaseAllocationApplication, receiptCaseAllocationFailure } from "./receipt-case-allocation.application.js";
const state = vi.hoisted(() => ({ job: vi.fn() }));
vi.mock("./practice-access.js", () => ({ PracticeAccess: class { job = state.job; } }));
const jobId = randomUUID(), context = { tenantId: randomUUID() };
const auth = { context, membershipId: randomUUID(), identityUserId: randomUUID(), digest: "a".repeat(64) };
const lines = { view: vi.fn(), command: vi.fn() }, cases = { command: vi.fn() };
const app = () => new ReceiptCaseAllocationApplication({} as Pool, randomUUID(), { lines, cases });
const command = { version: "stored-receipt-case-command.v1", commandId: randomUUID(), action: "review", factLineId: randomUUID(), caseId: randomUUID(), workId: randomUUID(), expectedCaseRevision: 1 };
const body = { version: "receipt-case-allocation-command.v1", target: "case", command };
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); state.job.mockResolvedValue(auth); });
afterEach(() => vi.unstubAllEnvs());
it("authenticates before parsing or reading lazy bodies, including replays", async () => {
 const read = vi.fn(); state.job.mockRejectedValue(new Error("NOT_FOUND"));
 await expect(app().command(jobId, read)).rejects.toThrow("NOT_FOUND");
 expect(read).not.toHaveBeenCalled(); expect(cases.command).not.toHaveBeenCalled();
});
it("forwards only validated identifiers and server authority to the stored allocator", async () => {
 cases.command.mockResolvedValue({ replayed: false });
 expect(await app().command(jobId, () => body)).toEqual({ replayed: false });
 expect(cases.command).toHaveBeenCalledWith(context, jobId, auth.digest, command);
 expect(lines.command).not.toHaveBeenCalled();
});
it.each([{ ...body, tenantId: randomUUID() }, { ...body, command: { ...command, netPence: 80000 } }, { ...body, command: { ...command, action: "approve", reviewId: randomUUID(), approvalHash: "bad" } }])("refuses forged money, scope and malformed approvals", async raw => {
 await expect(app().command(jobId, raw)).rejects.toMatchObject({ code: "INVALID_RECEIPT_CASE_COMMAND" }); expect(cases.command).not.toHaveBeenCalled();
});
it("uses the neutral producer for receipt review/reversal and reads", async () => {
 const input = { version: "receipt-line-facts-command.v1", action: "review", commandId: randomUUID(), paymentId: randomUUID(), expectedSourceRevision: 1 };
 await app().command(jobId, { ...body, target: "receipt_lines", command: input });
 expect(lines.command).toHaveBeenCalledWith(context, { membershipId: auth.membershipId, identityUserId: auth.identityUserId }, auth.digest, jobId, input);
 await app().view(jobId); expect(lines.view).toHaveBeenCalled();
 await expect(app().view(jobId, { tenantId: context.tenantId })).rejects.toMatchObject({ code: "INVALID_RECEIPT_CASE_QUERY" });
});
it("refuses production before access and preserves unknown commit outcomes as failures", async () => {
 vi.stubEnv("JOBGUARD_ENV", "production"); await expect(app().command(jobId, body)).rejects.toMatchObject({ code: "SYNTHETIC_MODE_REQUIRED" }); expect(state.job).not.toHaveBeenCalled();
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); const lost = new Error("commit acknowledgement lost"); cases.command.mockRejectedValue(lost);
 await expect(app().command(jobId, body)).rejects.toBe(lost); expect(receiptCaseAllocationFailure(lost)).toEqual({ status: 503, code: "RECEIPT_CASE_ALLOCATION_UNAVAILABLE" });
 expect(receiptCaseAllocationFailure(Object.assign(new Error("STORED_RECEIPT_APPROVAL_CHANGED"), { code: "23514" }))).toEqual({ status: 409, code: "STORED_RECEIPT_APPROVAL_CHANGED" });
});
