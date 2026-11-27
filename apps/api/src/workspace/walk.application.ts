import { PracticeAccessError, WalkError, WalkRepository, walkQueryV1, withTenant,
  type WalkEntryCommand, type WalkPhotoFilingCommand, type WalkQuery, type WalkSessionCommand } from "@jobguard/db";
import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { PracticeAccess } from "../practice-access.js";
import { uploadWalkPhoto } from "./walk-photo.application.js";

export { walkPhotoCommandV1, type WalkPhotoCommand } from "./walk-photo.application.js";

export { walkPhotoFilingCommandV1, type WalkPhotoFilingCommand,
  WALK_CLOCK_TOLERANCE_SECONDS, WalkError, walkEntryCommandV1, walkQueryV1, walkSessionCommandV1,
  type WalkEntryCommand, type WalkEntryView, type WalkQuery, type WalkSession, type WalkSessionCommand } from "@jobguard/db";

/** V2 walk session record: commands and queries for the later walk screens. No audio, no paid calls. */
export class WalkApplication {
  private readonly access: PracticeAccess;
  private readonly walks: WalkRepository;

  constructor(private readonly pool: Pool, private readonly sessionId?: string) {
    this.access = new PracticeAccess(pool, sessionId);
    this.walks = new WalkRepository(pool);
  }

  async read(jobId: string, query: WalkQuery) {
    const { context } = await this.authorize(jobId);
    const parsed = walkQueryV1.safeParse(query);
    if (!parsed.success) throw new WalkError("WALK_INVALID_QUERY");
    const sessions = await this.walks.read(context, jobId, parsed.data.sessionId);
    if (parsed.data.sessionId && sessions.length === 0) throw new PracticeAccessError("NOT_FOUND");
    return sessions;
  }

  async start(jobId: string, command: WalkSessionCommand) {
    const { context } = await this.authorize(jobId);
    if (!this.sessionId) throw new PracticeAccessError("UNAUTHENTICATED");
    return this.walks.startSession(context, jobId, this.sessionId, command);
  }

  async record(jobId: string, command: WalkEntryCommand) {
    const { context } = await this.authorize(jobId);
    if (!this.sessionId) throw new PracticeAccessError("UNAUTHENTICATED");
    return this.walks.recordEntry(context, jobId, this.sessionId, command);
  }

  // B1C mount, owned by B1A #920: filing pass-through beside the entry command.
  async fileWalkPhoto(jobId: string, command: WalkPhotoFilingCommand) {
    const { context } = await this.authorize(jobId);
    if (!this.sessionId) throw new PracticeAccessError("UNAUTHENTICATED");
    return this.walks.fileWalkPhoto(context, jobId, this.sessionId, command);
  }

  // V2-B1E: "Take photo" on the shared upload path, unchanged, so only a live job accepts it (option 1).
  async uploadPhoto(jobId: string, raw: unknown) {
    const { context } = await this.authorize(jobId);
    if (!this.sessionId) throw new PracticeAccessError("UNAUTHENTICATED");
    const digest = createHash("sha256").update(this.sessionId).digest("hex");
    const editor = await withTenant(this.pool, context, async db => (await db.$client.query<{ id: string | null }>(
      "SELECT app.v2_walk_editor($1) AS id", [digest])).rows[0]?.id);
    if (!editor) throw new WalkError("WALK_EDITOR_REQUIRED");
    return uploadWalkPhoto(this.pool, context, jobId, editor, raw);
  }

  /** Whether the shared upload rule will take a photo now. A hint for the screen; the upload itself decides. */
  async jobLive(jobId: string) {
    const { context } = await this.authorize(jobId);
    return withTenant(this.pool, context, async db => (await db.$client.query<{ status: string }>(
      "SELECT status FROM app.job WHERE (tenant_id, id) = ($1, $2)", [context.tenantId, jobId])).rows[0]?.status === "live");
  }

  private authorize(jobId: string) {
    if (process.env.JOBGUARD_LOCAL_V2 !== "1") throw new PracticeAccessError("SYNTHETIC_MODE_REQUIRED");
    return this.access.job(jobId);
  }
}
