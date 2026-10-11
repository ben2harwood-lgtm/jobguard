import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { WorkOrderError, sorVersionAuditPayloadV1, sorVersionImportV1, sorVersionListV1, sorVersionResultV1 } from "@jobguard/core";
import { appendAuditBatch } from "./audit.js";
import { assertContractorGate, canonicalJson, sha256Hex, workOrderFailure } from "./work-order-repository.js";
import { verifiedTenantContextFromMembership, withTenant, type AuthenticatedMembership } from "./tenant-context.js";

/**
 * Schedule-of-rates versions: immutable, imported by a member holding contract.manage (owner, admin, commercial_manager - Ben, 9 Oct 2026,
 * "Existing roles"). The import is one transaction with its audit event; the same command and payload replays, a changed payload conflicts.
 */
export class SorRepository {
  constructor(private readonly pool: Pool) {}
  async importVersion(principal: AuthenticatedMembership, raw: unknown) {
    const parsed = sorVersionImportV1.safeParse(raw);
    if (!parsed.success) throw new WorkOrderError("INVALID_COMMAND");
    const command = parsed.data;
    const contentHash = sha256Hex(canonicalJson({ reference: command.reference, effectiveFrom: command.effectiveFrom, items: [...command.items].sort((a, b) => a.code.localeCompare(b.code)) }));
    const requestHash = sha256Hex(canonicalJson(command));
    try {
      return await withTenant(this.pool, verifiedTenantContextFromMembership(principal), async db => {
        await db.$client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,54))", [principal.tenantId]);
        await assertContractorGate(db, principal, "sor");
        const row = (await db.$client.query<{ result: { versionId: string; scheduleId: string; itemCount: number; effectiveFrom: string; replayed: boolean } }>("SELECT app.import_sor_version($1,$2::jsonb) result", [principal.membershipId, JSON.stringify({
          version: "sor-version-record.v1", environment: "synthetic_demo", commandId: command.commandId, versionId: randomUUID(), scheduleId: command.scheduleId, scheduleReference: command.reference, reference: command.reference, effectiveFrom: command.effectiveFrom,
          contentHash, requestHash, items: command.items.map(item => ({ code: item.code, description: item.description, unit: item.unit, ratePence: item.rate.pence, standardMinutes: item.standardMinutes ?? null })),
        })])).rows[0]!;
        const result = row.result;
        if (!result.replayed) {
          // The audit event is the last business lock; the deferred trigger refuses a version committed without it.
          await appendAuditBatch(db, [{ id: result.versionId, version: "audit.v1", actorRef: `membership:${principal.membershipId}`, eventType: "contractor.sor_version.imported", subjectType: "sor-version", subjectRef: result.versionId,
            payload: sorVersionAuditPayloadV1.parse({ references: { commandId: command.commandId, versionId: result.versionId, scheduleId: result.scheduleId, environment: "synthetic_demo" }, hashes: { document: contentHash }, classifications: { action: "operational" } }) }]);
        }
        return sorVersionResultV1.parse({ version: "sor-version-result.v1", environment: "synthetic_demo", ...result, effectiveFrom: String(result.effectiveFrom).slice(0, 10), realExternalActions: 0 });
      });
    } catch (error) { throw workOrderFailure(error); }
  }
  async list(principal: AuthenticatedMembership) {
    try {
      return await withTenant(this.pool, verifiedTenantContextFromMembership(principal), async db => {
        // Reading price lists needs a contract-level read grant (owner, admin, commercial_manager, supervisor, surveyor, finance, read_only): the same members who can read contracts.
        await assertContractorGate(db, principal, "member");
        const allowed = (await db.$client.query<{ allowed: boolean }>("SELECT app.contractor_allowed($1,'contract.read',nullif(current_setting('app.tenant_id',true),'')::uuid) OR EXISTS(SELECT 1 FROM app.client_organisation c WHERE app.contractor_allowed($1,'contract.read',c.id)) allowed", [principal.membershipId])).rows[0]!.allowed;
        if (!allowed) throw new WorkOrderError("NOT_FOUND");
        const versions = (await db.$client.query<{ id: string; schedule_id: string; schedule_reference: string; reference: string; effective_from: string; item_count: number; created_at: Date }>(
          "SELECT v.id,v.schedule_id,s.reference schedule_reference,v.reference,v.effective_from::text,v.item_count,v.created_at FROM app.sor_version v JOIN app.schedule_of_rates s ON(s.tenant_id,s.id)=(v.tenant_id,v.schedule_id) ORDER BY v.effective_from DESC,v.id")).rows;
        return sorVersionListV1.parse({ version: "sor-version-list.v1", environment: "synthetic_demo", realExternalActions: 0,
          versions: versions.map(v => ({ id: v.id, scheduleId: v.schedule_id, scheduleReference: v.schedule_reference, reference: v.reference, effectiveFrom: v.effective_from, itemCount: v.item_count, createdAt: v.created_at.toISOString() })) });
      });
    } catch (error) { throw workOrderFailure(error); }
  }
}
