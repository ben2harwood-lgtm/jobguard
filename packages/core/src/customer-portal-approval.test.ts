import { describe, expect, it } from "vitest";
import {
  customerPortalApprovalCommandV1, customerPortalApprovalResultV1,
  customerPortalApprovalBinding, assertCustomerPortalApprovalTarget,
  customerPortalApprovalReplay,
} from "./customer-portal-approval.js";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const quote = { kind: "quote" as const, id: id(3), revision: 2, hash: "a".repeat(64), amount: { pence: 12000, currency: "GBP" as const } };
const command = { version: "customer-portal-approval.v1" as const, commandId: id(1), jobId: id(2), expectedJobRevision: 4, target: quote };
const binding = { tenantId: id(4), customerId: id(5), partyBindingId: id(6), policyVersion: "synthetic-reference.v1", realActorMembershipId: id(10), actingMembershipId: id(11), practiceSwitchId: id(12), practiceSessionRef: id(13) };

describe("customer portal approval reference contracts; no execution authority", () => {
  it("MP-03 binds quote identity revision hash total currency and job revision", () => {
    expect(customerPortalApprovalCommandV1.parse(command)).toEqual(command);
    expect(() => assertCustomerPortalApprovalTarget(command, { jobId: id(2), jobRevision: 4, target: quote, approvable: true })).not.toThrow();
    for (const target of [{ ...quote, id: id(9) }, { ...quote, revision: 3 }, { ...quote, hash: "b".repeat(64) }, { ...quote, amount: { ...quote.amount, pence: 12001 } }]) {
      expect(() => assertCustomerPortalApprovalTarget(command, { jobId: id(2), jobRevision: 4, target, approvable: true })).toThrow("STALE_APPROVAL");
    }
    for (const state of [{ jobId: id(8), jobRevision: 4 }, { jobId: id(2), jobRevision: 5 }]) {
      expect(() => assertCustomerPortalApprovalTarget(command, { ...state, target: quote, approvable: true })).toThrow("STALE_APPROVAL");
    }
  });
  it("MP-05 and MP-07 bind the signed priced extra without rewriting its origin", () => {
    const target = { ...quote, kind: "variation" as const, amount: { ...quote.amount, pence: -100 } };
    const extra = { ...command, target };
    expect(customerPortalApprovalCommandV1.parse(extra).target).toEqual(target);
    expect(() => assertCustomerPortalApprovalTarget(extra, { jobId: command.jobId, jobRevision: 4, target, approvable: false })).toThrow("STALE_APPROVAL");
    expect(() => assertCustomerPortalApprovalTarget(extra, { jobId: command.jobId, jobRevision: 4, target: { ...target, amount: { ...target.amount, pence: 100 } }, approvable: true })).toThrow("STALE_APPROVAL");
    expect(customerPortalApprovalCommandV1.safeParse({ ...extra, origin: "jobguard_catch" }).success).toBe(false);
  });
  it("MP-08 stage reference binds immutable completion and proof references without money", () => {
    const target = { kind: "stage" as const, id: id(7), hash: quote.hash, scopeItemId: id(8), evidenceLinkId: id(9), evidenceHash: "b".repeat(64), objectVersionId: "synthetic-object-v1" };
    const stage = { ...command, target };
    expect(customerPortalApprovalCommandV1.parse(stage).target).toEqual(target);
    expect(() => assertCustomerPortalApprovalTarget(stage, { jobId: command.jobId, jobRevision: 4, target, approvable: true })).not.toThrow();
    for (const changed of [{ ...target, id: id(20) }, { ...target, hash: "c".repeat(64) }, { ...target, scopeItemId: id(20) }, { ...target, evidenceLinkId: id(20) }, { ...target, evidenceHash: "c".repeat(64) }, { ...target, objectVersionId: "synthetic-object-v2" }]) {
      expect(() => assertCustomerPortalApprovalTarget(stage, { jobId: command.jobId, jobRevision: 4, target: changed, approvable: true })).toThrow("STALE_APPROVAL");
    }
    expect(() => assertCustomerPortalApprovalTarget(stage, { jobId: command.jobId, jobRevision: 4, target, approvable: false })).toThrow("STALE_APPROVAL");
    expect(customerPortalApprovalCommandV1.safeParse({ ...stage, target: { ...target, amount: quote.amount } }).success).toBe(false);
  });
  it("MP-10 canonical binding includes every command and customer binding field", () => {
    const first = customerPortalApprovalBinding(command, binding);
    expect(customerPortalApprovalBinding({ target: { ...quote, amount: { currency: "GBP", pence: 12000 } }, ...Object.fromEntries(Object.entries(command).filter(([key]) => key !== "target")) }, binding)).toBe(first);
    expect(customerPortalApprovalReplay(first, first)).toBe("replay");
    expect(customerPortalApprovalReplay(null, first)).toBe("new");
    const changes = [
      { ...command, commandId: id(8) }, { ...command, jobId: id(8) }, { ...command, expectedJobRevision: 5 },
      { ...command, target: { ...quote, kind: "variation" } }, { ...command, target: { ...quote, id: id(8) } },
      { ...command, target: { ...quote, revision: 3 } }, { ...command, target: { ...quote, hash: "b".repeat(64) } },
      { ...command, target: { ...quote, amount: { ...quote.amount, pence: 12001 } } },
    ];
    for (const changed of changes) expect(() => customerPortalApprovalReplay(first, customerPortalApprovalBinding(changed, binding))).toThrow("COMMAND_CONFLICT");
    for (const key of Object.keys(binding)) {
      const changed = { ...binding, [key]: key === "policyVersion" ? "synthetic-reference.v2" : id(8) };
      expect(() => customerPortalApprovalReplay(first, customerPortalApprovalBinding(command, changed))).toThrow("COMMAND_CONFLICT");
    }
  });
  it("MP-03 and MP-05 reject invalid amounts unknown authority fields and non-GBP", () => {
    for (const pence of [-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER, 1_000_000_000_001]) {
      expect(customerPortalApprovalCommandV1.safeParse({ ...command, target: { ...quote, amount: { ...quote.amount, pence } } }).success).toBe(false);
    }
    for (const fields of [{ tenantId: id(4) }, { actorMembershipId: id(4) }, { customerId: id(5) }, { method: "builder_attestation" }, { environment: "synthetic_demo" }]) {
      expect(customerPortalApprovalCommandV1.safeParse({ ...command, ...fields }).success).toBe(false);
    }
    expect(customerPortalApprovalCommandV1.safeParse({ ...command, target: { ...quote, amount: { pence: 12000, currency: "EUR" } } }).success).toBe(false);
  });
  it("MP-19 stored result permits only references hashes and server time, not customer personal data", () => {
    const result = { version: "customer-portal-approval-result.v1", environment: "synthetic_demo", approvalId: id(7), commandId: command.commandId, jobId: command.jobId, customerId: binding.customerId, realActorMembershipId: binding.realActorMembershipId, actingMembershipId: binding.actingMembershipId, practiceSwitchId: binding.practiceSwitchId, practiceSessionRef: binding.practiceSessionRef, method: "customer_authenticated", target: quote, approvedAt: "2026-10-16T12:00:00.000Z" };
    expect(customerPortalApprovalResultV1.parse(result)).toEqual(result);
    for (const fields of [{ customerName: "Fictional customer" }, { email: "customer@fictional.invalid" }, { message: "Fictional text" }, { credential: "t".repeat(43) }, { actor: { name: "Fictional actor" } }]) {
      expect(customerPortalApprovalResultV1.safeParse({ ...result, ...fields }).success).toBe(false);
    }
    expect(customerPortalApprovalResultV1.safeParse({ ...result, method: "builder_attestation" }).success).toBe(false);
  });
});
