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

// LP-4 standalone format preparation. No writer or export reader uses these schemas yet.
// Structural verification is neither checked-operation provenance nor actor authentication.
const statementEnvelopeKeys = new Set([
  "id", "version", "tenantid", "actorref", "eventtype", "subjecttype", "subjectref",
  "sequence", "occurredat", "payload", "payloadhash", "previoushash", "eventhash", "trust",
]);
const statementPayloadV2Schema = z.unknown().superRefine((raw, ctx) => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
  const payload = raw as Record<string, unknown>;
  for (const [group, entries] of Object.entries(payload)) {
    if (entries === undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [group], message: "Undefined audit field" });
    if (!entries || typeof entries !== "object" || Array.isArray(entries)) continue;
    for (const key of Object.keys(entries)) {
      if (key === "__proto__" || key === "constructor" || key === "prototype" ||
          statementEnvelopeKeys.has(key.replace(/[^a-z0-9]/giu, "").toLowerCase())) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [group, key], message: "Reserved audit envelope field" });
      }
    }
  }
}).pipe(auditPayloadV1Schema);
const statementUuid = z.string().uuid().regex(/^[a-f0-9-]+$/u);
/** Candidate lower-trust input only. Attribution and sealing are absent from this boundary. */
export const auditStatementInputV2Schema = z.object({
  version: z.literal("audit-statement-input.v2"), id: statementUuid,
  subjectType: identifier.max(100), subjectRef: identifier, payload: statementPayloadV2Schema,
}).strict();
const auditMicrosecondTime = z.string().regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{6}Z$/u)
  .refine(value => {
    if (value.startsWith("0000-")) return false;
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 19) === value.slice(0, 19);
  }, "Invalid UTC audit timestamp");
const statementSequence = z.string().regex(/^[1-9][0-9]{0,18}$/u)
  .refine(value => /^[1-9][0-9]{0,18}$/u.test(value) && BigInt(value) <= 9223372036854775807n, "Invalid audit sequence");
const statementEnvelopeV2Schema = auditStatementInputV2Schema.extend({
  version: z.literal("audit.statement.v2"), tenantId: statementUuid,
  sequence: statementSequence, actorRef: identifier,
  eventType: z.literal("audit.statement.recorded"), trust: z.literal("caller_statement"),
  occurredAt: auditMicrosecondTime, payloadHash: hash, previousHash: hash.nullable(),
}).strict();
export const auditStatementEventV2Schema = statementEnvelopeV2Schema.extend({ eventHash: hash }).strict();

// Keys/values are schema-limited to ASCII identifiers, literals and digests. Explicit code-unit
// ordering equals UTF-8 byte ordering here; it does not depend on locale or JS integer-key order.
function canonicalStatementJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, child]) => `${JSON.stringify(key)}:${canonicalStatementJson(child)}`).join(",")}}`;
}
export function canonicalAuditStatementPayloadV2(raw: unknown): string {
  return canonicalStatementJson(statementPayloadV2Schema.parse(raw));
}
/** Canonical event bytes exclude payload (bound by payloadHash) and eventHash itself. */
export function canonicalAuditStatementV2(raw: unknown): string {
  const { payload: _payload, ...envelope } = statementEnvelopeV2Schema.parse(raw);
  return canonicalStatementJson(envelope);
}
/** Verifies one candidate statement's structure/hashes only, never chain completeness or authority. */
export function verifyAuditStatementV2(raw: unknown): z.infer<typeof auditStatementEventV2Schema> {
  const parsed = auditStatementEventV2Schema.safeParse(raw);
  if (!parsed.success) throw new AuditVerificationError("Invalid statement format");
  const { eventHash, ...envelope } = parsed.data;
  if (sha256(canonicalAuditStatementPayloadV2(envelope.payload)) !== envelope.payloadHash ||
      sha256(canonicalAuditStatementV2(envelope)) !== eventHash) {
    throw new AuditVerificationError("Invalid statement hash");
  }
  return parsed.data;
}
