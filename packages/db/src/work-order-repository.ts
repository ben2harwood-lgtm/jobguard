import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import {
  ContractorError, ContractorPartyError, SorPricingError, WorkOrderError, contractorPartyAuditPayload, diffWorkOrderRevision, isWorkOrderRowErrorCode, matchWorkOrderLines, parseWorkOrderCsv, priceWorkOrderLines,
  selectSorVersion, validateWorkOrderRow, workOrderAuditPayloadV1, workOrderBatchAuditPayloadV1, workOrderBatchDetailV1, workOrderContentFields, workOrderErrorCodes, workOrderImportResultV1, workOrderOverviewV1,
  workOrderPartiesComplete, workOrderRevisionsV1, workOrderSampleCatalogV1,
  type SorItemRate, type WorkOrderErrorCode, type WorkOrderPricedLine, type WorkOrderReceipt, type WorkOrderRow, type WorkOrderRowErrorCode,
} from "@jobguard/core";
import { appendAuditBatch, type AuditEventInput } from "./audit.js";
import { ContractorPartyRepository } from "./contractor-party-repository.js";
import { ContractorRepository } from "./contractor-repository.js";
import { verifiedTenantContextFromMembership, withTenant, type AuthenticatedMembership, type TenantTransaction } from "./tenant-context.js";

export const canonicalJson = (value: unknown): string => value === null || typeof value !== "object" ? JSON.stringify(value)
  : Array.isArray(value) ? `[${value.map(canonicalJson).join(",")}]`
  : `{${Object.entries(value as Record<string, unknown>).filter(([, child]) => child !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`).join(",")}}`;
export const sha256Hex = (text: string) => createHash("sha256").update(text).digest("hex");
/** Deterministic version-4-shaped identifier, so a row's CH-3b command identity is reproducible from its batch command and row number. */
export function derivedUuid(seed: string): string {
  const bytes = createHash("sha256").update(seed).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40; bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
const uuidSchema = z.string().uuid();

/** Maps whatever a transaction raised to a typed refusal. Nothing from PostgreSQL (DETAIL, arguments, contacts) is propagated. */
export function workOrderFailure(error: unknown): WorkOrderError {
  if (error instanceof WorkOrderError) return error;
  if (error instanceof ContractorError) {
    return new WorkOrderError(error.code === "UNAUTHENTICATED" ? "UNAUTHENTICATED" : error.code === "MODE_FORBIDDEN" ? "MODE_FORBIDDEN" : error.code === "COMMAND_CONFLICT" ? "COMMAND_CONFLICT" : error.code === "STALE_REVISION" ? "STALE_REVISION" : error.code === "INVALID_COMMAND" || error.code === "INVALID_RULE_DOCUMENT" ? "INVALID_COMMAND" : "NOT_FOUND");
  }
  if (error instanceof ContractorPartyError) {
    return new WorkOrderError(error.code === "UNAUTHENTICATED" || error.code === "MODE_FORBIDDEN" || error.code === "COMMAND_CONFLICT" || error.code === "STALE_REVISION" || error.code === "INVALID_COMMAND" || error.code === "NOT_FOUND" || error.code === "CONTRACTOR_PARTIES_REQUIRED" || error.code === "PARTY_NOT_FOUND" || error.code === "CUSTOMER_TYPE_MISMATCH" ? error.code : "DATABASE_UNAVAILABLE");
  }
  if (error instanceof SorPricingError) return new WorkOrderError(isWorkOrderRowErrorCode(error.code) ? error.code : "INVALID_COMMAND");
  const e = error as { code?: string; message?: string };
  const known = workOrderErrorCodes.find(code => e.message === code);
  if (known) return new WorkOrderError(known);
  if (e.code === "23505") return new WorkOrderError("COMMAND_CONFLICT");
  if (e.code === "40001") return new WorkOrderError("STALE_REVISION");
  if (e.code === "P0002" || e.code === "42501" || e.code === "INVALID_TENANT_CONTEXT") return new WorkOrderError("NOT_FOUND");
  return new WorkOrderError("DATABASE_UNAVAILABLE");
}
/** A row-level refusal is recorded in its receipt; anything else (including infrastructure failure) aborts the whole import. */
function rowRefusal(error: unknown): WorkOrderRowErrorCode | null {
  const failure = workOrderFailure(error);
  if (failure.code === "INVALID_COMMAND") return "INVALID_ROW";
  if (failure.code === "COMMAND_CONFLICT") return null;
  return isWorkOrderRowErrorCode(failure.code) ? failure.code : null;
}

export type ContractorGateKind = "import" | "sor" | "member";
/**
 * The ENT-1 membership gate shared by every ENT-2 command and read: an active membership of this identity (else the ENT-1 not-found), a
 * contractor-track tenant (else the typed TRACK_FORBIDDEN, Q5), and the permission for the kind of call (else the same not-found).
 * Import = organisation.manage or data.import; sor = contract.manage (Ben, 9 Oct 2026, "Existing roles").
 */
export async function assertContractorGate(db: TenantTransaction, principal: AuthenticatedMembership, kind: ContractorGateKind): Promise<void> {
  const row = (await db.$client.query<{ track: string | null; active: boolean; allowed: boolean }>(
    `SELECT (SELECT commercial_track FROM app.commercial_track_assignment ORDER BY revision DESC LIMIT 1) track, coalesce(app.contractor_member_active(m.id),false) active,
     CASE $4::text WHEN 'import' THEN coalesce(app.work_order_import_permitted(m.id),false) WHEN 'sor' THEN coalesce(app.sor_import_permitted(m.id),false) ELSE true END allowed
     FROM app.membership m WHERE m.tenant_id=$1 AND m.id=$2 AND m.identity_user_id=$3 AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>statement_timestamp())`,
    [principal.tenantId, principal.membershipId, principal.identityUserId, kind])).rows[0];
  if (!row) throw new WorkOrderError("NOT_FOUND");
  if (row.track !== "contractor") throw new WorkOrderError("TRACK_FORBIDDEN");
  if (!row.active || !row.allowed) throw new WorkOrderError("NOT_FOUND");
}

type ContractDocument = { sorVersionIds: string[]; tenderedAdjustment: { numerator: string; denominator: string } };
type Applied = { receipt: WorkOrderReceipt; events: AuditEventInput[] };
type BatchContext = { db: TenantTransaction; principal: AuthenticatedMembership; batchId: string; commandId: string; items: Map<string, ReadonlyMap<string, SorItemRate>> };
type PreviousRevision = { id: string; revision: number; status: "ordered" | "cancelled"; issuedOn: string; dueOn: string | null; priority: "routine" | "urgent" | "emergency"; contentHash: string; sorVersionId: string | null; teamId: string | null; assignedMembershipIds: string[]; lines: WorkOrderPricedLine[] };

/** Resident contact is passed to the CH-3b routine without nulls: an absent value and a null one are both "missing" there. */
function normalizeResident(resident: NonNullable<WorkOrderRow["resident"]>) {
  if (resident.kind === "none") return resident.reason == null ? { kind: "none" as const } : { kind: "none" as const, reason: resident.reason };
  if (resident.contact == null) return { kind: "contact" as const };
  const { version, name, phone, email } = resident.contact;
  return { kind: "contact" as const, contact: { version, ...(name == null ? {} : { name }), ...(phone == null ? {} : { phone }), ...(email == null ? {} : { email }) } };
}
const iso = (value: Date | string) => (value instanceof Date ? value.toISOString() : value);

export class WorkOrderRepository {
  private readonly parties: ContractorPartyRepository;
  constructor(private readonly pool: Pool) { this.parties = new ContractorPartyRepository(pool); }
  async resolveSession(sessionId: string) { return new ContractorRepository(this.pool).resolveSession(sessionId); }

  /**
   * Imports one `work-order-import.v1` file. The whole file is one transaction: each order is attempted inside its own savepoint, so a
   * failing row commits no part of its order and is recorded (with a typed error) in its receipt; the batch, its receipts and every audit
   * event are written last. The same command with the same file, or the same file again after a clean import, is replayed and writes nothing.
   */
  async importCsv(principal: AuthenticatedMembership, input: { commandId: string; name: string; kind: "generated" | "csv"; csv: string }) {
    if (!uuidSchema.safeParse(input.commandId).success || typeof input.csv !== "string") throw new WorkOrderError("INVALID_COMMAND");
    const records = parseWorkOrderCsv(input.csv);
    const sourceSha256 = sha256Hex(input.csv);
    try {
      return await withTenant(this.pool, verifiedTenantContextFromMembership(principal), async db => {
        const c = db.$client;
        // Every contractor command of a tenant serialises on the ENT-1 lock; a concurrent import of the same file then sees this one's batch.
        await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,54))", [principal.tenantId]);
        await assertContractorGate(db, principal, "import");
        const prior = (await c.query<{ id: string; command_id: string; source_sha256: string }>(
          "SELECT id,command_id,source_sha256 FROM app.import_batch WHERE tenant_id=$1 AND (command_id=$2 OR (source_sha256=$3 AND rejected_count=0)) ORDER BY (command_id=$2) DESC,created_at LIMIT 1",
          [principal.tenantId, input.commandId, sourceSha256])).rows[0];
        if (prior) {
          if (prior.command_id === input.commandId && prior.source_sha256 !== sourceSha256) throw new WorkOrderError("COMMAND_CONFLICT");
          return workOrderImportResultV1.parse({ ...(await this.batchResult(db, prior.id)).result, replayed: true });
        }
        const context: BatchContext = { db, principal, batchId: randomUUID(), commandId: input.commandId, items: new Map() };
        const receipts: WorkOrderReceipt[] = [], events: AuditEventInput[] = [];
        for (const record of records) {
          if ("error" in record) { receipts.push({ rowNumber: record.rowNumber, outcome: "rejected", errorCode: "INVALID_ROW", reference: null, workOrderId: null, revisionId: null }); continue; }
          const reference = typeof (record.input as { workOrderReference?: unknown } | null)?.workOrderReference === "string" ? String((record.input as { workOrderReference: string }).workOrderReference).slice(0, 100) || null : null;
          const validated = validateWorkOrderRow(record.input);
          if (!validated.ok) { receipts.push({ rowNumber: record.rowNumber, outcome: "rejected", errorCode: validated.code, reference, workOrderId: null, revisionId: null }); continue; }
          await c.query("SAVEPOINT work_order_row");
          try {
            const applied = await this.applyRow(context, record.rowNumber, validated.row);
            await c.query("RELEASE SAVEPOINT work_order_row");
            receipts.push(applied.receipt); events.push(...applied.events);
          } catch (error) {
            await c.query("ROLLBACK TO SAVEPOINT work_order_row");
            await c.query("RELEASE SAVEPOINT work_order_row");
            const code = rowRefusal(error);
            if (!code) throw error;
            receipts.push({ rowNumber: record.rowNumber, outcome: "rejected", errorCode: code, reference: validated.row.workOrderReference, workOrderId: null, revisionId: null });
          }
        }
        await c.query("SELECT app.import_batch_record($1,$2::jsonb)", [principal.membershipId, JSON.stringify({
          version: "import-batch-record.v1", batchId: context.batchId, commandId: input.commandId, sourceSha256, sourceName: input.name, sourceKind: input.kind,
          rows: receipts.map(r => ({ rowNumber: r.rowNumber, outcome: r.outcome, errorCode: r.errorCode, reference: r.reference, workOrderId: r.workOrderId, revisionId: r.revisionId })),
        })]);
        events.push({ id: context.batchId, version: "audit.v1", actorRef: `membership:${principal.membershipId}`, eventType: "contractor.work_order_import.recorded", subjectType: "work-order-import", subjectRef: context.batchId,
          payload: workOrderBatchAuditPayloadV1.parse({ references: { commandId: input.commandId, batchId: context.batchId, environment: "synthetic_demo" }, hashes: { document: sourceSha256 }, classifications: { action: "operational" } }) });
        // Audit is the last business lock in the transaction.
        await appendAuditBatch(db, events);
        return workOrderImportResultV1.parse({ ...(await this.batchResult(db, context.batchId)).result, replayed: false });
      });
    } catch (error) { throw workOrderFailure(error); }
  }

  private async batchResult(db: TenantTransaction, batchId: string) {
    const c = db.$client;
    const batch = (await c.query<{ id: string; command_id: string; source_sha256: string; source_name: string; source_kind: "generated" | "csv"; row_count: number; created_count: number; revised_count: number; unchanged_count: number; rejected_count: number; created_at: Date }>(
      "SELECT id,command_id,source_sha256,source_name,source_kind,row_count,created_count,revised_count,unchanged_count,rejected_count,created_at FROM app.import_batch WHERE id=$1", [batchId])).rows[0];
    if (!batch) throw new WorkOrderError("NOT_FOUND");
    const rows = (await c.query<{ row_number: number; outcome: WorkOrderReceipt["outcome"]; error_code: string | null; work_order_reference: string | null; work_order_id: string | null; revision_id: string | null }>(
      "SELECT row_number,outcome,error_code,work_order_reference,work_order_id,revision_id FROM app.import_row_receipt WHERE batch_id=$1 ORDER BY row_number", [batchId])).rows;
    return {
      createdAt: iso(batch.created_at),
      result: {
        version: "work-order-import-result.v1" as const, environment: "synthetic_demo" as const, batchId: batch.id, commandId: batch.command_id,
        source: { name: batch.source_name, kind: batch.source_kind, sha256: batch.source_sha256 },
        counts: { rows: batch.row_count, created: batch.created_count, revised: batch.revised_count, unchanged: batch.unchanged_count, rejected: batch.rejected_count },
        rows: rows.map(r => ({ rowNumber: r.row_number, outcome: r.outcome, errorCode: r.error_code, reference: r.work_order_reference, workOrderId: r.work_order_id, revisionId: r.revision_id })), realExternalActions: 0 as const,
      },
    };
  }

  private async applyRow(context: BatchContext, rowNumber: number, row: WorkOrderRow): Promise<Applied> {
    const c = context.db.$client, tenantId = context.principal.tenantId;
    const existing = row.contractId ? (await c.query<{ id: string; job_id: string; contract_version_id: string }>(
      "SELECT id,job_id,contract_version_id FROM app.work_order WHERE tenant_id=$1 AND contract_id=$2 AND reference=$3", [tenantId, row.contractId, row.workOrderReference])).rows[0] : undefined;
    return existing ? this.reviseOrder(context, rowNumber, row, existing) : this.createOrder(context, rowNumber, row);
  }

  private async createOrder(context: BatchContext, rowNumber: number, row: WorkOrderRow): Promise<Applied> {
    const { db, principal } = context, c = db.$client;
    if (row.status === "cancelled") throw new WorkOrderError("ORDER_NOT_FOUND");
    if (row.expectedRevision !== 0) throw new WorkOrderError("STALE_REVISION");
    const jobId = randomUUID(), workOrderId = randomUUID(), revisionId = randomUUID(), bindCommandId = derivedUuid(`${context.commandId}:${rowNumber}`);
    await c.query("SELECT app.work_order_begin($1,$2,$3)", [principal.membershipId, jobId, `Work order ${row.workOrderReference}`]);
    // CH-3b: bind client, contract, site and resident in this transaction. A missing party raises CONTRACTOR_PARTIES_REQUIRED and the savepoint rolls the job back.
    const bound = await this.parties.bindInTransaction(db, principal, {
      version: "contractor-party-import.v1", environment: "synthetic_demo", commandId: bindCommandId, jobId, workOrderId, expectedJobRevision: 0,
      clientId: row.clientId ?? null, contractId: row.contractId ?? null, siteRevisionId: row.siteRevisionId ?? null, resident: row.resident ? normalizeResident(row.resident) : null,
    });
    const binding = (await c.query<{ contract_version_id: string; request_hash: string }>(
      "SELECT b.contract_version_id,r.request_hash FROM app.contractor_party_binding b JOIN app.command_receipt r ON(r.tenant_id,r.command_id)=(b.tenant_id,b.command_id) WHERE b.tenant_id=$1 AND b.job_id=$2", [principal.tenantId, jobId])).rows[0]!;
    const boundEvent: AuditEventInput = { id: bindCommandId, version: "audit.v1", actorRef: `membership:${principal.membershipId}`, eventType: "contractor.parties.bound", subjectType: "job", subjectRef: jobId, payload: contractorPartyAuditPayload("bound", bindCommandId, bound.id, binding.request_hash) };
    const priced = await this.priceRow(context, binding.contract_version_id, row);
    const lines = matchWorkOrderLines([], priced.lines, randomUUID);
    const next = { status: row.status, issuedOn: row.issuedOn, dueOn: row.dueOn, priority: row.priority, teamId: row.teamId, assignedMembershipIds: row.assignedMembershipIds, lines };
    const contentHash = sha256Hex(canonicalJson(workOrderContentFields(row)));
    await this.commit(context, { kind: "create", rowNumber, jobId, workOrderId, revisionId, reference: row.workOrderReference, expectedRevision: 0, row, contentHash, diff: diffWorkOrderRevision(null, next), sorVersionId: priced.sorVersionId, adjustment: priced.adjustment, lines });
    return { receipt: { rowNumber, outcome: "created", errorCode: null, reference: row.workOrderReference, workOrderId, revisionId }, events: [boundEvent, this.orderEvent(context, "created", workOrderId, revisionId, contentHash)] };
  }

  private async reviseOrder(context: BatchContext, rowNumber: number, row: WorkOrderRow, existing: { id: string; job_id: string; contract_version_id: string }): Promise<Applied> {
    const { db, principal } = context, c = db.$client;
    if (!workOrderPartiesComplete(row)) throw new WorkOrderError("CONTRACTOR_PARTIES_REQUIRED");
    const same = (await c.query<{ same: boolean }>("SELECT app.work_order_parties_unchanged($1,$2,$3,$4,$5,$6::jsonb) same", [principal.membershipId, existing.id, row.clientId, row.contractId, row.siteRevisionId, JSON.stringify(normalizeResident(row.resident!))])).rows[0]!.same;
    if (!same) throw new WorkOrderError("PARTY_CHANGE_REFUSED");
    const current = await this.currentRevision(c, principal.tenantId, existing.id);
    const contentHash = sha256Hex(canonicalJson(workOrderContentFields(row)));
    if (contentHash === current.contentHash) return { receipt: { rowNumber, outcome: "unchanged", errorCode: null, reference: row.workOrderReference, workOrderId: existing.id, revisionId: current.id }, events: [] };
    if (row.expectedRevision !== current.revision) throw new WorkOrderError("STALE_REVISION");
    let lines: WorkOrderPricedLine[], sorVersionId: string | null, adjustment: ContractDocument["tenderedAdjustment"];
    if (row.status === "cancelled") {
      // A cancellation is a revision that keeps the order's last lines (and so their scope identities); it prices nothing.
      lines = current.lines; sorVersionId = current.sorVersionId; adjustment = (await this.contractDocument(c, principal.tenantId, existing.contract_version_id)).tenderedAdjustment;
    } else {
      const priced = await this.priceRow(context, existing.contract_version_id, row);
      lines = matchWorkOrderLines(current.lines, priced.lines, randomUUID); sorVersionId = priced.sorVersionId; adjustment = priced.adjustment;
    }
    const revisionId = randomUUID();
    const next = { status: row.status, issuedOn: row.issuedOn, dueOn: row.dueOn, priority: row.priority, teamId: row.teamId, assignedMembershipIds: row.assignedMembershipIds, lines };
    await this.commit(context, { kind: "revise", rowNumber, jobId: existing.job_id, workOrderId: existing.id, revisionId, reference: row.workOrderReference, expectedRevision: current.revision, row, contentHash, diff: diffWorkOrderRevision(current, next), sorVersionId, adjustment, lines });
    return { receipt: { rowNumber, outcome: "revised", errorCode: null, reference: row.workOrderReference, workOrderId: existing.id, revisionId }, events: [this.orderEvent(context, "revised", existing.id, revisionId, contentHash)] };
  }

  private orderEvent(context: BatchContext, action: "created" | "revised", workOrderId: string, revisionId: string, contentHash: string): AuditEventInput {
    return { id: revisionId, version: "audit.v1", actorRef: `membership:${context.principal.membershipId}`, eventType: `contractor.work_order.${action}`, subjectType: "work-order", subjectRef: workOrderId,
      payload: workOrderAuditPayloadV1.parse({ references: { commandId: context.commandId, workOrderId, revisionId, environment: "synthetic_demo" }, hashes: { document: contentHash }, classifications: { action: "operational" } }) };
  }

  private async commit(context: BatchContext, input: { kind: "create" | "revise"; rowNumber: number; jobId: string; workOrderId: string; revisionId: string; reference: string; expectedRevision: number; row: WorkOrderRow; contentHash: string; diff: unknown; sorVersionId: string | null; adjustment: ContractDocument["tenderedAdjustment"]; lines: readonly WorkOrderPricedLine[] }) {
    const { row } = input;
    const payload = {
      version: "work-order-commit.v1", kind: input.kind, batchId: context.batchId, rowNumber: input.rowNumber, jobId: input.jobId, workOrderId: input.workOrderId, revisionId: input.revisionId, reference: input.reference,
      expectedRevision: input.expectedRevision, status: row.status, issuedOn: row.issuedOn, dueOn: row.dueOn, priority: row.priority, contentHash: input.contentHash, diff: input.diff, sorVersionId: input.sorVersionId, adjustment: input.adjustment,
      lines: input.lines.map((line, position) => ({ id: randomUUID(), scopeItemId: line.scopeItemId, position, clientLineReference: line.clientLineReference, sorVersionId: input.sorVersionId, sorCode: line.sorCode, unit: line.unit, quantity: line.quantity, ratePence: line.rate.pence, netPence: line.net.pence, origin: line.origin })),
      team: { teamId: row.teamId, membershipIds: [...row.assignedMembershipIds] },
    };
    await context.db.$client.query("SELECT app.work_order_commit($1,$2::jsonb)", [context.principal.membershipId, JSON.stringify(payload)]);
  }

  private async contractDocument(c: PoolClient, tenantId: string, contractVersionId: string): Promise<ContractDocument> {
    const document = (await c.query<{ document: ContractDocument }>("SELECT document FROM app.client_contract_version WHERE tenant_id=$1 AND id=$2", [tenantId, contractVersionId])).rows[0]?.document;
    if (!document) throw new WorkOrderError("PARTY_NOT_FOUND");
    return document;
  }
  /** The SoR version in force on the issue date (from the order's pinned contract version) and its persisted items price every line. */
  private async priceRow(context: BatchContext, contractVersionId: string, row: WorkOrderRow) {
    const c = context.db.$client, tenantId = context.principal.tenantId;
    const document = await this.contractDocument(c, tenantId, contractVersionId);
    const versions = document.sorVersionIds.length ? (await c.query<{ id: string; effectiveFrom: string }>("SELECT id,effective_from::text \"effectiveFrom\" FROM app.sor_version WHERE tenant_id=$1 AND id=ANY($2::uuid[])", [tenantId, document.sorVersionIds])).rows : [];
    const chosen = selectSorVersion(row.issuedOn, document.sorVersionIds, versions);
    let items = context.items.get(chosen.id);
    if (!items) {
      items = new Map((await c.query<{ code: string; unit: string; rate_pence: string }>("SELECT code,unit,rate_pence FROM app.sor_item WHERE tenant_id=$1 AND version_id=$2", [tenantId, chosen.id])).rows.map(r => [r.code, { unit: r.unit, ratePence: Number(r.rate_pence) }] as const));
      context.items.set(chosen.id, items);
    }
    const priced = priceWorkOrderLines(row.lines, items, document.tenderedAdjustment);
    return { sorVersionId: chosen.id, adjustment: document.tenderedAdjustment, lines: priced.map((line, index) => ({ ...line, clientLineReference: row.lines[index]!.clientLineReference })) };
  }

  private async currentRevision(c: PoolClient, tenantId: string, workOrderId: string): Promise<PreviousRevision> {
    const revision = (await c.query<{ id: string; revision: number; status: "ordered" | "cancelled"; issued_on: string; due_on: string | null; priority: PreviousRevision["priority"]; content_hash: string; sor_version_id: string | null }>(
      "SELECT r.id,r.revision,r.status,r.issued_on::text,r.due_on::text,r.priority,r.content_hash,r.sor_version_id FROM app.work_order_current k JOIN app.work_order_revision r ON(r.tenant_id,r.work_order_id,r.id)=(k.tenant_id,k.work_order_id,k.revision_id) WHERE k.tenant_id=$1 AND k.work_order_id=$2", [tenantId, workOrderId])).rows[0];
    if (!revision) throw new WorkOrderError("NOT_FOUND");
    const lines = (await c.query<{ scope_item_id: string; client_line_reference: string | null; sor_code: string; unit: string; quantity: string; rate_pence: string; net_pence: string }>(
      "SELECT scope_item_id,client_line_reference,sor_code,unit,quantity,rate_pence,net_pence FROM app.work_order_line WHERE tenant_id=$1 AND revision_id=$2 ORDER BY position", [tenantId, revision.id])).rows;
    const assignments = (await c.query<{ team_id: string; membership_id: string | null }>("SELECT team_id,membership_id FROM app.job_assignment WHERE tenant_id=$1 AND revision_id=$2", [tenantId, revision.id])).rows;
    return {
      id: revision.id, revision: revision.revision, status: revision.status, issuedOn: revision.issued_on, dueOn: revision.due_on, priority: revision.priority, contentHash: revision.content_hash, sorVersionId: revision.sor_version_id,
      teamId: assignments.find(a => a.membership_id === null)?.team_id ?? null, assignedMembershipIds: assignments.filter(a => a.membership_id !== null).map(a => a.membership_id!),
      lines: lines.map(l => ({ clientLineReference: l.client_line_reference, sorCode: l.sor_code, quantity: l.quantity, scopeItemId: l.scope_item_id, unit: l.unit, rate: { pence: Number(l.rate_pence), currency: "GBP" as const }, net: { pence: Number(l.net_pence), currency: "GBP" as const }, origin: "client_instruction" as const })),
    };
  }

  /** Office view: recent import batches and the order register. Resident contact is never part of it (CH-3b). */
  async overview(principal: AuthenticatedMembership) {
    try {
      return await withTenant(this.pool, verifiedTenantContextFromMembership(principal), async db => {
        await assertContractorGate(db, principal, "import");
        const c = db.$client;
        const batches = (await c.query<{ id: string; source_name: string; source_kind: "generated" | "csv"; row_count: number; created_count: number; revised_count: number; unchanged_count: number; rejected_count: number; created_at: Date }>(
          "SELECT id,source_name,source_kind,row_count,created_count,revised_count,unchanged_count,rejected_count,created_at FROM app.import_batch ORDER BY created_at DESC,id LIMIT 25")).rows;
        const orders = (await c.query<{ id: string; reference: string; job_id: string; job_status: string; client_name: string; status: "ordered" | "cancelled"; revision: number; priority: "routine" | "urgent" | "emergency"; issued_on: string; net_total_pence: string }>(
          `SELECT w.id,w.reference,w.job_id,j.status job_status,o.name client_name,r.status,r.revision,r.priority,r.issued_on::text,r.net_total_pence
           FROM app.work_order w JOIN app.work_order_current k ON(k.tenant_id,k.work_order_id)=(w.tenant_id,w.id) JOIN app.work_order_revision r ON(r.tenant_id,r.work_order_id,r.id)=(k.tenant_id,k.work_order_id,k.revision_id)
           JOIN app.job j ON(j.tenant_id,j.id)=(w.tenant_id,w.job_id) JOIN app.client_organisation o ON(o.tenant_id,o.id)=(w.tenant_id,w.client_id) ORDER BY w.created_at DESC,w.reference LIMIT 200`)).rows;
        return workOrderOverviewV1.parse({
          version: "work-order-overview.v1", environment: "synthetic_demo", realExternalActions: 0, samples: workOrderSampleCatalogV1,
          batches: batches.map(b => ({ id: b.id, sourceName: b.source_name, sourceKind: b.source_kind, createdAt: iso(b.created_at), counts: { rows: b.row_count, created: b.created_count, revised: b.revised_count, unchanged: b.unchanged_count, rejected: b.rejected_count } })),
          orders: orders.map(o => ({ id: o.id, reference: o.reference, jobId: o.job_id, jobStatus: o.job_status, clientName: o.client_name, status: o.status, revision: o.revision, priority: o.priority, issuedOn: o.issued_on, netTotalPence: Number(o.net_total_pence) })),
        });
      });
    } catch (error) { throw workOrderFailure(error); }
  }

  async batch(principal: AuthenticatedMembership, batchId: string) {
    if (!uuidSchema.safeParse(batchId).success) throw new WorkOrderError("NOT_FOUND");
    try {
      return await withTenant(this.pool, verifiedTenantContextFromMembership(principal), async db => {
        await assertContractorGate(db, principal, "import");
        const { result, createdAt } = await this.batchResult(db, batchId);
        return workOrderBatchDetailV1.parse({ ...result, version: "work-order-batch.v1", createdAt });
      });
    } catch (error) { throw workOrderFailure(error); }
  }

  /** Revisions with their diffs and stable line identities. Import-capable office members, or members who may read this job through its assignment. */
  async revisions(principal: AuthenticatedMembership, workOrderId: string) {
    if (!uuidSchema.safeParse(workOrderId).success) throw new WorkOrderError("NOT_FOUND");
    try {
      return await withTenant(this.pool, verifiedTenantContextFromMembership(principal), async db => {
        await assertContractorGate(db, principal, "member");
        const c = db.$client;
        const order = (await c.query<{ id: string; reference: string; job_id: string; job_status: string; allowed: boolean }>(
          `SELECT w.id,w.reference,w.job_id,j.status job_status,(coalesce(app.work_order_import_permitted($2),false) OR coalesce(app.contractor_job_allowed($2,'job.read',w.job_id),false)) allowed
           FROM app.work_order w JOIN app.job j ON(j.tenant_id,j.id)=(w.tenant_id,w.job_id) WHERE w.tenant_id=$1 AND w.id=$3`, [principal.tenantId, principal.membershipId, workOrderId])).rows[0];
        if (!order || !order.allowed) throw new WorkOrderError("NOT_FOUND");
        const revisions = (await c.query<{ id: string; revision: number; status: "ordered" | "cancelled"; issued_on: string; due_on: string | null; priority: "routine" | "urgent" | "emergency"; net_total_pence: string; batch_id: string; row_number: number; created_at: Date; diff: unknown }>(
          "SELECT id,revision,status,issued_on::text,due_on::text,priority,net_total_pence,batch_id,row_number,created_at,diff FROM app.work_order_revision WHERE tenant_id=$1 AND work_order_id=$2 ORDER BY revision", [principal.tenantId, workOrderId])).rows;
        const lines = (await c.query<{ revision_id: string; position: number; scope_item_id: string; client_line_reference: string | null; sor_code: string; unit: string; quantity: string; rate_pence: string; net_pence: string; origin: "client_instruction" }>(
          "SELECT revision_id,position,scope_item_id,client_line_reference,sor_code,unit,quantity,rate_pence,net_pence,origin FROM app.work_order_line WHERE tenant_id=$1 AND work_order_id=$2 ORDER BY position", [principal.tenantId, workOrderId])).rows;
        const teams = (await c.query<{ revision_id: string; team_id: string; name: string; operatives: number }>(
          `SELECT a.revision_id,a.team_id,t.name,(count(*) FILTER(WHERE a.membership_id IS NOT NULL))::int operatives FROM app.job_assignment a JOIN app.team t ON(t.tenant_id,t.id)=(a.tenant_id,a.team_id)
           WHERE a.tenant_id=$1 AND a.work_order_id=$2 GROUP BY a.revision_id,a.team_id,t.name`, [principal.tenantId, workOrderId])).rows;
        return workOrderRevisionsV1.parse({
          version: "work-order-revisions.v1", environment: "synthetic_demo", realExternalActions: 0, workOrderId: order.id, reference: order.reference, jobId: order.job_id, jobStatus: order.job_status, currentRevision: revisions.at(-1)?.revision ?? 1,
          revisions: revisions.map(r => ({
            id: r.id, revision: r.revision, status: r.status, issuedOn: r.issued_on, dueOn: r.due_on, priority: r.priority, netTotalPence: Number(r.net_total_pence), batchId: r.batch_id, rowNumber: r.row_number, createdAt: iso(r.created_at), diff: r.diff,
            team: teams.find(t => t.revision_id === r.id) ? { id: teams.find(t => t.revision_id === r.id)!.team_id, name: teams.find(t => t.revision_id === r.id)!.name } : null, operativeCount: teams.find(t => t.revision_id === r.id)?.operatives ?? 0,
            lines: lines.filter(l => l.revision_id === r.id).map(l => ({ position: l.position, scopeItemId: l.scope_item_id, clientLineReference: l.client_line_reference, sorCode: l.sor_code, unit: l.unit, quantity: l.quantity, ratePence: Number(l.rate_pence), netPence: Number(l.net_pence), origin: l.origin })),
          })),
        });
      });
    } catch (error) { throw workOrderFailure(error); }
  }
}
export type { WorkOrderErrorCode };
