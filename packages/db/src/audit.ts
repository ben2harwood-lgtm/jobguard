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
  id: z.string().uuid(), version: z.literal("audit.v1"), actorRef: identifier,
  eventType: identifier.max(100), subjectType: identifier.max(100), subjectRef: identifier,
  payload: auditPayloadV1Schema,
});
export type AuditEventInput = z.infer<typeof auditEventInputV1Schema>;
export interface AuditEvent extends AuditEventInput {
  tenantId: string; sequence: number; occurredAt: Date; payloadHash: string;
  previousHash: string | null; eventHash: string;
}
export interface AuditCheckpoint { tenantId: string; sequence: number; eventHash: string; recordedAt: Date; }

export class AuditVerificationError extends Error {
  readonly code = "AUDIT_VERIFICATION_FAILED";
  constructor(message: string) { super(message); this.name = "AuditVerificationError"; }
}
const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");
const canonicalJson = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`).join(",")}}`;
};
export const canonicalAuditHash = (event: Omit<AuditEvent, "eventHash" | "payload">): string =>
  sha256([event.version, event.tenantId, String(event.sequence), event.actorRef, event.eventType,
    event.subjectType, event.subjectRef, event.occurredAt.toISOString(), event.payloadHash,
    event.previousHash ?? ""].join("\u001f"));

/** Append after domain mutation: the per-tenant head row MUST be the transaction's final lock. */
export async function appendAuditBatch(database: TenantTransaction, inputs: readonly AuditEventInput[]): Promise<AuditEvent[]> {
  if (inputs.length === 0) return [];
  const parsed = inputs.map((input) => auditEventInputV1Schema.parse(input));
  const context = await database.$client.query<{ tenant_id: string }>(
    "SELECT nullif(current_setting('app.tenant_id', true), '')::uuid::text AS tenant_id",
  );
  const tenantId = context.rows[0]?.tenant_id;
  if (!tenantId) throw new AuditVerificationError("Missing transaction-local tenant context");
  const head = await database.$client.query<{ sequence: string; event_hash: string }>(
    "SELECT sequence::text, event_hash FROM app.lock_audit_head()",
  );
  let sequence = Number(head.rows[0]?.sequence ?? 0);
  let previousHash: string | null = head.rows[0]?.event_hash ?? null;
  const appended: AuditEvent[] = [];
  for (const input of parsed) {
    const timestamp = await database.$client.query<{ occurred_at: Date }>("SELECT clock_timestamp() AS occurred_at");
    const occurredAt = timestamp.rows[0]!.occurred_at;
    const payloadHash = sha256(canonicalJson(input.payload));
    const event = { ...input, tenantId, sequence: ++sequence, occurredAt, payloadHash, previousHash };
    const eventHash = canonicalAuditHash(event);
    await database.$client.query(
      `INSERT INTO app.audit_event (id, tenant_id, sequence, version, actor_ref, event_type,
       subject_type, subject_ref, occurred_at, payload, payload_hash, previous_hash, event_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13)`,
      [input.id, tenantId, sequence, input.version, input.actorRef, input.eventType, input.subjectType,
        input.subjectRef, occurredAt, canonicalJson(input.payload), payloadHash, previousHash, eventHash],
    );
    appended.push({ ...event, eventHash });
    previousHash = eventHash;
  }
  await database.$client.query("SELECT app.advance_audit_head($1, $2)", [sequence, previousHash]);
  return appended;
}

export function verifyAuditChain(events: readonly AuditEvent[], checkpoint?: AuditCheckpoint): void {
  let previous: string | null = null;
  let expectedSequence = 1;
  for (const event of events) {
    if (!auditEventInputV1Schema.safeParse(event).success || event.sequence !== expectedSequence ||
        event.previousHash !== previous || sha256(canonicalJson(event.payload)) !== event.payloadHash ||
        canonicalAuditHash(event) !== event.eventHash) {
      throw new AuditVerificationError(`Invalid audit chain at sequence ${event.sequence}`);
    }
    previous = event.eventHash;
    expectedSequence += 1;
  }
  if (checkpoint && (checkpoint.tenantId !== events[0]?.tenantId || checkpoint.sequence > events.length ||
      events[checkpoint.sequence - 1]?.eventHash !== checkpoint.eventHash)) {
    throw new AuditVerificationError("Audit chain does not contain the trusted checkpoint");
  }
}

/** Migration/assurance credentials only; runtime cannot access audit_control. */
export async function exportAuditCheckpoints(pool: Pool): Promise<AuditCheckpoint[]> {
  const result = await pool.query<AuditCheckpoint>(`INSERT INTO audit_control.checkpoint
    (tenant_id, sequence, event_hash)
    SELECT DISTINCT ON (tenant_id) tenant_id, sequence, event_hash FROM app.audit_event
    ORDER BY tenant_id, sequence DESC RETURNING tenant_id AS "tenantId", sequence::int,
    event_hash AS "eventHash", recorded_at AS "recordedAt"`);
  return result.rows;
}
