import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { cluster, type Cluster } from "./extra-fixtures.js";
import { meterCompany } from "./meter-persistence-fixtures.js";
import { workTenant, type WorkFixture } from "./job-work-state-fixtures.js";
import { AccountingExportRepository, storedAccountingExportV1 } from "../src/accounting-export-repository.js";
import { AccountingExportSandbox } from "../../../apps/api/src/accounting-export.sandbox.js";
import { FakeCodatAdapter } from "../../../apps/api/src/accounting-export.fake.js";
import { ctx, scope, source, consent } from "../../../apps/api/src/accounting-export.test-fixtures.js";
import { startBeforeMigration, applyMigration } from "./contractor-practice-session-fixtures.js";
import { proofBefore, proofDifferences } from "./upgrade-proof-utils.js";
import { migrate } from "../src/migrate.js";

let c: Cluster;
beforeAll(async () => { c = await cluster(); }, 240000);
afterAll(async () => { await c?.close(); });
async function setup(db: Cluster = c) {
 const a = await meterCompany(db as unknown as WorkFixture), tenantId = `demo-${a.tenantId}`;
 const sc = { ...scope, tenantId, mapping: { ...scope.mapping, tenantId } };
 const old = new AccountingExportSandbox(new FakeCodatAdapter(), [{ ...source, tenantId }], [{ ...consent, tenantId }], true)
  .preview({ ...ctx, tenantId }, sc, 100).artifact;
 const next = structuredClone(old);
 next.route = "xero"; next.connectionRevision = 2; next.scope.sourceId = "demo-next";
 next.source.sourceId = "demo-next"; next.target.sourceId = "demo-next";
 next.scope.mapping.revision++; next.scope.mapping.accountId = "demo-new-account"; next.target.accountId = "demo-new-account";
 for (const artifact of [old, next]) await db.admin.query(
  "INSERT INTO app.accounting_export_fixture(tenant_id,source_id,artifact,consent_expires_at) VALUES($1,$2,$3,clock_timestamp()+interval '1 hour')",
  [a.tenantId, artifact.source.sourceId, artifact]);
 const repo = new AccountingExportRepository(db.runtime);
 const call = (op: Parameters<typeof repo.execute>[2], id = old.source.sourceId, input: unknown = {}) => repo.execute(a.context, a.digest, op, id, input);
 const approve = async (id: string, decisionId = randomUUID()) => {
  const preview = await call("preview", id) as { previewHash: string };
  return call("approve", id, { version: 1, decisionId, previewHash: preview.previewHash,
   expiresAt: new Date(Date.now() + 600000).toISOString(), humanConfirmed: true });
 };
 const push = async (id: string) => {
  const attemptId = randomUUID();
  const entry = storedAccountingExportV1.parse(await call("claim", id, { version: 1, attemptId }));
  await db.admin.query("INSERT INTO app.accounting_export_inbox(tenant_id,id,attempt_id,matches) VALUES($1,$2,$3,$4)",
   [a.tenantId, randomUUID(), attemptId, JSON.stringify([{ id: `demo-external-${id}`, tenantId, reference: entry.reference,
    contentHash: entry.previewHash, payload: entry.artifact.target }])]);
  return call("reconcile", id, { version: 1, attemptId });
 };
 await approve(old.source.sourceId); await push(old.source.sourceId);
 const request = { version: 1, scope: next.scope, from: "codat", to: "xero", connectionRevision: 2, consentRevision: 1 };
 const preview = () => repo.routeChangePreview(a.context, a.digest, next.source.sourceId, request);
 const confirmation = async () => ({ ...request, commandId: randomUUID(), decisionId: randomUUID(),
  previewHash: (await preview()).previewHash, expiresAt: new Date(Date.now() + 600000).toISOString(),
  humanConfirmed: true, action: "accounting_export.route", status: "approved", tenantId });
 const confirm = (input: unknown) => repo.routeChangeConfirm(a.context, a.digest, next.source.sourceId, input);
 const snapshot = async () => (await db.admin.query("SELECT * FROM app.accounting_export_route_change WHERE tenant_id=$1", [a.tenantId])).rows;
 return { a, repo, old, next, call, approve, push, request, preview, confirmation, confirm, snapshot };
}
it("switches only the exact job/company, preserves historic artifacts/IDs, prevents repost and replays the original record", async () => {
 const f = await setup(), before = await f.call("read"), approval = await f.confirmation();
 await expect(f.approve(f.next.source.sourceId)).rejects.toThrow("EXPORT_APPROVAL_REQUIRED");
 const result = await f.confirm(approval);
 expect(result).toMatchObject({ revision: 1, actorId: f.a.actorId, artifact: { from: "codat", to: "xero" } });
 expect(await new AccountingExportRepository(c.runtime).routeChangeConfirm(f.a.context, f.a.digest, f.next.source.sourceId, approval)).toEqual(result);
 expect(await f.call("read")).toEqual(before);
 await expect(f.call("claim", f.old.source.sourceId, { version: 1, attemptId: randomUUID() })).rejects.toThrow("EXPORT_RECONCILE_REQUIRED");
 await f.approve(f.next.source.sourceId);
 expect(await f.push(f.next.source.sourceId)).toMatchObject({ status: "pushed", artifact: { route: "xero", scope: { mapping: f.next.scope.mapping } } });
 expect(await f.call("read")).toEqual(before);
 expect(await f.confirm(approval)).toEqual(result);
 expect(await f.snapshot()).toHaveLength(1);
 const otherJob = structuredClone(f.old); otherJob.source.jobId = otherJob.scope.jobId = "demo-unrelated";
 otherJob.source.sourceId = otherJob.scope.sourceId = otherJob.target.sourceId = "demo-unrelated";
 await c.admin.query("INSERT INTO app.accounting_export_fixture(tenant_id,source_id,artifact,consent_expires_at) VALUES($1,$2,$3,clock_timestamp()+interval '1 hour')", [f.a.tenantId, "demo-unrelated", otherJob]);
 expect(await f.call("preview", "demo-unrelated")).toMatchObject({ artifact: { route: "codat" } });
 const audit = (await c.admin.query("SELECT version,payload->'references'->>'auditTrust' trust FROM app.audit_event WHERE tenant_id=$1 AND event_type='accounting_export.route_change'", [f.a.tenantId])).rows;
 expect(audit).toEqual([{ version: "audit.v2", trust: "checked_operation" }]);
});
it("racing distinct confirms change once; reused decisions and altered command replay are refused", async () => {
 const f = await setup(), approval = await f.confirmation();
 const results = await Promise.allSettled([f.confirm(approval), f.confirm({ ...approval, commandId: randomUUID(), decisionId: randomUUID() })]);
 expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
 expect(await f.snapshot()).toHaveLength(1);
 const stored = (await f.snapshot())[0]!;
 const winner = { ...approval, commandId: stored.command_id, decisionId: stored.decision_id };
 await expect(f.confirm({ ...winner, expiresAt: new Date(Date.now()+500000).toISOString() })).rejects.toThrow("EXPORT_REPLAY_CONFLICT");
 await expect(f.confirm({ ...winner, commandId: randomUUID() })).rejects.toThrow("EXPORT_REPLAY_CONFLICT");
 await expect(f.approve(f.next.source.sourceId, stored.decision_id)).rejects.toThrow("EXPORT_REPLAY_CONFLICT");
});
it("rejects wrong tenant/company, broader scope, actor injection, stale revisions and expired Decisions without writes", async () => {
 const f = await setup(), other = await setup(), approval = await f.confirmation();
 await expect(f.repo.routeChangeConfirm(other.a.context, f.a.digest, f.next.source.sourceId, approval)).rejects.toThrow("EXPORT_FORBIDDEN");
 await expect(f.repo.routeChangeConfirm(other.a.context, other.a.digest, f.next.source.sourceId, approval)).rejects.toThrow("EXPORT_STALE_REVISION");
 for (const input of [{ ...approval, scope: { ...approval.scope, companyId: "demo-wrong" } },
  { ...approval, scope: { ...approval.scope, jobId: "demo-wrong" } }, { ...approval, actorId: randomUUID() },
  { ...approval, connectionRevision: 1 }, { ...approval, consentRevision: 2 },
  { ...approval, scope: { ...approval.scope, mapping: { ...approval.scope.mapping, revision: 99 } } },
  { ...approval, tenantId: "demo-wrong" }, { ...approval, expiresAt: new Date(Date.now()-1000).toISOString() }]) {
  await expect(f.confirm(input)).rejects.toThrow(/EXPORT_/);
  expect(await f.snapshot()).toEqual([]);
 }
 // SQL entry point also refuses supplied actor, without relying on TypeScript validation.
 await expect(workTenant(c.runtime, f.a.tenantId, db => db.query("SELECT app.accounting_export_route($1,$2,'routeChangeConfirm',$3,$4)",
  [f.a.tenantId, f.a.digest, f.next.source.sourceId, { ...approval, actorId: randomUUID() }]), { membershipId: f.a.actorId, bindRequest: false })).rejects.toThrow("EXPORT_INVALID_INPUT");
 expect(await f.snapshot()).toEqual([]);
 const exportDecision = (await c.admin.query("SELECT id FROM app.accounting_export_decision WHERE tenant_id=$1", [f.a.tenantId])).rows[0].id;
 await expect(f.confirm({ ...approval, decisionId: exportDecision })).rejects.toThrow("EXPORT_REPLAY_CONFLICT");
 for (const field of ["connectionRevision", "consentRevision"] as const) {
  const changed = { ...f.next, [field]: 3 };
  await c.admin.query("UPDATE app.accounting_export_fixture SET artifact=$2 WHERE tenant_id=$1 AND source_id=$3", [f.a.tenantId, changed, f.next.source.sourceId]);
  await expect(f.confirm(approval)).rejects.toThrow("EXPORT_STALE_REVISION");
 }
 expect(await f.snapshot()).toEqual([]);
});
it("holds a switch on unknown/pending outcomes and rechecks revocation before replay", async () => {
 const f = await setup(), approval = await f.confirmation();
 // A same-scope pending export blocks switching too, even though the anchor is valid.
 const pending = structuredClone(f.old); pending.scope.sourceId = pending.source.sourceId = pending.target.sourceId = "demo-pending";
 await c.admin.query("INSERT INTO app.accounting_export_fixture(tenant_id,source_id,artifact,consent_expires_at) VALUES($1,'demo-pending',$2,clock_timestamp()+interval '1 hour')", [f.a.tenantId, pending]);
 await f.approve("demo-pending");
 await expect(f.confirm(approval)).rejects.toThrow("EXPORT_RECONCILE_REQUIRED");
 await f.call("claim", "demo-pending", { version: 1, attemptId: randomUUID() });
 await expect(f.confirm(approval)).rejects.toThrow("EXPORT_RECONCILE_REQUIRED");
 expect(await f.snapshot()).toEqual([]);
 const g = await setup(), decision = await g.confirmation(); await g.confirm(decision);
 await c.admin.query("UPDATE app.accounting_export_fixture SET revoked=true WHERE tenant_id=$1 AND source_id=$2", [g.a.tenantId, g.next.source.sourceId]);
 await expect(g.confirm(decision)).rejects.toThrow("EXPORT_CONSENT_EXPIRED");
 expect(await g.snapshot()).toHaveLength(1);
});
it("binds the historic ledger and live destination revisions again at confirmation", async () => {
 const f = await setup(), approval = await f.confirmation();
 const added = structuredClone(f.old);
 added.scope.sourceId = added.source.sourceId = added.target.sourceId = "demo-added";
 await c.admin.query("INSERT INTO app.accounting_export_fixture(tenant_id,source_id,artifact,consent_expires_at) VALUES($1,'demo-added',$2,clock_timestamp()+interval '1 hour')", [f.a.tenantId, added]);
 await f.approve("demo-added"); await f.push("demo-added");
 await expect(f.confirm(approval)).rejects.toThrow("EXPORT_APPROVAL_REQUIRED");
 expect(await f.snapshot()).toEqual([]);
 const fresh = await f.confirmation();
 await c.admin.query("UPDATE app.accounting_export_fixture SET consent_expires_at=clock_timestamp()-interval '1 second' WHERE tenant_id=$1 AND source_id=$2", [f.a.tenantId, f.next.source.sourceId]);
 await expect(f.confirm(fresh)).rejects.toThrow("EXPORT_CONSENT_EXPIRED");
 expect(await f.snapshot()).toEqual([]);
 const g = await setup(), decision = await g.confirmation(); await g.confirm(decision);
 const colleague = await meterCompany(c as unknown as WorkFixture, g.a.tenantId);
 await expect(g.repo.routeChangeConfirm(colleague.context, colleague.digest, g.next.source.sourceId, decision)).rejects.toThrow("EXPORT_REPLAY_CONFLICT");
 expect(await g.snapshot()).toHaveLength(1);
});
it("FORCE RLS, narrow grants, append-only history and session boundary are database enforced", async () => {
 const f = await setup(); await f.confirm(await f.confirmation());
 expect((await c.admin.query("SELECT relrowsecurity,relforcerowsecurity,has_table_privilege('jobguard_runtime',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') allowed FROM pg_class WHERE oid='app.accounting_export_route_change'::regclass")).rows[0]).toEqual({ relrowsecurity: true, relforcerowsecurity: true, allowed: false });
 await expect(c.runtime.query("SELECT * FROM app.accounting_export_route_change")).rejects.toMatchObject({ code: "42501" });
 for (const sql of ["UPDATE app.accounting_export_route_change SET revision=revision+1", "DELETE FROM app.accounting_export_route_change", "TRUNCATE app.accounting_export_route_change"])
  await expect(c.admin.query(sql)).rejects.toThrow("EXPORT_IMMUTABLE");
 await expect(c.runtime.query("SELECT app.accounting_export_route($1,$2,'routeChangePreview',$3,$4)", [f.a.tenantId, f.a.digest, f.next.source.sourceId, f.request])).rejects.toThrow();
 await c.admin.query("UPDATE identity.session SET revoked_at=clock_timestamp() WHERE id=$1", [f.a.sessionId]);
 await expect(f.preview()).rejects.toThrow("EXPORT_FORBIDDEN");
});
it("0599_accounting_export_route_change upgrades without changing populated predecessors; only the exact checked dispatcher body changes", async () => {
 const u = await startBeforeMigration("0599_accounting_export_route_change.sql");
 try {
  const populated = await setup(u);
  const historic = await populated.call("read");
  const tables = ["control_plane.tenant", "identity.session", "app.membership", "app.job", "app.accounting_export_ledger", "app.audit_event", "app.journal"];
  const before = await proofBefore(u.admin, tables);
  const routines = (await u.admin.query("SELECT oid,pg_get_functiondef(oid) definition,proacl::text FROM pg_proc WHERE pronamespace IN('app'::regnamespace,'identity'::regnamespace) AND prokind='f' ORDER BY oid")).rows;
  const oid = (await u.admin.query("SELECT 'app.accounting_export(uuid,text,text,text,jsonb)'::regprocedure::oid oid")).rows[0].oid;
  await applyMigration(u, "0599_accounting_export_route_change.sql");
  expect(await proofDifferences(u.admin, before)).toEqual({ rows: [], types: [] });
  const current = (await u.admin.query("SELECT oid,pg_get_functiondef(oid) definition,proacl::text FROM pg_proc WHERE oid=ANY($1::oid[]) ORDER BY oid", [routines.map(r=>r.oid)])).rows;
  for (const prior of routines) {
   const actual = current.find(r=>r.oid===prior.oid);
   if (prior.oid !== oid) expect(actual).toEqual(prior);
   else {
    expect(actual.proacl).toEqual(prior.proacl);
    expect(actual.definition).toContain("f.artifact:=app.accounting_export_routed_artifact(t,f.artifact)");
    const restored = actual.definition
     .replace(" f.artifact:=app.accounting_export_routed_artifact(t,f.artifact);\n", "")
     .replace("  IF EXISTS(SELECT 1 FROM app.accounting_export_route_change WHERE tenant_id=t AND decision_id=(v->>'decisionId')::uuid)\n   THEN RAISE EXCEPTION 'EXPORT_REPLAY_CONFLICT'; END IF;\n", "");
    expect(restored).toEqual(prior.definition);
   }
  }
  expect(await populated.call("read")).toEqual(historic);
  await migrate(u.admin); await migrate(u.admin);
  expect(await proofDifferences(u.admin, before)).toEqual({ rows: [], types: [] });
 } finally { await u.close(); }
}, 240000);

it("checked read returns a hash-bound proposal and reloadable immutable history without writes or cross-tenant disclosure", async () => {
 const f = await setup();
 const read = () => new AccountingExportRepository(c.runtime).routeChangeRead(f.a.context, f.a.digest, f.next.source.sourceId);
 const historic = await f.call("read");
 const auditCount = async () => (await c.admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1", [f.a.tenantId])).rows[0].n;
 const before = await auditCount();
 expect(await read()).toEqual({ version: 1, proposal: await f.preview(), confirmed: null, history: [] });
 expect(await f.snapshot()).toEqual([]); expect(await auditCount()).toBe(before);
 const confirmed = await f.confirm(await f.confirmation());
 const after = await auditCount();
 expect(await read()).toEqual({ version: 1, proposal: null, confirmed, history: [confirmed] });
 expect(await auditCount()).toBe(after); expect(await f.call("read")).toEqual(historic);
 const other = await meterCompany(c as unknown as WorkFixture);
 await expect(f.repo.routeChangeRead(other.context, other.digest, f.next.source.sourceId)).rejects.toThrow("EXPORT_NOT_FOUND");
 await expect(f.repo.routeChangeRead(other.context, f.a.digest, f.next.source.sourceId)).rejects.toThrow("EXPORT_FORBIDDEN");
 await expect(c.runtime.query("SELECT app.accounting_export_route_read($1,$2,$3)", [f.a.tenantId, f.a.digest, f.next.source.sourceId])).rejects.toThrow();
 expect((await c.admin.query("SELECT has_function_privilege('jobguard_runtime','app.accounting_export_route_read(uuid,text,text)','EXECUTE') allowed, has_table_privilege('jobguard_runtime','app.accounting_export_route_change','SELECT') tables")).rows[0]).toEqual({ allowed: true, tables: false });
 await c.admin.query("UPDATE app.membership SET role='read_only' WHERE tenant_id=$1 AND id=$2", [f.a.tenantId, f.a.actorId]);
 await expect(read()).rejects.toThrow("EXPORT_FORBIDDEN");
 expect(await f.snapshot()).toHaveLength(1);
});
it("read refuses a pending/unknown historic export and revoked consent without storing a change", async () => {
 const f = await setup();
 const added = structuredClone(f.old);
 added.scope.sourceId = added.source.sourceId = added.target.sourceId = "demo-read-held";
 await c.admin.query("INSERT INTO app.accounting_export_fixture(tenant_id,source_id,artifact,consent_expires_at) VALUES($1,$2,$3,clock_timestamp()+interval '1 hour')", [f.a.tenantId, added.source.sourceId, added]);
 await f.approve(added.source.sourceId);
 for (let i = 0; i < 2; i++) {
  await expect(f.repo.routeChangeRead(f.a.context, f.a.digest, f.next.source.sourceId)).rejects.toThrow("EXPORT_RECONCILE_REQUIRED");
  if (!i) await f.call("claim", added.source.sourceId, { version: 1, attemptId: randomUUID() });
 }
 expect(await f.snapshot()).toEqual([]);
 await c.admin.query("UPDATE app.accounting_export_fixture SET revoked=true WHERE tenant_id=$1 AND source_id=$2", [f.a.tenantId, f.next.source.sourceId]);
 await expect(f.repo.routeChangeRead(f.a.context, f.a.digest, f.next.source.sourceId)).rejects.toThrow("EXPORT_CONSENT_EXPIRED");
});
it("0617_accounting_export_route_change_read adds only its read routine and preserves populated predecessors on upgrade", async () => {
 const u = await startBeforeMigration("0617_accounting_export_route_change_read.sql");
 try {
  const f = await setup(u); await f.confirm(await f.confirmation());
  const before = await proofBefore(u.admin, ["app.accounting_export_route_change", "app.accounting_export_ledger", "app.accounting_export_outbox", "app.audit_event"]);
  const routines = (await u.admin.query("SELECT oid,pg_get_functiondef(oid) definition,proacl::text FROM pg_proc WHERE pronamespace IN('app'::regnamespace,'identity'::regnamespace) AND prokind='f' ORDER BY oid")).rows;
  await applyMigration(u, "0617_accounting_export_route_change_read.sql");
  expect(await proofDifferences(u.admin, before)).toEqual({ rows: [], types: [] });
  expect((await u.admin.query("SELECT oid,pg_get_functiondef(oid) definition,proacl::text FROM pg_proc WHERE oid=ANY($1::oid[]) ORDER BY oid", [routines.map(r=>r.oid)])).rows).toEqual(routines);
  expect(await f.repo.routeChangeRead(f.a.context, f.a.digest, f.next.source.sourceId)).toMatchObject({ proposal: null, history: [{ revision: 1 }] });
 } finally { await u.close(); }
}, 240000);
