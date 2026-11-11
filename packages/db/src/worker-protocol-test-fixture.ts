// SQL protocol double only. Authorization, transitions and locks need real PG.
import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { vi } from "vitest";
import type { AuditEvent } from "./audit.js";
export function workerProtocolFixture(overrides: Record<string, any> = {}) {
  const row = { id: randomUUID(), authorization_id: randomUUID(), adapter: "fake_capture", provider_effect_key: "fictional",
    action_type: "send_quote", recipient: null, immutable_content: "fictional", content_hash: createHash("sha256").update("fictional").digest("hex"),
    aggregate_revision: 1, amount_pence: null, currency: null, policy_version: "synthetic.v1",
    authorization_expires_at: new Date("2099-01-01"), created_at: new Date(), next_attempt_at: new Date(0),
    claimed_at: new Date(0), updated_at: new Date(0), status: "pending", ...overrides };
  const state = { enabled: true, authorized: true, visible: true, auditFailure: false, attempt: 0, inTransaction: false,
    claimError: undefined as Error | undefined };
  const audit: AuditEvent[] = [];
  const token = randomUUID();
  const append = (event: string, references = {}) => {
    if (state.auditFailure) throw new Error("synthetic audit failure");
    audit.push({ eventType: `outbox.${event}`, payload: { references } } as AuditEvent);
  };
  let snapshot: { row: typeof row; audit: AuditEvent[]; attempt: number };
  const query = vi.fn(async (sql: string, values: any[] = []): Promise<{ rows: any[]; rowCount?: number }> => {
    if (sql === "BEGIN") { snapshot = { row: { ...row }, audit: [...audit], attempt: state.attempt }; state.inTransaction = true; }
    else if (sql === "COMMIT") state.inTransaction = false;
    else if (sql === "ROLLBACK") {
      Object.assign(row, snapshot.row); audit.splice(0, audit.length, ...snapshot.audit); state.attempt = snapshot.attempt; state.inTransaction = false;
    } else if (sql.startsWith("SELECT id FROM app.action_outbox")) return { rows: [], rowCount: state.visible ? 1 : 0 };
    else if (sql.includes("outbound_control.claims_enabled")) return { rows: [{ enabled: state.enabled }] };
    else if (sql.includes("app.claim_worker_action")) {
      if (state.claimError) throw state.claimError;
      if (!state.authorized || !values[1].includes(row.adapter)) return { rows: [{ claim: null }] };
      if (row.status === "executing") { row.status = "outcome_unknown"; append("outcome_unknown"); return { rows: [{ claim: null }] }; }
      if (!["pending", "retryable"].includes(row.status) || row.next_attempt_at > new Date()) return { rows: [{ claim: null }] };
      if (row.authorization_expires_at <= new Date()) { row.status = "cancelled"; append("authorization_revoked"); return { rows: [{ claim: { refused: true, code: "AUTHORIZATION_REVOKED" } }] }; }
      state.attempt++;
      row.status = "executing";
      append("claimed");
      const action = Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value instanceof Date ? value.toISOString() : value]));
      return { rows: [{ claim: { action, attempt: state.attempt, token } }] };
    } else if (sql.includes("app.complete_worker_action")) {
      if (values[1] !== token || row.status !== "executing") return { rows: [{ completed: false }] };
      const next = values[2] === "retryable" && state.attempt >= 5 ? "dead_letter" : values[2];
      append(next); row.status = next;
      if (next === "retryable") row.next_attempt_at = new Date(Date.now() + 60000);
      return { rows: [{ completed: true }] };
    } else if (sql.includes("app.worker_reconciliation")) return { rows: [{ effect: row.status === "outcome_unknown" ? { adapter: row.adapter, provider_effect_key: row.provider_effect_key, revision: row.updated_at.toISOString() } : null }] };
    else if (sql.includes("app.reconcile_worker_action")) { append(values[4] === "succeeded" ? "succeeded" : "retryable", { reconciliation: values[4] }); row.status = values[4] === "succeeded" ? "succeeded" : "retryable"; return { rows: [{ reconciled: true }] }; }
    else if (sql.includes("app.control_outbox")) {
      const changed = (values[1] === "retry" && row.status === "retryable") || (values[1] === "cancel" && ["pending", "retryable", "outcome_unknown", "dead_letter"].includes(row.status));
      if (changed) { if (values[1] === "cancel") row.status = "cancelled"; else row.next_attempt_at = new Date(0); }
      return { rows: [{ changed }] };
    } else if (sql.includes("FROM app.append_audit(")) {
      const { fakeAuditAppend } = await import("./audit-protocol-test-fixture.js");
      const events = fakeAuditAppend(String(values[0]), overrides.tenant_id); audit.push(...events); return { rows: events };
    } else if (sql.startsWith("SELECT nullif")) return { rows: [{ tenant_id: overrides.tenant_id }] };
    else if (!sql.startsWith("SELECT set_config")) throw new Error(`Unexpected worker protocol SQL: ${sql}`);
    return { rows: [] };
  });
  const pool = { query, connect: vi.fn(async () => ({ query, release: vi.fn() })) } as unknown as Pool;
  return { row, state, audit, query, pool, token };
}
