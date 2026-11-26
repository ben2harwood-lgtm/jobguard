// V2-G3 (Q57): release a saved handover version by customer link, and "Acknowledge receipt".
// The builder side has G2's mode and access checks; the customer side has no sign-in, only the token.
import { PilotG1DeniedError, requireG1ForPilot } from "@jobguard/config";
import type { Pool } from "pg";
import { JobSourceError } from "@jobguard/core";
import { HandoverReleaseError, HandoverReleaseRepository, PracticeAccessError, practiceMaterialPool } from "@jobguard/db";
import { PracticeAccess } from "../practice-access.js";

export { HandoverReleaseError, handoverAcknowledgeV1, handoverReleaseCommandV1, type HandoverLinkView, type HandoverRelease,
  type HandoverReleaseCommand } from "@jobguard/db";

function v2Only() {
  try { requireG1ForPilot(process.env.JOBGUARD_ENV, process.env); }
  catch (error) { if (!(error instanceof PilotG1DeniedError)) throw error; throw new JobSourceError("SYNTHETIC_MODE_REQUIRED"); }
  if (process.env.JOBGUARD_ENV !== "synthetic_demo" || process.env.JOBGUARD_LOCAL_V2 !== "1") throw new JobSourceError("SYNTHETIC_MODE_REQUIRED");
}

export class HandoverReleaseApplication {
  private readonly access: PracticeAccess;
  constructor(private readonly pool: Pool, private readonly sessionId?: string) { v2Only(); this.access = new PracticeAccess(pool, sessionId); }
  private async open(jobId: string) {
    v2Only();
    const auth = await this.access.job(jobId);
    return { auth, releases: new HandoverReleaseRepository(practiceMaterialPool(this.pool, auth.digest)) };
  }
  async read(jobId: string) {
    const { auth, releases } = await this.open(jobId);
    return { version: "v2-handover-releases.v1" as const, environment: "synthetic_demo" as const, jobId,
      ...await releases.list(auth.context, jobId), realExternalActions: 0 as const };
  }
  async command(jobId: string, raw: unknown) {
    const { auth, releases } = await this.open(jobId);
    if (!this.sessionId) throw new PracticeAccessError("UNAUTHENTICATED");
    return releases.release(auth.context, jobId, this.sessionId, raw);
  }
}

/** The no-sign-in side: the token alone opens one release. */
export class HandoverLinkApplication {
  private readonly releases: HandoverReleaseRepository;
  constructor(pool: Pool) { this.releases = new HandoverReleaseRepository(pool); }
  open(token: string) { v2Only(); return this.releases.open(token); }
  acknowledge(raw: unknown) { v2Only(); return this.releases.acknowledge(raw); }
}

const statuses: Record<HandoverReleaseError["code"], number> = { HANDOVER_RELEASE_INVALID_COMMAND: 400, HANDOVER_RELEASE_NOT_FOUND: 404,
  HANDOVER_SITE_NOT_COMPLETE: 409, HANDOVER_NO_RECIPIENT: 409, HANDOVER_RELEASE_COMMAND_CONFLICT: 409, HANDOVER_LINK_REFUSED: 404 };
/** This piece's refusals; null falls back to the job-source mapping. */
export function handoverReleaseFailure(error: unknown): { status: number; body: Record<string, unknown> } | null {
  if (!(error instanceof HandoverReleaseError)) return null;
  return { status: statuses[error.code], body: { code: error.code, environment: "synthetic_demo" } };
}
