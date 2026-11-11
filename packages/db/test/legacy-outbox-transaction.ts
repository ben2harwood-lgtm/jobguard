// TEST ONLY: retain the old SQL protocol for genuine schemas predating LP-10.
import type { TenantTransaction } from "../src/tenant-context.js";
export async function historicalOutboxTransaction(db: TenantTransaction) {
  const client = db.$client;
  const historical = (await client.query(`SELECT to_regprocedure('app.control_outbox(uuid,text)') IS NULL
    AND to_regprocedure('app.claim_worker_action(uuid,text[])') IS NULL
    AND NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='control_plane' AND c.relname='worker_action_binding') AS historical`)).rows[0]?.historical;
  if (historical !== true) return;
  const query = async (sql: string, values: unknown[] = []) => {
    if (sql.includes("FROM app.lock_outbox_for_history($2)")) return client.query(
      "SELECT status,claimed_at FROM app.action_outbox WHERE tenant_id=$1 AND id=$2 FOR SHARE", values);
    if (sql.startsWith("SELECT app.control_outbox(")) {
      const command = /,'([^']+)'/u.exec(sql)?.[1];
      const predicate = "tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid";
      let changed;
      if (command === "cancel") changed = await client.query(`UPDATE app.action_outbox SET status='cancelled',updated_at=clock_timestamp() WHERE ${predicate} AND id=$1 AND status IN('pending','retryable')`, values);
      else if (command === "retry") changed = await client.query(`UPDATE app.action_outbox SET next_attempt_at=clock_timestamp() WHERE ${predicate} AND id=$1 AND status='retryable'`, values);
      else if (command === "blocked") changed = await client.query(`UPDATE app.action_outbox o SET status='cancelled',updated_at=clock_timestamp() WHERE ${predicate} AND id=$1 AND (status='pending' OR(status IN('retryable','dead_letter') AND EXISTS(SELECT 1 FROM app.action_attempt a WHERE a.tenant_id=o.tenant_id AND a.action_id=o.id AND a.error_code='FAKE_BLOCKED_CHANGED' AND a.attempt_number=(SELECT max(b.attempt_number) FROM app.action_attempt b WHERE(b.tenant_id,b.action_id)=(o.tenant_id,o.id)))))`, values);
      else if (command === "expire") {
        changed = await client.query(`UPDATE app.action_outbox SET status='outcome_unknown',updated_at=clock_timestamp() WHERE ${predicate} AND id=$1 AND status='executing' AND claimed_at<clock_timestamp()-interval '5 minutes'`, values);
        if (changed.rowCount) await client.query(`UPDATE app.action_attempt SET outcome='outcome_unknown',error_code='STALE_CLAIM',finished_at=clock_timestamp() WHERE ${predicate} AND action_id=$1 AND outcome='started'`, values);
      } else if (command === "close_attempt") changed = await client.query(`UPDATE app.action_attempt SET outcome='outcome_unknown',error_code='STALE_CLAIM',finished_at=clock_timestamp() WHERE ${predicate} AND action_id=$1 AND outcome='started' AND id=(SELECT a.id FROM app.action_attempt a WHERE a.tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND a.action_id=$1 ORDER BY a.attempt_number DESC LIMIT 1)`, values);
      else throw new Error("Unknown historical outbox control");
      return { ...changed, rows: [{ changed: !!changed.rowCount }], rowCount: 1 };
    }
    return client.query(sql, values);
  };
  db.$client = new Proxy(client, { get(target, key) {
    if (key === "query") return query;
    const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
  } });
}
