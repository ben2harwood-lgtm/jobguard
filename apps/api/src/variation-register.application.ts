import { PilotG1DeniedError, requireG1ForPilot } from "@jobguard/config";
import type { Pool } from "pg";
import { JobSourceError, VariationRegisterError, buildVariationRegisterV1, latestClosedRegisterWeekV1, registerWeekV1, registerWeekWindowV1,
  renderVariationRegisterPdf, type VariationRegister } from "@jobguard/core";
import { PracticeAccessError, RequestBindingRefusedError, VariationRegisterRepository } from "@jobguard/db";
import { z } from "zod";
import { PracticeAccess } from "./practice-access.js";

export const variationRegisterQueryV1 = z.object({ week: registerWeekV1.optional() }).strict();
/** QW-3: the builder's weekly extras register (closes Friday 18:00 UK time). Practice mode only. Reads money, never changes it. */
export class VariationRegisterApplication {
  private readonly access: PracticeAccess;
  constructor(private readonly pool: Pool, sessionId?: string, private readonly clock: () => Date = () => new Date()) {
    this.assertMode(); this.access = new PracticeAccess(pool, sessionId);
  }
  private assertMode() {
    try { requireG1ForPilot(process.env.JOBGUARD_ENV, process.env); }
    catch (error) { if (!(error instanceof PilotG1DeniedError)) throw error; throw new JobSourceError("SYNTHETIC_MODE_REQUIRED"); }
    if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new JobSourceError("SYNTHETIC_MODE_REQUIRED");
  }
  async read(query: unknown = {}): Promise<VariationRegister> {
    this.assertMode();
    const parsed = variationRegisterQueryV1.safeParse(query);
    if (!parsed.success) throw new JobSourceError("INVALID_JOB_SOURCE_INPUT");
    const auth = await this.access.session(), now = this.clock(), friday = parsed.data.week ?? latestClosedRegisterWeekV1(now);
    const week = registerWeekWindowV1(friday);
    if (now.toISOString() < week.closesAt) throw new VariationRegisterError("REGISTER_WEEK_NOT_CLOSED");
    const sources = await new VariationRegisterRepository(this.pool).sources(auth.context, auth.digest, week).catch((error: unknown) => {
      if (error instanceof RequestBindingRefusedError && error.sessionKind === "practice") throw new PracticeAccessError("UNAUTHENTICATED");
      throw error;
    });
    return buildVariationRegisterV1(friday, now, sources);
  }
  async pdf(query: unknown = {}): Promise<{ register: VariationRegister; bytes: Uint8Array }> {
    const register = await this.read(query);
    return { register, bytes: renderVariationRegisterPdf(register) };
  }
}
export function variationRegisterFailure(error: unknown): { status: number; body: Record<string, unknown> } | null {
  if (error instanceof VariationRegisterError) return { status: error.code === "INVALID_REGISTER_WEEK" ? 400 : 404, body: { version: "job-source-error.v1", code: error.code, environment: "synthetic_demo", realExternalActions: 0 } };
  return null;
}
