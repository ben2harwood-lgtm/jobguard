import type { AuditEvent, AuditEventInput } from "./audit.js";

/** Protocol double for domain tests only. Does not simulate PostgreSQL hashes,
 * permissions or locks; lp4-audit.integration.test.ts supplies those assertions. */
export function fakeAuditAppend(serialized: string, tenantId: string): AuditEvent[] {
  return (JSON.parse(serialized) as AuditEventInput[]).map((input, index) => ({
    ...input, version: "audit.v2", tenantId, sequence: index + 1,
    occurredAt: new Date("2026-10-29T12:00:00.000Z"), payloadHash: "a".repeat(64), previousHash: null,
    eventHash: "b".repeat(64), payload: { ...input.payload,
      references: { ...input.payload.references, auditTrust: "lower_trust" } },
  }));
}

/** Exact capability probe only; callers must still reject unknown SQL. */
export function fakeOutboxAuditProbe(sql: string, installed = false) {
  if (sql === "SELECT to_regprocedure('app.lp6e_append_outbox_audit(jsonb)') installed") {
    return { rows: [{ installed: installed ? "app.lp6e_append_outbox_audit(jsonb)" : null }] };
  }
  return undefined;
}
