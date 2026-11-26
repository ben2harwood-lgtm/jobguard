import type { Pool } from "pg";
import { z } from "zod";
import type { OutboundAction, OutboundAdapter, SafeTelemetry } from "./outbox.js";
import { WorkerActionExecutor } from "./worker-action-executor.js";

export const commercialEmailJobV1 = z.strictObject({ actionId: z.guid(), tenantId: z.guid() });

/** Uses the existing checked worker routines for approval, attempts, audit and reconciliation. */
export class CommercialEmailOutbox {
  private readonly executor: WorkerActionExecutor;

  constructor(private readonly pool: Pool, adapters: Map<string, OutboundAdapter>, telemetry: SafeTelemetry,
    signinDigest: (value: string) => string, private readonly canDeliver: (action: Readonly<OutboundAction>) => boolean) {
    this.executor = new WorkerActionExecutor(pool, adapters, telemetry, signinDigest);
  }

  async discover() {
    const rows = (await this.pool.query(
      'SELECT action_id AS "actionId", tenant_id AS "tenantId" FROM app.pilot_email_signals()',
    )).rows;
    return z.array(commercialEmailJobV1).parse(rows);
  }

  async execute(raw: unknown): Promise<void> {
    const job = commercialEmailJobV1.parse(raw);
    await this.executor.execute(job.actionId, undefined, job.tenantId, async (client, action) => {
      if (!this.canDeliver(action)) return false;
      return (await client.query<{ current: boolean }>(
        'SELECT app.pilot_email_action_current($1) AS current', [action.id],
      )).rows[0]?.current === true;
    });
  }
}
