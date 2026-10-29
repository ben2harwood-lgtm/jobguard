import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { downloadPlatformInvoice, platformInvoiceAccountFixture, type PlatformInvoiceProfile, type PlatformInvoiceRequest } from "@jobguard/core";
import { PlatformTaxInvoiceFixtureRepository } from "../src/platform-tax-invoice-fixture-repository.js";
import { closeWorkFixture, createWorkFixture, seedWorkJob, workTenant, type WorkFixture } from "./job-work-state-fixtures.js";
let f: WorkFixture;
beforeAll(async () => { f = await createWorkFixture(); }, 240000);
afterAll(async () => { await closeWorkFixture(f); });
async function setup() {
  const a = await seedWorkJob(f), issuerId = randomUUID();
  const profile: PlatformInvoiceProfile = { version: "platform-invoice-profile.v1", tenantId: a.tenantId, issuerId,
    name: "JobGuard fictional issuer", address: "Fictional address — simulation only", vatRegistration: "SIMULATION-NOT-REGISTERED", environment: "synthetic_demo" };
  const request = (): PlatformInvoiceRequest => ({ version: "platform-invoice-request.v1", commandId: randomUUID(), tenantId: a.tenantId,
    issuerId, actorMembershipId: a.actorId, environment: "synthetic_demo", kind: "invoice", originalNumber: null, taxPolicy: "D02-pending-approval-example",
    lines: [{ id: randomUUID(), principalPence: 4900, taxPence: 980, sourcePrincipalPence: 4900,
      provenance: { kind: "subscription", statement: { tenantId: a.tenantId, id: randomUUID(), hash: "a".repeat(64) }, period: "2026-10", policyVersion: "subscription_pricing_policy_v4" } }] });
  const repo = new PlatformTaxInvoiceFixtureRepository(f.admin);
  return { a, profile, request, issue: (r: PlatformInvoiceRequest) => repo.issue(a.context, profile, r) };
}
it("durably serializes numbering, commands and sources under concurrent requests", async () => {
  const t = await setup(), r = t.request();
  const [first, replay] = await Promise.all([t.issue(r), t.issue(r)]);
  expect(first).toEqual(replay);
  const next = await Promise.all([t.issue(t.request()), t.issue(t.request())]);
  expect(next.map(d => d.sequence).sort()).toEqual([2, 3]);
  await expect(t.issue({ ...r, commandId: randomUUID() })).rejects.toThrow("PLATFORM_INVOICE_CONFLICT");
  const changed = structuredClone(r); changed.lines[0]!.taxPence++;
  await expect(t.issue(changed)).rejects.toThrow("PLATFORM_INVOICE_CONFLICT");
  const stored = await f.admin.query("SELECT document_hash FROM app.platform_invoice_document WHERE tenant_id=$1 AND number=$2", [t.a.tenantId, first.number]);
  expect(stored.rows[0].document_hash).toBe(downloadPlatformInvoice(first).hash);
  const audit = await f.admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND event_type='platform_invoice.simulation_invoice'", [t.a.tenantId]);
  expect(audit.rows[0].n).toBe(3);
});
it("credits are linked, replay-safe, bounded under races and never mutate original bytes", async () => {
  const t = await setup(), invoice = await t.issue(t.request()), before = downloadPlatformInvoice(invoice).hash;
  const correction = structuredClone(invoice.request); correction.commandId = randomUUID(); correction.kind = "credit_note"; correction.originalNumber = invoice.number;
  const results = await Promise.allSettled([t.issue(correction), t.issue({ ...correction, commandId: randomUUID() })]);
  expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
  expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
  const note = results.find(r => r.status === "fulfilled");
  if (note?.status !== "fulfilled") throw new Error("Missing credit");
  expect(await t.issue(note.value.request)).toEqual(note.value);
  expect(platformInvoiceAccountFixture(invoice, [note.value], invoice.grossPence)).toMatchObject({ remainingCashDuePence: 0, refundDuePence: 5880, collectionStarted: false });
  expect(downloadPlatformInvoice(await t.issue(invoice.request)).hash).toBe(before);
});
it("refuses all runtime reads, inserts and fixture issuance; prevents cross-tenant use", async () => {
  const t = await setup(), r = t.request(); await t.issue(r);
  const runtime = new PlatformTaxInvoiceFixtureRepository(f.runtime);
  await expect(runtime.issue(t.a.context, t.profile, t.request())).rejects.toThrow();
  for (const table of ["platform_invoice_issuer", "platform_invoice_document"]) {
    await expect(workTenant(f.runtime, t.a.tenantId, db => db.query(`SELECT * FROM app.${table}`))).rejects.toThrow();
    const privileges = await f.admin.query("SELECT has_table_privilege('jobguard_runtime',$1,'INSERT,UPDATE,DELETE,TRUNCATE') allowed", [`app.${table}`]);
    expect(privileges.rows[0].allowed).toBe(false);
  }
  const other = await seedWorkJob(f);
  await expect(new PlatformTaxInvoiceFixtureRepository(f.admin).issue(other.context, t.profile, r)).rejects.toThrow("PLATFORM_INVOICE_FORBIDDEN");
  await expect(t.issue({ ...t.request(), actorMembershipId: other.actorId })).rejects.toThrow("PLATFORM_INVOICE_FORBIDDEN");
  const catalog = await f.admin.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='app.platform_invoice_document'::regclass");
  expect(catalog.rows[0]).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
});
it("protects issuer and invoice history against edits, deletion and truncation", async () => {
  const t = await setup(); await t.issue(t.request());
  for (const table of ["platform_invoice_issuer", "platform_invoice_document"]) {
    const column = table === "platform_invoice_issuer" ? "profile" : "document";
    await expect(f.admin.query(`UPDATE app.${table} SET ${column}=${column} WHERE tenant_id=$1`, [t.a.tenantId])).rejects.toThrow("PLATFORM_INVOICE_IMMUTABLE");
    await expect(f.admin.query(`DELETE FROM app.${table} WHERE tenant_id=$1`, [t.a.tenantId])).rejects.toThrow("PLATFORM_INVOICE_IMMUTABLE");
    await expect(f.admin.query(`TRUNCATE app.${table} CASCADE`)).rejects.toThrow("PLATFORM_INVOICE_IMMUTABLE");
  }
});
it("rejects production without issuing or collecting", async () => {
  const t = await setup();
  await expect(t.issue({ ...t.request(), environment: "production" } as unknown as PlatformInvoiceRequest)).rejects.toThrow("INVALID_PLATFORM_INVOICE");
  const count = await f.admin.query("SELECT count(*)::int n FROM app.platform_invoice_document WHERE tenant_id=$1", [t.a.tenantId]);
  expect(count.rows[0].n).toBe(0);
  const first = await t.issue(t.request()); expect(first.collectionStarted).toBe(false);
  const work = await f.admin.query("SELECT count(*)::int n FROM app.subscription_simulated_work WHERE tenant_id=$1", [t.a.tenantId]);
  expect(work.rows[0].n).toBe(0);
});

it("rejects expired fixture actors even on a replay", async () => {
  const t = await setup(), request = t.request(); await t.issue(request);
  await f.admin.query("UPDATE app.membership SET expires_at=clock_timestamp()-interval '1 day' WHERE tenant_id=$1 AND id=$2", [t.a.tenantId, t.a.actorId]);
  await expect(t.issue(request)).rejects.toThrow("PLATFORM_INVOICE_FORBIDDEN");
});
