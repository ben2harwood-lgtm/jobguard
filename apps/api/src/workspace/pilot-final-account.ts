import { requirePilotG1 } from "@jobguard/config";
import { FinalAccountCommandService, FinalAccountLockRepository, InvoiceEmailRepository, VariationRepository, type VerifiedTenantContext } from "@jobguard/db";
import type { Pool } from "pg";
import { z } from "zod";
import { finalAccountCommandV1 } from "../final-account.contracts.js";
import { finalAccountDispositionCommandV1, finalAccountLockCommandV1 } from "../final-account-lock.contracts.js";
import type { PilotJobAccess } from "./pilot-job-access.js";

const reviewExtra = z.strictObject({
  version: z.literal("pilot-final-review-extra.v1"),
  commandId: z.guid(),
  description: z.string().trim().min(1).max(500),
});

function command<T>(schema: z.ZodType<T>, raw: unknown): T {
  const input = schema.safeParse(raw);
  if (!input.success) throw new Error("INVALID_COMMAND");
  return input.data;
}

export function pilotFinalAccount(pool: Pool, context: VerifiedTenantContext, access: PilotJobAccess) {
  const accounts = new FinalAccountCommandService(pool);
  const locks = new FinalAccountLockRepository(pool);
  const gate = () => requirePilotG1(process.env);

  async function read(jobId: string) {
    await access(jobId, true);
    const [view, account, termsVersion] = await Promise.all([
      locks.read(context, jobId), accounts.read(context, jobId), locks.pilotTerms(context, jobId),
    ]);
    return {
      version: 1 as const, jobId, termsApproved: termsVersion !== null, account,
      lock: view.lock && { id: view.lock.id, lockedAt: view.lock.lockedAt },
      captures: view.captures, dispositions: view.dispositions,
    };
  }

  return {
    read,
    stageInvoiceEmail: async (jobId: string, raw: unknown) => {
      const actor = await access(jobId, true);
      return new InvoiceEmailRepository(pool).stage(context, jobId, raw,
        { actorMembershipId: actor.membershipId, checkGate: gate });
    },
    assemble: async (jobId: string, raw: unknown) => {
      const actor = await access(jobId, true);
      const input = command(finalAccountCommandV1, raw);
      await accounts.assemble(context, { ...input, jobId, actorMembershipId: actor.membershipId }, gate);
      return read(jobId);
    },
    lock: async (jobId: string, raw: unknown) => {
      const actor = await access(jobId, true);
      const { version: _version, ...input } = command(finalAccountLockCommandV1, raw);
      const { id, lockedAt } = await locks.lock(context, { ...input, jobId, actorMembershipId: actor.membershipId }, gate);
      return { version: 1 as const, jobId, lock: { id, lockedAt } };
    },
    disposition: async (jobId: string, raw: unknown) => {
      const actor = await access(jobId, true);
      const { version: _version, ...input } = command(finalAccountDispositionCommandV1, raw);
      return locks.disposition(context, { ...input, jobId, actorMembershipId: actor.membershipId }, gate);
    },
    reviewExtra: async (jobId: string, raw: unknown) => {
      const actor = await access(jobId, true);
      const input = command(reviewExtra, raw);
      return new VariationRepository(pool).addFinalReviewExtra(context, {
        version: "final-review-extra.v1", actorMembershipId: actor.membershipId,
        deviceId: null, deviceCapturedAt: null, price: null,
        proposal: {
          version: "variation-proposal.v1", id: input.commandId, jobId, scopeItemId: input.commandId,
          existingScopeItemId: null, lineageParentScopeItemId: null, captureKind: "text",
          description: input.description, captureText: input.description, suggestion: null,
        },
      }, gate);
    },
  };
}
