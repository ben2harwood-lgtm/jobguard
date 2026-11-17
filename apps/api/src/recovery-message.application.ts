import type { Pool } from "pg";
import { z } from "zod";
import { RecoveryMessageRepository, RecoveryMessageError, PracticeAccessError, practiceMaterialPool } from "@jobguard/db";
import { PracticeAccess } from "./practice-access.js";
import {
  RECOVERY_MESSAGE_RESPONSE_VERSION, recoveryMessageCommandV1, recoveryMessageIdV1, recoveryMessagePreviewCommandV1,
} from "./recovery-message.contracts.js";

/**
 * The one application boundary for the practice recovery message, shared by the Nest controller and the thin
 * Next route adapters. There is no live adapter anywhere behind it, and no tenant, actor or mode comes from a request.
 */
export class RecoveryMessageApplication {
  constructor(private readonly pool: Pool) {}

  private async authorize(sessionId: string | undefined, caseId: string) {
    const auth = await new PracticeAccess(this.pool, sessionId).case(caseId);
    return { ctx: auth.context, actor: { membershipId: auth.membershipId, actorRef: `membership:${auth.membershipId}` },
      repo: new RecoveryMessageRepository(practiceMaterialPool(this.pool, auth.digest)) };
  }
  private async respond<T extends object>(result: Promise<T>) {
    try { return { version: RECOVERY_MESSAGE_RESPONSE_VERSION, ...await result }; }
    catch (error) {
      if (error instanceof RecoveryMessageError && error.code === "RECOVERY_MESSAGE_NOT_FOUND") throw new PracticeAccessError("NOT_FOUND");
      throw error;
    }
  }

  async read(sessionId: string | undefined, caseId: string) {
    const { ctx, repo } = await this.authorize(sessionId, caseId);
    return this.respond(repo.read(ctx, recoveryMessageIdV1.parse(caseId)));
  }

  async preview(sessionId: string | undefined, caseId: string, raw: unknown) {
    const { ctx, actor, repo } = await this.authorize(sessionId, caseId);
    return this.respond(repo.preview(ctx, recoveryMessageIdV1.parse(caseId), recoveryMessagePreviewCommandV1.parse(raw), actor));
  }

  async command(sessionId: string | undefined, caseId: string, messageId: string, raw: unknown) {
    const { ctx, actor, repo } = await this.authorize(sessionId, caseId);
    const command = recoveryMessageCommandV1.parse(raw);
    if (command.messageId.toLowerCase() !== recoveryMessageIdV1.parse(messageId).toLowerCase()) {
      throw new z.ZodError([{ code: "custom", path: ["messageId"], message: "The message in the command must be the message in the path" }]);
    }
    return this.respond(repo.command(ctx, recoveryMessageIdV1.parse(caseId), command, actor));
  }
}
