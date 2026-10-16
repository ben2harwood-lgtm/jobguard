import type { Pool } from "pg";
import { z } from "zod";
import { appendAuditBatch } from "./audit.js";
import { northsideSettings, northsideSettingsV1 } from "./northside-settings.js";
import { withTenant, type VerifiedTenantContext, type AuthenticatedMembership } from "./tenant-context.js";
import { derivedUuid } from "./work-order-repository.js";

/** The run is its generated tenant, with a permanent reference to the original practice owner. */
export async function registerNorthsideRun(pool: Pool, owner: AuthenticatedMembership, context: VerifiedTenantContext) {
  return withTenant(pool, context, async db => {
    const added = (await db.$client.query<{ added: boolean }>("SELECT app.northside_register($1,$2::jsonb) added", [owner.membershipId, JSON.stringify(northsideSettings)])).rows[0]!.added;
    if (added) await appendAuditBatch(db, [{ id: derivedUuid(`northside-settings:${owner.tenantId}`), version: "audit.v1", actorRef: `membership:${owner.membershipId}`,
      eventType: "northside.settings.recorded", subjectType: "northside-run", subjectRef: owner.tenantId,
      payload: { references: { environment: "synthetic_demo", settings: northsideSettings.version, classification: "demo_settings" }, classifications: { action: "operational" } } }]);
  });
}
const runV1 = z.object({ settings: northsideSettingsV1, settingsHash: z.string().regex(/^[a-f0-9]{64}$/u), testerMembershipId: z.string().uuid() }).strict();
export async function northsideRun(pool: Pool, member: AuthenticatedMembership, context: VerifiedTenantContext) {
  return withTenant(pool, context, async db => {
    const row = (await db.$client.query('SELECT settings,settings_hash "settingsHash",owner_membership_id "testerMembershipId" FROM app.northside_run WHERE tenant_id=$1', [member.tenantId])).rows[0];
    return row ? runV1.parse(row) : null;
  });
}
/** Only the four named fictional journey targets, for the owner-controlled practice switch. No wider organisation read. */
export async function northsideSwitchTargets(pool: Pool, member: AuthenticatedMembership, context: VerifiedTenantContext) {
  return withTenant(pool, context, async db => (await db.$client.query<{ membershipId: string; role: string }>(
    `SELECT m.id "membershipId",m.role FROM app.membership m JOIN app.contractor_member c ON(c.tenant_id,c.membership_id)=(m.tenant_id,m.id)
     WHERE m.tenant_id=$1 AND app.contractor_member_active(m.id) AND (m.role,c.email) IN
     (('operative','demo.operative@fictional.invalid'),('surveyor','surveyor@northside-fictional.invalid'),
      ('supervisor','supervisor@northside-fictional.invalid'),('client_approver','client.approver@northside-fictional.invalid')) ORDER BY m.role`, [member.tenantId])).rows);
}
/** The actor's own attribution references only; this reveals no other client's extra or commercial content. */
export async function northsideOwnActions(pool: Pool, member: AuthenticatedMembership, context: VerifiedTenantContext) {
  return withTenant(pool, context, async db => (await db.$client.query<{
    sourceId: string; sourceKind: string; actorRole: string; actorMembershipId: string; testerMembershipId: string; switchId: string | null; settingsVersion: string; settingsHash: string;
  }>(`SELECT source_id "sourceId",source_kind "sourceKind",actor_role "actorRole",actor_membership_id "actorMembershipId",tester_membership_id "testerMembershipId",
       switch_id "switchId",settings_version "settingsVersion",settings_hash "settingsHash"
      FROM app.northside_action_attribution WHERE tenant_id=$1 AND actor_membership_id=$2 ORDER BY recorded_at DESC,source_id LIMIT 8`, [member.tenantId, member.membershipId])).rows);
}

const localArtifact = z.object({ version: z.literal("extra-client-approval-message.v1"), linkId: z.string().uuid(), requestId: z.string().uuid(), revision: z.number().int(),
  recipient: z.string().email().refine(s => s.endsWith(".invalid")), netPence: z.number().int().positive(), expiresAt: z.string().datetime(), path: z.string(), token: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/u) }).strict();
/** Only the owner can recover the exact locally approved artifact after reload. This performs no delivery. */
export async function northsideLocalLinks(pool: Pool, member: AuthenticatedMembership, context: VerifiedTenantContext) {
  return withTenant(pool, context, async db => {
    const allowed = (await db.$client.query("SELECT 1 FROM app.membership WHERE tenant_id=$1 AND id=$2 AND role='owner' AND app.contractor_member_active(id)", [member.tenantId, member.membershipId])).rowCount;
    if (!allowed) return [];
    const rows = (await db.$client.query<{ extra_id: string; job_id: string; request_id: string; immutable_content: string }>(
      `SELECT k.variation_id extra_id,k.job_id,k.request_id,o.immutable_content FROM app.extra_client_link k JOIN app.action_outbox o ON(o.tenant_id,o.id)=(k.tenant_id,k.outbox_action_id)
       WHERE k.tenant_id=$1 AND k.issued_by_membership_id=$2 AND k.expires_at>clock_timestamp() AND NOT EXISTS(SELECT 1 FROM app.extra_client_link_closure c WHERE(c.tenant_id,c.link_id)=(k.tenant_id,k.id))
       AND k.request_id=(SELECT q.id FROM app.extra_approval_request q WHERE q.tenant_id=k.tenant_id AND q.variation_id=k.variation_id ORDER BY q.request_revision DESC LIMIT 1)`, [member.tenantId, member.membershipId])).rows;
    return rows.map(row => {
      const artifact = localArtifact.parse(JSON.parse(row.immutable_content));
      if (artifact.requestId !== row.request_id) throw new Error("NORTHSIDE_ARTIFACT_INVALID");
      return { extraId: row.extra_id, recipient: artifact.recipient, path: `/extra-approval/${row.job_id}/${row.request_id}#t=${artifact.token}` };
    });
  });
}
