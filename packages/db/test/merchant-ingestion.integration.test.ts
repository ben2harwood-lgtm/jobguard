import { randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { migrate, SupplierDocumentRepository, withTenant } from "../src/index.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { importWatchdogFixtureJob } from "./watchdog-fixtures.js";
import { closeTestPools, freePort, installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
import { proofBefore, proofDifferences } from "./upgrade-proof-utils.js";
import type { SupplierDocumentIntake } from "@jobguard/core";
let postgres: EmbeddedPostgres, admin: Pool, runtime: Pool;
const tenant = randomUUID(), other = randomUUID(), job = randomUUID(), otherJob = randomUUID(), sameTenantJob = randomUUID();
const context = testTenantContext(tenant), otherContext = testTenantContext(other);
const previousEnvironment = process.env.JOBGUARD_ENV;
let preserved: Awaited<ReturnType<typeof proofBefore>>;
let originalId: string;
beforeAll(async () => {
  process.env.JOBGUARD_ENV = "synthetic_demo";
  const directory = await mkdtemp(join(tmpdir(), "jg-merchant-")), port = await freePort(61900, 80);
  postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password: "synthetic", persistent: true,
    createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
  await postgres.initialise(); await postgres.start();
  admin = new Pool({ host: "127.0.0.1", port, database: "postgres", user: "postgres", password: "synthetic" });
  // Install current main first; omit only this additive migration, including its bookkeeping INSERT.
  await migrate({ query: async (sql: string, params?: unknown[]) => sql.includes("ADD COLUMN canonical_document_id") ? { rows: [], rowCount: 0 } : admin.query(sql, params) } as Pick<Pool, "query">);
  await installLegacySyntheticPartyFixtures(admin);
  await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1),($2)", [tenant, other]);
  await importWatchdogFixtureJob(admin, tenant, job); await importWatchdogFixtureJob(admin, other, otherJob); await importWatchdogFixtureJob(admin, tenant, sameTenantJob);
  await admin.query("CREATE ROLE merchant_test_login LOGIN PASSWORD 'synthetic' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; GRANT jobguard_runtime TO merchant_test_login");
  runtime = new Pool({ host: "127.0.0.1", port, database: "postgres", user: "merchant_test_login", password: "synthetic" });
  await withTenant(runtime, context, db => db.$client.query("INSERT INTO app.supplier_document(id,tenant_id,job_id,supplier_context,document_type,document_number,content_hash,status) VALUES($1,$2,$3,'fictional-merchant','invoice','OLD-SYNTHETIC',$4,'ready')", [randomUUID(), tenant, job, "a".repeat(64)]));
  preserved = await proofBefore(admin, ["app.supplier_document", "app.supplier_document_intake", "app.goods_receipt", "app.purchase_order_revision"]);
  await migrate(admin);
}, 120000);
afterAll(async () => {
  await closeTestPools(runtime, admin); await postgres?.stop();
  if (previousEnvironment === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV = previousEnvironment;
});
const repo = () => new SupplierDocumentRepository(runtime);
async function intake(fixtureId: SupplierDocumentIntake["fixtureId"], channel: SupplierDocumentIntake["channel"] = "fixture_portal") {
  const view = await repo().view(context, job);
  return repo().intake(context, job, { version: "supplier-document-intake.v1", fixtureId, channel,
    ...(channel === "fixture_mail" ? { alias: "materials@fictional-builder.invalid" } : {}), expectedRevision: view.intakeRevision });
}
it("upgrades existing documents without changing prior rows, money, orders or delivery history", async () => {
  expect(await proofDifferences(admin, preserved)).toEqual({ rows: [], types: [] });
  expect((await admin.query("SELECT canonical_document_id FROM app.supplier_document WHERE document_number='OLD-SYNTHETIC'")).rows).toEqual([{ canonical_document_id: null }]);
});
it("deduplicates upload/mail/portal and concurrent exact replays while retaining each arrival", async () => {
  originalId = (await intake("materials-B-invoice", "picker")).documentId;
  expect((await intake("materials-B-invoice", "fixture_mail")).documentId).toBe(originalId);
  const view = await repo().view(context, job);
  const input: SupplierDocumentIntake = { version: "supplier-document-intake.v1", commandId: randomUUID(), fixtureId: "materials-B-invoice", channel: "fixture_portal", expectedRevision: view.intakeRevision };
  const results = await Promise.all([repo().intake(context, job, input), repo().intake(context, job, input)]);
  expect(results[0]).toEqual(results[1]); expect(results[0].documentId).toBe(originalId);
  await expect(repo().intake(context, job, { ...input, fixtureId: "merchant-changed-invoice" })).rejects.toThrow("IDEMPOTENCY_CONFLICT");
  const arrivals = (await admin.query("SELECT channel FROM app.supplier_document_intake WHERE tenant_id=$1 AND document_id=$2 ORDER BY channel", [tenant, originalId])).rows;
  expect(arrivals).toEqual([{ channel: "fixture_mail" }, { channel: "fixture_portal" }, { channel: "picker" }]);
  const current = await repo().view(context, job);
  expect(current.facts[0].source_text).toContain("GBP 25.00");
  expect(current.documents.find(d => d.id === originalId)?.provenance).toHaveLength(3);
});
it("quarantines changed content, identity/version drift and malformed amounts; never overwrites agreed facts", async () => {
  const before = await proofBefore(admin, ["app.supplier_fact_revision", "app.purchase_order_revision", "app.goods_receipt", "app.job_party_binding", "app.final_account_lock"]);
  const changed = await intake("merchant-changed-invoice"); expect(changed.result).toBe("held");
  for (const fixture of ["merchant-schema-drift", "merchant-identity-drift", "merchant-invalid-amount"] as const) expect((await intake(fixture)).result).toBe("held");
  const view = await repo().view(context, job), held = view.documents.find(d => d.id === changed.documentId);
  expect(held).toMatchObject({ canonical_document_id: originalId, status: "held", hold_reason: "Merchant review: changed_document", recognizedDebtPence: 0 });
  expect((await admin.query("SELECT source_schema_version FROM app.supplier_document_intake WHERE tenant_id=$1 AND fixture_id='merchant-schema-drift'", [tenant])).rows).toEqual([{ source_schema_version: "merchant-feed.v2" }]);
  expect(view.facts).toHaveLength(1); expect(view.facts[0].source_text).toContain("GBP 25.00");
  await expect(repo().confirm(context, job, { version: "supplier-fact-correction.v1", commandId: randomUUID(), documentId: changed.documentId, documentType: "invoice", quantity: "10", unitPricePence: 9900, netPence: 99000, expectedRevision: 0 })).rejects.toThrow("SUPPLIER_PROPOSAL_NOT_FOUND");
  expect(await proofBefore(admin, Object.keys(before))).toEqual(before);
  expect((await admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND event_type='merchant_document.review_required'", [tenant])).rows[0].n).toBe(4);
});
it("keeps credits separate from invoices and never treats a credit as reversal or settled allocation", async () => {
  const before = await proofBefore(admin, ["app.supplier_fact_revision", "app.goods_receipt", "app.purchase_order_revision", "app.journal"]);
  const credit = await intake("materials-B-credit", "picker"); expect(credit.documentId).not.toBe(originalId);
  expect((await repo().view(context, job)).documents.find(d => d.id === credit.documentId)).toMatchObject({ document_type: "credit", recognizedDebtPence: 0 });
  expect(await proofBefore(admin, Object.keys(before))).toEqual(before);
});
it("refuses cross-tenant job access, RLS writes, cross-job canonical links and runtime mutation", async () => {
  expect((await repo().view(otherContext, job)).documents).toEqual([]);
  await expect(repo().intake(otherContext, job, { version: "supplier-document-intake.v1", fixtureId: "materials-B-invoice", channel: "fixture_portal", expectedRevision: 0 })).rejects.toThrow("JOB_NOT_FOUND");
  const own = await repo().intake(otherContext, otherJob, { version: "supplier-document-intake.v1", fixtureId: "materials-B-invoice", channel: "fixture_portal", expectedRevision: 0 }); expect(own.documentId).not.toBe(originalId);
  const sameTenant = await repo().intake(context, sameTenantJob, { version: "supplier-document-intake.v1", fixtureId: "materials-B-invoice", channel: "fixture_portal", expectedRevision: 0 });
  await expect(withTenant(runtime, context, db => db.$client.query("INSERT INTO app.supplier_document(id,tenant_id,job_id,supplier_context,document_type,document_number,content_hash,status,canonical_document_id) VALUES($1,$2,$3,'fictional-merchant','invoice','WRONG-JOB',$4,'held',$5)", [randomUUID(), tenant, job, "d".repeat(64), sameTenant.documentId]))).rejects.toMatchObject({ code: "23503" });
  await expect(withTenant(runtime, context, db => db.$client.query("UPDATE app.supplier_document SET canonical_document_id=$1 WHERE tenant_id=$2", [originalId, tenant]))).rejects.toMatchObject({ code: "42501" });
  await expect(withTenant(runtime, context, db => db.$client.query("INSERT INTO app.supplier_document(id,tenant_id,job_id,supplier_context,document_type,document_number,content_hash,status,canonical_document_id) VALUES($1,$2,$3,'fictional-merchant','invoice','FOREIGN',$4,'held',$5)", [randomUUID(), tenant, job, "b".repeat(64), own.documentId]))).rejects.toMatchObject({ code: "23503" });
  await expect(withTenant(runtime, context, db => db.$client.query("INSERT INTO app.supplier_document(id,tenant_id,job_id,supplier_context,document_type,content_hash,status) VALUES($1,$2,$3,'fictional-merchant','invoice',$4,'held')", [randomUUID(), other, otherJob, "c".repeat(64)]))).rejects.toMatchObject({ code: "42501" });
});
it("retains the existing forced RLS, owner and append-only runtime privileges", async () => {
  const rows = (await admin.query(`SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,r.rolname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.oid=c.relowner WHERE n.nspname='app' AND c.relname IN('supplier_document','supplier_document_intake','supplier_document_version')`)).rows;
  expect(rows).toHaveLength(3); expect(rows.every(r => r.relrowsecurity && r.relforcerowsecurity && r.rolname === "jobguard_migration")).toBe(true);
  for (const table of ["supplier_document", "supplier_document_intake", "supplier_document_version"]) for (const privilege of ["UPDATE", "DELETE", "TRUNCATE"]) {
    expect((await admin.query("SELECT has_table_privilege('jobguard_runtime',$1,$2) allowed", [`app.${table}`, privilege])).rows[0].allowed).toBe(false);
  }
});
