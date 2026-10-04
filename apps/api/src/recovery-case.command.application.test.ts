import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { beforeEach, expect, it, vi } from "vitest";
const spies = vi.hoisted(() => ({ verify: vi.fn(), command: vi.fn(), list: vi.fn() }));
vi.mock("@jobguard/db", async importOriginal => ({
  ...await importOriginal<typeof import("@jobguard/db")>(),
  readSyntheticDemoJob: spies.verify,
  RecoveryCaseRepository: class { command = spies.command; list = spies.list; },
}));
import { DEMO_IDENTITY_USER_ID, DEMO_MEMBERSHIP_ID } from "@jobguard/db";
const serverReviewer = { membershipId: DEMO_MEMBERSHIP_ID, identityUserId: DEMO_IDENTITY_USER_ID };
import { RecoveryCaseApplication } from "./recovery-case.application.js";
const jobId = randomUUID();
const input = () => ({ version:"recovery-case-command.v1", action:"open", commandId:randomUUID(), caseType:"merchant_overcharge", claimedNetPence:32000, counterparty:"Merchant", book:"supplier_cost", sourceType:"supplier_documents", sourceRefs:["INV-320"], expectedRevision:0 });
beforeEach(() => { vi.resetAllMocks(); spies.list.mockResolvedValue([]); spies.verify.mockResolvedValue({job:{id:jobId}}); });
it("derives the reviewer from verified sandbox membership with no client reviewer", async () => {
  const pool = {} as Pool;
  await new RecoveryCaseApplication(pool).command(jobId,input());
  expect(spies.verify).toHaveBeenCalledWith(pool,jobId);
  expect(spies.command).toHaveBeenCalledWith(expect.anything(),jobId,expect.anything(),serverReviewer);
});
it("does not authorize a client-supplied reviewer", async () => {
  await new RecoveryCaseApplication({} as Pool).command(jobId,{...input(),reviewerRef:"forged-reviewer"});
  expect(spies.command.mock.calls[0]?.[3]).toEqual(serverReviewer);
});
it("refuses the command when membership verification fails", async () => {
  spies.verify.mockRejectedValue(new Error("MEMBERSHIP_FORBIDDEN"));
  await expect(new RecoveryCaseApplication({} as Pool).command(jobId,{...input(),reviewerRef:"forged-reviewer"})).rejects.toThrow("MEMBERSHIP_FORBIDDEN");
  expect(spies.command).not.toHaveBeenCalled();
});
