import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { appendAuditBatch, type AuditEventInput } from "../src/audit.js";
import type { RecoveryMessageActor, RecoveryMessageView } from "../src/recovery-message-repository.js";
import { withTenant } from "../src/tenant-context.js";
import { testTenantContext } from "./tenant-context-test-utils.js";

/** Populate an approved message's historical facts before the worker routines exist.
 * The predecessor's guards validate every insert. The current repository exercises
 * the populated data after upgrade, using the real worker and application roles.
 */
export async function seedPredecessorRecoveryMessage(
  owner: Pool, tenant: string, caseId: string, view: RecoveryMessageView,
  actor: RecoveryMessageActor, outcome: "succeeded" | "outcome_unknown" | "revoked",
) {
  const approval = view.approval;
  if (!approval || view.status !== "queued") throw new Error("Expected an approved predecessor message");
  const action = approval.outboxActionId;
  const command = randomUUID();
  const requestHash = createHash("sha256").update(command).digest("hex");
  const reference = `fake-recovery:${action}`;
  await withTenant(owner, testTenantContext(tenant, { membershipId: actor.membershipId }), async db => {
    const client = db.$client;
    let revision = view.revision;
    const audits: AuditEventInput[] = [];
    const event = async (kind: string, actorRef: string) => {
      await client.query(`INSERT INTO app.recovery_message_event
        (id,tenant_id,job_id,case_id,message_id,revision,kind,command_id,request_hash,actor_membership_id,environment)
        VALUES(gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8,$9,'synthetic_demo')`,
        [tenant, view.message.jobId, caseId, view.id, ++revision, kind, command, requestHash, actor.membershipId]);
      audits.push({ id: randomUUID(), version: "audit.v1", actorRef, eventType: `recovery.message.${kind}`,
        subjectType: "recovery_message", subjectRef: view.id,
        payload: { references: { caseId, jobId: view.message.jobId, commandId: command },
          hashes: { content: view.message.contentHash, request: requestHash }, classifications: { action: "commercial" } } });
    };
    if (outcome === "revoked") {
      await client.query("UPDATE app.action_authorization SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2", [tenant, approval.authorizationId]);
      await client.query("UPDATE app.action_outbox SET status='cancelled',updated_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2", [tenant, action]);
      await event("revoked", actor.actorRef);
    } else {
      await event("started", actor.actorRef);
      await client.query("UPDATE app.action_outbox SET status='executing',claimed_at=clock_timestamp(),updated_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2", [tenant, action]);
      await client.query(`INSERT INTO app.recovery_message_sink
        (id,tenant_id,job_id,case_id,message_id,outbox_action_id,recipient,body,content_hash,attachment_hash,provider_reference,environment,real_external_actions)
        VALUES(gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'synthetic_demo',0)`,
        [tenant, view.message.jobId, caseId, view.id, action, view.message.recipient, view.message.body, view.message.contentHash, view.message.attachmentHash, reference]);
      await client.query(`INSERT INTO app.action_attempt
        (id,tenant_id,action_id,attempt_number,outcome,provider_reference,error_code,finished_at)
        VALUES(gen_random_uuid(),$1,$2,1,$3,$4,$5,clock_timestamp())`,
        [tenant, action, outcome, outcome === "succeeded" ? reference : null, outcome === "outcome_unknown" ? "FAKE_RESPONSE_LOST_AFTER_ACCEPTANCE" : null]);
      await client.query(`UPDATE app.action_outbox SET status=$3::varchar(24),completed_at=CASE WHEN $3::varchar(24)='succeeded' THEN clock_timestamp() END,updated_at=clock_timestamp()
        WHERE tenant_id=$1 AND id=$2`, [tenant, action, outcome]);
      await event(outcome, "system:recovery-message-executor");
    }
    await appendAuditBatch(db, audits);
  });
}
