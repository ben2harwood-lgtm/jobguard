// V2-G9: the builder's aftercare switch and the 6- and 12-month practice offers, with G2's mode and access checks.
import { PilotG1DeniedError, requireG1ForPilot } from "@jobguard/config";
import type { Pool } from "pg";
import { JobSourceError } from "@jobguard/core";
import { PracticeAccessError, AftercareError, AftercareRepository, practiceMaterialPool } from "@jobguard/db";
import { PracticeAccess } from "../practice-access.js";

export { AftercareError, aftercareSendV1, aftercareSwitchV1, type AftercareSend, type AftercareState,
  type AftercareSwitch, type AftercareView } from "@jobguard/db";

function v2Only() {
  try { requireG1ForPilot(process.env.JOBGUARD_ENV, process.env); }
  catch (error) { if (!(error instanceof PilotG1DeniedError)) throw error; throw new JobSourceError("SYNTHETIC_MODE_REQUIRED"); }
  if (process.env.JOBGUARD_ENV !== "synthetic_demo" || process.env.JOBGUARD_LOCAL_V2 !== "1") throw new JobSourceError("SYNTHETIC_MODE_REQUIRED");
}

export class AftercareApplication {
  private readonly access: PracticeAccess;
  constructor(private readonly pool: Pool, private readonly sessionId?: string) { v2Only(); this.access = new PracticeAccess(pool, sessionId); }
  private async open(jobId: string) {
    v2Only();
    const auth = await this.access.job(jobId);
    return { auth, aftercare: new AftercareRepository(practiceMaterialPool(this.pool, auth.digest)) };
  }
  async read(jobId: string) {
    const { auth, aftercare } = await this.open(jobId);
    return { version: "v2-aftercare.v1" as const, environment: "synthetic_demo" as const, jobId,
      ...await aftercare.read(auth.context, jobId), realExternalActions: 0 as const };
  }
  async command(jobId: string, raw: unknown) {
    const { auth, aftercare } = await this.open(jobId);
    if (!this.sessionId) throw new PracticeAccessError("UNAUTHENTICATED");
    return aftercare.command(auth.context, jobId, this.sessionId, raw);
  }
}

const statuses: Record<AftercareError["code"], number> = { AFTERCARE_INVALID_COMMAND: 400, AFTERCARE_NOT_FOUND: 404,
  AFTERCARE_COMMAND_CONFLICT: 409, AFTERCARE_NOT_DUE: 409 };
/** This piece's refusals; null falls back to the job-source mapping. */
export function aftercareFailure(error: unknown): { status: number; body: Record<string, unknown> } | null {
  if (!(error instanceof AftercareError)) return null;
  return { status: statuses[error.code], body: { code: error.code, ...(error.state && { state: error.state }), environment: "synthetic_demo" } };
}
