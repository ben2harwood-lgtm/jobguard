import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import {
  electManagedRecovery, managedRecoveryCommandV1, previewManagedRecoveryInvoice,
  type ManagedRecoveryState,
} from "@jobguard/core";
import { UserCommandDispatcher } from "./commands.js";
import { withTenant, type TenantTransaction, type VerifiedTenantContext } from "./tenant-context.js";

const id = z.guid().transform(v => v.toLowerCase());
const actorV1 = z.object({ membershipId: id, identityUserId: id }).strict();
type Actor = z.infer<typeof actorV1>;
const electionRow = z.object({
  tenant_id: id, job_id: id, case_id: id, command_id: id, actor_membership_id: id,
  terms_version: z.string(), service: z.string(), points: z.number(), elected_at: z.coerce.date(),
});
export class ManagedRecoveryPersistenceError extends Error {
  constructor(readonly code: "MANAGED_RECOVERY_FORBIDDEN" | "MANAGED_RECOVERY_CONFLICT" | "PURSUIT_ALREADY_STARTED") {
    super(code); this.name = "ManagedRecoveryPersistenceError";
  }
}
const forbidden = (): never => { throw new ManagedRecoveryPersistenceError("MANAGED_RECOVERY_FORBIDDEN"); };
function fromRow(raw: unknown): ManagedRecoveryState {
  const e = electionRow.parse(raw), scope = { tenantId: e.tenant_id, jobId: e.job_id, caseId: e.case_id };
  return electManagedRecovery({ version: "managed-recovery-state.v1", environment: "synthetic_demo", ...scope,
    election: null, pursuitStartedAt: null }, {
    version: "managed-recovery-election-command.v1", commandId: e.command_id, caseId: e.case_id,
    termsVersion: e.terms_version, selection: { service: e.service, points: e.points },
  }, { environment: "synthetic_demo", ...scope, actorMembershipId: e.actor_membership_id,
    canApprove: true, now: e.elected_at.toISOString() });
}
function translate(error: unknown): never {
  const e = error as { code?: string; message?: string };
  if (e.code === "COMMAND_CONFLICT" || e.message === "MANAGED_RECOVERY_CONFLICT") throw new ManagedRecoveryPersistenceError("MANAGED_RECOVERY_CONFLICT");
  if (e.message === "PURSUIT_ALREADY_STARTED") throw new ManagedRecoveryPersistenceError("PURSUIT_ALREADY_STARTED");
  if (e.code === "FORBIDDEN" || e.code === "42501") return forbidden();
  throw error;
}
/** Session-derived context and actor only; no HTTP endpoint or live offering. */
export class ManagedRecoveryRepository {
  constructor(private readonly pool: Pool) {}

  private async authorize(db: TenantTransaction, context: VerifiedTenantContext, job: string, caseId: string, actor: Actor) {
    const member = await db.$client.query(`SELECT id FROM app.membership
      WHERE tenant_id=$1 AND id=$2 AND identity_user_id=$3 AND role='owner'
      AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp()) FOR SHARE`,
    [context.tenantId, actor.membershipId, actor.identityUserId]);
    if (member.rowCount !== 1) forbidden();
    await db.$client.query("SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))", [context.tenantId, caseId]);
    const found = await db.$client.query(`SELECT c.id FROM app.recovery_case c
      JOIN app.job j ON(j.tenant_id,j.id)=(c.tenant_id,c.job_id)
      JOIN app.job_commercial_track t ON(t.tenant_id,t.job_id)=(c.tenant_id,c.job_id)
      WHERE c.tenant_id=$1 AND c.job_id=$2 AND c.id=$3 AND c.synthetic AND c.environment='synthetic_demo'
      AND c.case_type='withheld_customer_payment' AND j.fee_policy_version='reference_fee_policy_v3'
      AND t.job_track='small_builder' AND t.environment='synthetic_demo'`, [context.tenantId, job, caseId]);
    if (found.rowCount !== 1) forbidden();
  }

  async elect(context: VerifiedTenantContext, jobId: string, raw: unknown, rawActor: Actor): Promise<ManagedRecoveryState> {
    const command = managedRecoveryCommandV1.parse(raw), job = id.parse(jobId), actor = actorV1.parse(rawActor);
    const { caseId, selection, termsVersion } = command;
    const contentHash = createHash("sha256").update([
      "managed-recovery-election-command.v1", job, caseId, selection.service, selection.points, termsVersion,
    ].join("\n")).digest("hex");
    try {
      return await new UserCommandDispatcher(this.pool).dispatch(context, {
        version: "command.v1", commandId: command.commandId, commandType: "managed_recovery.elect",
        semanticKey: `managed-recovery:${job}:${caseId}`, actorMembershipId: actor.membershipId,
        subjectType: "recovery_case", subjectRef: caseId,
        action: { actionType: "managed_recovery.elect", recipient: null, contentHash, aggregateRevision: 1,
          amountPence: null, currency: null, policyVersion: termsVersion, expiresAt: new Date("2099-01-01T00:00:00Z") },
      }, {
        // Before receipt/replay: recheck current session identity and membership.
        lock: db => this.authorize(db, context, job, caseId, actor),
        mutate: async (db, authorized) => fromRow((await db.$client.query(
          "SELECT * FROM app.mon9_elect($1,$2,$3,$4,$5,$6,$7,$8)",
          [job, caseId, actor.membershipId, command.commandId, authorized.authorizationId,
            selection.service, selection.points, termsVersion])).rows[0]),
        auditEvents: result => [{ id: randomUUID(), version: "audit.v1", actorRef: `membership:${actor.membershipId}`,
          eventType: "managed_recovery.elected", subjectType: "recovery_case", subjectRef: caseId,
          payload: { references: { jobId: job, commandId: command.commandId },
            hashes: { election: result.election!.bindingHash }, classifications: { action: "commercial" } } }],
      });
    } catch (error) { return translate(error); }
  }

  async preview(context: VerifiedTenantContext, jobId: string, caseId: string, rawActor: Actor) {
    const job = id.parse(jobId), c = id.parse(caseId), actor = actorV1.parse(rawActor);
    return withTenant(this.pool, context, async db => {
      await this.authorize(db, context, job, c, actor);
      // One statement, one source snapshot. Manual landings and caller amounts never
      // qualify. Only approved stored allocations with final proof and settled cash.
      const row = (await db.$client.query(`SELECT
        (SELECT to_jsonb(e) FROM app.managed_recovery_election e WHERE e.tenant_id=$1 AND e.job_id=$2 AND e.case_id=$3) election,
        (SELECT started_at FROM app.managed_recovery_pursuit p WHERE p.tenant_id=$1 AND p.job_id=$2 AND p.case_id=$3) started_at,
        coalesce((SELECT sum(greatest(0,a.eligible_net_pence-coalesce((SELECT sum(r.eligible_net_pence)
          FROM app.recovery_case_allocation_reversal r WHERE r.tenant_id=a.tenant_id AND r.job_id=a.job_id AND r.allocation_id=a.id),0)))
          FROM app.recovery_case_allocation a
          JOIN app.evidence_object e ON(e.tenant_id,e.job_id,e.id,e.object_version_id,e.sha256)=(a.tenant_id,a.job_id,a.evidence_id,a.object_version_id,a.evidence_hash)
          JOIN app.evidence_upload u ON(u.tenant_id,u.id)=(e.tenant_id,e.upload_id)
          JOIN app.practice_feed_event f ON(f.tenant_id,f.id)=(a.tenant_id,a.movement_id)
          WHERE a.tenant_id=$1 AND a.job_id=$2 AND a.case_id=$3
            AND e.kind='original' AND u.state='verified' AND e.server_verified_at IS NOT NULL
            AND f.state='settled' AND f.identity='identified'
            AND NOT EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE i.tenant_id=e.tenant_id AND i.evidence_id=e.id)
            AND NOT EXISTS(SELECT 1 FROM app.customer_payment_reversal r WHERE r.tenant_id=a.tenant_id AND r.payment_id=a.payment_id)
            AND (SELECT er.status='approved' AND er.policy_version=a.policy_version FROM app.recovery_eligibility_revision er WHERE er.tenant_id=a.tenant_id AND er.case_id=a.case_id ORDER BY er.revision DESC LIMIT 1) IS TRUE
            AND NOT EXISTS(SELECT 1 FROM app.practice_feed_event u WHERE u.tenant_id=f.tenant_id AND u.account_id=f.account_id AND u.movement_key=f.movement_key AND u.identity='unidentified'
              AND NOT EXISTS(SELECT 1 FROM app.practice_feed_command k WHERE k.tenant_id=u.tenant_id AND k.account_id=u.account_id AND k.movement_key=u.movement_key AND k.action='reconcile_duplicate'))
        ),0)::text principal`, [context.tenantId, job, c])).rows[0]!;
      const state: ManagedRecoveryState = row.election ? fromRow(row.election) : {
        version: "managed-recovery-state.v1", environment: "synthetic_demo", tenantId: context.tenantId,
        jobId: job, caseId: c, election: null, pursuitStartedAt: null,
      };
      return previewManagedRecoveryInvoice({ ...state, pursuitStartedAt: row.started_at ? new Date(row.started_at).toISOString() : null }, {
        version: "managed-recovery-invoice-preview.v1", environment: "synthetic_demo", tenantId: context.tenantId,
        jobId: job, caseId: c, cumulativeQualifyingPrincipal: { numerator: row.principal, denominator: "1" },
      });
    });
  }
}
