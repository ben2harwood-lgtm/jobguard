import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { AdoptInFlightJobMutation, UserCommandDispatcher, type VerifiedTenantContext } from "../src/index.js";

/** Minimal synthetic M1-17 command fixture. Never inserts/updates job status. */
export async function importWatchdogFixtureJob(admin: Pool, tenantId: string, jobId: string, title = "Fictional watchdog job", lifecyclePoint: "live" | "invoiced" = "live") {
  const userId = randomUUID(), accountId = randomUUID(), membershipId = randomUUID();
  await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [userId]);
  await admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Synthetic watchdog fixture')", [accountId, tenantId]);
  await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [membershipId, tenantId, accountId, userId]);
  const input = { version: "adopt-job.v1", jobId, baselineId: randomUUID(), title, lifecyclePoint,
    provenance: "imported", lineageStrength: "builder_attested_weaker", baselineHash: "a".repeat(64), baselineDescription: "Fictional builder-attested work underway",
    acceptedNetValuePence: 100000, recoveryCapPence: 1500, acceptedValueSource: "builder_attestation", attestedByMembershipId: membershipId,
    attestedAt: new Date(0), importTermsVersion: "synthetic_import_terms_candidate.v1", feePolicyVersion: "reference_fee_policy_v1", mode: "synthetic_candidate" };
  const command = { version: "command.v1", commandId: randomUUID(), commandType: "job.adopt_in_flight", semanticKey: `fixture-import:${jobId}`,
    actorMembershipId: membershipId, subjectType: "job", subjectRef: jobId,
    action: { actionType: "job.adopt_in_flight", recipient: null, contentHash: input.baselineHash, aggregateRevision: 0,
      amountPence: input.acceptedNetValuePence, currency: "GBP", policyVersion: input.importTermsVersion, expiresAt: new Date("2099-01-01") } };
  const mutation = new AdoptInFlightJobMutation(tenantId, "synthetic_candidate", input);
  // Identity setup needs the harness owner. The business mutation and its audit
  // execute as the actual runtime role, through the existing dispatcher.
  return new UserCommandDispatcher(admin).dispatch({ tenantId } as VerifiedTenantContext, command, {
    async mutate(db, c) { await db.$client.query("SET LOCAL ROLE jobguard_runtime"); return mutation.mutate(db, c); },
    auditEvents: mutation.auditEvents.bind(mutation),
  });
}
