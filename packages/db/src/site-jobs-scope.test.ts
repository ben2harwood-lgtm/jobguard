import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { expect, it, vi } from "vitest";
import { SiteVisitRepository, assignedJobsByScopeQuery } from "./site-visit-repository.js";
import { verifiedTenantContextFromMembership, type AuthenticatedMembership } from "./tenant-context.js";

it.each([0, 200, 201])("the request uses the scope query and preserves projection and truncation for %i rows", async count => {
 const actor = { tenantId: randomUUID(), membershipId: randomUUID(), identityUserId: randomUUID() } as AuthenticatedMembership;
 const context = verifiedTenantContextFromMembership(actor);
 const rows = Array.from({ length: count }, (_, i) => ({ job_id: randomUUID(), work_order_id: randomUUID(), reference: `FICTIONAL-${i}`, priority: "routine", issued_on: "2026-10-01", due_on: null, open_visit: i === 0 ? randomUUID() : null }));
 const query = vi.fn(async (sql: string, values?: unknown[]) => {
  if (sql === assignedJobsByScopeQuery) {
   expect(values).toEqual([actor.tenantId, actor.membershipId]);
   return { rows };
  }
  if (sql === "SELECT app.mon8_feature_decision($1,$2,$3) decision") {
   expect(values).toEqual([actor.membershipId, "site_origin_capture", "retained_read"]);
   return { rows: [{ decision: { version: "plan-entitlement-decision.v1", environment: "synthetic_demo", feature: "site_origin_capture", entitlement: "included", executable: true, reason: "available" } }] };
  }
  if (sql.includes("FROM app.membership m")) return { rows: [{ track: "contractor", active: true, allowed: true }] };
  if (sql.includes("SELECT decision,reason_code")) {
   expect(values).toEqual([actor.membershipId, null]);
   return { rows: [{ decision: "not_found", reason_code: "job_out_of_scope" }] };
  }
  if (sql === "BEGIN" || sql === "COMMIT" || sql.startsWith("SELECT set_config")) return { rows: [] };
  throw new Error(`Unexpected SQL: ${sql}`);
 });
 const pool = { connect: async () => ({ query, release: () => undefined }) } as unknown as Pool;
 const actual = await new SiteVisitRepository(pool).assignedJobs(context, actor);
 expect(query.mock.calls.filter(([sql]) => sql === assignedJobsByScopeQuery)).toHaveLength(1);
 expect(actual).toEqual({ jobs: rows.slice(0, 200).map(r => ({ jobId: r.job_id, workOrderId: r.work_order_id, reference: r.reference, priority: r.priority, issuedOn: r.issued_on, dueOn: r.due_on, openVisitId: r.open_visit })), truncated: count > 200 });
});
