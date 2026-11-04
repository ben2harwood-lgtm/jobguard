import { createHash, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { cluster, type Cluster } from "./extra-fixtures.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { migrate } from "../src/migrate.js";
import { withTenant } from "../src/tenant-context.js";
import { AccountingObservationReceiptRepository } from "../src/accounting-observation-receipt-repository.js";
import { FakeAccountingObservationEmitter } from "../../../apps/api/src/accounting-observation-connector.js";
let c: Cluster, shadow: Pool;
const tenantId = randomUUID(), otherTenant = randomUUID(), jobId = randomUUID();
const context = testTenantContext(tenantId);
const text = "Fictional outside tap";
const observation = () => ({ version: "observation.v1", tenantId, jobId, kind: "supplier_line",
 evidence: { id: randomUUID(), objectVersionId: "synthetic-v1", sha256: createHash("sha256").update(text).digest("hex"), serverReceivedAt: "2026-10-30T12:00:00Z" },
 text, citations: [{ start: 0, end: text.length, quote: text }],
 facts: { workReference: "tap", scopeArea: "job", description: text, status: "unknown", estimatedValuePence: null,
 safetyImplication: false, customerClearlyRequested: false, needsPriorWrittenAgreement: false, significantWork: null,
 activeDispute: false, silenceMateriallyWorsensDispute: false, disclosureDuty: false } });
const batch = (observations: unknown[]) => ({ version: "fake-accounting-observations.v1", environment: "synthetic_demo", observations });
const emitter = () => new FakeAccountingObservationEmitter(new AccountingObservationReceiptRepository(shadow));
beforeAll(async () => {
 c = await cluster();
 for (const t of [tenantId, otherTenant]) {
  await c.admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [t]);
  await c.admin.query("INSERT INTO app.job(tenant_id,id,title,status) VALUES($1,$2,'Fictional accounting job','live')", [t, jobId]);
 }
 await c.admin.query("CREATE ROLE accounting_test_shadow LOGIN PASSWORD 'synthetic' NOSUPERUSER NOBYPASSRLS; GRANT jobguard_shadow TO accounting_test_shadow");
 shadow = new Pool({ ...c.admin.options, user: "accounting_test_shadow", max: 2 });
}, 120000);
afterAll(async () => { await shadow?.end(); await c?.close(); });
it("separate runs and fresh pool connections emit one observation; new version emits again", async () => {
 const o = observation(), scope = { tenantId, jobId };
 expect(await emitter().emit(context, scope, batch([o]))).toHaveLength(1);
 const fresh = new Pool({ ...c.admin.options, user: "accounting_test_shadow", max: 1 });
 try {
  const restarted = new FakeAccountingObservationEmitter(new AccountingObservationReceiptRepository(fresh));
  expect(await restarted.emit(context, scope, batch([o]))).toEqual([]);
  expect(await restarted.emit(context, scope, batch([{ ...o, evidence: { ...o.evidence, objectVersionId: "synthetic-v2" } }]))).toHaveLength(1);
 } finally { await fresh.end(); }
});
it("identical evidence/version/job IDs do not collide across tenants", async () => {
 const o = observation();
 expect(await emitter().emit(context, { tenantId, jobId }, batch([o]))).toHaveLength(1);
 expect(await emitter().emit(testTenantContext(otherTenant), { tenantId: otherTenant, jobId }, batch([{ ...o, tenantId: otherTenant }]))).toHaveLength(1);
});
it("concurrent runs emit once", async () => {
 const o = observation();
 const results = await Promise.all([emitter(), emitter()].map(e => e.emit(context, { tenantId, jobId }, batch([o]))));
 expect(results.flat()).toHaveLength(1);
});
it("conflicting replay rolls back every new receipt in its batch", async () => {
 const o = observation(), next = observation(), scope = { tenantId, jobId };
 await emitter().emit(context, scope, batch([o]));
 await expect(emitter().emit(context, scope, batch([next, { ...o, facts: { ...o.facts, status: "completed" } }]))).rejects.toThrow("ACCOUNTING_VERSION_CONFLICT");
 expect(await emitter().emit(context, scope, batch([next]))).toHaveLength(1);
});
it("binding and validation failures leave no receipts", async () => {
 const o = observation();
 await expect(emitter().emit(testTenantContext(otherTenant), { tenantId, jobId }, batch([o]))).rejects.toThrow("ACCOUNTING_BINDING_MISMATCH");
 await expect(emitter().emit(context, { tenantId, jobId }, batch([o, { ...o, tenantId: otherTenant }]))).rejects.toThrow("ACCOUNTING_BINDING_MISMATCH");
 expect(await emitter().emit(context, { tenantId, jobId }, batch([o]))).toHaveLength(1);
});
it("runtime cannot read or mutate receipts; shadow is tenant isolated and append only", async () => {
 for (const sql of ["SELECT * FROM app.accounting_observation_receipt", "INSERT INTO app.accounting_observation_receipt DEFAULT VALUES", "UPDATE app.accounting_observation_receipt SET job_id=job_id", "DELETE FROM app.accounting_observation_receipt", "TRUNCATE app.accounting_observation_receipt"])
  await expect(c.runtime.query(sql)).rejects.toMatchObject({ code: "42501" });
 expect((await shadow.query("SELECT * FROM app.accounting_observation_receipt")).rows).toEqual([]);
 await withTenant(shadow, context, async db => {
  expect((await db.$client.query("SELECT * FROM app.accounting_observation_receipt WHERE tenant_id=$1", [otherTenant])).rows).toEqual([]);
 });
 for (const sql of ["UPDATE app.accounting_observation_receipt SET job_id=job_id", "DELETE FROM app.accounting_observation_receipt", "TRUNCATE app.accounting_observation_receipt"])
  await expect(shadow.query(sql)).rejects.toMatchObject({ code: "42501" });
});

it("migration replay retains receipts and enforces tenant-qualified job references", async () => {
 const o = observation();
 await emitter().emit(context, { tenantId, jobId }, batch([o]));
 await migrate(c.admin);
 expect(await emitter().emit(context, { tenantId, jobId }, batch([o]))).toEqual([]);
 const missingJob = randomUUID();
 await expect(emitter().emit(context, { tenantId, jobId: missingJob }, batch([{ ...observation(), jobId: missingJob }]))).rejects.toMatchObject({ code: "23503" });
});
