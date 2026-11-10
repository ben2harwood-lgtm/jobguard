import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, expect, it } from "vitest";
import { platformInvoiceAccountFixture, type PlatformInvoiceProfile, type PlatformInvoiceIssueCommand } from "@jobguard/core";
import { PlatformInvoiceReadRepository } from "../src/platform-invoice-read-repository.js";
import { PlatformTaxInvoiceFixtureRepository } from "../src/platform-tax-invoice-fixture-repository.js";
import { createWorkFixture, closeWorkFixture, workTenant, type WorkFixture } from "./job-work-state-fixtures.js";
import { meterCompany, preparedPeriod } from "./subscription-persistence-fixtures.js";
let f: WorkFixture;
beforeAll(async () => { f = await createWorkFixture(); }, 240000);
afterAll(async () => { await closeWorkFixture(f); });
async function setup() {
  const { a, issued } = await preparedPeriod(f, 4, "Solo"), issuerId = randomUUID();
  const profile: PlatformInvoiceProfile = { version: "platform-invoice-profile.v1", tenantId: a.tenantId, issuerId,
    name: "JobGuard fictional issuer", address: "Fictional address — simulation only", vatRegistration: "SIMULATION-NOT-REGISTERED", environment: "synthetic_demo" };
  const command: PlatformInvoiceIssueCommand = { version: "platform-invoice-issue.v1", environment: "synthetic_demo", commandId: randomUUID(), issuerId,
    actorMembershipId: a.actorId, kind: "invoice", originalNumber: null, taxPolicy: "D02-pending-approval-example",
    lines: [{ id: randomUUID(), sourceKind: "subscription", sourceId: issued.statementId, expectedSourceHash: issued.artifactHash, taxPence: 580 }] };
  const writer = new PlatformTaxInvoiceFixtureRepository(f.admin);
  const invoice = await writer.issue(a.context, a.digest, profile, command);
  return { a, invoice, writer, profile, command };
}
const reader = () => new PlatformInvoiceReadRepository(f.runtime);
it("refuses removed members, revoked members, non-owners, expired memberships and bad sessions", async () => {
  const t = await setup();
  // Remove the identity membership locator, as the session membership lookup requires it.
  await f.admin.query("DELETE FROM identity.membership_locator WHERE tenant_id=$1 AND membership_id=$2", [t.a.tenantId, t.a.actorId]);
  await expect(reader().read(t.a.context, t.a.digest)).rejects.toThrow("PLATFORM_INVOICE_FORBIDDEN");
  const user = (await f.admin.query("SELECT identity_user_id FROM app.membership WHERE id=$1", [t.a.actorId])).rows[0].identity_user_id;
  await f.admin.query("INSERT INTO identity.membership_locator(user_id,tenant_id,membership_id) VALUES($1,$2,$3)", [user, t.a.tenantId, t.a.actorId]);
  for (const patch of ["revoked_at=clock_timestamp()", "role='admin'", "role='read_only'", "expires_at=clock_timestamp()-interval '1 second'"]) {
    await workTenant(f.admin, t.a.tenantId, db => db.query(`UPDATE app.membership SET ${patch} WHERE tenant_id=$1 AND id=$2`, [t.a.tenantId, t.a.actorId]), { membershipId: t.a.actorId });
    await expect(reader().read(t.a.context, t.a.digest)).rejects.toThrow("PLATFORM_INVOICE_FORBIDDEN");
    await workTenant(f.admin, t.a.tenantId, db => db.query("UPDATE app.membership SET role='owner',revoked_at=NULL,expires_at=NULL WHERE tenant_id=$1 AND id=$2", [t.a.tenantId, t.a.actorId]), { membershipId: t.a.actorId });
  }
  await expect(reader().read(t.a.context, "0".repeat(64))).rejects.toThrow("PLATFORM_INVOICE_FORBIDDEN");
  await f.admin.query("UPDATE identity.session SET revoked_at=clock_timestamp() WHERE token_digest=$1", [t.a.digest]);
  await expect(reader().read(t.a.context, t.a.digest)).rejects.toThrow("PLATFORM_INVOICE_FORBIDDEN");
});
it("never returns another company's documents even with their context or digest", async () => {
  const a = await setup(), b = await setup();
  await expect(reader().read(a.a.context, b.a.digest)).rejects.toThrow("PLATFORM_INVOICE_FORBIDDEN");
  const result = await reader().read(a.a.context, a.a.digest);
  expect(result).toEqual([{ invoice: a.invoice, credits: [] }]);
  expect(JSON.stringify(result)).not.toContain(b.a.tenantId);
  const empty = await meterCompany(f);
  expect(await reader().read(empty.context, empty.digest)).toEqual([]);
});
it("reads issued D02 examples and credits without starting collection or changing row counts", async () => {
  const t = await setup();
  const credit = await t.writer.issue(t.a.context, t.a.digest, t.profile, { ...t.command, commandId: randomUUID(), kind: "credit_note", originalNumber: t.invoice.number });
  const counts = async () => {
    const tables = ["platform_invoice_document", "platform_invoice_source", "platform_invoice_issuer", "audit_event", "platform_statement", "subscription_simulated_work"];
    return Promise.all(tables.map(async table => (await f.admin.query(`SELECT count(*)::text n FROM app.${table} WHERE tenant_id=$1`, [t.a.tenantId])).rows[0].n));
  };
  const before = await counts();
  const [result] = await reader().read(t.a.context, t.a.digest);
  expect(result).toEqual({ invoice: t.invoice, credits: [credit] });
  expect(platformInvoiceAccountFixture(result!.invoice, result!.credits, 0)).toMatchObject({ principalPence: 0, taxPence: 0, grossPence: 0, alreadyPaidPence: 0, remainingCashDuePence: 0, refundDuePence: 0, collectionStarted: false });
  expect(await counts()).toEqual(before);
  expect(t.invoice).toMatchObject({ principalPence: 2900, taxPence: 580, grossPence: 3480, collectionStarted: false });
  for (const table of ["platform_invoice_document", "platform_invoice_source", "platform_invoice_issuer"]) {
    await expect(workTenant(f.runtime, t.a.tenantId, db => db.query(`SELECT * FROM app.${table}`), { membershipId: t.a.actorId })).rejects.toMatchObject({ code: "42501" });
    expect((await f.admin.query("SELECT has_table_privilege('jobguard_runtime',$1,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') allowed", [`app.${table}`])).rows[0].allowed).toBe(false);
  }
  const routine = (await f.admin.query("SELECT prosecdef,proconfig FROM pg_proc WHERE oid='app.platform_invoice_read(uuid,text)'::regprocedure")).rows[0];
  expect(routine).toEqual({ prosecdef: true, proconfig: ["search_path=pg_catalog"] });
});
