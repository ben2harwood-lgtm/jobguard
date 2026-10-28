import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { StoredReceiptCaseAllocationRepository, storedReceiptCaseCommandV1 } from "./stored-receipt-case-allocation-repository.js";
import type { VerifiedTenantContext } from "./tenant-context.js";
const command = { version: "stored-receipt-case-command.v1", action: "review", commandId: randomUUID(), factLineId: randomUUID(), caseId: randomUUID(), workId: randomUUID(), expectedCaseRevision: 1 };
describe("stored receipt case command boundary", () => {
  it.each(["grossPence", "netPence", "taxPence", "artifact", "sourceHash", "tenantId"])("refuses app-supplied %s before connecting", async key => {
    const pool = { connect: vi.fn() };
    await expect(new StoredReceiptCaseAllocationRepository(pool as unknown as Pool, "synthetic_demo")
      .command({} as VerifiedTenantContext, randomUUID(), "a".repeat(64), { ...command, [key]: 1 })).rejects.toMatchObject({ code: "INVALID_STORED_RECEIPT_COMMAND" });
    expect(pool.connect).not.toHaveBeenCalled();
  });
  it.each(["production", "pilot_no_charge", "unconfigured", "development"])("refuses %s before connecting", async env => {
    const pool = { connect: vi.fn() };
    await expect(new StoredReceiptCaseAllocationRepository(pool as unknown as Pool, env)
      .command({} as VerifiedTenantContext, randomUUID(), "a".repeat(64), command)).rejects.toMatchObject({ code: "STORED_RECEIPT_SYNTHETIC_ONLY" });
    expect(pool.connect).not.toHaveBeenCalled();
  });
  it("requires the saved review identity and exact approval hash", () => {
    expect(storedReceiptCaseCommandV1.safeParse(command).success).toBe(true);
    expect(storedReceiptCaseCommandV1.safeParse({ ...command, action: "approve" }).success).toBe(false);
    expect(storedReceiptCaseCommandV1.safeParse({ ...command, action: "approve", reviewId: randomUUID(), approvalHash: "b".repeat(64) }).success).toBe(true);
  });
});
