import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { RecoveryDemoRepository } from "./recovery-demo-repository.js";
import { PostgresRecoveryOutcomePostingPort } from "./recovery-repository.js";
import { verifiedTenantContextFromMembership } from "./tenant-context.js";

// Boundary doubles only: no claim about PostgreSQL authority, atomicity or RLS.
function database(rows: Record<string, unknown>[] = []) {
  const query = vi.fn(async (_sql: string, _values?: unknown[]) => ({ rows, rowCount: rows.length }));
  const release = vi.fn();
  const connect = vi.fn(async () => ({ query, release }));
  return { pool: { connect } as unknown as Pool, query, connect, release };
}
const context = verifiedTenantContextFromMembership({
  tenantId: randomUUID(), identityUserId: randomUUID(), membershipId: randomUUID(),
} as Parameters<typeof verifiedTenantContextFromMembership>[0]);
function approval() {
  return {
    version: "recovery.landing.approve.v1", commandId: randomUUID(), jobId: randomUUID(),
    allocationId: randomUUID(), derivationId: randomUUID(), journalId: randomUUID(),
    caseId: randomUUID(), receiptId: randomUUID(), evidenceId: randomUUID(),
    eligibilityApprovalId: randomUUID(), landingApprovalId: randomUUID(),
    grossPence: 18000, eligibleNetPence: 15000, currency: "GBP",
    policyVersion: "reference_fee_policy_v1", expectedCaseRevision: 0,
  };
}

describe("LATER-B17 historical v1 repository boundaries", () => {
  it("L104 parses the complete approval envelope and forwards every posting identity", async () => {
    const input = approval(), db = database([{ id: input.derivationId }]);
    const result = await new PostgresRecoveryOutcomePostingPort(db.pool).approveSyntheticLanding(context, input);
    expect(result).toBe(input.derivationId);
    const posting = db.query.mock.calls.find(([sql]) => sql.includes("approve_synthetic_landing"));
    expect(posting).toBeDefined();
    expect(JSON.parse(posting![1]![0] as string)).toEqual(input);
    expect(db.query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
    expect(db.release).toHaveBeenCalledOnce();
  });

  it.each(["tenantId", "actorMembershipId", "approved", "settled", "unexpected"])(
    "L104 refuses untrusted %s before connecting", async field => {
      const db = database();
      await expect(new PostgresRecoveryOutcomePostingPort(db.pool).approveSyntheticLanding(
        context, { ...approval(), [field]: randomUUID() },
      )).rejects.toMatchObject({ name: "ZodError" });
      expect(db.connect).not.toHaveBeenCalled();
    },
  );

  it.each(["allocationId", "derivationId", "journalId", "commandId", "eligibilityApprovalId", "landingApprovalId"])(
    "L104 requires a valid %s in the full envelope", async field => {
      for (const invalid of [undefined, "invalid"]) {
        const db = database();
        await expect(new PostgresRecoveryOutcomePostingPort(db.pool).approveSyntheticLanding(
          context, { ...approval(), [field]: invalid },
        )).rejects.toMatchObject({ name: "ZodError" });
        expect(db.connect).not.toHaveBeenCalled();
      }
    },
  );

  it("L104 propagates a posting failure through transaction rollback", async () => {
    const db = database(), failure = new Error("posting refused");
    db.query.mockImplementation(async sql => {
      if (sql.includes("approve_synthetic_landing")) throw failure;
      return { rows: [], rowCount: 0 };
    });
    await expect(new PostgresRecoveryOutcomePostingPort(db.pool).approveSyntheticLanding(context, approval())).rejects.toBe(failure);
    expect(db.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
    expect(db.query.mock.calls.some(([sql]) => sql === "COMMIT")).toBe(false);
    expect(db.release).toHaveBeenCalledOnce();
  });

  it.each([
    { liability: "20300", delta: "5300" },
    { liability: "20300", delta: "0" },
    { liability: "20300", delta: "20300" },
  ])("L119 reads the posting delta $delta rather than cumulative liability $liability", async ({ liability, delta }) => {
    const job = randomUUID(), allocation = randomUUID();
    const db = database([{
      scenario: "eligible", case_id: randomUUID(), receipt_id: randomUUID(), evidence_id: randomUUID(),
      allocation_id: allocation, liability_pence: liability, posting_delta_pence: delta,
    }]);
    const result = await new RecoveryDemoRepository(db.pool).read(job);
    expect(result).toMatchObject({ jobId: job, allocationId: allocation, approved: true, additionalFeePence: Number(delta) });
    const read = db.query.mock.calls.find(([sql]) => sql.includes("FROM app.recovery_demo_selection"));
    expect(read?.[0]).toContain("d.posting_delta_pence");
    expect(read?.[0]).not.toContain("d.liability_pence");
  });

  it("L119 keeps an unapproved selection at zero additional fee", async () => {
    const db = database([{
      scenario: "eligible", case_id: randomUUID(), receipt_id: randomUUID(), evidence_id: randomUUID(),
      allocation_id: null, posting_delta_pence: null,
    }]);
    expect(await new RecoveryDemoRepository(db.pool).read(randomUUID())).toMatchObject({ approved: false, additionalFeePence: 0 });
  });
});
