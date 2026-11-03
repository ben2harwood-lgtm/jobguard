import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterEach, expect, it, vi } from "vitest";
const transaction = vi.hoisted(() => ({ committed: 0 }));
vi.mock("../src/tenant-context.js", () => ({ withTenant: vi.fn(async () => { transaction.committed++; }) }));
import { RecoveryCaseRepository } from "../src/recovery-case-repository.js";
// The mock above replaces withTenant only; the real constructor still gives this context its stamp.
const { verifiedTenantContextFromMembership } = await vi.importActual<typeof import("../src/tenant-context.js")>("../src/tenant-context.js");
const context = verifiedTenantContextFromMembership({ identityUserId: randomUUID(), membershipId: randomUUID(), tenantId: randomUUID() } as Parameters<typeof verifiedTenantContextFromMembership>[0]);
const reviewer = { membershipId: randomUUID(), identityUserId: randomUUID() };
afterEach(() => { vi.restoreAllMocks(); transaction.committed = 0; });
it.each(["command", "eligibilityCommand"] as const)("%s: every post-commit read error is typed unknown, even if it resembles a refusal", async method => {
 const repo = new RecoveryCaseRepository({} as Pool);
 vi.spyOn(repo, "listForMember").mockRejectedValue(new Error("RECOVERY_STALE_REVISION"));
 const input = method === "command" ? { version: "recovery-case-command.v1", action: "open", commandId: randomUUID(), caseType: "withheld_customer_payment", claimedNetPence: 32000, counterparty: "Customer", book: "builder_customer", sourceType: "customer_invoice", sourceRefs: ["Generated customer invoice INV-18800"], expectedRevision: 0 } : { version: "recovery-eligibility-command.v1", action: "review", commandId: randomUUID(), caseId: randomUUID(), expectedCaseRevision: 1, evidenceRevision: 1, policyVersion: "reference-d03.v1", policyRevision: 1, scenario: "evidence_backed_withheld_payment" };
 await expect(repo[method](context, randomUUID(), input, reviewer)).rejects.toMatchObject({ code: "RECOVERY_COMMAND_OUTCOME_UNKNOWN" });
 expect(transaction.committed).toBe(1);
});
it.each(["command", "eligibilityCommand"] as const)("%s: a missing affected row after commit is also unknown", async method => {
 const repo = new RecoveryCaseRepository({} as Pool);
 vi.spyOn(repo, "listForMember").mockResolvedValue([]);
 const input = method === "command" ? { version: "recovery-case-command.v1", action: "open", commandId: randomUUID(), caseType: "withheld_customer_payment", claimedNetPence: 32000, counterparty: "Customer", book: "builder_customer", sourceType: "customer_invoice", sourceRefs: ["Generated customer invoice INV-18800"], expectedRevision: 0 } : { version: "recovery-eligibility-command.v1", action: "review", commandId: randomUUID(), caseId: randomUUID(), expectedCaseRevision: 1, evidenceRevision: 1, policyVersion: "reference-d03.v1", policyRevision: 1, scenario: "evidence_backed_withheld_payment" };
 await expect(repo[method](context, randomUUID(), input, reviewer)).rejects.toMatchObject({ code: "RECOVERY_COMMAND_OUTCOME_UNKNOWN" });
});

it.each([
 ["prevent", "RECOVERY_PREVENTION_HAS_STORED_CASH"],
 ["write_off", "RECOVERY_WRITE_OFF_HAS_STORED_CASH"],
])("maps only the exact %s stored-cash database refusal to the existing transition error", async (eventType, message) => {
 const { withTenant } = await import("../src/tenant-context.js");
 const repo = new RecoveryCaseRepository({} as Pool);
 const input = { version: "recovery-case-command.v1", action: "transition", commandId: randomUUID(), caseId: randomUUID(), expectedRevision: 2, eventType };
 const failure = Object.assign(new Error(message), {code: "23514"});
 vi.mocked(withTenant).mockRejectedValueOnce(failure);
 await expect(repo.command(context, randomUUID(), input, reviewer)).rejects.toMatchObject({code: "RECOVERY_TRANSITION_FORBIDDEN"});
 for (const error of [new Error(message), Object.assign(new Error("connection lost"), {code: "23514"})]) {
  vi.mocked(withTenant).mockRejectedValueOnce(error);
  await expect(repo.command(context, randomUUID(), input, reviewer)).rejects.toBe(error);
 }
});

it.each(["RECOVERY_PREVENTION_HAS_STORED_CASH", "RECOVERY_WRITE_OFF_HAS_STORED_CASH"])("keeps %s after commit as an unknown outcome", async message => {
 const repo = new RecoveryCaseRepository({} as Pool);
 const failure = Object.assign(new Error(message), {code: "23514"});
 vi.spyOn(repo, "listForMember").mockRejectedValue(failure);
 await expect(repo.command(context, randomUUID(), {version: "recovery-case-command.v1", action: "transition", commandId: randomUUID(), caseId: randomUUID(), expectedRevision: 2, eventType: "prevent"}, reviewer)).rejects.toMatchObject({code: "RECOVERY_COMMAND_OUTCOME_UNKNOWN", cause: failure});
 expect(transaction.committed).toBe(1);
});
