import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterEach, expect, it, vi } from "vitest";
import { MAX_MONEY_PENCE } from "@jobguard/core";
import { DEMO_IDENTITY_USER_ID, DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID, RecoveryAllocationRepository } from "@jobguard/db";
import { PracticeAccess } from "./practice-access.js";
import { RecoveryAllocationController } from "./recovery-allocation.controller.js";
import { recoveryAllocationViewV1 } from "./recovery-allocation.contracts.js";

const { testTenantContext } = await import(new URL("../../../packages/db/test/tenant-context-test-utils.ts", import.meta.url).href);
const jobId = randomUUID(), sessionId = randomUUID(), allocationId = randomUUID(), creditNoteId = randomUUID();
const caseId = randomUUID(), paymentId = randomUUID();
const creditedView = {
  version: "recovery-allocation-view.v1" as const, environment: "synthetic_demo" as const, realExternalActions: 0 as const, jobId,
  grossMovementsPence: 38400, eligibleNetPence: 32000, allocatedTaxPence: 6400,
  invoiceBalancePence: 2256000 - 38400 - 2256000, paused: false,
  availableEvidence: [], receipts: [], cases: [], allocations: [], lines: [], review: null,
  reversalSources: [{ allocationId, sourceId: creditNoteId, kind: "credit_note" as const, availableGrossPence: 38400 }],
};
const review = {
  action: "reverse" as const, caseId, paymentId, allocationId, expectedCaseRevision: 3,
  grossPence: 38400, eligibleNetPence: 32000, taxPence: 6400,
  approvalHash: "a".repeat(64), policyVersion: "reference-d03.v1", movementHash: "b".repeat(64), evidenceHash: "c".repeat(64),
};

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

// Small boundary reproducer: authentication and persistence are doubles; the
// controller, application response validation and HTTP error mapping are real.
it.each(["get", "review_reverse"])("paid-invoice credit remains readable and reversible: %s", async action => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  vi.spyOn(PracticeAccess.prototype, "job").mockResolvedValue({
    context: testTenantContext(DEMO_TENANT_ID), membershipId: DEMO_MEMBERSHIP_ID,
    identityUserId: DEMO_IDENTITY_USER_ID, digest: "d".repeat(64),
  });
  vi.spyOn(RecoveryAllocationRepository.prototype, "view").mockResolvedValue(creditedView);
  vi.spyOn(RecoveryAllocationRepository.prototype, "command").mockResolvedValue({ ...creditedView, review });
  const controller = new RecoveryAllocationController({} as Pool);
  const request = { headers: { cookie: `jg_session=${sessionId}` } };
  const result = action === "get"
    ? controller.get(request, jobId, {})
    : controller.reverse(request, jobId, {
      version: "recovery-allocation-command.v1", commandId: randomUUID(), action,
      allocationId, creditNoteId, expectedCaseRevision: 3, grossPence: 38400,
    });
  await expect(result).resolves.toMatchObject({ invoiceBalancePence: -38400, reversalSources: creditedView.reversalSources,
    review: action === "get" ? null : { action: "reverse", grossPence: 38400, eligibleNetPence: 32000, taxPence: 6400 } });
});

it.each([-MAX_MONEY_PENCE, 0, MAX_MONEY_PENCE])("accepts bounded signed invoice balance %s", invoiceBalancePence => {
  expect(recoveryAllocationViewV1.parse({ ...creditedView, invoiceBalancePence }).invoiceBalancePence).toBe(invoiceBalancePence);
});
it.each([-MAX_MONEY_PENCE - 1, MAX_MONEY_PENCE + 1, -0.5, 0.5, NaN, Infinity, -Infinity, "-38400"])("refuses invalid invoice balance %s", invoiceBalancePence => {
  expect(recoveryAllocationViewV1.safeParse({ ...creditedView, invoiceBalancePence }).success).toBe(false);
});
it.each(["grossMovementsPence", "eligibleNetPence", "allocatedTaxPence"])("keeps %s non-negative", field => {
  expect(recoveryAllocationViewV1.safeParse({ ...creditedView, invoiceBalancePence: 0, [field]: -1 }).success).toBe(false);
});
it("keeps reversal-source and review amounts non-negative", () => {
  expect(recoveryAllocationViewV1.safeParse({ ...creditedView, invoiceBalancePence: 0,
    reversalSources: [{ ...creditedView.reversalSources[0], availableGrossPence: -1 }] }).success).toBe(false);
  for (const field of ["grossPence", "eligibleNetPence", "taxPence"]) {
    expect(recoveryAllocationViewV1.safeParse({ ...creditedView, invoiceBalancePence: 0, review: { ...review, [field]: -1 } }).success).toBe(false);
  }
});
