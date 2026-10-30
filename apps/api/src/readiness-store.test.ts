import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import type { VerifiedTenantContext } from "@jobguard/db";
import { DurableReadinessStore } from "./readiness-store.js";
import type { ReadinessProposal, ScheduledPlan } from "./readiness-scheduler.js";

const scope = { tenantId: randomUUID(), jobId: randomUUID(), taskId: randomUUID() };
const plan: ScheduledPlan = { version: "readiness-scheduled-plan.v1", synthetic: true, scope, factRevision: 1,
  ruleRevision: "readiness-scheduled.v1", status: "confirmed", plannedDate: "2026-11-02", jurisdiction: "england-and-wales",
  localTime: "09:00", timeZone: "Europe/London", predecessors: [], edges: [], material: { requiredUnits: 1, landedUnits: 1 }, access: "unknown", crew: true };
const proposal: ReadinessProposal = { version: "readiness-prevention-proposal.v1", scope, key: "a".repeat(64), planHash: "b".repeat(64),
  ruleRevision: "readiness-scheduled.v1", evaluatedAt: "2026-11-02T09:00:00.000Z", ready: false, reasons: ["Access availability unknown"], weather: "unknown",
  classification: "prevention", feeEligible: false, recoveryFeePence: 0, status: "proposal", programmeChanged: false };
function fixture(mode = "synthetic_demo") {
  const connect = vi.fn(() => { throw new Error("unexpected database access"); });
  const store = new DurableReadinessStore({ connect } as unknown as Pool, { tenantId: scope.tenantId } as VerifiedTenantContext, mode);
  return { store, connect };
}
describe("durable readiness store boundaries", () => {
  it("refuses default and all live modes before touching a connection", async () => {
    for (const mode of ["disabled", "production_billing", "pilot_no_charge", "provider_sandbox"]) {
      const { store, connect } = fixture(mode);
      await expect(store.confirm(plan, "member:synthetic")).rejects.toThrow("READINESS_LIVE_DISABLED");
      await expect(store.load(scope)).rejects.toThrow("READINESS_LIVE_DISABLED");
      await expect(store.recordProposal(proposal)).rejects.toThrow("READINESS_LIVE_DISABLED");
      await expect(store.proposals(scope)).rejects.toThrow("READINESS_LIVE_DISABLED");
      expect(connect).not.toHaveBeenCalled();
    }
  });
  it("returns no rows for a different tenant and refuses its writes", async () => {
    const { store, connect } = fixture(), other = { ...scope, tenantId: randomUUID() };
    expect(await store.load(other)).toBeNull(); expect(await store.proposals(other)).toEqual([]);
    await expect(store.confirm({ ...plan, scope: other }, "member:synthetic")).rejects.toThrow("READINESS_SCOPE_MISMATCH");
    await expect(store.recordProposal({ ...proposal, scope: other })).rejects.toThrow("READINESS_SCOPE_MISMATCH");
    expect(connect).not.toHaveBeenCalled();
  });
  it("rejects malformed/model/authority-bearing plans and cycles without writes", async () => {
    const { store, connect } = fixture();
    for (const patch of [{ synthetic: false }, { access: null }, { crew: "false" }, { status: "model_suggested" }, { cureHours: 1 }, { approved: true }, { factRevision: 0 }]) {
      await expect(store.confirm({ ...plan, ...patch }, "member:synthetic")).rejects.toThrow("INVALID_READINESS_PLAN");
    }
    await expect(store.confirm({ ...plan, edges: [{ taskId: scope.taskId, dependsOnTaskId: scope.taskId }] }, "member:synthetic")).rejects.toThrow("DEPENDENCY_CYCLE");
    expect(connect).not.toHaveBeenCalled();
  });
  it("refuses fee, locked bill, programme changes and false readiness at the persistence boundary", async () => {
    const { store, connect } = fixture();
    for (const patch of [{ feeEligible: true }, { recoveryFeePence: 1 }, { programmeChanged: true }, { classification: "recovery" }, { lockedBillId: randomUUID() }, { ready: true }, { ready: true, reasons: [] }, { weather: null }]) {
      await expect(store.recordProposal({ ...proposal, ...patch } as ReadinessProposal)).rejects.toThrow("INVALID_READINESS_PROPOSAL");
    }
    await expect(store.recordProposal(null)).rejects.toThrow("INVALID_READINESS_PROPOSAL");
    expect(connect).not.toHaveBeenCalled();
  });
});
