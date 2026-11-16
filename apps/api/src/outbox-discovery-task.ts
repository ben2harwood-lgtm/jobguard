import type { TaskList } from "graphile-worker";

/** Rotate durable signals; only the business executor decides whether an action is due or authorized. */
export function registerOutboxDiscoveryTask(tasks: TaskList): void {
  tasks.discover_outbox = async (_payload, helpers) => {
    await helpers.withPgClient(async client => {
      await client.query("BEGIN");
      try {
        const signals = await client.query<{ action_id: string; tenant_id: string }>(
          `SELECT action_id,tenant_id FROM infrastructure.outbox_signal
           ORDER BY enqueued_at NULLS FIRST,created_at,action_id LIMIT 100 FOR UPDATE SKIP LOCKED`,
        );
        for (const signal of signals.rows) {
          await client.query(
            `SELECT graphile_worker.add_job('execute_outbox',$1::json,
             job_key := $2,job_key_mode := 'preserve_run_at')`,
            [JSON.stringify({ actionId: signal.action_id, tenantId: signal.tenant_id }), `outbox:${signal.action_id}`],
          );
          await client.query(
            "UPDATE infrastructure.outbox_signal SET enqueued_at=clock_timestamp() WHERE action_id=$1",
            [signal.action_id],
          );
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
  };
}
