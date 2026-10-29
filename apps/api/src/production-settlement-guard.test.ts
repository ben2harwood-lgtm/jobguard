import { describe, expect, it, vi } from "vitest";
import { MAX_MONEY_PENCE } from "@jobguard/core";
import { postFeeObligation } from "./effects/fee-posting.js";
import {
  executeSettlementGuardedWork, ProductionSettlementDeniedError,
  readG4SEvidenceChecklist, readProductionSettlementEligibility,
  requireProductionSettlementEligibility,
} from "./production-settlement-guard.js";

const tenantId = "10000000-0000-4000-8000-000000000001";
const jobId = "10000000-0000-4000-8000-000000000002";
const otherId = "10000000-0000-4000-8000-000000000003";
const cash = () => ({
  version: "production-settlement-facts.v1", tenantId, jobId, amountPence: 101, category: "cash",
  source: { tenantId, jobId, environment: "production_billing", proof: "verified", movement: "settled",
    settledPence: 101, allocatedPence: 101, reversedPence: 0, refundedPence: 0 },
});

describe("SV-8 dark production settlement guard", () => {
  it("reads the absent G4-S record honestly without pretending evidence or approval exists", () => {
    expect(readG4SEvidenceChecklist()).toEqual({
      version: "g4-s-evidence-checklist.v1", record: "missing", lock: "missing", isolation: "missing",
      attribution: "missing", reversalRefundControls: "missing", independentV3Arithmetic: "missing",
      reviewedTerms: "missing", reviewedPilotEvidence: "missing", productionEnabled: false,
    });
    expect(Object.isFrozen(readG4SEvidenceChecklist())).toBe(true);
  });

  it.each([1, 5, 15, 101, MAX_MONEY_PENCE])("valid %i pence cash still cannot open production", amountPence => {
    const facts = cash();
    Object.assign(facts, { amountPence });
    Object.assign(facts.source, { settledPence: amountPence, allocatedPence: amountPence });
    expect(readProductionSettlementEligibility(facts)).toMatchObject({ cashRequirementsMet: true, eligible: false });
    expect(() => requireProductionSettlementEligibility("production_billing", facts)).toThrow(ProductionSettlementDeniedError);
  });

  it.each([
    ["builder receipt", { proof: "builder_attested" }],
    ["unverified proof", { proof: "unverified" }],
    ["pending movement", { movement: "pending" }],
    ["cancelled movement", { movement: "cancelled" }],
    ["demo fact", { environment: "synthetic_demo" }],
    ["reference fact", { environment: "synthetic_reference" }],
    ["sandbox fact", { environment: "provider_sandbox" }],
    ["another tenant", { tenantId: otherId }],
    ["another job in same tenant", { jobId: otherId }],
    ["unallocated cash", { allocatedPence: 0 }],
    ["over allocated amount", { allocatedPence: 100 }],
    ["allocation over source", { allocatedPence: 102 }],
    ["source too small", { settledPence: 100 }],
    ["partial reversal", { reversedPence: 1 }],
    ["full reversal", { reversedPence: 101 }],
    ["refund", { refundedPence: 1 }],
  ])("refuses %s", (_name, changes) => {
    const facts = cash();
    Object.assign(facts.source, changes);
    expect(readProductionSettlementEligibility(facts).cashRequirementsMet).toBe(false);
    expect(() => requireProductionSettlementEligibility("production_billing", facts)).toThrow(ProductionSettlementDeniedError);
  });

  it.each([0, -1, 0.5, MAX_MONEY_PENCE + 1, Number.NaN, Number.POSITIVE_INFINITY])("refuses amount %s without rounding", amountPence => {
    expect(readProductionSettlementEligibility({ ...cash(), amountPence }).cashRequirementsMet).toBe(false);
  });

  it("keeps consumed credit disabled even with otherwise valid claimed cash", () => {
    expect(readProductionSettlementEligibility({ ...cash(), category: "consumed_credit" })).toMatchObject({
      cashRequirementsMet: false, consumedCreditProductionEnabled: false, eligible: false,
    });
  });

  it.each([undefined, null, {}, { ...cash(), g4SApproved: true }, { ...cash(), productionEnabled: true }])(
    "fails closed for missing, malformed or client-extended facts", facts => {
      expect(readProductionSettlementEligibility(facts).cashRequirementsMet).toBe(false);
      expect(() => requireProductionSettlementEligibility("production_billing", facts)).toThrow(ProductionSettlementDeniedError);
    },
  );

  it("does not let an approved D01 bypass the settlement gate", () => {
    expect(() => postFeeObligation("production_billing", {
      id: "D01", policyVersion: "reference_fee_policy_v3", status: "approved",
    })).toThrow(ProductionSettlementDeniedError);
  });

  it.each(["production_billing", "pilot_no_charge", "provider_sandbox", "production", "disabled", ""])(
    "refuses worker effects in %s before reads, writes, attempts or providers", async mode => {
      const execute = vi.fn(async () => ({ claimed: true }));
      await expect(executeSettlementGuardedWork(mode, execute)).rejects.toThrow(ProductionSettlementDeniedError);
      expect(execute).not.toHaveBeenCalled();
    },
  );

  it("refuses duplicate and changed-key replays, reversals in either order, and locked or superseded bill references without leaking payloads", async () => {
    const execute = vi.fn(async (_payload: unknown) => undefined);
    const command = { commandId: otherId, idempotencyKey: "fake-only-key", ...cash() };
    const attacks = [command, command, { ...command, amountPence: 1 },
      { ...command, action: "reversal" }, command, { ...command, action: "cancel" },
      { ...command, lockId: otherId, finalAccountRevision: "locked" },
      { ...command, finalAccountRevision: "superseded" },
      { ...command, tenantId: otherId, hiddenSignal: "secret synthetic note", email: "fixture@example.invalid" }];
    for (const payload of attacks) {
      // The queue entry passes only a closure, never payload-supplied evidence, to the gate.
      await expect(executeSettlementGuardedWork("production_billing", () => execute(payload)))
        .rejects.toMatchObject({ code: "PRODUCTION_SETTLEMENT_DISABLED", message: "PRODUCTION_SETTLEMENT_DISABLED" });
    }
    expect(execute).not.toHaveBeenCalled();
    expect(JSON.stringify(readProductionSettlementEligibility(attacks.at(-1))))
      .not.toMatch(/secret|fixture@example|10000000|fake-only-key/);
  });

  it("keeps synthetic execution results and failures unchanged", async () => {
    const result = Object.freeze({ synthetic: true });
    const execute = vi.fn(async () => result);
    expect(await executeSettlementGuardedWork("synthetic_demo", execute)).toBe(result);
    expect(execute).toHaveBeenCalledTimes(1);
    const failure = new Error("existing synthetic refusal");
    await expect(executeSettlementGuardedWork("synthetic_demo", async () => { throw failure; })).rejects.toBe(failure);
    expect(postFeeObligation("synthetic_demo", { id: "D01", policyVersion: "reference_fee_policy_v1", status: "proposed" }))
      .toBe("gate_passed");
  });
});
