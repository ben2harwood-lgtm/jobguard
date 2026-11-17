import type { Pool } from "pg";
import { z } from "zod";
import {
  PracticeAccessError, RECOVERY_FOLLOW_UP_ERROR_CODES, RecoveryFollowUpError, RecoveryFollowUpRepository, RecoveryMessageError, RecoveryMessageRepository, SandboxRepository,
  practiceMaterialPool,
} from "@jobguard/db";
import { PracticeAccess } from "./practice-access.js";
import { recoveryMessageFailure } from "./recovery-message.errors.js";
import { recoveryFollowUpCommandV1, recoveryFollowUpIdV1, recoveryFollowUpScheduleCommandV1 } from "./recovery-follow-up.contracts.js";

const KNOWN = new Set<string>(RECOVERY_FOLLOW_UP_ERROR_CODES);
/**
 * One server-side mapping from an internal failure to a client-safe status and code. A follow-up refusal keeps its typed code; an M4-5-S message
 * refusal (the reminder is previewed through that path) keeps its own; PostgreSQL, driver, parser and programming error text never reaches a client.
 */
export function recoveryFollowUpFailure(error: unknown): { status: number; code: string } {
  const message = error instanceof Error ? error.message : "";
  if (error instanceof RecoveryFollowUpError || (KNOWN.has(message) && !(error instanceof RecoveryMessageError))) {
    if (message === "RECOVERY_FOLLOW_UP_NOT_FOUND") return { status: 404, code: message };
    if (message === "RECOVERY_FOLLOW_UP_FORBIDDEN") return { status: 403, code: message };
    return KNOWN.has(message) ? { status: 409, code: message } : { status: 500, code: "INTERNAL_ERROR" };
  }
  return recoveryMessageFailure(error);
}

/**
 * The one application boundary for the practice recovery follow-up, shared by the Nest controller and the thin Next route adapters.
 * No live adapter, scheduler or workflow engine is behind it; no tenant, actor or mode comes from a request. The practice clock it moves is
 * SBOX-2's own, advanced by SBOX-2's own repository on the caller's verified practice session.
 */
export class RecoveryFollowUpApplication {
  constructor(private readonly pool: Pool) {}

  private async authorize(sessionId: string | undefined, caseId: string) {
    const auth = await new PracticeAccess(this.pool, sessionId).case(caseId);
    const practice = practiceMaterialPool(this.pool, auth.digest);
    return {
      ctx: auth.context, actor: { membershipId: auth.membershipId, actorRef: `membership:${auth.membershipId}` },
      repo: new RecoveryFollowUpRepository(practice, new RecoveryMessageRepository(practice)),
    };
  }
  private async respond<T extends object>(result: Promise<T>) {
    try { return await result; }
    catch (error) {
      if ((error instanceof RecoveryFollowUpError || error instanceof RecoveryMessageError) && error.code.endsWith("_NOT_FOUND")) throw new PracticeAccessError("NOT_FOUND");
      throw error;
    }
  }

  async read(sessionId: string | undefined, caseId: string) {
    const { ctx, repo } = await this.authorize(sessionId, caseId);
    return this.respond(repo.read(ctx, recoveryFollowUpIdV1.parse(caseId)));
  }

  async schedule(sessionId: string | undefined, caseId: string, raw: unknown) {
    const { ctx, actor, repo } = await this.authorize(sessionId, caseId);
    return this.respond(repo.schedule(ctx, recoveryFollowUpIdV1.parse(caseId), recoveryFollowUpScheduleCommandV1.parse(raw), actor));
  }

  async command(sessionId: string | undefined, caseId: string, followUpId: string, raw: unknown) {
    const { ctx, actor, repo } = await this.authorize(sessionId, caseId);
    const command = recoveryFollowUpCommandV1.parse(raw), id = recoveryFollowUpIdV1.parse(caseId);
    if (command.followUpId.toLowerCase() !== recoveryFollowUpIdV1.parse(followUpId).toLowerCase()) {
      throw new z.ZodError([{ code: "custom", path: ["followUpId"], message: "The follow-up in the command must be the follow-up in the path" }]);
    }
    switch (command.action) {
      case "advance_time": {
        // SBOX-2's own bounded advance moves the run's fake clock on this very session; the due evaluation rides in its transaction.
        const sandbox = new SandboxRepository(this.pool);
        return this.respond(repo.advanceTime(ctx, id, command, actor, (runId, commandId) => sandbox.advance(sessionId!, runId, commandId)));
      }
      case "open_review": return this.respond(repo.openReview(ctx, id, command, actor));
      case "approve_reminder": return this.respond(repo.approveReminder(ctx, id, command, actor));
      case "cancel": return this.respond(repo.cancel(ctx, id, command, actor));
    }
  }
}
