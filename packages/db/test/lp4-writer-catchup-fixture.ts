import type { Pool } from "pg";
import { expect } from "vitest";
import { auditEventTrust, verifyAuditChain, type AuditEvent } from "../src/audit.js";

// Each entry names the HIGHEST migration on the pinned main that defines the
// routine, including the 0322 replacement of 0290's ef_audit.
export const lp4WriterSources = {
  "app.mon3_audit": "0372_free_first_job_admission.sql",
  "app.customer_portal_audit": "0387_customer_signin.sql",
  "app.decision_check_command": "0193_later_decision_identity.sql",
  "app.mon2_audit": "0195_subscription_persistence.sql",
  "app.mon1_capture_small_trip": "0208_meter_small_trip.sql",
  "app.guard_final_check_manifest": "0237_final_check_prerequisites.sql",
  "app.publish_final_check_certificate": "0237_final_check_prerequisites.sql",
  "app.append_final_check_audit": "0238_final_check.sql",
  "app.cb_complete": "0243_contractor_billing.sql",
  "app.cb_audit": "0243_contractor_billing.sql",
  "app.ef_derive": "0276_enterprise_fee_derivation.sql",
  "app.ef_audit": "0322_enterprise_duplicate_reconciliation.sql",
  "app.enterprise_baseline_import": "0296_enterprise_baseline.sql",
  "app.small_builder_demo_audit": "0313_small_builder_demo_runs.sql",
  "app.ef_reconcile_exported_duplicate": "0322_enterprise_duplicate_reconciliation.sql",
};

/** Real PostgreSQL assertion, alongside the owning routine's existing behavioural
 * regression. Requires an actual event; an empty result cannot pass. */
export async function assertLp4SealedEvents(owner: Pool, tenant: string, eventType: string) {
  const events = (await owner.query<AuditEvent>(`SELECT id,version,tenant_id AS "tenantId",sequence::int,
    actor_ref AS "actorRef",event_type AS "eventType",subject_type AS "subjectType",subject_ref AS "subjectRef",payload,
    occurred_at AS "occurredAt",payload_hash AS "payloadHash",previous_hash AS "previousHash",event_hash AS "eventHash"
    FROM app.audit_event WHERE tenant_id=$1 ORDER BY sequence`, [tenant])).rows;
  const matching = events.filter(e => e.eventType === eventType);
  expect(matching.length).toBeGreaterThan(0);
  for (const event of matching) {
    expect(event.version).toBe("audit.v2");
    expect(auditEventTrust(event)).toBe("checked_operation");
  }
  verifyAuditChain(events);
}
