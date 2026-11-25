import { PilotG1DeniedError, requireG1ForPilot } from "@jobguard/config";
import type { Pool } from "pg";
import { JobSourceError, SnagError, buildSnagListV1, parseSnag, snagCommandV1, snagEventCommandV1, snagPhotoCommandV1, type SnagList } from "@jobguard/core";
import { SnagRepository, WatchdogError, practiceMaterialPool } from "@jobguard/db";
import { z } from "zod";
import { PracticeAccess } from "./practice-access.js";

const snagId = z.guid();
/** QW-4: the job's snag list. Practice mode only, with the same session and job checks as the job diary. */
export class SnagApplication {
  private readonly access: PracticeAccess;
  constructor(private readonly pool: Pool, sessionId?: string, private readonly clock: () => Date = () => new Date()) {
    this.assertMode(); this.access = new PracticeAccess(pool, sessionId);
  }
  private assertMode() {
    try { requireG1ForPilot(process.env.JOBGUARD_ENV, process.env); }
    catch (error) { if (!(error instanceof PilotG1DeniedError)) throw error; throw new JobSourceError("SYNTHETIC_MODE_REQUIRED"); }
    if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new JobSourceError("SYNTHETIC_MODE_REQUIRED");
  }
  /** Ownership is checked first; only then is the job's list read, through the practice-bound pool. */
  private async open(jobId: string) {
    this.assertMode();
    const auth = await this.access.job(jobId);
    return { auth, repository: new SnagRepository(practiceMaterialPool(this.pool, auth.digest)) };
  }
  async list(jobId: string): Promise<SnagList> {
    const { auth, repository } = await this.open(jobId);
    return buildSnagListV1(jobId, this.clock(), await repository.read(auth.context, jobId));
  }
  /** Add or revise a snag, then answer with the whole list. */
  async save(jobId: string, raw: unknown): Promise<SnagList> {
    const { auth, repository } = await this.open(jobId), command = parseSnag(snagCommandV1, raw);
    if (command.action === "add") await repository.add(auth.context, jobId, command);
    else await repository.revise(auth.context, jobId, command);
    return buildSnagListV1(jobId, this.clock(), await repository.read(auth.context, jobId));
  }
  /** Mark fixed, mark checked or reopen. */
  async event(jobId: string, snag: string, raw: unknown): Promise<SnagList> {
    const { auth, repository } = await this.open(jobId), command = parseSnag(snagEventCommandV1, raw), id = parseSnag(snagId, snag);
    await repository.recordEvent(auth.context, jobId, id, command);
    return buildSnagListV1(jobId, this.clock(), await repository.read(auth.context, jobId));
  }
  /** Begin answers the upload to finalize; finalize answers the verified evidence id. */
  async photo(jobId: string, snag: string, raw: unknown) {
    const { auth, repository } = await this.open(jobId), command = parseSnag(snagPhotoCommandV1, raw), id = parseSnag(snagId, snag);
    return { version: "snag-photo-result.v1" as const, environment: "synthetic_demo" as const, jobId, snagId: id,
      ...await repository.photo(auth.context, jobId, id, command), realExternalActions: 0 as const };
  }
}

const statuses: Record<SnagError["code"], number> = {
  INVALID_SNAG_INPUT: 400, SNAG_NOT_FOUND: 404, SNAG_PRACTICE_ONLY: 403, SNAG_COMMAND_CONFLICT: 409, SNAG_REVISION_CONFLICT: 409,
  SNAG_TRANSITION_REFUSED: 409, SNAG_CHECKER_MUST_DIFFER: 409, SNAG_PHOTO_REFUSED: 409, PHOTO_LIMIT_REACHED: 409,
};
/** The snag refusals and the watchdog's live-job refusal; anything else falls back to the job-source mapping. */
export function snagFailure(error: unknown): { status: number; body: Record<string, unknown> } | null {
  if (error instanceof SnagError) return { status: statuses[error.code], body: { version: "job-source-error.v1", code: error.code, environment: "synthetic_demo", realExternalActions: 0 } };
  if (error instanceof WatchdogError && error.code === "JOB_NOT_LIVE") return { status: 409, body: { code: error.code } };
  return null;
}
