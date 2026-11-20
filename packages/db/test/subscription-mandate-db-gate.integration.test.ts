import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { subscriptionAgreementHash, subscriptionAgreementText } from "@jobguard/core";
import { SubscriptionMandateRepository } from "../src/subscription-mandate-repository.js";
import { closeWorkFixture, createWorkFixture, workTenant, type WorkFixture } from "./job-work-state-fixtures.js";
import { meterCompany } from "./meter-persistence-fixtures.js";
import { closeTestPools } from "./pool-test-utils.js";

let f: WorkFixture;
type Company = Awaited<ReturnType<typeof meterCompany>>;
let approved: Company, fresh: Company, approvalId: string, approval: object, freshApproval: object;
const tables = ["subscription_terms_version", "subscription_mandate_event", "command_receipt", "action_authorization", "decision", "audit_event"];
const counts = async () => Promise.all(tables.map(async table =>
  (await f.admin.query(`SELECT count(*)::int n FROM app.${table}`)).rows[0].n as number));

function input(a: Company) {
  const selection = { version: "subscription-agreement-selection.v1", termsVersion: "synthetic_subscription_success_terms.v1",
    catalogueVersion: "subscription_pricing_policy_v4", tenantId: a.tenantId, agreementId: randomUUID(), revision: 1,
    plan: "Solo", cadence: "monthly", anchorDay: 1, recipientRef: randomUUID(),
    validFrom: new Date(Date.now() + 3600000).toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString() };
  return { version: "subscription-mandate-command.v1", kind: "approve", expectedSequence: 0,
    termsText: subscriptionAgreementText(selection), termsHash: subscriptionAgreementHash(selection) };
}

beforeAll(async () => {
  f = await createWorkFixture();
  approved = await meterCompany(f); fresh = await meterCompany(f);
  approvalId = randomUUID(); approval = input(approved); freshApproval = input(fresh);
  // Prove these credentials and exact commands work before copying to another database.
  await workTenant(f.runtime, approved.tenantId, db => db.query("SELECT app.m413_command($1,$2,$3,$4::jsonb)",
    [approved.tenantId, approved.digest, approvalId, JSON.stringify(approval)]), { membershipId: approved.actorId, bindRequest: false });
  expect((await new SubscriptionMandateRepository(f.runtime).read(approved.context, approved.digest)).record?.state).toBe("active");
  const user = (await f.runtime.query("SELECT current_user u")).rows[0].u as string;
  const { host, port, password } = (f.admin as unknown as { options: { host: string; port: number; password: string } }).options;
  const base = { host, port, password };
  // Close all source connections so the template copy needs no forced termination.
  await closeTestPools(f.runtime, f.admin);
  const control = new Pool({ ...base, user: "postgres", database: "postgres", max: 1 });
  try { await control.query("CREATE DATABASE jobguard_m413_outside TEMPLATE jobguard_synthetic_demo"); }
  finally { await control.end(); }
  f.admin = new Pool({ ...base, user: "postgres", database: "jobguard_m413_outside", max: 1 });
  f.runtime = new Pool({ ...base, user, database: "jobguard_m413_outside", max: 1 });
}, 120000);
afterAll(async () => closeWorkFixture(f));

it("refuses reads, fresh approvals, exact replays and lifecycle commands outside the demo database without writes", async () => {
  expect((await f.admin.query("SELECT current_database() name")).rows[0].name).toBe("jobguard_m413_outside");
  const before = await counts();
  const refused = { message: "SYNTHETIC_MODE_REQUIRED", code: "42501" };
  const commands: Array<readonly [Company, string, object]> = [
    [fresh, randomUUID(), freshApproval],
    [approved, approvalId, approval],
    ...["revoked", "cancelled", "paused", "renewal_failed", "superseded"].map(kind =>
      [approved, randomUUID(), { version: "subscription-mandate-command.v1", kind, expectedSequence: 1 }] as const),
  ];
  for (const [a, id, value] of commands) {
    await expect(workTenant(f.runtime, a.tenantId, db => db.query("SELECT app.m413_command($1,$2,$3,$4::jsonb)",
      [a.tenantId, a.digest, id, JSON.stringify(value)]), { membershipId: a.actorId, bindRequest: false })).rejects.toMatchObject(refused);
  }
  // Read refuses even for valid active authority, a new tenant, or another tenant's session.
  for (const [tenant, digest] of [[approved.tenantId, approved.digest], [fresh.tenantId, fresh.digest],
    [fresh.tenantId, approved.digest], [randomUUID(), "0".repeat(64)]] as const) {
    await expect(workTenant(f.runtime, tenant, db => db.query("SELECT app.m413_read($1,$2)", [tenant, digest]), { bindRequest: false }))
      .rejects.toMatchObject(refused);
  }
  await expect(workTenant(f.runtime, fresh.tenantId, db => db.query("SELECT app.m413_command($1,$2,$3,$4::jsonb)",
    [fresh.tenantId, "0".repeat(64), randomUUID(), "{}"]), { membershipId: fresh.actorId, bindRequest: false })).rejects.toMatchObject(refused);
  expect(await counts()).toEqual(before);
});
