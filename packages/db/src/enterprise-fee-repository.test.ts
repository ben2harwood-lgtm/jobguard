import { describe, expect, it } from "vitest";
import { EnterpriseFeeError } from "@jobguard/core";
import { EnterpriseFeeRepository, enterpriseFeeProductionCommandV1, enterpriseReconcileExportedDuplicateV1, enterpriseFeeApproveStatementV1, enterpriseFeeDatabaseFailure, enterpriseFeeDeriveCommandV1, enterpriseFeeDisputeStatementV1 } from "./enterprise-fee-repository.js";

describe("ENT-7a enterprise fee repository boundary", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  it("accepts only the strict derive command: no amount, rate, origin or allocation can be supplied", () => {
    const ok = { version: "enterprise-fee-derive.v1", commandId: id, agreementVersionId: id, period: "2026-10" };
    expect(enterpriseFeeDeriveCommandV1.safeParse(ok).success).toBe(true);
    for (const extra of [{ cumulativeFeePence: 1 }, { rate: "1/10" }, { contributions: [] }]) expect(enterpriseFeeDeriveCommandV1.safeParse({ ...ok, ...extra }).success).toBe(false);
    for (const period of ["2026-13", "1999-12", "2026-1", "26-10"]) expect(enterpriseFeeDeriveCommandV1.safeParse({ ...ok, period }).success).toBe(false);
  });
  it("ReconcileExportedDuplicate accepts identities only, never an app-supplied amount", async () => {
    const command = { version: "enterprise-reconcile-exported-duplicate.v1", commandId: id, jobId: id, duplicateId: id, canonicalId: "22222222-2222-4222-8222-222222222222" };
    expect(enterpriseReconcileExportedDuplicateV1.safeParse(command).success).toBe(true);
    for (const extra of [{ amountPence: 1 }, { corrections: [] }, { tenantId: id }, { canonicalId: id }])
      expect(enterpriseReconcileExportedDuplicateV1.safeParse({ ...command, ...extra }).success).toBe(false);
    const repo = new EnterpriseFeeRepository({ connect: () => { throw new Error("must not connect"); } } as never);
    await expect(repo.reconcileExportedDuplicate({} as never, id, { ...command, amountPence: 1 })).rejects.toMatchObject({ code: "INVALID_FEE_INPUT" });
  });
  it("maps database refusals to public codes and treats anything else as an unknown outcome", () => {
    const code = (e: unknown) => { try { enterpriseFeeDatabaseFailure(e); } catch (x) { return (x as EnterpriseFeeError).code; } };
    expect(code({ message: "FEE_NOT_FOUND" })).toBe("FEE_NOT_FOUND");
    expect(code({ message: "permission denied", code: "42501" })).toBe("EXTRA_FORBIDDEN");
    expect(code({ message: "duplicate", code: "23505" })).toBe("COMMAND_CONFLICT");
    expect(code(new Error("connection reset"))).toBe("OUTCOME_UNKNOWN");
  });
  it("refuses malformed input before any database call", async () => {
    const repo = new EnterpriseFeeRepository({ connect: () => { throw new Error("must not connect"); } } as never);
    await expect(repo.derive({} as never, "not-a-uuid", {})).rejects.toMatchObject({ code: "INVALID_FEE_INPUT" });
    await expect(repo.read({} as never, id, "nope")).rejects.toMatchObject({ code: "INVALID_FEE_INPUT" });
  });
  it("ENT-7b approval binds exact hash, integer total and an explicit expiry; disputes carry a short reason code", () => {
    const ok = { version: "enterprise-fee-approve-statement.v1", commandId: id, statementId: id, contentHash: "a".repeat(64), totalDeltaPence: -12, expiresAt: "2026-10-28T12:00:00Z" };
    expect(enterpriseFeeApproveStatementV1.safeParse(ok).success).toBe(true);
    for (const bad of [{ contentHash: "A".repeat(64) }, { totalDeltaPence: 1.5 }, { expiresAt: "tomorrow" }, { amount: 1 }]) expect(enterpriseFeeApproveStatementV1.safeParse({ ...ok, ...bad }).success).toBe(false);
    const dispute = { version: "enterprise-fee-dispute-statement.v1", commandId: id, statementId: id, reasonCode: "line_disputed" };
    expect(enterpriseFeeDisputeStatementV1.safeParse(dispute).success).toBe(true);
    for (const reasonCode of ["Line", "1x", "a".repeat(41), "free text"]) expect(enterpriseFeeDisputeStatementV1.safeParse({ ...dispute, reasonCode }).success).toBe(false);
  });
});

describe("M4-9 dark production command", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const derive = { version: "enterprise-fee-production.v1", action: "derive", commandId: id, agreementVersionId: id, period: "2026-10" };
  it("accepts identities only; policy approval, environment and amounts cannot be request authority", () => {
    expect(enterpriseFeeProductionCommandV1.safeParse(derive).success).toBe(true);
    expect(enterpriseFeeProductionCommandV1.safeParse({ version: derive.version, action: "accrue", commandId: id, statementId: id, authorizationId: id }).success).toBe(true);
    for (const fields of [{ environment: "production_billing" }, { policyApproved: true }, { gate: "G4-C" }, { amountPence: 1 }, { contributions: [] }])
      expect(enterpriseFeeProductionCommandV1.safeParse({ ...derive, ...fields }).success).toBe(false);
  });
  it("rejects malformed production commands before connecting", async () => {
    const repo = new EnterpriseFeeRepository({ connect: () => { throw new Error("must not connect"); } } as never);
    for (const raw of [{ ...derive, enabled: true }, { ...derive, period: "2026-13" }, { ...derive, action: "accrue" }])
      await expect(repo.productionCommand({} as never, id, raw)).rejects.toMatchObject({ code: "INVALID_FEE_INPUT" });
  });
});
