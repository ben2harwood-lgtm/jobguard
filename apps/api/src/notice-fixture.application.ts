import { z } from "zod";
import { assertRealConstructionNoticeAllowed, ConstructionNoticeError } from "@jobguard/core";
import { NoticeFixtureRepositoryError, type NoticeFixtureRepository } from "@jobguard/db";
import { resolveVerifiedTenantContext, type TenantRequestCredentials } from "./auth/principal-bridge.js";
import { identityStatus } from "./auth/identity-http.js";
import type { IdentityApplication } from "./auth/identity.application.js";

export function assertNoticeFixtureMode() {
  if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new NoticeFixtureRepositoryError("NOT_FOUND");
}
export function noticeFixtureRealNoticeRefusal(): string {
  try { assertRealConstructionNoticeAllowed(); } catch (error) {
    if (!(error instanceof ConstructionNoticeError)) throw error;
    return error.message;
  }
}
export class NoticeFixtureApplication {
  constructor(private readonly identity: IdentityApplication,
    private readonly repository: Pick<NoticeFixtureRepository, "read" | "command">) {}
  async read(credentials: TenantRequestCredentials, jobId: string, noticeId: string) {
    assertNoticeFixtureMode();
    const context = await resolveVerifiedTenantContext(this.identity.provider, credentials, this.identity.allowedOrigin);
    // Repository reads rely on their caller's verified membership. Match the command's owner/admin boundary.
    const principal = await this.identity.provider.authenticate(credentials.sessionToken!);
    const membership = principal && await this.identity.provider.findMembership(principal, context.tenantId);
    if (!membership || !["owner", "admin"].includes(membership.role)) throw new NoticeFixtureRepositoryError("NOT_FOUND");
    const view = await this.repository.read(context, jobId, noticeId);
    const now = Date.now(), target = JSON.stringify(view.preview);
    const approval = view.decisions.find(d => d.resolution === "approved" && d.approvedPreview === target
      && Date.parse(d.decidedAt) <= now && Date.parse(d.expiresAt) > now);
    return { ...view, approvalExpiresAt: new Date(now + 3600000).toISOString(),
      activeDecisionId: approval?.id ?? null, realNoticeRefusal: noticeFixtureRealNoticeRefusal(),
      approvalMessage: approval ? "Approval binds this exact practice preview. Nothing was sent."
        : "No current approval. Old, expired or changed previews cannot be used for a service fact; review and approve this preview again." };
  }
  async command(credentials: TenantRequestCredentials, jobId: string, raw: unknown) {
    assertNoticeFixtureMode();
    const context = await resolveVerifiedTenantContext(this.identity.provider, credentials, this.identity.allowedOrigin);
    const routeId = z.guid().safeParse(jobId);
    if (!routeId.success || !raw || typeof raw !== "object" || !("jobId" in raw)
      || typeof raw.jobId !== "string" || raw.jobId.toLowerCase() !== routeId.data.toLowerCase()) {
      throw new ConstructionNoticeError("INVALID_INPUT", "Command must target this job");
    }
    return this.repository.command(context, { kind: "human",
      sessionDigest: this.identity.provider.digest(`session:${credentials.sessionToken}`) }, raw);
  }
}
export type NoticeFixtureView = Awaited<ReturnType<NoticeFixtureApplication["read"]>>;
const messages: Record<string, string> = {
  INVALID_INPUT: "Check the structured fields. Tenant, actor and enable flags are not accepted.",
  MISSING_FACTS: "Flagged for advice: complete the due date, contract reference and trigger evidence. No approval was stored.",
  UNSUPPORTED_ADVICE_REQUIRED: "Flagged for professional advice: this profile, version or method is unsupported. No approval was stored.",
  STALE_REVISION: "The facts changed. Refresh and approve the current preview again.",
  REPLAY_CONFLICT: "This command ID already records different facts. Refresh and review before a new command.",
  APPROVAL_REQUIRED: "The approval is missing, expired, revoked or for changed facts. Refresh and approve this preview again.",
  CONTEXT_MISMATCH: "The approval or service fact does not match this current preview. Refresh and review again.",
  INVALID_SERVICE_STATE: "Record one initial queued fact, then separate evidence for each fact. Legally served also requires a separate assessment reference; delivery or read is insufficient.",
};
export function noticeFixtureFailure(error: unknown) {
  if (error instanceof NoticeFixtureRepositoryError && error.code === "NOTICE_UNAVAILABLE") return { status: 503,
    body: { version: "notice.fixture-error.v1", code: error.code,
      message: "Practice notice records could not be loaded. The result is unknown. Refresh or retry the same saved command." } };
  if (error instanceof NoticeFixtureRepositoryError) return { status: 404,
    body: { version: "notice.fixture-error.v1", code: "NOT_FOUND", message: "Practice notice unavailable." } };
  if (error instanceof ConstructionNoticeError) return { status: error.code === "INVALID_INPUT" ? 400 : 409,
    body: { version: "notice.fixture-error.v1", code: error.code, message: messages[error.code] ?? "Practice operation refused." } };
  const auth = identityStatus(error);
  return { status: auth.status, body: { version: "notice.fixture-error.v1",
    code: auth.code === "IDENTITY_UNAVAILABLE" ? "NOTICE_UNAVAILABLE" : auth.code,
    message: "Practice notice unavailable. Sign in and refresh before trying again." } };
}
