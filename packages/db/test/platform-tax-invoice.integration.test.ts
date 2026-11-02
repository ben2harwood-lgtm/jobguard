import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { downloadPlatformInvoice, platformInvoiceAccountFixture, type PlatformInvoiceProfile, type PlatformInvoiceIssueCommand } from "@jobguard/core";
import { PlatformTaxInvoiceFixtureRepository } from "../src/platform-tax-invoice-fixture-repository.js";
import { closeWorkFixture, createWorkFixture, seedWorkJob, workTenant, type WorkFixture } from "./job-work-state-fixtures.js";
import { preparedPeriod, calendarInput, storeMeter, issue } from "./subscription-persistence-fixtures.js";
let f: WorkFixture;
beforeAll(async () => { f = await createWorkFixture(); }, 240000);
afterAll(async () => { await closeWorkFixture(f); });
async function setup() {
  const { a, issued } = await preparedPeriod(f, 4, "Solo"), issuerId = randomUUID();
  const profile: PlatformInvoiceProfile = { version: "platform-invoice-profile.v1", tenantId: a.tenantId, issuerId,
    name: "JobGuard fictional issuer", address: "Fictional address — simulation only", vatRegistration: "SIMULATION-NOT-REGISTERED", environment: "synthetic_demo" };
  const request = (source = issued): PlatformInvoiceIssueCommand => ({ version: "platform-invoice-issue.v1", commandId: randomUUID(),
    issuerId, actorMembershipId: a.actorId, environment: "synthetic_demo", kind: "invoice", originalNumber: null, taxPolicy: "D02-pending-approval-example",
    lines: [{ id: randomUUID(), sourceKind: "subscription", sourceId: source.statementId, expectedSourceHash: source.artifactHash, taxPence: 580 }] });
  const repo = new PlatformTaxInvoiceFixtureRepository(f.admin);
  return { a, profile, request, repo, issue: (r: PlatformInvoiceIssueCommand) => repo.issue(a.context, a.digest, profile, r) };
}
it("derives amounts and provenance from a real immutable subscription statement", async () => {
  const t = await setup(), r = t.request(), invoice = await t.issue(r);
  expect(invoice).toMatchObject({ principalPence: 2900, taxPence: 580, grossPence: 3480 });
  expect(invoice.request.lines[0]!.sourcePrincipalPence).toBe(2900);
  const source = (await f.admin.query("SELECT artifact_hash,amount_pence FROM app.platform_statement WHERE tenant_id=$1 AND id=$2", [t.a.tenantId, r.lines[0]!.sourceId])).rows[0];
  expect(invoice.request.lines[0]!.provenance.statement.hash).toBe(source.artifact_hash);
  expect(invoice.principalPence).toBe(Number(source.amount_pence));
  const trace = invoice.request.lines[0]!.provenance;
  expect(trace.kind).toBe("subscription");
  if (trace.kind !== "subscription") throw new Error("Wrong trace");
  const approval = (await f.admin.query("SELECT content_hash FROM app.action_authorization WHERE tenant_id=$1 AND id=$2", [t.a.tenantId, trace.approval.id])).rows[0];
  expect(trace.approval.hash).toBe(approval.content_hash);
});
it("durably serializes numbering, commands and sources under concurrent requests", async () => {
  const t = await setup(), r = t.request();
  const [first, replay] = await Promise.all([t.issue(r), t.issue(r)]);
  expect(first).toEqual(replay);
  const later = [];
  for (const month of [10, 11]) {
    await storeMeter(f, t.a, calendarInput(t.a.tenantId, 4, month));
    later.push(t.request(await issue(f, t.a, `2026-${month}-01`)));
  }
  const next = await Promise.all(later.map(t.issue));
  expect(next.map(d => d.sequence).sort()).toEqual([2, 3]);
  await expect(t.issue({ ...r, commandId: randomUUID() })).rejects.toThrow("PLATFORM_INVOICE_CONFLICT");
  const changed = structuredClone(r); changed.lines[0]!.taxPence++;
  await expect(t.issue(changed)).rejects.toThrow("PLATFORM_INVOICE_CONFLICT");
  const stored = await f.admin.query("SELECT document_hash FROM app.platform_invoice_document WHERE tenant_id=$1 AND number=$2", [t.a.tenantId, first.number]);
  expect(stored.rows[0].document_hash).toBe(downloadPlatformInvoice(first).hash);
  expect((await f.admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND event_type='platform_invoice.simulation_invoice'", [t.a.tenantId])).rows[0].n).toBe(3);
});
it("refuses fabricated, foreign and mismatched sources and supplied principal/provenance", async () => {
  const t = await setup(), other = await setup();
  for (const change of [{ sourceId: randomUUID() }, { sourceId: other.request().lines[0]!.sourceId }, { expectedSourceHash: "a".repeat(64) }]) {
    const r = t.request(); Object.assign(r.lines[0]!, change);
    await expect(t.issue(r)).rejects.toThrow("PLATFORM_INVOICE_FORBIDDEN");
  }
  for (const patch of [{ principalPence: 1 }, { sourcePrincipalPence: 99999 }, { provenance: { statement: { id: randomUUID(), hash: "a".repeat(64) } } }]) {
    const r = t.request(); Object.assign(r.lines[0]!, patch);
    await expect(t.issue(r)).rejects.toThrow("INVALID_PLATFORM_INVOICE");
  }
  for (const sourceKind of ["success_fee", "contractor_fee"] as const) {
    const r = t.request(); r.lines[0]!.sourceKind = sourceKind;
    await expect(t.issue(r)).rejects.toThrow("PLATFORM_INVOICE_SOURCE_UNAVAILABLE");
  }
  expect((await f.admin.query("SELECT count(*)::int n FROM app.platform_invoice_document WHERE tenant_id=$1", [t.a.tenantId])).rows[0].n).toBe(0);
});
it("recomputes the stored source hash and refuses stored hash corruption", async () => {
  const t = await setup(), r = t.request();
  // Administrative corruption fixture: restore by rollback, never alter a main migration.
  const client = await f.admin.connect();
  try {
    await client.query("BEGIN"); await client.query("SET LOCAL session_replication_role='replica'");
    await client.query("UPDATE app.platform_statement SET artifact_hash=$3 WHERE tenant_id=$1 AND id=$2", [t.a.tenantId, r.lines[0]!.sourceId, "b".repeat(64)]);
    await client.query("UPDATE app.subscription_period p SET artifact_hash=$3 FROM app.platform_statement s WHERE s.tenant_id=$1 AND s.id=$2 AND (p.tenant_id,p.id)=(s.tenant_id,s.period_id)", [t.a.tenantId, r.lines[0]!.sourceId, "b".repeat(64)]);
    // Reader sees the same transaction; fake pool delegates to this connection only for the attack.
    const pool = { connect: async () => ({ query: (sql: string, values?: unknown[]) => {
      if (sql === "BEGIN") return client.query("SAVEPOINT invoice_attack");
      if (sql === "ROLLBACK") return client.query("ROLLBACK TO SAVEPOINT invoice_attack");
      if (sql === "COMMIT") return client.query("RELEASE SAVEPOINT invoice_attack");
      return client.query(sql, values);
    }, release: () => undefined }) } as unknown as import("pg").Pool;
    // Map the repository transaction to a savepoint inside this corruption fixture.
    r.lines[0]!.expectedSourceHash = "b".repeat(64);
    await expect(new PlatformTaxInvoiceFixtureRepository(pool).issue(t.a.context, t.a.digest, t.profile, r)).rejects.toThrow("PLATFORM_INVOICE_FORBIDDEN");
  } finally { await client.query("ROLLBACK"); client.release(); }
});
it("refuses a second issuer for the same source even after credit, including a database race", async () => {
  const t = await setup(), command = t.request(), secondProfile = { ...t.profile, issuerId: randomUUID() };
  const second = { ...structuredClone(command), issuerId: secondProfile.issuerId, commandId: randomUUID() };
  const results = await Promise.allSettled([t.issue(command), t.repo.issue(t.a.context, t.a.digest, secondProfile, second)]);
  expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
  expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
  expect((await f.admin.query("SELECT count(*)::int n FROM app.platform_invoice_source WHERE tenant_id=$1", [t.a.tenantId])).rows[0].n).toBe(1);
  // Independent DB uniqueness attack: bypass the writer using the other issuer/document coordinates.
  const row = (await f.admin.query("SELECT * FROM app.platform_invoice_source WHERE tenant_id=$1", [t.a.tenantId])).rows[0];
  await expect(f.admin.query("INSERT INTO app.platform_invoice_source SELECT * FROM app.platform_invoice_source WHERE tenant_id=$1", [t.a.tenantId])).rejects.toMatchObject({ code: "23505" });
  const winner = results.find(r => r.status === "fulfilled");
  if (winner?.status !== "fulfilled") throw new Error("No winner");
  expect(row.invoice_number).toBe(winner.value.number);
});
it("credits derive remaining principal from the stored original and remain replay-safe", async () => {
  const t = await setup(), originalCommand = t.request(), invoice = await t.issue(originalCommand), before = downloadPlatformInvoice(invoice).hash;
  const correction = { ...structuredClone(originalCommand), commandId: randomUUID(), kind: "credit_note" as const, originalNumber: invoice.number };
  const results = await Promise.allSettled([t.issue(correction), t.issue({ ...correction, commandId: randomUUID() })]);
  expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
  expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
  const note = results.find(r => r.status === "fulfilled");
  if (note?.status !== "fulfilled") throw new Error("Missing credit");
  const replayCommand = results[0]?.status === "fulfilled" ? correction : { ...correction, commandId: note.value.request.commandId };
  expect(await t.issue(replayCommand)).toEqual(note.value);
  expect(platformInvoiceAccountFixture(invoice, [note.value], invoice.grossPence)).toMatchObject({ remainingCashDuePence: 0, refundDuePence: 3480, collectionStarted: false });
  expect(downloadPlatformInvoice(await t.issue(originalCommand)).hash).toBe(before);
  const profile = { ...t.profile, issuerId: randomUUID() };
  await expect(t.repo.issue(t.a.context, t.a.digest, profile, { ...t.request(), issuerId: profile.issuerId })).rejects.toThrow("PLATFORM_INVOICE_CONFLICT");
});
it("binds actor to the persisted session and refuses runtime/foreign/revoked access", async () => {
  const t = await setup(), r = t.request(); await t.issue(r);
  await expect(new PlatformTaxInvoiceFixtureRepository(f.runtime).issue(t.a.context, t.a.digest, t.profile, t.request())).rejects.toThrow();
  const other = await seedWorkJob(f, t.a.tenantId); // another valid owner in the SAME tenant
  await expect(t.issue({ ...t.request(), actorMembershipId: other.actorId })).rejects.toThrow("PLATFORM_INVOICE_FORBIDDEN");
  await expect(t.repo.issue(t.a.context, "0".repeat(64), t.profile, t.request())).rejects.toThrow();
  for (const table of ["platform_invoice_issuer", "platform_invoice_document", "platform_invoice_source"]) {
    await expect(workTenant(f.runtime, t.a.tenantId, db => db.query(`SELECT * FROM app.${table}`))).rejects.toThrow();
    expect((await f.admin.query("SELECT has_table_privilege('jobguard_runtime',$1,'INSERT,UPDATE,DELETE,TRUNCATE') allowed", [`app.${table}`])).rows[0].allowed).toBe(false);
  }
  await f.admin.query("UPDATE identity.session SET revoked_at=clock_timestamp() WHERE token_digest=$1", [t.a.digest]);
  await expect(t.issue(r)).rejects.toThrow();
});
it("protects issuer, invoice and source history against edits, deletion and truncation", async () => {
  const t = await setup(); await t.issue(t.request());
  for (const table of ["platform_invoice_issuer", "platform_invoice_document", "platform_invoice_source"]) {
    const column = table === "platform_invoice_issuer" ? "profile" : table === "platform_invoice_document" ? "document" : "source_hash";
    await expect(f.admin.query(`UPDATE app.${table} SET ${column}=${column} WHERE tenant_id=$1`, [t.a.tenantId])).rejects.toThrow("PLATFORM_INVOICE_IMMUTABLE");
    await expect(f.admin.query(`DELETE FROM app.${table} WHERE tenant_id=$1`, [t.a.tenantId])).rejects.toThrow("PLATFORM_INVOICE_IMMUTABLE");
    await expect(f.admin.query(`TRUNCATE app.${table} CASCADE`)).rejects.toThrow("PLATFORM_INVOICE_IMMUTABLE");
  }
});
it("refuses live mode; caller tax is a pending-D02 example and issuance starts no collection", async () => {
  const t = await setup();
  await expect(t.issue({ ...t.request(), environment: "production" } as unknown as PlatformInvoiceIssueCommand)).rejects.toThrow("INVALID_PLATFORM_INVOICE");
  const r = t.request(); r.lines[0]!.taxPence = 123;
  const first = await t.issue(r); expect(first.taxPence).toBe(123); expect(first.collectionStarted).toBe(false);
  expect(first.warning).toContain("D02 tax examples pending approval");
  expect((await f.admin.query("SELECT count(*)::int n FROM app.subscription_simulated_work WHERE tenant_id=$1", [t.a.tenantId])).rows[0].n).toBe(0);
});
