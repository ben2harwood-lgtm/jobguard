import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { cluster, type Cluster } from "./extra-fixtures.js";
import { meterCompany } from "./meter-persistence-fixtures.js";
import { workTenant, type WorkFixture } from "./job-work-state-fixtures.js";
import { AccountingExportRepository, storedAccountingExportV1 } from "../src/accounting-export-repository.js";
import { pushStoredAccountingExport, FakeAccountingExportInbox } from "../../../apps/api/src/accounting-export.persisted.js";
import { FakeCodatAdapter } from "../../../apps/api/src/accounting-export.fake.js";
import { AccountingExportSandbox } from "../../../apps/api/src/accounting-export.sandbox.js";
import { ctx, scope, source, consent } from "../../../apps/api/src/accounting-export.test-fixtures.js";
import { readFileSync } from "node:fs";

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
 const inbox = new FakeAccountingExportInbox(c.admin, adapter);
 const push = () => pushStoredAccountingExport(new AccountingExportRepository(c.runtime), a.context, a.digest, source.sourceId, inbox);
 return { a, adapter, repo, artifact, call, approval, push, inbox };
}

async function attempted(expiring = false, observe = true) {
 const f = await setup();
 if (expiring) {
  f.approval.expiresAt = (await c.admin.query("SELECT clock_timestamp()+interval '3 seconds' expiry")).rows[0].expiry.toISOString();
 }
 await f.call("approve", f.approval);
 const entry = storedAccountingExportV1.parse(await f.call("claim", { version: 1, attemptId: randomUUID() }));
 // The committed claim precedes the sole fake adapter call, as in the existing executor.
 f.adapter.push(entry.reference, entry.previewHash, entry.artifact.target, { tenantId: `demo-${f.a.tenantId}`, companyId: f.artifact.scope.companyId });
 if (observe) await f.inbox.observe(f.a.context, entry);
 return { ...f, entry, input: { version: 1, attemptId: entry.attemptId } };
}
async function expire(f: Awaited<ReturnType<typeof attempted>>) {
 await c.admin.query("SELECT pg_sleep(greatest(0,extract(epoch FROM ($1::timestamptz-clock_timestamp())))+0.02)", [f.approval.expiresAt]);
}
async function immutable(tenant: string) {
 return (await c.admin.query(`SELECT
  (SELECT row_to_json(d)::text FROM app.accounting_export_decision d WHERE tenant_id=$1) decision,
  (SELECT row_to_json(l)::text FROM app.accounting_export_ledger l WHERE tenant_id=$1) ledger,
  (SELECT jsonb_agg(a ORDER BY id)::text FROM app.accounting_export_attempt a WHERE tenant_id=$1) attempts`, [tenant])).rows[0];
}
async function successor(f: Awaited<ReturnType<typeof attempted>>, role: "owner" | "admin") {
 const other = await meterCompany(c as unknown as WorkFixture, f.a.tenantId);
 await c.admin.query("UPDATE app.membership SET role=$2 WHERE id=$1", [other.actorId, role]);
 await c.admin.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE id=$1", [f.a.actorId]);
 const call = (op: "read" | "reconcile" | "claim" | "approve", input: unknown = {}) =>
  f.repo.execute(other.context, other.digest, op, source.sourceId, input);
 return { other, call };
}
it("reconciles the exact persisted observation after natural Decision expiry without a second send", async () => {
 const f = await attempted(true), before = await immutable(f.a.tenantId);
 await expire(f);
 expect(await f.call("reconcile", f.input)).toMatchObject({ status: "pushed", attempts: 1, qualifyingRecoveryProof: false });
 expect(await f.call("reconcile", f.input)).toEqual(await f.call("read"));
 expect(await f.push()).toMatchObject({ status: "pushed", attempts: 1 });
 expect(f.adapter.pushes).toBe(1);
 expect(await immutable(f.a.tenantId)).toEqual(before);
 await expect(f.call("claim", { version: 1, attemptId: randomUUID() })).rejects.toThrow("EXPORT_APPROVAL_REQUIRED");
});
it.each(["owner", "admin"] as const)("a current %s observes the departed approver's attempt without replacing authorization", async role => {
 const f = await attempted(), before = await immutable(f.a.tenantId), next = await successor(f, role);
 expect(await next.call("read")).toMatchObject({ attemptId: f.entry.attemptId, attempts: 1 });
 expect(await next.call("reconcile", f.input)).toMatchObject({ status: "pushed", attempts: 1, qualifyingRecoveryProof: false });
 expect(await next.call("reconcile", f.input)).toEqual(await next.call("read"));
 await expect(next.call("claim", { version: 1, attemptId: randomUUID() })).rejects.toThrow("EXPORT_NOT_FOUND");
 await expect(next.call("approve", f.approval)).rejects.toThrow("EXPORT_REPLAY_CONFLICT");
 await expect(f.call("read")).rejects.toThrow("EXPORT_FORBIDDEN");
 await expect(f.call("reconcile", f.input)).rejects.toThrow("EXPORT_FORBIDDEN");
 expect(await immutable(f.a.tenantId)).toEqual(before);
 const events = (await c.admin.query("SELECT actor_ref,payload FROM app.audit_event WHERE tenant_id=$1 AND event_type='accounting_export.reconcile'", [f.a.tenantId])).rows;
 expect(events).toHaveLength(2);
 for (const e of events) {
  expect(e.actor_ref).toBe(`membership:${next.other.actorId}`);
  expect(e.payload.references.commandId).toBe(f.entry.attemptId);
 }
 expect(f.adapter.pushes).toBe(1);
});
it("keeps unattempted reads and claims actor-bound, and expired approval cannot start work", async () => {
 const f = await setup();
 f.approval.expiresAt = (await c.admin.query("SELECT clock_timestamp()+interval '2 seconds' expiry")).rows[0].expiry.toISOString();
 await f.call("approve", f.approval);
 const other = await meterCompany(c as unknown as WorkFixture, f.a.tenantId);
 for (const op of ["read", "claim", "reconcile"] as const) {
  await expect(f.repo.execute(other.context, other.digest, op, source.sourceId,
   op === "read" ? {} : { version: 1, attemptId: randomUUID() })).rejects.toThrow("EXPORT_NOT_FOUND");
 }
 await c.admin.query("SELECT pg_sleep(greatest(0,extract(epoch FROM ($1::timestamptz-clock_timestamp())))+0.02)", [f.approval.expiresAt]);
 await expect(f.call("claim", { version: 1, attemptId: randomUUID() })).rejects.toThrow("EXPORT_APPROVAL_REQUIRED");
 expect(await f.call("read")).toMatchObject({ status: "pending", attempts: 0, attemptId: null });
 expect(f.adapter.pushes).toBe(0);
});
it.each(["session_expired", "session_revoked", "member_revoked", "member_expired", "member_role", "other_tenant"])("refuses a successor with %s before any writes", async reason => {
 const f = await attempted(), next = await successor(f, "admin"), before = await immutable(f.a.tenantId);
 if (reason === "session_expired") await c.admin.query("UPDATE identity.session SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", [next.other.sessionId]);
 if (reason === "session_revoked") await c.admin.query("UPDATE identity.session SET revoked_at=clock_timestamp() WHERE id=$1", [next.other.sessionId]);
 if (reason === "member_revoked") await c.admin.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE id=$1", [next.other.actorId]);
 if (reason === "member_expired") await c.admin.query("UPDATE app.membership SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", [next.other.actorId]);
 if (reason === "member_role") await c.admin.query("UPDATE app.membership SET role='member' WHERE id=$1", [next.other.actorId]);
 const call = reason === "other_tenant" ? async (op: "read" | "reconcile", input: unknown = {}) => {
  const other = await meterCompany(c as unknown as WorkFixture);
  return f.repo.execute(other.context, next.other.digest, op, source.sourceId, input);
 } : next.call;
 await expect(call("read")).rejects.toThrow("EXPORT_FORBIDDEN");
 await expect(call("reconcile", f.input)).rejects.toThrow("EXPORT_FORBIDDEN");
 expect(await immutable(f.a.tenantId)).toEqual(before);
 expect((await c.admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND event_type='accounting_export.reconcile'", [f.a.tenantId])).rows[0].n).toBe(0);
});
it.each([false, true])("missing or forged request binding (forged %s) cannot observe an attempt", async forged => {
 const f = await attempted(), before = await immutable(f.a.tenantId);
 await expect(workTenant(c.runtime, f.a.tenantId, async db => {
  if (forged) await db.query("SELECT set_config('app.actor_id',$1,true)", [f.a.actorId]);
  return db.query("SELECT app.accounting_export($1,$2,'reconcile',$3,$4)", [f.a.tenantId, f.a.digest, source.sourceId, f.input]);
 }, { bindRequest: false })).rejects.toThrow();
 expect(await immutable(f.a.tenantId)).toEqual(before);
});
it.each(["consent_expired", "consent_revoked", "stale_artifact", "wrong_attempt", "wrong_source", "missing_observation"])("keeps the %s refusal for an attempted export", async reason => {
 const f = await attempted(true, reason !== "missing_observation");
 await expire(f);
 if (reason === "consent_expired") await c.admin.query("UPDATE app.accounting_export_fixture SET consent_expires_at=clock_timestamp()-interval '1 second' WHERE tenant_id=$1", [f.a.tenantId]);
 if (reason === "consent_revoked") await c.admin.query("UPDATE app.accounting_export_fixture SET revoked=true WHERE tenant_id=$1", [f.a.tenantId]);
 if (reason === "stale_artifact") await c.admin.query("UPDATE app.accounting_export_fixture SET artifact=jsonb_set(artifact,'{scope,mapping,revision}','2') WHERE tenant_id=$1", [f.a.tenantId]);
 if (reason === "wrong_attempt") f.input.attemptId = randomUUID();
 const errors: Record<string, string> = { consent_expired: "EXPORT_CONSENT_EXPIRED", consent_revoked: "EXPORT_CONSENT_EXPIRED", stale_artifact: "EXPORT_STALE_REVISION", wrong_attempt: "EXPORT_REPLAY_CONFLICT", wrong_source: "EXPORT_NOT_FOUND", missing_observation: "EXPORT_OBSERVATION_REQUIRED" };
 await expect(f.repo.execute(f.a.context, f.a.digest, "reconcile", reason === "wrong_source" ? "demo-missing" : source.sourceId, f.input)).rejects.toThrow(errors[reason]);
 expect(f.adapter.pushes).toBe(1);
});
it("restored scratch mutation removing only the exception strands expiry and successor regressions", async () => {
 const expired = await attempted(true), departed = await attempted(), next = await successor(departed, "owner");
 await expire(expired);
 const sql = readFileSync(new URL("../migrations/0751_accounting_export_attempt_reconciliation.sql", import.meta.url), "utf8");
 const mutant = sql.replace("observe_existing:=operation IN('read','reconcile')", "observe_existing:=false AND operation IN('read','reconcile')")
  .replace(/^BEGIN;\n/, "").replace(/COMMIT;\n$/, "");
 expect(mutant).not.toBe(sql);
 const db = await c.admin.connect();
 try {
  await db.query("BEGIN"); await db.query(mutant);
  // Each expected database refusal gets its own savepoint; retain the scratch routine.
  for (const [actor, input, error] of [[expired.a, expired.input, "EXPORT_APPROVAL_REQUIRED"], [next.other, departed.input, "EXPORT_NOT_FOUND"]] as const) {
   await db.query("SAVEPOINT refusal");
   await db.query("SELECT set_config('app.tenant_id',$1,true)", [actor.tenantId]);
   await db.query("SELECT app.bind_request('real',$1,$2)", [actor.digest, actor.tenantId]);
   await expect(db.query("SELECT app.accounting_export($1,$2,'reconcile',$3,$4)", [actor.tenantId, actor.digest, source.sourceId, input])).rejects.toThrow(error);
   await db.query("ROLLBACK TO SAVEPOINT refusal");
  }
 } finally { await db.query("ROLLBACK"); db.release(); }
 expect(await expired.call("reconcile", expired.input)).toMatchObject({ status: "pushed", attempts: 1 });
 expect(await next.call("reconcile", departed.input)).toMatchObject({ status: "pushed", attempts: 1 });
});

it.each(["paid", "content_hash", "reference", "external_edit", "duplicate_import", "confirmed_absent"])("expired approval preserves the %s observation outcome", async mode => {
 const f = await attempted(true, false);
 if (mode === "paid") f.adapter.objects[0]!.paid = true;
 if (mode === "content_hash") f.adapter.objects[0]!.contentHash = "0".repeat(64);
 if (mode === "external_edit") f.adapter.objects[0]!.payload.amount.pence++;
 if (mode === "duplicate_import") f.adapter.objects.push({ ...f.adapter.objects[0]!, id: "demo-duplicate" });
 if (mode === "confirmed_absent") f.adapter.objects.length = 0;
 if (mode === "reference") {
  // Administrative validated inbox fixture; runtime cannot supply provider facts.
  const match = { ...f.adapter.objects[0]!, reference: "0".repeat(64) };
  await c.admin.query("INSERT INTO app.accounting_export_inbox(tenant_id,id,attempt_id,matches) VALUES($1,$2,$3,$4)", [f.a.tenantId, randomUUID(), f.entry.attemptId, JSON.stringify([match])]);
 } else await f.inbox.observe(f.a.context, f.entry);
 await expire(f);
 const status = { paid: "pushed", content_hash: "external_edit", reference: "reference_conflict", external_edit: "external_edit", duplicate_import: "duplicate_import", confirmed_absent: "confirmed_absent" }[mode];
 expect(await f.call("reconcile", f.input)).toMatchObject({ status, attempts: 1, qualifyingRecoveryProof: false });
 expect(await f.call("reconcile", f.input)).toMatchObject({ status, attempts: 1, qualifyingRecoveryProof: false });
 expect(f.adapter.pushes).toBe(1);
});
