import type { Pool } from "pg";
import { PreventionCheckRepository } from "@jobguard/db";
import { preventionCommandV1, PreventionCheckError } from "@jobguard/core";
import { PracticeAccess } from "./practice-access.js";
import { preventionActionV1 } from "./prevention-check.contracts.js";

export class PreventionCheckApplication {
  private readonly access: PracticeAccess;
  private readonly repository: PreventionCheckRepository;
  constructor(pool: Pool, sessionId?: string) { this.access = new PracticeAccess(pool,sessionId); this.repository = new PreventionCheckRepository(pool); }
  async view(jobId: string) {
    const auth = await this.access.job(jobId);
    return this.repository.view(auth.context,auth.membershipId,jobId,auth.digest);
  }
  async command(jobId: string, raw: unknown, routeAction?: string) {
    const auth = await this.access.job(jobId);
    const parsed = preventionCommandV1.safeParse(raw);
    if (!parsed.success || (routeAction !== undefined && (!preventionActionV1.safeParse(routeAction).success || routeAction !== parsed.data.action))) throw new PreventionCheckError("INVALID_PREVENTION_COMMAND");
    return this.repository.command(auth.context,auth.membershipId,jobId,parsed.data,auth.digest);
  }
}
