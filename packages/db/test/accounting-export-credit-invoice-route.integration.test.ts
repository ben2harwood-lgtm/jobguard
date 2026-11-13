import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, expect, it } from "vitest";
import { cluster, type Cluster } from "./extra-fixtures.js";
import { meterCompany } from "./meter-persistence-fixtures.js";
import type { WorkFixture } from "./job-work-state-fixtures.js";
import { AccountingExportRepository } from "../src/accounting-export-repository.js";
import { pushStoredAccountingExport, FakeAccountingExportInbox } from "../../../apps/api/src/accounting-export.persisted.js";
import { FakeCodatAdapter } from "../../../apps/api/src/accounting-export.fake.js";
import { AccountingExportSandbox } from "../../../apps/api/src/accounting-export.sandbox.js";
import { ctx, scope, source, consent } from "../../../apps/api/src/accounting-export.test-fixtures.js";

let c: Cluster;
beforeAll(async () => { c = await cluster(); }, 240000);
afterAll(async () => { await c?.close(); });

async function setup() {
 const a = await meterCompany(c as unknown as WorkFixture), tenantId = `demo-${a.tenantId}`;
 const sc = { ...scope, tenantId, mapping: { ...scope.mapping, tenantId } };
 const adapter = new FakeCodatAdapter();
 const model = new AccountingExportSandbox(adapter, [{ ...source, tenantId }], [{ ...consent, tenantId }], true);
 const invoice = model.preview({ ...ctx, tenantId }, sc, 100).artifact;
 type Artifact = typeof invoice;
 const seed = async (artifact: Artifact) => {
  await c.admin.query(
   "INSERT INTO app.accounting_export_fixture(tenant_id,source_id,artifact,consent_expires_at) VALUES($1,$2,$3,clock_timestamp()+interval '1 hour')",
   [a.tenantId, artifact.source.sourceId, artifact]);
 };
 await seed(invoice);
 const repo = new AccountingExportRepository(c.runtime);
 const call = (id: string, op: Parameters<typeof repo.execute>[2], input: unknown = {}) =>
  repo.execute(a.context, a.digest, op, id, input);
 const approval = () => ({ version: 1, decisionId: randomUUID(),
  expiresAt: new Date(Date.now() + 600000).toISOString(), humanConfirmed: true });
 const approve = async (id: string) => {
  const preview = await call(id, "preview") as { previewHash: string };
  const input = { ...approval(), previewHash: preview.previewHash };
  return { input, result: await call(id, "approve", input) };
 };
 const inbox = new FakeAccountingExportInbox(c.admin, adapter);
 const push = (id: string) => pushStoredAccountingExport(repo, a.context, a.digest, id, inbox);
 const adjustment = (kind: "credit" | "receipt") => {
  const artifact = structuredClone(invoice), id = `demo-${kind}`;
  artifact.source = { ...artifact.source, sourceId: id, kind, state: "posted", amount: { pence: 40, currency: "GBP" },
   finalAccount: null, invoiceId: invoice.source.sourceId, invoiceRevision: invoice.source.revision };
  artifact.scope.sourceId = id;
  artifact.target = { ...artifact.target, sourceId: id, objectType: kind === "receipt" ? "payment" : "credit_note",
   amount: { pence: 40, currency: "GBP" }, invoiceId: invoice.source.sourceId, invoiceRevision: invoice.source.revision };
  return artifact;
 };
 const refuse = async (artifact: Artifact) => {
  await seed(artifact);
  // Submit an otherwise exact approval directly, so refusal proves the write boundary too.
  const hash = (await c.admin.query("SELECT app.final_lock_hash($1::jsonb) hash", [artifact])).rows[0].hash;
  await expect(call(artifact.source.sourceId, "approve", { ...approval(), previewHash: hash }))
   .rejects.toThrow("EXPORT_REFERENCE_CONFLICT");
  await expect(call(artifact.source.sourceId, "preview")).rejects.toThrow("EXPORT_REFERENCE_CONFLICT");
  for (const table of ["decision", "ledger", "outbox"]) {
   expect((await c.admin.query(`SELECT count(*)::int n FROM app.accounting_export_${table} WHERE tenant_id=$1 AND source_id=$2`,
    [a.tenantId, artifact.source.sourceId])).rows[0].n).toBe(0);
  }
 };
 return { a, tenantId, invoice, adapter, repo, seed, call, approve, push, adjustment, refuse };
}

async function switchedCredit(changedCustomer: boolean) {
 const f = await setup();
 await f.approve(f.invoice.source.sourceId);
 expect(await f.push(f.invoice.source.sourceId)).toMatchObject({ status: "pushed" });
 const next = structuredClone(f.invoice);
 next.scope.sourceId = next.source.sourceId = next.target.sourceId = "demo-inv2";
 next.route = "xero";
 next.connectionRevision = 2;
 if (changedCustomer) next.scope.mapping.customerId = next.target.customerId = "demo-customer-b";
 await f.seed(next);
 const request = { version: 1, scope: next.scope, from: "codat", to: "xero", connectionRevision: 2, consentRevision: 1 };
 const preview = await f.repo.routeChangePreview(f.a.context, f.a.digest, next.source.sourceId, request);
 await f.repo.routeChangeConfirm(f.a.context, f.a.digest, next.source.sourceId, {
  ...request, commandId: randomUUID(), decisionId: randomUUID(), previewHash: preview.previewHash,
  expiresAt: new Date(Date.now() + 600000).toISOString(), humanConfirmed: true,
  action: "accounting_export.route", status: "approved", tenantId: f.tenantId,
 });
 const credit = f.adjustment("credit");
 credit.route = next.route;
 credit.connectionRevision = next.connectionRevision;
 credit.scope.mapping = structuredClone(next.scope.mapping);
 credit.target.customerId = next.target.customerId;
 return { f, credit };
}

it.each([false, true])("refuses a credit on Xero for a Codat invoice after a second invoice authorizes the switch (changed customer %s)", async changedCustomer => {
 const { f, credit } = await switchedCredit(changedCustomer);
 await f.refuse(credit);
 expect(f.adapter.pushes).toBe(1);
});

it.each(["credit", "receipt"] as const)("refuses a %s mapped to another customer", async kind => {
 const f = await setup(), artifact = f.adjustment(kind);
 artifact.scope.mapping.customerId = artifact.target.customerId = "demo-other-customer";
 await f.refuse(artifact);
});

it.each(["credit", "receipt"] as const)("refuses a %s mapped to another company", async kind => {
 const f = await setup(), artifact = f.adjustment(kind);
 artifact.scope.companyId = artifact.scope.mapping.companyId = artifact.target.companyId = "demo-other-company";
 await f.refuse(artifact);
});

it("exports a matching invoice, credit and receipt once and replays the accepted credit result", async () => {
 const f = await setup();
 await f.approve(f.invoice.source.sourceId);
 await f.push(f.invoice.source.sourceId);
 for (const kind of ["credit", "receipt"] as const) {
  const artifact = f.adjustment(kind), id = artifact.source.sourceId;
  await f.seed(artifact);
  const accepted = await f.approve(id);
  expect(await f.call(id, "approve", accepted.input)).toEqual(accepted.result);
  const pushed = await f.push(id);
  expect(pushed).toMatchObject({ status: "pushed", attempts: 1 });
  expect(await f.push(id)).toEqual(pushed);
  expect(await f.call(id, "approve", accepted.input)).toEqual(pushed);
 }
 expect(f.adapter.pushes).toBe(3);
 for (const table of ["decision", "ledger", "outbox", "attempt"]) {
  expect((await c.admin.query(`SELECT count(*)::int n FROM app.accounting_export_${table} WHERE tenant_id=$1`,
   [f.a.tenantId])).rows[0].n).toBe(3);
 }
});


it("the route regression detects removal of the three conditions in a rolled-back scratch routine", async () => {
 const { f, credit } = await switchedCredit(false);
 await f.refuse(credit);
 const sql = readFileSync(new URL("../migrations/0693_accounting_export_credit_invoice_route.sql", import.meta.url), "utf8");
 const additions = `   OR invoice #> '{scope,companyId}' IS DISTINCT FROM f.artifact #> '{scope,companyId}'
   OR invoice #> '{scope,mapping,customerId}' IS DISTINCT FROM f.artifact #> '{scope,mapping,customerId}'
   OR EXISTS(SELECT 1 FROM app.accounting_export_ledger WHERE tenant_id=t
    AND source_id=f.artifact #>> '{source,invoiceId}'
    AND artifact->'route' IS DISTINCT FROM f.artifact->'route')
`;
 expect(sql).toContain(additions);
 const scratch = sql.replace(additions, "").replace(/^BEGIN;\n/, "").replace(/COMMIT;\n$/, "");
 const db = await c.admin.connect();
 try {
  await db.query("BEGIN");
  await db.query(scratch);
  await db.query("SELECT set_config('app.tenant_id',$1,true)", [f.a.tenantId]);
  const preview = (await db.query("SELECT app.accounting_export($1,$2,'preview',$3,'{}') result",
   [f.a.tenantId, f.a.digest, credit.source.sourceId])).rows[0].result;
  const approval = { version: 1, decisionId: randomUUID(), previewHash: preview.previewHash,
   expiresAt: new Date(Date.now() + 600000).toISOString(), humanConfirmed: true };
  // With the checks removed, the same approval wrongly creates a ledger entry.
  expect((await db.query("SELECT app.accounting_export($1,$2,'approve',$3,$4::jsonb) result",
   [f.a.tenantId, f.a.digest, credit.source.sourceId, approval])).rows[0].result).toMatchObject({ status: "pending" });
  expect((await db.query("SELECT count(*)::int n FROM app.accounting_export_ledger WHERE tenant_id=$1 AND source_id=$2",
   [f.a.tenantId, credit.source.sourceId])).rows[0].n).toBe(1);
 } finally {
  await db.query("ROLLBACK");
  db.release();
 }
 await expect(f.call(credit.source.sourceId, "preview")).rejects.toThrow("EXPORT_REFERENCE_CONFLICT");
});
