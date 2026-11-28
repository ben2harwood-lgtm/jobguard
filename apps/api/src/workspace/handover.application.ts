// V2-G2 (Q56): handover pack versions. Same mode and access checks as the G1 snag register.
import { PilotG1DeniedError, requireG1ForPilot } from "@jobguard/config";
import type { Pool } from "pg";
import { JobSourceError } from "@jobguard/core";
import { HandoverError, HandoverRepository, practiceMaterialPool } from "@jobguard/db";
import { PracticeAccess } from "../practice-access.js";

export { HandoverError, handoverPreviewV1, handoverSaveCommandV1, type HandoverSaveCommand, type HandoverVersion } from "@jobguard/db";
export type { HandoverChoice, HandoverContent, HandoverRefusal, HandoverSectionKey, HandoverSources } from "@jobguard/core";

export class HandoverApplication {
  private readonly access: PracticeAccess;
  constructor(private readonly pool: Pool, private readonly sessionId?: string) {
    this.assertMode(); this.access = new PracticeAccess(pool, sessionId);
  }
  private assertMode() {
    try { requireG1ForPilot(process.env.JOBGUARD_ENV, process.env); }
    catch (error) { if (!(error instanceof PilotG1DeniedError)) throw error; throw new JobSourceError("SYNTHETIC_MODE_REQUIRED"); }
    if (process.env.JOBGUARD_ENV !== "synthetic_demo" || process.env.JOBGUARD_LOCAL_V2 !== "1") throw new JobSourceError("SYNTHETIC_MODE_REQUIRED");
  }
  private async open(jobId: string) {
    this.assertMode();
    const auth = await this.access.job(jobId);
    return { auth, handover: new HandoverRepository(practiceMaterialPool(this.pool, auth.digest)) };
  }
  async read(jobId: string) {
    const { auth, handover } = await this.open(jobId);
    return { version: "v2-handover-view.v1" as const, environment: "synthetic_demo" as const, jobId,
      ...await handover.view(auth.context, jobId), realExternalActions: 0 as const };
  }
  /** Preview (writes nothing) or save a version, by `version`. */
  async command(jobId: string, raw: unknown) {
    const { auth, handover } = await this.open(jobId);
    const version = (raw as { version?: unknown } | null)?.version;
    if (version === "v2-handover-preview.v1") return { preview: await handover.preview(auth.context, jobId, raw) };
    if (version === "v2-handover-save-command.v1") return { saved: await handover.save(auth.context, jobId, this.sessionId!, raw) };
    throw new HandoverError("HANDOVER_INVALID_COMMAND");
  }
}

const statuses: Record<HandoverError["code"], number> = { HANDOVER_INVALID_COMMAND: 400, HANDOVER_NOT_FOUND: 404,
  HANDOVER_NOTHING_CHOSEN: 409, HANDOVER_LINE_REFUSED: 409, HANDOVER_SOURCE_CHANGED: 409, HANDOVER_VERSION_CONFLICT: 409,
  HANDOVER_COMMAND_CONFLICT: 409 };
/** This piece's refusals; null falls back to the job-source mapping. */
export function handoverFailure(error: unknown): { status: number; body: Record<string, unknown> } | null {
  if (!(error instanceof HandoverError)) return null;
  return { status: statuses[error.code], body: { code: error.code, environment: "synthetic_demo",
    ...(error.refused.length && { refused: error.refused }) } };
}
