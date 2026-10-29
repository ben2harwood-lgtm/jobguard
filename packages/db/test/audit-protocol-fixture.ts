import type { AuditEvent, AuditEventInput } from "../src/audit.js";

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
