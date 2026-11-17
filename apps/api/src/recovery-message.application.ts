import { z } from "zod";
import type { Pool } from "pg";
import {
  DEMO_IDENTITY_USER_ID, DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID,
  RecoveryMessageRepository, verifiedTenantContextFromMembership,
} from "@jobguard/db";
import { recoveryMessageCommandV1, recoveryMessagePreviewV1 } from "@jobguard/core";

const uuid = z.string().uuid();
export class RecoveryMessageApplicationError extends Error {
  constructor(readonly code: string) { super(code); }
}
export function recoveryMessageError(error: unknown) {
  const code = error instanceof z.ZodError ? "INVALID_MESSAGE_COMMAND"
    : error instanceof Error ? error.message : "DATABASE_UNAVAILABLE";
  const status = code === "UNAUTHENTICATED" ? 401
    : /FORBIDDEN|REVOKED|ENVIRONMENT|SYNTHETIC_ONLY/u.test(code) ? 403
    : /NOT_FOUND/u.test(code) ? 404
    : /CHANGED|STALE|CONFLICT|CANCELLED|EXPIRED/u.test(code) ? 409 : 400;
  return { code, status };
}

/** One application boundary for Nest and the thin Next adapter. No live adapter exists. */
export class RecoveryMessageApplication {
  private readonly repo: RecoveryMessageRepository;
  constructor(pool: Pool) { this.repo = new RecoveryMessageRepository(pool); }
  private principal(sessionId: unknown) {
    if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new RecoveryMessageApplicationError("SYNTHETIC_ONLY");
    if (!uuid.safeParse(sessionId).success) throw new RecoveryMessageApplicationError("UNAUTHENTICATED");
    const context = verifiedTenantContextFromMembership({
      identityUserId: DEMO_IDENTITY_USER_ID, membershipId: DEMO_MEMBERSHIP_ID, tenantId: DEMO_TENANT_ID,
    } as Parameters<typeof verifiedTenantContextFromMembership>[0]);
    return { context, actor: { membershipId: DEMO_MEMBERSHIP_ID, actorRef: `membership:${DEMO_MEMBERSHIP_ID}`, sessionId: sessionId as string } };
  }
  async read(sessionId: unknown, caseId: unknown) {
    const { context, actor } = this.principal(sessionId);
    return this.repo.read(context, uuid.parse(caseId), actor);
  }
  async command(sessionId: unknown, caseId: unknown, raw: unknown) {
    const { context, actor } = this.principal(sessionId);
    const id = uuid.parse(caseId);
    const preview = recoveryMessagePreviewV1.safeParse(raw);
    if (preview.success) return this.repo.preview(context, id, preview.data, actor);
    return this.repo.command(context, id, recoveryMessageCommandV1.parse(raw), actor);
  }
}
