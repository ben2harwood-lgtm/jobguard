// V2-G8: the builder's review-request switch and the one practice send, with G2's mode and access checks.
import { PilotG1DeniedError, requireG1ForPilot } from "@jobguard/config";
import type { Pool } from "pg";
import { JobSourceError } from "@jobguard/core";
import { PracticeAccessError, ReviewRequestError, ReviewRequestRepository, practiceMaterialPool } from "@jobguard/db";
import { PracticeAccess } from "../practice-access.js";

export { ReviewRequestError, reviewRequestSendV1, reviewRequestSwitchV1, type ReviewRequestSend, type ReviewRequestState,
  type ReviewRequestSwitch, type ReviewRequestView } from "@jobguard/db";

function v2Only() {
  try { requireG1ForPilot(process.env.JOBGUARD_ENV, process.env); }
  catch (error) { if (!(error instanceof PilotG1DeniedError)) throw error; throw new JobSourceError("SYNTHETIC_MODE_REQUIRED"); }
  if (process.env.JOBGUARD_ENV !== "synthetic_demo" || process.env.JOBGUARD_LOCAL_V2 !== "1") throw new JobSourceError("SYNTHETIC_MODE_REQUIRED");
}

export class ReviewRequestApplication {
  private readonly access: PracticeAccess;
  constructor(private readonly pool: Pool, private readonly sessionId?: string) { v2Only(); this.access = new PracticeAccess(pool, sessionId); }
  private async open(jobId: string) {
    v2Only();
    const auth = await this.access.job(jobId);
    return { auth, requests: new ReviewRequestRepository(practiceMaterialPool(this.pool, auth.digest)) };
  }
  async read(jobId: string) {
    const { auth, requests } = await this.open(jobId);
    return { version: "v2-review-request.v1" as const, environment: "synthetic_demo" as const, jobId,
      ...await requests.read(auth.context, jobId), realExternalActions: 0 as const };
  }
  async command(jobId: string, raw: unknown) {
    const { auth, requests } = await this.open(jobId);
    if (!this.sessionId) throw new PracticeAccessError("UNAUTHENTICATED");
    return requests.command(auth.context, jobId, this.sessionId, raw);
  }
}

const statuses: Record<ReviewRequestError["code"], number> = { REVIEW_REQUEST_INVALID_COMMAND: 400, REVIEW_REQUEST_NOT_FOUND: 404,
  REVIEW_REQUEST_COMMAND_CONFLICT: 409, REVIEW_REQUEST_NOT_DUE: 409, REVIEW_REQUEST_ALREADY_SENT: 409 };
/** This piece's refusals; null falls back to the job-source mapping. */
export function reviewRequestFailure(error: unknown): { status: number; body: Record<string, unknown> } | null {
  if (!(error instanceof ReviewRequestError)) return null;
  return { status: statuses[error.code], body: { code: error.code, ...(error.state && { state: error.state }), environment: "synthetic_demo" } };
}
