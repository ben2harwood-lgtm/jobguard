import type { Pool } from "pg";
import { ChangeDraftRepository, PracticeAccessError, assertExtraLinkMode } from "@jobguard/db";
import { PracticeAccess } from "./practice-access.js";

export { ChangeDraftRepositoryError, changeDraftCommandV1, changeDraftPreviewV1, type ChangeDraftCommand,
  type ChangeDraftLineRow, type ChangeDraftRow } from "@jobguard/db";

/** V2-F3: same access as the F6 builder links. Money goes through main's variation path only. */
export class ChangeDraftApplication {
  private readonly repository: ChangeDraftRepository;
  private readonly access: PracticeAccess;
  constructor(pool: Pool, private readonly sessionId?: string) {
    this.repository = new ChangeDraftRepository(pool);
    this.access = new PracticeAccess(pool, sessionId);
  }
  async list(jobId: string) {
    assertExtraLinkMode(); const auth = await this.access.job(jobId);
    return { version: "v2-change-drafts.v1" as const, lines: await this.repository.lines(auth.context, jobId),
      drafts: await this.repository.list(auth.context, jobId) };
  }
  async preview(jobId: string, raw: unknown) {
    assertExtraLinkMode(); const auth = await this.access.job(jobId);
    return this.repository.preview(auth.context, jobId, raw);
  }
  async command(jobId: string, raw: unknown) {
    assertExtraLinkMode(); const auth = await this.access.job(jobId);
    if (!this.sessionId) throw new PracticeAccessError("UNAUTHENTICATED");
    return this.repository.command(auth.context, jobId, this.sessionId, auth.membershipId, raw);
  }
}
