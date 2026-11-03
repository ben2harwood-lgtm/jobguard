import { randomUUID } from "node:crypto";
import { expect } from "vitest";
import { PlanEntitlementsApplication } from "../../../apps/api/src/plan-entitlements.application.js";
import { companyPlanEntitlements } from "../../../apps/api/src/plan-entitlements.authority.js";
import { PersistedAuthProvider } from "../../../apps/api/src/auth/persisted-auth-provider.js";
import { IdentityApplication } from "../../../apps/api/src/auth/identity.application.js";
import { FixtureIdentityEmail } from "../../../apps/api/src/auth/identity-email.js";
import { IdentityRepository, withTenant, appendAuditBatch, AuditExportRepository, handoffAuditExportCheckpoint } from "../src/index.js";
import { withCompanyEntitlement, serverEntitlement } from "../src/plan-entitlement-service.js";
import { workTenant, type WorkFixture } from "./job-work-state-fixtures.js";
import type { SubscriptionCompany } from "./subscription-persistence-fixtures.js";
export const request = (feature = "invoices", jobId?: string) => ({ version: "plan-entitlement-check.v1", feature, ...(jobId ? { jobId } : {}) });
export function service(f: WorkFixture, a: SubscriptionCompany) {
  return new PlanEntitlementsApplication({
    withCurrentDecision: <T>(raw: unknown, consume: (decision: unknown) => T) =>
      withCompanyEntitlement(f.runtime, a.context, a.digest, raw, async (_db, decision) => consume(decision)),
  });
}
/** Bind a known fictional token to the fixture's real identity session. All bridge
 * authentication, membership and SQL rechecks use real PostgreSQL, without doubles. */
export async function companyService(f: WorkFixture, a: SubscriptionCompany) {
  const provider = new PersistedAuthProvider(new IdentityRepository(f.admin), "mon8-fictional-identity-secret-over-32-characters", new FixtureIdentityEmail(), "synthetic_demo");
  const sessionToken = randomUUID().repeat(2), csrfToken = randomUUID(), origin = "https://jobguard.invalid";
  const digest = provider.digest(`session:${sessionToken}`);
  await f.admin.query("UPDATE identity.session SET token_digest=$2,csrf_token=$3 WHERE id=$1", [a.sessionId, digest, csrfToken]);
  const bound = { ...a, digest };
  return { a: bound, app: companyPlanEntitlements(f.runtime, new IdentityApplication(provider, origin),
    { sessionToken, csrfToken, origin, requestedTenantId: a.tenantId }) };
}
export async function changeTrack(f: WorkFixture, a: SubscriptionCompany, track: string, revision: number) {
  await withTenant(f.admin, a.context, async db => {
    const id = randomUUID(), actor = "operations:mon8-lifecycle-fixture";
    await db.$client.query("SELECT app.assign_commercial_track($1,$2,$3,$4,$5,$6)", [a.tenantId, id, track, `synthetic-agreement:${a.tenantId}`, revision, actor]);
    await appendAuditBatch(db, [{ id, version: "audit.v1", actorRef: actor, eventType: "commercial_track.assigned", subjectType: "tenant", subjectRef: a.tenantId, payload: { references: { environment: "synthetic_demo" } } }]);
  });
}
/** Create a real signed retained export with owner-only synthetic scope scaffolding.
 * This tests existing export rights; it does not enable new accounting exports. */
export async function retainedExport(f: WorkFixture, a: SubscriptionCompany) {
  const identityUserId = (await f.admin.query("SELECT identity_user_id FROM app.membership WHERE tenant_id=$1 AND id=$2", [a.tenantId, a.actorId])).rows[0].identity_user_id;
  await workTenant(f.admin, a.tenantId, async db => {
    await db.query("SET LOCAL session_replication_role='replica'");
    await db.query("INSERT INTO app.contractor_member(tenant_id,membership_id,email) VALUES($1,$2,'owner@mon8.invalid')", [a.tenantId, a.actorId]);
    await db.query("INSERT INTO app.role_grant(tenant_id,id,membership_id,role,scope_kind,scope_id) VALUES($1,$2,$3,'owner','tenant',$1)", [a.tenantId, randomUUID(), a.actorId]);
  });
  await withTenant(f.runtime, a.context, db => appendAuditBatch(db, [{ id: randomUUID(), version: "audit.v1", actorRef: `membership:${a.actorId}`, eventType: "mon8.fixture", subjectType: "job", subjectRef: a.jobId, payload: { references: { environment: "synthetic_demo" } } }]));
  const checkpoint = (await f.admin.query(`INSERT INTO audit_control.checkpoint(tenant_id,sequence,event_hash)
    SELECT tenant_id,sequence,event_hash FROM app.audit_event WHERE tenant_id=$1 ORDER BY sequence DESC LIMIT 1
    RETURNING tenant_id AS "tenantId",sequence::int,event_hash AS "eventHash",recorded_at AS "recordedAt"`, [a.tenantId])).rows[0];
  await handoffAuditExportCheckpoint(f.admin, checkpoint);
  const actor = { membershipId: a.actorId, identityUserId }, repository = new AuditExportRepository(f.runtime);
  await repository.create(a.context, actor, { version: "audit-export-request.v1", commandId: randomUUID() });
  return () => repository.list(a.context, actor);
}
export async function retained(f: WorkFixture, a: SubscriptionCompany, exports: () => Promise<unknown>) {
  const tables = ["job", "quote_document_version", "final_account_revision", "final_account_line"];
  const data = await workTenant(f.runtime, a.tenantId, async db => {
    const result: Record<string, unknown> = {};
    for (const table of tables) result[table] = (await db.query(`SELECT row_to_json(t)::text bytes FROM app.${table} t WHERE tenant_id=$1 ORDER BY id`, [a.tenantId])).rows;
    return result;
  });
  expect(data.job).not.toEqual([]);
  const files = await exports(); expect(files).not.toEqual([]);
  const availability = await withTenant(f.runtime, a.context, db => serverEntitlement(db, a.actorId, "accounting_export", "retained_read"));
  return { data, exports: JSON.stringify(files), availability };
}
