import { utcDatetimeV1 } from "@jobguard/core";
import { createHash, generateKeyPairSync, randomUUID, sign, verify, createPublicKey } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { appendAuditBatch, auditEventTrust, auditStoredInputSchema, verifyAuditChain, type AuditCheckpoint, type AuditEvent } from "./audit.js";
import type { TenantTransaction, VerifiedTenantContext } from "./tenant-context.js";

export const AUDIT_EXPORT_NOTICE = "The signature proves export integrity only";
export const AUDIT_EXPORT_SANDBOX = "Practice sandbox — synthetic data; nothing is sent or charged";
const uuid = z.guid({ error: "Invalid uuid" }), digest = z.string().regex(/^[a-f0-9]{64}$/u);
const sequence = z.number().int().positive().safe();
const timestamp = utcDatetimeV1;
export const auditExportRequestV1 = z.object({ version: z.literal("audit-export-request.v1"), commandId: uuid }).strict();
const storedFields = { tenantId: uuid, sequence, occurredAt: timestamp, payloadHash: digest, previousHash: digest.nullable(), eventHash: digest };
const eventV1 = z.union([
  auditStoredInputSchema.options[0].extend(storedFields).strict(),
  auditStoredInputSchema.options[1].extend(storedFields).strict(),
]);
const checkpointV1 = z.object({ tenantId: uuid, sequence, eventHash: digest, recordedAt: timestamp }).strict();
export const auditExportPayloadV1 = z.object({
  version: z.literal("audit-export.v1"), environment: z.literal("synthetic_demo"), notice: z.literal(AUDIT_EXPORT_NOTICE), sandbox: z.literal(AUDIT_EXPORT_SANDBOX),
  tenantId: uuid, exportId: uuid, createdAt: timestamp, entryCount: sequence, headHash: digest, signerFingerprint: digest,
  checkpoints: z.array(checkpointV1).min(1), entries: z.array(eventV1).min(1),
}).strict();
const base64 = z.string().min(1).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u);
export const auditExportFileV1 = z.object({ version: z.literal("audit-export-file.v1"), algorithm: z.literal("Ed25519"), payloadBase64: base64, publicKeyPem: z.string().min(1).max(1000), signatureBase64: base64 }).strict();
export type AuditExportFile = z.infer<typeof auditExportFileV1>;
export type AuditExportPayload = z.infer<typeof auditExportPayloadV1>;
export class AuditExportError extends Error {
  constructor(readonly code: "AUDIT_EXPORT_UNAUTHENTICATED" | "AUDIT_EXPORT_FORBIDDEN" | "AUDIT_EXPORT_MODE_HELD" | "AUDIT_EXPORT_CHECKPOINT_REQUIRED" | "AUDIT_EXPORT_INVALID_INPUT" | "AUDIT_EXPORT_INVALID" | "AUDIT_EXPORT_COMMAND_CONFLICT" | "AUDIT_EXPORT_UNAVAILABLE") { super(code); }
}
const hash = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
export function auditExportFingerprint(pem: string): string {
  const key = createPublicKey(pem);
  if (key.asymmetricKeyType !== "ed25519") throw new AuditExportError("AUDIT_EXPORT_INVALID");
  return hash(key.export({ type: "spki", format: "der" }));
}
/** Private keys exist only for this synthetic creation and are never persisted. */
export function signAuditExport(input: Omit<AuditExportPayload, "signerFingerprint">): AuditExportFile {
  const keys = generateKeyPairSync("ed25519");
  const publicKeyPem = keys.publicKey.export({ type: "spki", format: "pem" }).toString();
  const payload = auditExportPayloadV1.parse({ ...input, signerFingerprint: auditExportFingerprint(publicKeyPem) });
  const bytes = Buffer.from(JSON.stringify(payload), "utf8");
  const file = auditExportFileV1.parse({ version: "audit-export-file.v1", algorithm: "Ed25519", payloadBase64: bytes.toString("base64"), publicKeyPem, signatureBase64: sign(null, bytes, keys.privateKey).toString("base64") });
  verifySignedAuditExport(file);
  return file;
}
/** Reuses the merged chain verifier; a bundled public key is not independently trusted. */
export function verifySignedAuditExport(raw: unknown, trustedPublicKeyPem?: string) {
  try {
    const file = auditExportFileV1.parse(raw), bytes = Buffer.from(file.payloadBase64, "base64");
    if (bytes.toString("base64") !== file.payloadBase64 || !verify(null, bytes, createPublicKey(file.publicKeyPem), Buffer.from(file.signatureBase64, "base64"))) throw new Error();
    const payload = auditExportPayloadV1.parse(JSON.parse(bytes.toString("utf8")));
    const fingerprint = auditExportFingerprint(file.publicKeyPem);
    if (fingerprint !== payload.signerFingerprint || (trustedPublicKeyPem !== undefined && fingerprint !== auditExportFingerprint(trustedPublicKeyPem))) throw new Error();
    if (payload.entries.length !== payload.entryCount || payload.entries.some(e => e.tenantId !== payload.tenantId) || payload.checkpoints.some(c => c.tenantId !== payload.tenantId)) throw new Error();
    const events = payload.entries.map(e => ({ ...e, occurredAt: new Date(e.occurredAt) }));
    for (const checkpoint of payload.checkpoints) verifyAuditChain(events, { ...checkpoint, recordedAt: new Date(checkpoint.recordedAt) });
    const tail = events.at(-1)!;
    if (tail.eventHash !== payload.headHash || tail.id !== payload.exportId || tail.eventType !== "audit.export.created" || tail.subjectRef !== payload.exportId || tail.occurredAt.toISOString() !== payload.createdAt) throw new Error();
    return { version: "audit-export-verification.v1" as const, integrityValid: true, complete: trustedPublicKeyPem !== undefined, signerTrusted: trustedPublicKeyPem !== undefined, checkpointTrust: "signer attests restricted handoff; no external timestamp" as const, notice: AUDIT_EXPORT_NOTICE, evidenceTrust: events.map(event => ({ id: event.id, trust: auditEventTrust(event) })), payload };
  } catch { throw new AuditExportError("AUDIT_EXPORT_INVALID"); }
}
export interface AuditExportActor { membershipId: string; identityUserId: string; }
export interface AuditExportRow { id: string; createdAt: string; entryCount: number; headHash: string; file: AuditExportFile; }

/** Restricted assurance path only: copies an EXISTING checkpoint, never creates one or grants runtime access to audit_control. */
export async function handoffAuditExportCheckpoint(assurancePool: Pick<Pool | PoolClient, "query">, checkpoint: AuditCheckpoint): Promise<void> {
  const parsed = checkpointV1.parse({ ...checkpoint, recordedAt: checkpoint.recordedAt.toISOString() });
  const result = await assurancePool.query(`INSERT INTO app.audit_export_checkpoint(tenant_id,sequence,event_hash,recorded_at)
    SELECT tenant_id,sequence,event_hash,recorded_at FROM audit_control.checkpoint
    WHERE tenant_id=$1 AND sequence=$2 AND event_hash=$3 AND date_trunc('milliseconds',recorded_at)=$4
    ON CONFLICT(tenant_id,sequence) DO NOTHING`, [parsed.tenantId, parsed.sequence, parsed.eventHash, parsed.recordedAt]);
  if (!result.rowCount) {
    const existing = await assurancePool.query(`SELECT 1 FROM app.audit_export_checkpoint h JOIN audit_control.checkpoint c
      ON (h.tenant_id,h.sequence,h.event_hash,h.recorded_at)=(c.tenant_id,c.sequence,c.event_hash,c.recorded_at)
      WHERE h.tenant_id=$1 AND h.sequence=$2 AND h.event_hash=$3 AND date_trunc('milliseconds',h.recorded_at)=$4`, [parsed.tenantId, parsed.sequence, parsed.eventHash, parsed.recordedAt]);
    if (!existing.rowCount) throw new AuditExportError("AUDIT_EXPORT_CHECKPOINT_REQUIRED");
  }
}
const actorV1 = z.object({ membershipId: uuid, identityUserId: uuid }).strict();
const eventColumns = `id,version,actor_ref AS "actorRef",event_type AS "eventType",subject_type AS "subjectType",subject_ref AS "subjectRef",payload,tenant_id AS "tenantId",sequence::int,occurred_at AS "occurredAt",payload_hash AS "payloadHash",previous_hash AS "previousHash",event_hash AS "eventHash"`;
export class AuditExportRepository {
  constructor(private readonly pool: Pool) {}
  /** Refusal only: the session identifies historical membership, not current export authority. */
  async refuse(context: VerifiedTenantContext, rawActor: AuditExportActor, action: "create" | "list"): Promise<void> {
    const { withTenant } = await import("./tenant-context.js");
    const actor = actorV1.parse(rawActor);
    await withTenant(this.pool, context, async db => {
      await db.$client.query("SELECT pg_advisory_xact_lock_shared(hashtextextended($1,54))", [context.tenantId]);
      const member = await db.$client.query("SELECT 1 FROM app.membership WHERE tenant_id=$1 AND id=$2 AND identity_user_id=$3", [context.tenantId, actor.membershipId, actor.identityUserId]);
      // The verified session supplies the tenant even if its historical actor no longer matches.
      // As in the authorization refusal path, never copy an unknown/foreign actor into the chain.
      await appendAuditBatch(db, [{ id: randomUUID(), version: "audit.v1", actorRef: member.rowCount ? `membership:${actor.membershipId}` : "security:unverified-member", eventType: "audit.export.refused", subjectType: "audit-export", subjectRef: context.tenantId, payload: { references: { action }, classifications: { action: "security" } } }]);
    });
  }
  private async authorized(db: TenantTransaction, context: VerifiedTenantContext, actor: AuditExportActor, action: "create" | "list"): Promise<boolean> {
    const allowed = (await db.$client.query<{ allowed: boolean; knownMember: boolean }>(`SELECT EXISTS(SELECT 1 FROM app.membership m JOIN app.role_grant g ON (g.tenant_id,g.membership_id)=(m.tenant_id,m.id)
      WHERE m.tenant_id=$1 AND m.id=$2 AND m.identity_user_id=$3 AND app.contractor_member_active(m.id)
      AND g.role IN ('owner','admin') AND g.scope_kind='tenant' AND g.scope_id=$1 AND g.contract_id IS NULL
      AND NOT EXISTS(SELECT 1 FROM app.role_grant_revocation r WHERE (r.tenant_id,r.grant_id)=(g.tenant_id,g.id))) allowed,
      EXISTS(SELECT 1 FROM app.membership m WHERE m.tenant_id=$1 AND m.id=$2 AND m.identity_user_id=$3) AS "knownMember"`, [context.tenantId, actor.membershipId, actor.identityUserId])).rows[0]!;
    // Never copy an unknown/foreign membership identity into this tenant's refusal chain.
    if (!allowed.allowed) await appendAuditBatch(db, [{ id: randomUUID(), version: "audit.v1", actorRef: allowed.knownMember ? `membership:${actor.membershipId}` : "security:unverified-member", eventType: "audit.export.refused", subjectType: "audit-export", subjectRef: context.tenantId, payload: { references: { action }, classifications: { action: "security" } } }]);
    return allowed.allowed;
  }
  async list(context: VerifiedTenantContext, rawActor: AuditExportActor): Promise<AuditExportRow[]> {
    const { withTenant } = await import("./tenant-context.js");
    const actor = actorV1.parse(rawActor);
    const result = await withTenant(this.pool, context, async db => {
      await db.$client.query("SELECT pg_advisory_xact_lock_shared(hashtextextended($1,54))", [context.tenantId]);
      if (!await this.authorized(db, context, actor, "list")) return null;
      return (await db.$client.query<AuditExportRow>(`SELECT id,created_at::text AS "createdAt",entry_count AS "entryCount",head_hash AS "headHash",file FROM app.audit_export WHERE tenant_id=$1 ORDER BY created_at,id`, [context.tenantId])).rows;
    });
    if (result === null) throw new AuditExportError("AUDIT_EXPORT_FORBIDDEN");
    return result;
  }
  async create(context: VerifiedTenantContext, rawActor: AuditExportActor, raw: unknown): Promise<AuditExportRow> {
    if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new AuditExportError("AUDIT_EXPORT_MODE_HELD");
    const { withTenant } = await import("./tenant-context.js");
    const request = auditExportRequestV1.parse(raw), actor = actorV1.parse(rawActor);
    const result = await withTenant(this.pool, context, async db => {
      // ENT-1 membership/grant mutation shares this lock. Every business lock precedes appendAuditBatch.
      await db.$client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,54))", [context.tenantId]);
      if (!await this.authorized(db, context, actor, "create")) return null;
      const prior = (await db.$client.query<AuditExportRow & { actorId: string }>(`SELECT id,created_at::text AS "createdAt",entry_count AS "entryCount",head_hash AS "headHash",file,actor_membership_id AS "actorId" FROM app.audit_export WHERE tenant_id=$1 AND id=$2`, [context.tenantId, request.commandId])).rows[0];
      if (prior) { if (prior.actorId !== actor.membershipId) throw new AuditExportError("AUDIT_EXPORT_COMMAND_CONFLICT"); const { actorId: _actorId, ...row } = prior; return row; }
      const checkpoints = (await db.$client.query<AuditCheckpoint>(`SELECT tenant_id AS "tenantId",sequence::int,event_hash AS "eventHash",recorded_at AS "recordedAt" FROM app.audit_export_checkpoint WHERE tenant_id=$1 ORDER BY sequence`, [context.tenantId])).rows;
      if (!checkpoints.length) throw new AuditExportError("AUDIT_EXPORT_CHECKPOINT_REQUIRED");
      // Head lock is final. Once held, all preceding committed entries and this export's event form one snapshot.
      const [exportEvent] = await appendAuditBatch(db, [{ id: request.commandId, version: "audit.v1", actorRef: `membership:${actor.membershipId}`, eventType: "audit.export.created", subjectType: "audit-export", subjectRef: request.commandId, payload: { references: { environment: "synthetic_demo", checkpointSequence: String(checkpoints.at(-1)!.sequence) }, classifications: { action: "security" } } }]);
      const entries = (await db.$client.query<AuditEvent>(`SELECT ${eventColumns} FROM app.audit_event WHERE tenant_id=$1 ORDER BY sequence`, [context.tenantId])).rows;
      for (const checkpoint of checkpoints) verifyAuditChain(entries, checkpoint);
      const file = signAuditExport({ version: "audit-export.v1", environment: "synthetic_demo", notice: AUDIT_EXPORT_NOTICE, sandbox: AUDIT_EXPORT_SANDBOX, tenantId: context.tenantId, exportId: request.commandId, createdAt: exportEvent!.occurredAt.toISOString(), entryCount: entries.length, headHash: exportEvent!.eventHash, checkpoints: checkpoints.map(c => ({ ...c, recordedAt: c.recordedAt.toISOString() })), entries: entries.map(e => ({ ...e, occurredAt: e.occurredAt.toISOString() })) });
      await db.$client.query(`INSERT INTO app.audit_export(tenant_id,id,actor_membership_id,created_at,entry_count,head_hash,file) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)`, [context.tenantId, request.commandId, actor.membershipId, exportEvent!.occurredAt, entries.length, exportEvent!.eventHash, JSON.stringify(file)]);
      return { id: request.commandId, createdAt: exportEvent!.occurredAt.toISOString(), entryCount: entries.length, headHash: exportEvent!.eventHash, file };
    });
    // Refusal is thrown AFTER commit so the refusal audit is durable.
    if (!result) throw new AuditExportError("AUDIT_EXPORT_FORBIDDEN");
    return result;
  }
}
