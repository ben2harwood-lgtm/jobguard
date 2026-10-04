import type { Pool } from "pg";
import { z } from "zod";
import {
  DEMO_IDENTITY_USER_ID, DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID, RecoveryMessageRepository,
  verifiedTenantContextFromMembership, withTenant,
} from "@jobguard/db";
import {
  RECOVERY_MESSAGE_RESPONSE_VERSION, recoveryMessageCommandV1, recoveryMessageIdV1, recoveryMessagePreviewCommandV1,
} from "./recovery-message.contracts.js";

const context = () => verifiedTenantContextFromMembership({
  identityUserId: DEMO_IDENTITY_USER_ID, membershipId: DEMO_MEMBERSHIP_ID, tenantId: DEMO_TENANT_ID,
} as Parameters<typeof verifiedTenantContextFromMembership>[0]);

/**
 * The one application boundary for the practice recovery message, shared by the Nest controller and the thin
 * Next route adapters. There is no live adapter anywhere behind it, and no tenant, actor or mode comes from a request.
 */
export class RecoveryMessageApplication {
  private readonly repo: RecoveryMessageRepository;
  constructor(private readonly pool: Pool) { this.repo = new RecoveryMessageRepository(pool); }

  private async authorize(sessionId: string | undefined) {
    if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new Error("SYNTHETIC_MODE_REQUIRED");
    if (!recoveryMessageIdV1.safeParse(sessionId).success) throw new Error("UNAUTHENTICATED");
    const ctx = context();
    const member = await withTenant(this.pool, ctx, async db => (await db.$client.query<{ id: string }>(
      `SELECT id FROM app.membership WHERE tenant_id=$1 AND id=$2 AND identity_user_id=$3
       AND role='owner' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())`,
      [DEMO_TENANT_ID, DEMO_MEMBERSHIP_ID, DEMO_IDENTITY_USER_ID],
    )).rows[0]);
    if (!member) throw new Error("FORBIDDEN");
    return { ctx, actor: { membershipId: member.id, actorRef: `membership:${member.id}` } };
  }
  private respond<T extends object>(state: T) { return { version: RECOVERY_MESSAGE_RESPONSE_VERSION, ...state }; }

  async read(sessionId: string | undefined, caseId: string) {
    const { ctx } = await this.authorize(sessionId);
    return this.respond(await this.repo.read(ctx, recoveryMessageIdV1.parse(caseId)));
  }

  async preview(sessionId: string | undefined, caseId: string, raw: unknown) {
    const { ctx, actor } = await this.authorize(sessionId);
    return this.respond(await this.repo.preview(ctx, recoveryMessageIdV1.parse(caseId), recoveryMessagePreviewCommandV1.parse(raw), actor));
  }

  async command(sessionId: string | undefined, caseId: string, messageId: string, raw: unknown) {
    const { ctx, actor } = await this.authorize(sessionId);
    const command = recoveryMessageCommandV1.parse(raw);
    if (command.messageId.toLowerCase() !== recoveryMessageIdV1.parse(messageId).toLowerCase()) {
      throw new z.ZodError([{ code: "custom", path: ["messageId"], message: "The message in the command must be the message in the path" }]);
    }
    return this.respond(await this.repo.command(ctx, recoveryMessageIdV1.parse(caseId), command, actor));
  }
}
