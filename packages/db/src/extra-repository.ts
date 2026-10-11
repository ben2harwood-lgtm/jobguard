import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Pool } from "pg";
import {
 ExtraPersistenceError, extraPersistenceErrorCodes, raiseExtraV1, extraRecordV1, extraRecordLegacyV1, extraDuplicateLinkV1, extraOrderLineLinkV1,
 originForCommand, effectiveOrigin, type ExtraRecord, type ExtraReadRecord, type RaiseExtra, type EnterpriseGroup, type ExtraPersistenceErrorCode,
} from "@jobguard/core";
import { appendAuditBatch, type AuditEventInput } from "./audit.js";
import { canonicalJson, sha256Hex, derivedUuid } from "./work-order-repository.js";
import { withTenant, InvalidTenantContextError, type VerifiedTenantContext, type TenantTransaction } from "./tenant-context.js";

/** ENT-3/ENT-5 may append their own facts here, before the final audit-head lock. */
export type ExtraTransactionSeam = (db: TenantTransaction, fact: Readonly<{ kind: "raise" | "duplicate_link" | "order_line_link"; commandId: string; jobId: string; variationId: string; linkId?: string }>) => Promise<void>;
export type RaisedExtra = { variationId: string };
export type ExtraLinkResult = { linkId: string; variationId: string };
const uuid = z.string().uuid();
const originColumns = `o.*,to_char(o.server_recorded_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') server_text,
 to_char(o.device_captured_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') device_text,
 (SELECT kind FROM app.extra_event e WHERE (e.tenant_id,e.job_id,e.variation_id)=(o.tenant_id,o.job_id,o.variation_id) ORDER BY sequence DESC LIMIT 1) latest_kind`;
type OriginRow = Record<string, any>;
function record(row: OriginRow): ExtraReadRecord {
 const input = { version: "extra-record.v1", origin: { version: "extra-origin.v1", tenantId: row.tenant_id, jobId: row.job_id, variationId: row.variation_id, origin: { version: "variation-origin.v1", jobTrack: row.job_track, kind: row.kind }, commandId: row.command_id, raisingMembershipId: row.raising_membership_id, raisingRole: row.raising_role, serverRecordedAt: row.server_text, deviceId: row.device_id, deviceCapturedAt: row.device_text, evidenceHash: row.evidence_hash }, contractorProvenance: { commandType: row.command_type, raisingGrantId: row.raising_grant_id, raiserAssigned: row.raiser_assigned, workOrderId: row.work_order_id, workOrderRevisionId: row.work_order_revision_id, siteVisitId: row.site_visit_id, evidenceId: row.evidence_id, residentConfirmationEvidenceId: row.resident_confirmation_evidence_id, clientCaptureId: row.client_capture_id, originHash: row.origin_hash }, latestEventKind: row.latest_kind };
 const value = row.provenance === "command" ? extraRecordV1.safeParse(input) : extraRecordLegacyV1.safeParse({ ...input, version: "extra-record-legacy.v1", origin: { ...input.origin, version: "extra-origin-legacy.v1", legacy: true, provenance: row.provenance } });
 if (!value.success) throw new ExtraPersistenceError("INVALID_ORIGIN"); return value.data;
}
function failure(error: unknown, fallback: ExtraPersistenceErrorCode = "INVALID_ORIGIN"): never {
 if (error instanceof ExtraPersistenceError || error instanceof InvalidTenantContextError) throw error;
 const e = error as { code?: string; message?: string };
 const known = extraPersistenceErrorCodes.find(code => e.message === code);
 if (known) throw new ExtraPersistenceError(known);
 if (e.code === "23505") throw new ExtraPersistenceError(fallback === "INVALID_ORIGIN" ? "COMMAND_CONFLICT" : fallback);
 if (e.code === "23514" || e.code === "55000") throw new ExtraPersistenceError(fallback);
 if (e.code === "23503" || e.code === "42501" || e.code === "P0002") throw new ExtraPersistenceError("NOT_FOUND");
 if (e.code === "40001" || e.code === "40P01") throw new ExtraPersistenceError("STALE_REVISION");
 throw new ExtraPersistenceError("DATABASE_UNAVAILABLE");
}
function parse<T>(schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } }, raw: unknown): T {
 const parsed = schema.safeParse(raw); if (!parsed.success) throw new ExtraPersistenceError("INVALID_COMMAND"); return parsed.data;
}
async function lockJob(db: TenantTransaction, tenant: string, job: string): Promise<void> {
 await db.$client.query("SELECT pg_advisory_xact_lock(hashtextextended($1::uuid::text||':'||$2::uuid::text,417))", [tenant, job]);
 if (!(await db.$client.query("SELECT 1 FROM app.job WHERE tenant_id=$1 AND id=$2", [tenant, job])).rowCount) throw new ExtraPersistenceError("NOT_FOUND");
}
async function claim<T>(db: TenantTransaction, tenant: string, commandId: string, type: string, semantic: string, hash: string, actor: string): Promise<T | null> {
 const inserted = await db.$client.query(`INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,actor_membership_id)
 VALUES($1,$2,$3,$4,$5,'processing',$6) ON CONFLICT DO NOTHING RETURNING command_id`, [tenant, commandId, type, semantic, hash, actor]);
 if (inserted.rowCount) return null;
 const rows = (await db.$client.query<{ request_hash: string; status: string; result: T }>("SELECT request_hash,status,result FROM app.command_receipt WHERE tenant_id=$1 AND (command_id=$2 OR (command_type=$3 AND semantic_key=$4))", [tenant, commandId, type, semantic])).rows;
 if (rows.length !== 1 || rows[0]!.request_hash !== hash || rows[0]!.status !== "succeeded") throw new ExtraPersistenceError("COMMAND_CONFLICT"); return rows[0]!.result;
}
async function complete(db: TenantTransaction, tenant: string, commandId: string, result: RaisedExtra | ExtraLinkResult): Promise<void> {
 await db.$client.query("UPDATE app.command_receipt SET status='succeeded',result=$3::jsonb,completed_at=clock_timestamp() WHERE tenant_id=$1 AND command_id=$2", [tenant, commandId, canonicalJson(result)]);
}
function audit(tenant: string, actor: string, type: string, subject: string, references: Record<string, string>, hashes?: Record<string, string>, id = randomUUID()): AuditEventInput {
 // tenant is deliberately not an audit payload input; appendAuditBatch reads the transaction context.
 void tenant;
 return { id, version: "audit.v1", actorRef: `membership:${actor}`, eventType: type, subjectType: "extra", subjectRef: subject, payload: { references: { ...references, environment: "synthetic_demo" }, ...(hashes ? { hashes } : {}) } };
}
export class ExtraRepository {
 constructor(private readonly pool: Pool) {}
 async raiseExtra(context: VerifiedTenantContext, raw: unknown, seam?: ExtraTransactionSeam): Promise<RaisedExtra> {
  const input = parse(raiseExtraV1, raw), { commandId: _commandId, ...content } = input;
  const requestHash = sha256Hex(canonicalJson(content));
  try { return await withTenant(this.pool, context, async db => {
   const tenant = context.tenantId.toLowerCase();
   await lockJob(db, tenant, input.jobId);
   const binding = (await db.$client.query("SELECT j.provenance,t.job_track,t.environment FROM app.job j JOIN app.job_commercial_track t ON(t.tenant_id,t.job_id)=(j.tenant_id,j.id) WHERE j.tenant_id=$1 AND j.id=$2", [tenant, input.jobId])).rows[0];
   if (!binding || binding.job_track !== "contractor" || binding.provenance !== "work_order" || binding.environment !== "synthetic_demo") throw new ExtraPersistenceError("NOT_FOUND");
   const variationId = derivedUuid(`extra:${tenant}:${input.jobId}:${input.clientCaptureId ?? input.commandId}`);
   // Capture retries bind their own command receipt without creating another origin.
   if (input.clientCaptureId) {
    const prior = (await db.$client.query("SELECT c.request_hash,c.status,c.result FROM app.extra_origin o JOIN app.command_receipt c ON(c.tenant_id,c.command_id)=(o.tenant_id,o.command_id) WHERE o.tenant_id=$1 AND o.job_id=$2 AND o.client_capture_id=$3", [tenant, input.jobId, input.clientCaptureId])).rows[0];
    if (prior) {
     if (prior.request_hash !== requestHash || prior.status !== "succeeded") throw new ExtraPersistenceError("COMMAND_CONFLICT");
     // The original semantic key is unique. A retry uses the same receipt type,
     // with a command-specific key, and permanently binds this ID/hash/result.
     const replay = await claim<RaisedExtra>(db, tenant, input.commandId, input.commandType, `extra-origin-retry:${input.jobId}:${variationId}:${input.commandId}`, requestHash, input.actorMembershipId);
     if (replay) return replay;
     const result = prior.result as RaisedExtra;
     await complete(db, tenant, input.commandId, result); return result;
    }
   }
   const replay = await claim<RaisedExtra>(db, tenant, input.commandId, input.commandType, `extra-origin:${input.jobId}:${variationId}`, requestHash, input.actorMembershipId);
   if (replay) return replay;
   const origin = originForCommand(input.commandType, "contractor");
   const member = (await db.$client.query<{ role: string }>("SELECT role FROM app.membership WHERE tenant_id=$1 AND id=$2 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())", [tenant, input.actorMembershipId])).rows[0];
   if (!member) throw new ExtraPersistenceError("NOT_FOUND");
   let excessRevision: string | null = null;
   if (input.excessOfScopeItemId) {
    const line = (await db.$client.query<{ revision_id: string }>("SELECT l.revision_id FROM app.work_order_line l JOIN app.work_order_current c ON(c.tenant_id,c.revision_id)=(l.tenant_id,l.revision_id) WHERE l.tenant_id=$1 AND l.job_id=$2 AND l.scope_item_id=$3", [tenant, input.jobId, input.excessOfScopeItemId])).rows[0];
    if (!line) throw new ExtraPersistenceError("NOT_FOUND"); excessRevision = line.revision_id;
   }
   const scopeId = randomUUID();
   await db.$client.query("INSERT INTO app.scope_identity(tenant_id,job_id,id) VALUES($1,$2,$3)", [tenant, input.jobId, scopeId]);
   if (input.excessOfScopeItemId) await db.$client.query("INSERT INTO app.scope_lineage(tenant_id,job_id,parent_scope_item_id,child_scope_item_id,kind) VALUES($1,$2,$3,$4,'variation')", [tenant, input.jobId, input.excessOfScopeItemId, scopeId]);
   await db.$client.query(`INSERT INTO app.variation(tenant_id,job_id,id,scope_item_id,lineage_parent_scope_item_id,capture_kind,capture_text,description,job_track,origin,sor_version_id,sor_code,excess_of_revision_id,excess_of_scope_item_id)
    VALUES($1,$2,$3,$4,$5,'text',$6,$7,'contractor',$8,$9,$10,$11,$5)`, [tenant, input.jobId, variationId, scopeId, input.excessOfScopeItemId ?? null, input.note, input.description, origin.kind, input.sorItem?.versionId ?? null, input.sorItem?.code ?? null, excessRevision]);
   const originRow = (await db.$client.query<{ origin_hash: string }>(`INSERT INTO app.extra_origin(tenant_id,job_id,variation_id,job_track,kind,command_id,raising_membership_id,raising_role,provenance,source_capture_kind,source_capture_hash,raising_grant_id,device_id,device_captured_at,client_capture_id,site_visit_id,evidence_id,resident_confirmation_evidence_id)
    VALUES($1,$2,$3,'contractor',$4,$5,$6,$7,'command','text',$8,$9,$10,$11,$12,$13,$14,$15) RETURNING origin_hash`, [tenant, input.jobId, variationId, origin.kind, input.commandId, input.actorMembershipId, member.role, sha256Hex(input.note), input.grantId, input.deviceId ?? null, input.deviceCapturedAt ?? null, input.clientCaptureId ?? null, input.siteVisitId ?? null, input.evidenceId ?? null, input.residentConfirmationEvidenceId ?? null])).rows[0]!;
   await db.$client.query("INSERT INTO app.extra_event(tenant_id,id,job_id,variation_id,kind,command_id,actor_membership_id) VALUES($1,$2,$3,$4,'logged',$5,$6)", [tenant, randomUUID(), input.jobId, variationId, input.commandId, input.actorMembershipId]);
   await seam?.(db, { kind: "raise", commandId: input.commandId, jobId: input.jobId, variationId });
   await appendAuditBatch(db, [audit(tenant, input.actorMembershipId, "contractor.extra.raised", variationId, { command: input.commandId, job: input.jobId, extra: variationId }, { origin: originRow.origin_hash })]);
   const result = { variationId }; await complete(db, tenant, input.commandId, result); return result;
  }); } catch (error) { failure(error); }
 }
 async linkDuplicate(context: VerifiedTenantContext, raw: unknown, seam?: ExtraTransactionSeam): Promise<ExtraLinkResult> {
  const input = parse(extraDuplicateLinkV1, raw), { commandId: _commandId, ...content } = input;
  try { return await withTenant(this.pool, context, async db => {
   const tenant = context.tenantId.toLowerCase(); await lockJob(db, tenant, input.jobId);
   for (const id of [input.duplicateId, input.canonicalId]) await this.readInTransaction(db, tenant, input.jobId, id);
   const replay = await claim<ExtraLinkResult>(db, tenant, input.commandId, "MarkDuplicate", `extra-duplicate:${input.jobId}:${input.duplicateId}:${input.canonicalId}:${input.commandId}`, sha256Hex(canonicalJson(content)), input.actorMembershipId); if (replay) return replay;
   const linkId = randomUUID();
   await db.$client.query("INSERT INTO app.extra_duplicate_link(tenant_id,id,job_id,duplicate_id,canonical_id,kind,command_id,actor_membership_id) VALUES($1,$2,$3,$4,$5,'link',$6,$7)", [tenant, linkId, input.jobId, input.duplicateId, input.canonicalId, input.commandId, input.actorMembershipId]);
   await seam?.(db, { kind: "duplicate_link", commandId: input.commandId, jobId: input.jobId, variationId: input.duplicateId, linkId });
   await appendAuditBatch(db, [audit(tenant, input.actorMembershipId, "contractor.extra.duplicate_linked", input.duplicateId, { command: input.commandId, job: input.jobId, duplicate: input.duplicateId, canonical: input.canonicalId, link: linkId }, undefined, linkId)]);
   const result = { linkId, variationId: input.duplicateId }; await complete(db, tenant, input.commandId, result); return result;
  }); } catch (error) { failure(error, "DUPLICATE_LINK_REFUSED"); }
 }
 async linkOrderLine(context: VerifiedTenantContext, raw: unknown, seam?: ExtraTransactionSeam): Promise<ExtraLinkResult> {
  const input = parse(extraOrderLineLinkV1, raw), { commandId: _commandId, ...content } = input;
  try { return await withTenant(this.pool, context, async db => {
   const tenant = context.tenantId.toLowerCase(); await lockJob(db, tenant, input.jobId); await this.readInTransaction(db, tenant, input.jobId, input.variationId);
   const replay = await claim<ExtraLinkResult>(db, tenant, input.commandId, "RecordClientInstruction", `extra-order-line:${input.jobId}:${input.variationId}`, sha256Hex(canonicalJson(content)), input.actorMembershipId); if (replay) return replay;
   const linkId = randomUUID();
   await db.$client.query("INSERT INTO app.extra_order_line_link(tenant_id,id,job_id,variation_id,work_order_id,revision_id,scope_item_id,command_id,actor_membership_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)", [tenant, linkId, input.jobId, input.variationId, input.workOrderId, input.revisionId, input.scopeItemId, input.commandId, input.actorMembershipId]);
   await seam?.(db, { kind: "order_line_link", commandId: input.commandId, jobId: input.jobId, variationId: input.variationId, linkId });
   await appendAuditBatch(db, [audit(tenant, input.actorMembershipId, "contractor.extra.order_line_linked", input.variationId, { command: input.commandId, job: input.jobId, extra: input.variationId, link: linkId, work_order: input.workOrderId, revision: input.revisionId, scope: input.scopeItemId }, undefined, linkId)]);
   const result = { linkId, variationId: input.variationId }; await complete(db, tenant, input.commandId, result); return result;
  }); } catch (error) { failure(error, "ORDER_LINE_LINK_REFUSED"); }
 }
 private async readInTransaction(db: TenantTransaction, tenant: string, job: string, extra: string): Promise<ExtraReadRecord> {
  const row = (await db.$client.query(`SELECT ${originColumns} FROM app.extra_origin o WHERE o.tenant_id=$1 AND o.job_id=$2 AND o.variation_id=$3`, [tenant, job, extra])).rows[0];
  if (!row) throw new ExtraPersistenceError("NOT_FOUND"); return record(row);
 }
 async readExtra(context: VerifiedTenantContext, jobId: string, variationId: string): Promise<ExtraReadRecord> {
  parse(uuid, jobId); parse(uuid, variationId);
  try { return await withTenant(this.pool, context, db => this.readInTransaction(db, context.tenantId.toLowerCase(), jobId, variationId)); } catch (error) { failure(error); }
 }
 async readDuplicateGroup(context: VerifiedTenantContext, jobId: string, variationId: string): Promise<{ canonicalId: string; members: ExtraRecord[]; effectiveOrigin: ExtraRecord }> {
  parse(uuid, jobId); parse(uuid, variationId);
  try { return await withTenant(this.pool, context, async db => {
   const tenant = context.tenantId.toLowerCase(); await this.readInTransaction(db, tenant, jobId, variationId);
   // One statement reads a coherent active graph; no ordering/fee rule is implemented in SQL.
   const rows = (await db.$client.query(`WITH active AS (
    SELECT l.* FROM app.extra_duplicate_link l WHERE l.tenant_id=$1 AND l.job_id=$2 AND l.kind='link'
     AND NOT EXISTS(SELECT 1 FROM app.extra_duplicate_link u WHERE (u.tenant_id,u.reverses_link_id)=(l.tenant_id,l.id))
   ), canonical AS (SELECT coalesce((SELECT canonical_id FROM active WHERE duplicate_id=$3),$3::uuid) id)
   SELECT ${originColumns},v.scope_item_id,c.id canonical_id,r.content_hash order_hash FROM canonical c
   JOIN app.extra_origin o ON o.tenant_id=$1 AND o.job_id=$2 AND (o.variation_id=c.id OR o.variation_id IN(SELECT duplicate_id FROM active WHERE canonical_id=c.id))
   JOIN app.variation v ON(v.tenant_id,v.job_id,v.id)=(o.tenant_id,o.job_id,o.variation_id)
   LEFT JOIN app.work_order_revision r ON(r.tenant_id,r.work_order_id,r.id)=(o.tenant_id,o.work_order_id,o.work_order_revision_id)`, [tenant, jobId, variationId])).rows;
   if (!rows.length) throw new ExtraPersistenceError("NOT_FOUND");
   const members = rows.map(row => { const member = record(row); if (member.version !== "extra-record.v1") throw new ExtraPersistenceError("INVALID_ORIGIN"); return member; }), canonicalId = rows[0]!.canonical_id as string;
   // ENT-4a accepts the full enterprise facts schema. The ordering adapter supplies
   // only persisted origins, IDs and structural grants; unrelated commercial fields
   // are neutral (unknown/unpriced, no approvals, no billing facts). Never expose it.
   const orderingFacts: EnterpriseGroup = { version: "enterprise-group.v1", tenantId: tenant, jobId, jobTrack: "contractor", currency: "GBP", mode: "synthetic_demo", feeGate: false, canonicalId, unresolvedCandidateIds: [], agreementVersionId: "origin-ordering.v1", members: rows.map((row, index) => {
    const m = members[index]!, p = m.contractorProvenance, o = m.origin;
    if (!p.raisingGrantId || !p.commandType || !p.workOrderRevisionId || !p.originHash) throw new ExtraPersistenceError("INVALID_ORIGIN");
    return { id: o.variationId, tenantId: tenant, jobId, scopeItemId: row.scope_item_id, state: o.variationId === canonicalId ? "logged" : "duplicate", duplicateOf: o.variationId === canonicalId ? null : canonicalId, billingBalances: null, workDone: false, exportedAt: null,
     revision: { id: o.variationId, hash: p.originHash, serverRecordedAt: o.serverRecordedAt, netPence: null, priceConfirmed: false, priceSource: "unpriced", requirement: null, approvals: [] }, origin: o,
     raisingCommand: { id: o.commandId, type: p.commandType, actorId: o.raisingMembershipId, role: o.raisingRole as EnterpriseGroup["members"][number]["raisingCommand"]["role"], grant: { id: p.raisingGrantId, tenantId: tenant, jobId, membershipId: o.raisingMembershipId, role: o.raisingRole as EnterpriseGroup["members"][number]["raisingCommand"]["role"] }, assigned: p.raiserAssigned ?? false },
     orderAtOrigin: { revisionId: p.workOrderRevisionId, hash: row.order_hash, coverage: "new" }, captureNote: null, photo: { status: "none", evidenceId: null, hash: null, tenantId: null, jobId: null, scopeItemId: null, objectVersionId: null }, residentCaptured: false, residentConfirmationHash: null, prompt: null, exportLineId: null, billingFacts: [] };
   }) };
   const chosen = effectiveOrigin(orderingFacts); return { canonicalId, members, effectiveOrigin: members.find(m => m.origin.variationId === chosen.id)! };
  }); } catch (error) { failure(error); }
 }
}
