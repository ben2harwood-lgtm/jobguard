import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { expect, it } from "vitest";
import { FinalAccountCommandService } from "../src/final-account-repository.js";
import { testTenantContext } from "./tenant-context-test-utils.js";

const tenantId = randomUUID(), jobId = randomUUID(), actorMembershipId = randomUUID();
const scopeId = randomUUID(), baselineId = randomUUID(), draftId = randomUUID();
const command = () => ({ version: "final-account.assemble.v1", commandId: randomUUID(), jobId, actorMembershipId });
type StoredRevision = { id: string; revision: number; source_hash: string; net_pence: number; tax_pence: number; total_pence: number; lines: any[] };

/** Scripted SQL demonstrates repository control flow, not PostgreSQL integrity or SQL execution.
 * In the repricing case it models the audited query's two current-approval predicates explicitly.
 * The separate integration suite executes the same journeys against PostgreSQL. */
class AssemblySql {
 readonly calls: Array<{ sql: string; values: any[] }> = [];
 readonly revisions: StoredRevision[] = [];
 head = { id: draftId, revision: 0, current_revision_id: null as string | null };
 approved: any[] = [];
 pending: any[] = [];
 currentState = "approved";
 currentVariationRevision: string | null = null;
 query = async (sql: string, values: any[] = []) => {
  this.calls.push({ sql, values });
  const result = (rows: any[]) => ({ rows, rowCount: rows.length });
  if (sql.includes("FROM app.membership")) return result([{}]);
  if (sql.includes("SELECT baseline_quote_version_id")) return result([{ baseline_quote_version_id: baselineId }]);
  if (sql.includes("FROM app.quote_document_version")) return result([{ id: baselineId, quote_revision_id: baselineId,
   scope_item_id: scopeId, scope_revision_id: randomUUID(), description: "Fictional baseline", origin: "captured",
   quantity_decimal: "1", unit: "item", unit_rate_pence: "10000", discount_decimal: "0", tax_treatment: "standard_rate_20", rate_provenance: "entered" }]);
  if (sql.startsWith("SELECT r.id source_id,r.scope_item_id")) return result(this.approved.filter(row =>
   (!sql.includes("v.state='approved'") || this.currentState === "approved") &&
   (!sql.includes("v.current_revision_id=a.revision_id") || this.currentVariationRevision === row.source_id)));
  if (sql.includes("FROM app.stage_completion")) return result([]);
  if (sql.includes("FROM app.scope_identity")) return result([{ id: scopeId }]);
  if (sql.includes("SELECT * FROM app.final_account_draft")) return result([{ ...this.head }]);
  if (sql.includes("FROM app.final_account_revision") && sql.includes("source_hash=$3")) return result(this.revisions.filter(r => r.source_hash === values[2]));
  if (sql.includes("max(revision)")) return result([{ revision: Math.max(0, ...this.revisions.map(r => r.revision)) }]);
  if (sql.includes("INSERT INTO app.final_account_revision")) {
   if (this.revisions.some(r => r.revision === values[4])) throw new Error("duplicate revision number");
   this.revisions.push({ id: values[0], revision: values[4], source_hash: values[6], net_pence: values[9], tax_pence: values[10], total_pence: values[11], lines: [] });
   return result([]);
  }
  if (sql.includes("INSERT INTO app.final_account_line")) {
   this.revisions.find(r => r.id === values[3])!.lines.push({ kind: values[4], source_id: values[5], scope_item_id: values[6], commercial_revision_id: values[7], approval_id: values[8], description: values[9], net_pence: values[10] });
   return result([]);
  }
  if (sql.includes("app.advance_final_account_draft")) { this.head.current_revision_id = values[2]; this.head.revision = values[3]; return result([]); }
  if (sql.includes("SELECT d.revision")) return result(this.head.current_revision_id ? [{ ...this.revisions.find(r => r.id === this.head.current_revision_id)!, ...this.head, tax_policy_version: "candidate_m1_standard_v1", issue_blocked: true, findings: [] }] : []);
  if (sql.includes("FROM app.final_account_line")) return result(this.revisions.find(r => r.id === values[2])!.lines);
  if (sql.includes("FROM app.final_account_proof")) return result([]);
  if (sql.includes("FROM app.variation v")) return result(this.pending);
  if (sql.includes(" AS tenant_id")) return result([{ tenant_id: tenantId }]);
  if (sql.includes("app.lock_audit_head")) return result([]);
  if (sql.includes("clock_timestamp() AS occurred_at")) return result([{ occurred_at: new Date("2026-10-14T12:00:00Z") }]);
  if (/^(BEGIN|COMMIT|ROLLBACK|SELECT set_config|INSERT INTO app.audit_event|SELECT app.advance_audit_head|SELECT app.invalidate_stale_final_account_authorizations)/u.test(sql)) return result([]);
  throw new Error(`Unexpected SQL: ${sql}`);
 };
 pool = { connect: async () => ({ query: this.query, release() {} }) } as unknown as Pool;
 extra(netPence = 5000) {
  const source_id = randomUUID(); this.currentVariationRevision = source_id;
  return { source_id, scope_item_id: randomUUID(), commercial_revision_id: source_id, description: "Fictional extra", signed_delta_pence: netPence, approval_id: randomUUID() };
 }
}

it("rebuild after rejecting an extra makes the corrected account current (scripted SQL)", async () => {
 const db = new AssemblySql(), service = new FinalAccountCommandService(db.pool), context = testTenantContext(tenantId);
 const first = await service.assemble(context, command());
 db.approved = [db.extra()];
 await service.assemble(context, command());
 db.currentState = "rejected"; db.approved = [];
 const corrected = await service.assemble(context, command()), current = await service.read(context, jobId);
 expect(corrected.id).toBe(first.id);
 expect(current?.id).toBe(corrected.id);
 expect(current?.revision).toBe(corrected.revision);
 expect(current?.totals.net.pence).toBe(10000);
 expect(current?.lines.filter(line => line.kind === "variation")).toEqual([]);
 // Returning to old content must not reuse an already allocated revision number next time.
 db.currentState = "approved"; db.approved = [db.extra(8000)];
 const third = await service.assemble(context, command());
 expect(third.revision).toBe(3);
 expect(third.totals.net.pence).toBe(18000);
 expect(db.revisions).toHaveLength(3);
});

it("pending repricing preserves the last approved commercial revision (scripted SQL)", async () => {
 const db = new AssemblySql(), service = new FinalAccountCommandService(db.pool), context = testTenantContext(tenantId);
 const approved = db.extra(); db.approved = [approved];
 db.currentState = "priced"; db.currentVariationRevision = randomUUID();
 db.pending = [{ source_id: db.currentVariationRevision, description: "Fictional pending price", signed_delta_pence: 7000 }];
 const account = await service.assemble(context, command()), current = await service.read(context, jobId);
 expect(account.totals.net.pence).toBe(15000);
 expect(account.lines.filter(line => line.kind === "variation")).toMatchObject([{ sourceId: approved.source_id, approvalId: approved.approval_id, netPence: 5000 }]);
 expect(current?.pending).toEqual([{ sourceId: db.currentVariationRevision, description: "Fictional pending price", netPence: 7000 }]);
});
