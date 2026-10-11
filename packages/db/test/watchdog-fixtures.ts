import { testTenantContext } from "./tenant-context-test-utils.js";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { AdoptInFlightJobMutation, UserCommandDispatcher, withTenant } from "../src/index.js";

/** Minimal synthetic M1-17 command fixture. Never inserts/updates job status. */
export async function importWatchdogFixtureJob(admin: Pool, tenantId: string, jobId: string, title = "Fictional watchdog job", lifecyclePoint: "live" | "invoiced" = "live") {
  const userId = randomUUID(), accountId = randomUUID(), membershipId = randomUUID();
  await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [userId]);
  await admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Synthetic watchdog fixture')", [accountId, tenantId]);
  await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [membershipId, tenantId, accountId, userId]);
  // CH-3a's controlled import requires explicit registry revisions. Seed only
  // fictional identity metadata here; adoption still creates the job/binding,
  // authorization, immutable baseline and audit through the real runtime path.
  const customerId = randomUUID(), customerRevisionId = randomUUID(), siteId = randomUUID(), siteRevisionId = randomUUID();
  await withTenant(admin, testTenantContext(tenantId), async db => {
    await db.$client.query("INSERT INTO app.customer(tenant_id,id) VALUES($1,$2)", [tenantId, customerId]);
    await db.$client.query("INSERT INTO app.customer_revision(tenant_id,id,customer_id,revision,payload) VALUES($1,$2,$3,1,$4)",
      [tenantId, customerRevisionId, customerId, { version: "customer.v1", name: "Fictional watchdog customer", type: "person", email: "watchdog-customer@example.invalid" }]);
    await db.$client.query("INSERT INTO app.site(tenant_id,id) VALUES($1,$2)", [tenantId, siteId]);
    await db.$client.query("INSERT INTO app.site_revision(tenant_id,id,site_id,revision,payload,match_key) VALUES($1,$2,$3,1,$4,'[]')",
      [tenantId, siteRevisionId, siteId, { version: "site.v1", addressLines: ["1 Fictional Street"], town: "London", postcode: "SW1A 1AA" }]);
  });
  const input = { version: "adopt-job.v1", jobId, baselineId: randomUUID(), title, lifecyclePoint,
    provenance: "imported", lineageStrength: "builder_attested_weaker", baselineHash: "a".repeat(64), baselineDescription: "Fictional builder-attested work underway",
    acceptedNetValuePence: 100000, recoveryCapPence: 1500, acceptedValueSource: "builder_attestation", attestedByMembershipId: membershipId,
    attestedAt: new Date(0), importTermsVersion: "synthetic_import_terms_candidate.v1", feePolicyVersion: "reference_fee_policy_v1", mode: "synthetic_candidate", parties: { version: "job-parties.v1", customerRevisionId, siteRevisionId } };
  const command = { version: "command.v1", commandId: randomUUID(), commandType: "job.adopt_in_flight", semanticKey: `import:${jobId}`,
    actorMembershipId: membershipId, subjectType: "job", subjectRef: jobId,
    action: { actionType: "job.adopt_in_flight", recipient: null, contentHash: input.baselineHash, aggregateRevision: 0,
      amountPence: input.acceptedNetValuePence, currency: "GBP", policyVersion: input.importTermsVersion, expiresAt: new Date("2099-01-01") } };
  const mutation = new AdoptInFlightJobMutation(tenantId, "synthetic_candidate", input);
  // Identity setup needs the harness owner. The business mutation and its audit
  // execute as the actual runtime role, through the existing dispatcher.
  return new UserCommandDispatcher(admin).dispatch(testTenantContext(tenantId), command, {
    async mutate(db, c) { await db.$client.query("SET LOCAL ROLE jobguard_runtime"); return mutation.mutate(db, c); },
    auditEvents: mutation.auditEvents.bind(mutation),
  });
}
