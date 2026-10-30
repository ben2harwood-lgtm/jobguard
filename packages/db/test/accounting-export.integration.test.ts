import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { cluster, type Cluster } from "./extra-fixtures.js";
import { meterCompany } from "./meter-persistence-fixtures.js";
import { workTenant, type WorkFixture } from "./job-work-state-fixtures.js";
import { AccountingExportRepository, storedAccountingExportV1 } from "../src/accounting-export-repository.js";
import { pushStoredAccountingExport } from "../../../apps/api/src/accounting-export.persisted.js";
import { FakeCodatAdapter } from "../../../apps/api/src/accounting-export.fake.js";
import { AccountingExportSandbox } from "../../../apps/api/src/accounting-export.sandbox.js";
import { ctx, scope, source, consent } from "../../../apps/api/src/accounting-export.test-fixtures.js";
import { migrate } from "../src/migrate.js";

let c: Cluster;
beforeAll(async () => { c = await cluster(); }, 240000);
afterAll(async () => { await c?.close(); });
async function setup() {
 const a = await meterCompany(c as unknown as WorkFixture), tenantId = `demo-${a.tenantId}`;
 const sc = { ...scope, tenantId, mapping: { ...scope.mapping, tenantId } };
 const adapter = new FakeCodatAdapter();
 const model = new AccountingExportSandbox(adapter, [{ ...source, tenantId }], [{ ...consent, tenantId }], true);
 const artifact = model.preview({ ...ctx, tenantId }, sc, 100).artifact;
 await c.admin.query("INSERT INTO app.accounting_export_fixture(tenant_id,source_id,artifact,consent_expires_at) VALUES($1,$2,$3,clock_timestamp()+interval '1 hour')", [a.tenantId, source.sourceId, artifact]);
 const repo = new AccountingExportRepository(c.runtime);
 const call = (op: Parameters<typeof repo.execute>[2], input: unknown = {}) => repo.execute(a.context, a.digest, op, source.sourceId, input);
 const preview = await call("preview") as { previewHash: string };
 const approval = { version: 1, decisionId: randomUUID(), previewHash: preview.previewHash, expiresAt: new Date(Date.now() + 600000).toISOString(), humanConfirmed: true };
 const push = () => pushStoredAccountingExport(new AccountingExportRepository(c.runtime), a.context, a.digest, source.sourceId, adapter);
 return { a, adapter, repo, artifact, call, approval, push };
}
it("one document persists once across concurrent approvals, retries and repository restart", async () => {
 const f = await setup();
 const results = await Promise.all([f.call("approve", f.approval), f.call("approve", f.approval)]);
 expect(results[0]).toEqual(results[1]);
 expect(await f.push()).toMatchObject({ status: "pushed", attempts: 1 });
 expect(await f.push()).toMatchObject({ status: "pushed", attempts: 1 });
 expect(f.adapter.pushes).toBe(1);
 for (const table of ["decision", "ledger", "outbox", "attempt"]) {
  expect((await c.admin.query(`SELECT count(*)::int n FROM app.accounting_export_${table} WHERE tenant_id=$1`, [f.a.tenantId])).rows[0].n).toBe(1);
 }
 const before = await f.call("read"); await migrate(c.admin); await migrate(c.admin);
 expect(await f.call("read")).toEqual(before);
});
it.each(["unknown_before", "unknown_after"] as const)("%s reconciles after restart before any recreate", async mode => {
 const f = await setup(); await f.call("approve", f.approval); f.adapter.next = mode;
 expect(await f.push()).toMatchObject({ status: "outcome_unknown" });
 expect(await f.push()).toMatchObject({ status: mode === "unknown_after" ? "pushed" : "confirmed_absent" });
 expect(f.adapter.pushes).toBe(1);
 expect(await f.push()).toMatchObject({ status: mode === "unknown_after" ? "pushed" : "confirmed_absent" });
 expect(f.adapter.pushes).toBe(1);
});
it("a racing or abandoned claim cannot execute twice; stale attempts cannot overwrite current work", async () => {
 const f = await setup(); await f.call("approve", f.approval);
 const attemptId = randomUUID();
 const results = await Promise.allSettled([f.call("claim", { version: 1, attemptId }), f.call("claim", { version: 1, attemptId: randomUUID() })]);
 expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
 const entry = storedAccountingExportV1.parse(await f.call("read"));
 await f.call("reconcile", { version: 1, attemptId: entry.attemptId, matches: [] });
 await expect(f.call("claim", { version: 1, attemptId: randomUUID() })).rejects.toThrow("EXPORT_RECONCILE_REQUIRED");
 await expect(f.call("reconcile", { version: 1, attemptId: randomUUID(), matches: [] })).rejects.toThrow("EXPORT_REPLAY_CONFLICT");
 expect(f.adapter.pushes).toBe(0);
});
it("changed company, mapping or source revision invalidates an approval and never rewrites history", async () => {
 for (const field of ["company", "mapping", "source"]) {
  const f = await setup(); await f.call("approve", f.approval);
  const changed = structuredClone(f.artifact);
  if (field === "company") { changed.scope.companyId = "demo-other-company"; changed.scope.mapping.companyId = "demo-other-company"; changed.target.companyId = "demo-other-company"; }
  else if (field === "mapping") changed.scope.mapping.revision++;
  else { changed.source.revision++; changed.scope.sourceRevision++; changed.target.sourceRevision++; }
  await c.admin.query("UPDATE app.accounting_export_fixture SET artifact=$2 WHERE tenant_id=$1", [f.a.tenantId, changed]);
  await expect(f.call("approve", f.approval)).rejects.toThrow("EXPORT_APPROVAL_REQUIRED");
  await expect(f.call("claim", { version: 1, attemptId: randomUUID() })).rejects.toThrow("EXPORT_STALE_REVISION");
  expect((await c.admin.query("SELECT artifact FROM app.accounting_export_ledger WHERE tenant_id=$1", [f.a.tenantId])).rows[0].artifact).toEqual(f.artifact);
 }
});
it("wrong company sessions, missing context, revoked sessions and expired consent fail before replay", async () => {
 const f = await setup(), other = await setup(); await f.call("approve", f.approval);
 await expect(f.repo.execute(other.a.context, f.a.digest, "read", source.sourceId)).rejects.toThrow("EXPORT_FORBIDDEN");
 await expect(f.repo.execute(other.a.context, other.a.digest, "approve", source.sourceId, f.approval)).rejects.toThrow("EXPORT_APPROVAL_REQUIRED");
 await expect(c.runtime.query("SELECT app.accounting_export($1,$2,'read',$3,'{}')", [f.a.tenantId, f.a.digest, source.sourceId])).rejects.toThrow();
 await c.admin.query("UPDATE app.accounting_export_fixture SET revoked=true WHERE tenant_id=$1", [f.a.tenantId]);
 await expect(f.call("approve", f.approval)).rejects.toThrow("EXPORT_CONSENT_EXPIRED");
 await c.admin.query("UPDATE identity.session SET revoked_at=clock_timestamp() WHERE id=$1", [other.a.sessionId]);
 await expect(other.call("read")).rejects.toThrow("EXPORT_FORBIDDEN");
});
it("external paid never becomes proof, external edits and duplicate imports require reconciliation", async () => {
 const f = await setup(); await f.call("approve", f.approval); await f.push();
 f.adapter.objects[0]!.paid = true;
 const entry = storedAccountingExportV1.parse(await f.call("read"));
 const reconcile = () => f.call("reconcile", { version: 1, attemptId: entry.attemptId, matches: f.adapter.objects });
 expect(await reconcile()).toMatchObject({ status: "pushed", qualifyingRecoveryProof: false });
 f.adapter.objects[0]!.payload.amount.pence++;
 expect(await reconcile()).toMatchObject({ status: "external_edit", qualifyingRecoveryProof: false });
 f.adapter.objects.push({ ...f.adapter.objects[0]!, id: "demo-duplicate" });
 expect(await reconcile()).toMatchObject({ status: "duplicate_import", qualifyingRecoveryProof: false });
 await expect(f.call("claim", { version: 1, attemptId: randomUUID() })).rejects.toThrow("EXPORT_RECONCILE_REQUIRED");
});
it("tables deny all runtime writes and reads, force RLS and preserve immutable records", async () => {
 const f = await setup(); await f.call("approve", f.approval);
 for (const name of ["fixture", "decision", "ledger", "outbox", "attempt"]) {
  const table = `app.accounting_export_${name}`;
  expect((await c.admin.query("SELECT relrowsecurity,relforcerowsecurity,has_table_privilege('jobguard_runtime',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') allowed FROM pg_class WHERE oid=$1::regclass", [table])).rows[0]).toEqual({ relrowsecurity: true, relforcerowsecurity: true, allowed: false });
  await expect(workTenant(c.runtime, f.a.tenantId, db => db.query(`SELECT * FROM ${table}`))).rejects.toMatchObject({ code: "42501" });
 }
 await expect(c.admin.query("UPDATE app.accounting_export_ledger SET company_id='demo-other' WHERE tenant_id=$1", [f.a.tenantId])).rejects.toThrow("EXPORT_IMMUTABLE");
 expect((await c.runtime.query("SELECT nullif(current_setting('app.tenant_id',true),'') tenant")).rows[0].tenant).toBeNull();
});
it("same-company different actor cannot reuse a Decision; decision expiry prevents claim", async () => {
 const f = await setup(); await f.call("approve", f.approval);
 const other = await meterCompany(c as unknown as WorkFixture, f.a.tenantId);
 await expect(f.repo.execute(other.context, other.digest, "read", source.sourceId)).rejects.toThrow("EXPORT_NOT_FOUND");
 await expect(f.repo.execute(other.context, other.digest, "approve", source.sourceId, f.approval)).rejects.toThrow("EXPORT_REPLAY_CONFLICT");
 const expired = await setup();
 await expect(expired.call("approve", { ...expired.approval, expiresAt: "2020-01-01T00:00:00.000Z" })).rejects.toThrow("EXPORT_APPROVAL_REQUIRED");
 await expect(expired.call("claim", { version: 1, attemptId: randomUUID() })).rejects.toThrow("EXPORT_NOT_FOUND");
});
it("unlocked final-account fixtures are refused; combined receipt/credit reservations cannot exceed the invoice", async () => {
 const unlocked = await setup(), changed = structuredClone(unlocked.artifact);
 changed.source.finalAccount = { revision: 3, lockedRevision: 2 };
 await c.admin.query("UPDATE app.accounting_export_fixture SET artifact=$2 WHERE tenant_id=$1", [unlocked.a.tenantId, changed]);
 await expect(unlocked.call("approve", unlocked.approval)).rejects.toThrow("EXPORT_STALE_REVISION");
 const f = await setup();
 for (const kind of ["receipt", "credit"] as const) {
  const artifact = structuredClone(f.artifact), id = `demo-adjustment-${kind}`;
  artifact.source = { ...artifact.source, sourceId: id, kind, state: "posted", amount: { pence: 60, currency: "GBP" },
   finalAccount: null, invoiceId: source.sourceId, invoiceRevision: 1 };
  artifact.scope.sourceId = id;
  artifact.target = { ...artifact.target, sourceId: id, objectType: kind === "receipt" ? "payment" : "credit_note",
   amount: { pence: 60, currency: "GBP" }, invoiceId: source.sourceId, invoiceRevision: 1 };
  await c.admin.query("INSERT INTO app.accounting_export_fixture(tenant_id,source_id,artifact,consent_expires_at) VALUES($1,$2,$3,clock_timestamp()+interval '1 hour')", [f.a.tenantId, id, artifact]);
  const run = (op: "preview" | "approve", v: unknown = {}) => f.repo.execute(f.a.context, f.a.digest, op, id, v);
  if (kind === "credit") await expect(run("preview")).rejects.toThrow("EXPORT_REFERENCE_CONFLICT");
  else {
   const preview = await run("preview") as { previewHash: string };
   await run("approve", { ...f.approval, decisionId: randomUUID(), previewHash: preview.previewHash });
  }
 }
});
