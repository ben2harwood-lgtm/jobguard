import { createHash } from "node:crypto";
import { z } from "zod";
import type { Pool } from "pg";
import type { TenantTransaction } from "./tenant-context.js";

const identifier = z.string().min(1).max(200).regex(/^[A-Za-z0-9_.:@/-]+$/u);
const hash = z.string().regex(/^[a-f0-9]{64}$/u);

/** V1 deliberately permits identifiers and hashes only, never free text or contact data. */
export const auditPayloadV1Schema = z.object({
  references: z.record(identifier, identifier).optional(),
  hashes: z.record(identifier, hash).optional(),
  classifications: z.record(identifier, z.enum(["operational", "commercial", "financial", "security"])).optional(),
}).strict();
export const auditEventInputV1Schema = z.object({
  id: z.guid({ error: "Invalid uuid" }), version: z.literal("audit.v1"), actorRef: identifier,
  eventType: identifier.max(100), subjectType: identifier.max(100), subjectRef: identifier,
  payload: auditPayloadV1Schema,
});
/** Requests remain v1; only the database emits v2. Legacy history has no trust assertion. */
const checkedExclusionsSchema = auditEventInputV1Schema.extend({
  version: z.literal("audit.v2"), actorRef: z.literal("system:final_check"),
  eventType: z.literal("final_check.sources_excluded"), subjectType: z.literal("job"),
  payload: auditPayloadV1Schema.extend({ references: z.object({
    manifestId: z.guid(), lockId: z.guid(), auditTrust: z.literal("checked_operation"),
    exclusions: z.array(z.object({ uploadId: z.guid(), state: z.enum(["rejected", "expired"]),
      reason: z.string().min(1).max(200).regex(/^[A-Za-z0-9_:/-]+$/u) }).strict()),
  }).strict() }),
});
export const auditStoredInputSchema = z.union([
  auditEventInputV1Schema.extend({ version: z.enum(["audit.v1", "audit.v2"]) }), checkedExclusionsSchema,
]);
export function auditEventTrust(event: Pick<AuditEvent, "version" | "payload">): "legacy" | "lower_trust" | "checked_operation" {
  if (event.version === "audit.v1") return "legacy";
  const trust = event.payload.references?.auditTrust;
  if (trust !== "lower_trust" && trust !== "checked_operation") throw new AuditVerificationError("Invalid audit trust label");
  return trust;
}
export type AuditEventInput = z.infer<typeof auditEventInputV1Schema>;
export type AuditEvent = z.infer<typeof auditStoredInputSchema> & {
  tenantId: string; sequence: number; occurredAt: Date; payloadHash: string;
  previousHash: string | null; eventHash: string;
}
export interface AuditCheckpoint { tenantId: string; sequence: number; eventHash: string; recordedAt: Date; }

export class AuditVerificationError extends Error {
  readonly code = "AUDIT_VERIFICATION_FAILED";
  constructor(message: string) { super(message); this.name = "AuditVerificationError"; }
}
const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");
const canonicalJson = (value: unknown, version = "audit.v1"): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(child => canonicalJson(child, version)).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => version === "audit.v1" ? a.localeCompare(b) : a < b ? -1 : a > b ? 1 : 0)
    .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child, version)}`).join(",")}}`;
};
export const canonicalAuditHash = (event: Omit<AuditEvent, "eventHash" | "payload">): string =>
  sha256([event.version, ...(event.version === "audit.v2" ? [event.id] : []), event.tenantId, String(event.sequence), event.actorRef, event.eventType,
    event.subjectType, event.subjectRef, event.occurredAt.toISOString(), event.payloadHash,
    event.previousHash ?? ""].join("\u001f"));

/** Append after domain mutation: the per-tenant head row MUST be the transaction's final lock. */
export async function appendAuditBatch(database: TenantTransaction, inputs: readonly AuditEventInput[]): Promise<AuditEvent[]> {
  if (inputs.length === 0) return [];
  const parsed = inputs.map((input) => auditEventInputV1Schema.strict().parse(input));
  const result = await database.$client.query<AuditEvent>(`SELECT id, version, tenant_id AS "tenantId",
    sequence::int, actor_ref AS "actorRef", event_type AS "eventType", subject_type AS "subjectType",
    subject_ref AS "subjectRef", occurred_at AS "occurredAt", payload, payload_hash AS "payloadHash",
    previous_hash AS "previousHash", event_hash AS "eventHash" FROM app.append_audit($1::jsonb)`,
  [JSON.stringify(parsed)]);
  return result.rows;
}

export function verifyAuditChain(events: readonly AuditEvent[], checkpoint?: AuditCheckpoint): void {
  let previous: string | null = null;
  let expectedSequence = 1;
  for (const event of events) {
    if (!auditStoredInputSchema.safeParse(event).success || event.sequence !== expectedSequence ||
        event.previousHash !== previous || sha256(canonicalJson(event.payload, event.version)) !== event.payloadHash ||
        canonicalAuditHash(event) !== event.eventHash) {
      throw new AuditVerificationError(`Invalid audit chain at sequence ${event.sequence}`);
    }
    auditEventTrust(event);
    previous = event.eventHash;
    expectedSequence += 1;
  }
  if (checkpoint && (checkpoint.tenantId !== events[0]?.tenantId || checkpoint.sequence > events.length ||
      events[checkpoint.sequence - 1]?.eventHash !== checkpoint.eventHash)) {
    throw new AuditVerificationError("Audit chain does not contain the trusted checkpoint");
  }
}

/** Migration/assurance credentials only. Returns newly recorded checkpoints; equal hashes skip.
 * The insert fixes candidate identities; skipped candidates are verified in a fresh statement.
 * Valid inserts commit before disagreement is reported; other companies' records remain. */
export async function exportAuditCheckpoints(pool: Pool): Promise<AuditCheckpoint[]> {
  type Candidate = Omit<AuditCheckpoint, "recordedAt"> & { recordedAt: Date | null; inserted: boolean };
  const result = await pool.query<Candidate>(`WITH candidates AS MATERIALIZED (
    SELECT DISTINCT ON (tenant_id) tenant_id, sequence, event_hash FROM app.audit_event
    ORDER BY tenant_id, sequence DESC
  ), inserted AS (
    INSERT INTO audit_control.checkpoint (tenant_id, sequence, event_hash)
    SELECT tenant_id, sequence, event_hash FROM candidates ORDER BY tenant_id, sequence
    ON CONFLICT (tenant_id, sequence) DO NOTHING
    RETURNING tenant_id, sequence, event_hash, recorded_at
  )
  SELECT candidate.tenant_id AS "tenantId", candidate.sequence::int, candidate.event_hash AS "eventHash",
    inserted.recorded_at AS "recordedAt", inserted.tenant_id IS NOT NULL AS inserted
  FROM candidates candidate LEFT JOIN inserted
    ON (inserted.tenant_id,inserted.sequence)=(candidate.tenant_id,candidate.sequence)
  ORDER BY candidate.tenant_id, candidate.sequence`);
  const skipped = result.rows.filter(row => !row.inserted)
    .map(({ tenantId, sequence, eventHash }) => ({ tenantId, sequence, eventHash }));
  if (skipped.length) {
    // DO NOTHING may wait for a row invisible to the insert snapshot. Re-read only those
    // fixed identities after the statement completes, never today's newest events.
    const conflicts = await pool.query<Pick<AuditCheckpoint, "tenantId" | "sequence">>(`SELECT candidate."tenantId", candidate.sequence
      FROM jsonb_to_recordset($1::jsonb) AS candidate("tenantId" uuid, sequence bigint, "eventHash" text)
      LEFT JOIN audit_control.checkpoint stored
        ON (stored.tenant_id,stored.sequence)=(candidate."tenantId",candidate.sequence)
      WHERE stored.event_hash IS DISTINCT FROM candidate."eventHash"
      ORDER BY candidate."tenantId", candidate.sequence`, [JSON.stringify(skipped)]);
    const disagreement = conflicts.rows[0];
    if (disagreement) throw new AuditVerificationError(`Stored checkpoint differs for tenant ${disagreement.tenantId} at sequence ${disagreement.sequence}`);
  }
  return result.rows.filter(row => row.inserted).map(({ inserted: _inserted, ...checkpoint }) => ({ ...checkpoint, recordedAt: checkpoint.recordedAt! }));
}
