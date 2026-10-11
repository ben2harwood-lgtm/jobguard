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
