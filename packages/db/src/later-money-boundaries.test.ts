import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { MAX_MONEY_PENCE } from "@jobguard/core";
import { consequentialCommandV1Schema, UserCommandDispatcher } from "./commands.js";
import { confirmProposalV1, transitionJobV1, JobRepository } from "./job-repository.js";
import { LedgerRepository, planObligationV1, planSettlementV1 } from "./ledger.js";
import { verifiedTenantContextForQueuedJob } from "./tenant-context.js";

const command = (amountPence: number | null) => ({
  version: "command.v1", commandId: randomUUID(), commandType: "synthetic.boundary",
  semanticKey: "synthetic:boundary", actorMembershipId: randomUUID(), subjectType: "job", subjectRef: randomUUID(),
  action: { actionType: "synthetic.boundary", recipient: null, contentHash: "a".repeat(64), aggregateRevision: 0,
    amountPence, currency: amountPence === null ? null : "GBP", policyVersion: "synthetic.v1", expiresAt: new Date("2099-01-01") },
});
const proposal = (unitPricePence = 1, totalPence = unitPricePence, quantityDecimal = "1") => ({
  proposalId: randomUUID(), jobId: randomUUID(), description: "Fictional work", quantityDecimal,
  unit: "item", unitPricePence, totalPence,
});
const transition = { jobId: randomUUID(), expectedRevision: 0, to: "quoting", reason: "start_quote" };
const posting = (amountPence: number) => ({
  schemaVersion: 1, bookId: randomUUID(), amountPence, currency: "GBP", sourceEventId: "synthetic:boundary",
  provenanceRef: "synthetic:fixture", artifactHash: "a".repeat(64), authorizationId: randomUUID(), actorRef: "synthetic:actor",
  receivableAccountId: randomUUID(),
});
const obligation = (amount: number) => ({ ...posting(amount), deferredIncomeAccountId: randomUUID(), provenanceKind: "synthetic_authorized_plan" });
const settlement = (amount: number) => ({ ...posting(amount), obligationJournalId: randomUUID(), clearingAccountId: randomUUID() });
const invalidAmounts = [MAX_MONEY_PENCE + 1, -MAX_MONEY_PENCE, -MAX_MONEY_PENCE - 1, Number.MAX_SAFE_INTEGER + 1,
  -(Number.MAX_SAFE_INTEGER + 1), 0.5, Infinity, NaN];

describe("LATER-B27 shared money boundaries", () => {
  it("L026 command money accepts the maximum and rejects maximum plus one and unsafe integers", () => {
    for (const value of [0, MAX_MONEY_PENCE]) expect(consequentialCommandV1Schema.parse(command(value)).action.amountPence).toBe(value);
    for (const value of invalidAmounts) expect(consequentialCommandV1Schema.safeParse(command(value)).success).toBe(false);
  });

  it("L102 direct repository money accepts the maximum and rejects values beyond either limit and unsafe integers", () => {
    expect(confirmProposalV1.parse(proposal(MAX_MONEY_PENCE)).totalPence).toBe(MAX_MONEY_PENCE);
    expect(confirmProposalV1.parse(proposal(0)).totalPence).toBe(0);
    for (const value of [1, MAX_MONEY_PENCE]) {
      expect(planObligationV1.parse(obligation(value)).amountPence).toBe(value);
      expect(planSettlementV1.parse(settlement(value)).amountPence).toBe(value);
    }
    for (const field of ["acceptedNetValuePence", "recoveryCapPence"] as const) {
      expect(transitionJobV1.parse({ ...transition, [field]: MAX_MONEY_PENCE })[field]).toBe(MAX_MONEY_PENCE);
      for (const value of invalidAmounts) expect(transitionJobV1.safeParse({ ...transition, [field]: value }).success).toBe(false);
    }
    for (const value of invalidAmounts) {
      expect(confirmProposalV1.safeParse(proposal(value)).success).toBe(false);
      expect(confirmProposalV1.safeParse(proposal(1, value)).success).toBe(false);
      expect(planObligationV1.safeParse(obligation(value)).success).toBe(false);
      expect(planSettlementV1.safeParse(settlement(value)).success).toBe(false);
    }
    expect(planObligationV1.safeParse(obligation(0)).success).toBe(false);
    expect(planSettlementV1.safeParse(settlement(0)).success).toBe(false);
  });

  it("L102 legacy permitted nulls remain explicit and amount/currency must appear together", () => {
    expect(consequentialCommandV1Schema.parse(command(null)).action).toMatchObject({ amountPence: null, currency: null });
    const nullable = { acceptedNetValuePence: null, recoveryCapPence: null, quoteVersionId: null, feePolicyVersion: null };
    expect(transitionJobV1.parse(transition)).toMatchObject(nullable);
    expect(transitionJobV1.parse({ ...transition, ...nullable })).toMatchObject(nullable);
    for (const [amountPence, currency] of [[1, null], [null, "GBP"]]) {
      const input = command(null);
      expect(consequentialCommandV1Schema.safeParse({ ...input, action: { ...input.action, amountPence, currency } }).success).toBe(false);
    }
    expect(confirmProposalV1.safeParse(proposal(null as unknown as number)).success).toBe(false);
    expect(planObligationV1.safeParse(obligation(null as unknown as number)).success).toBe(false);
  });

  it("L016 confirmation rejects a total inconsistent with exact quantity times rate", () => {
    expect(confirmProposalV1.safeParse(proposal(101, 152, "1.5")).success).toBe(true);
    expect(confirmProposalV1.safeParse(proposal(101, 151, "1.5")).success).toBe(false);
    expect(confirmProposalV1.safeParse(proposal(103, 154, "1.5")).success).toBe(true);
    expect(confirmProposalV1.safeParse(proposal(103, 155, "1.5")).success).toBe(false);
    expect(confirmProposalV1.safeParse(proposal(3, 1, "0.333333")).success).toBe(true);
    expect(confirmProposalV1.safeParse(proposal(3, 2, "0.333333")).success).toBe(false);
    expect(confirmProposalV1.safeParse(proposal(1, 0, "0")).success).toBe(true);
    expect(confirmProposalV1.safeParse(proposal(1, 1, "0.0000001")).success).toBe(false);
  });

  it("L016 L026 L102 typed failures occur before any database connection or mutation", async () => {
    const connect = vi.fn(() => { throw new Error("Unexpected database connection"); });
    const pool = { connect } as unknown as Pool;
    const context = verifiedTenantContextForQueuedJob(randomUUID());
    const jobs = new JobRepository(pool), ledger = new LedgerRepository(pool), dispatcher = new UserCommandDispatcher(pool);
    const tooLarge = MAX_MONEY_PENCE + 1;
    await expect(jobs.confirmProposal(context, ["quote:edit"], proposal(101, 151, "1.5"))).rejects.toMatchObject({ name: "ZodError" });
    await expect(jobs.confirmProposal(context, ["quote:edit"], proposal(MAX_MONEY_PENCE, MAX_MONEY_PENCE, "2"))).rejects.toMatchObject({
      issues: expect.arrayContaining([expect.objectContaining({ code: "custom", params: { moneyCode: "overflow" } })]),
    });
    await expect(dispatcher.dispatch(context, command(tooLarge), { mutate: vi.fn() })).rejects.toMatchObject({
      issues: expect.arrayContaining([expect.objectContaining({ code: "custom", params: { moneyCode: "magnitude_exceeded" } })]),
    });
    await expect(jobs.transition(context, ["job:update"], { ...transition, recoveryCapPence: tooLarge })).rejects.toMatchObject({ name: "ZodError" });
    for (const [method, input] of [["postPlanObligation", obligation(tooLarge)], ["postPlanSettlement", settlement(tooLarge)]] as const) {
      await expect(ledger[method](context, { permission: "finance:approve", authorizationId: input.authorizationId, actorRef: input.actorRef }, input)).rejects.toMatchObject({ name: "ZodError" });
    }
    expect(connect).not.toHaveBeenCalled();
  });
});
