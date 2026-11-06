import type { Pool } from "pg";
import { z } from "zod";
import { WorkOrderError } from "@jobguard/core";
import { ConnectorPromotionRepository } from "@jobguard/db";
const principalV1 = z.object({version:z.literal("contractor-principal.v1"),sessionId:z.string().uuid()}).strict();
/** Only a persisted human contractor session. No connector binding/token or caller-selected actor. */
export class ConnectorPromotionApplication {
  private readonly repository: ConnectorPromotionRepository;
  constructor(pool: Pool) { this.repository = new ConnectorPromotionRepository(pool); }
  private session(raw: unknown) {
    if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new WorkOrderError("MODE_FORBIDDEN");
    const parsed = principalV1.safeParse(raw);
    if (!parsed.success) throw new WorkOrderError("UNAUTHENTICATED");
    return parsed.data.sessionId;
  }
  list(principal: unknown) { return this.repository.list(this.session(principal)); }
  promote(principal: unknown, raw: unknown) { return this.repository.promote(this.session(principal), raw); }
}
