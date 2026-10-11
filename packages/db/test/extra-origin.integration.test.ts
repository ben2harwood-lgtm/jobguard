// Written before implementation. NOT RUN in the builder sandbox: cannot start PostgreSQL.
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { sha256Hex } from "../src/work-order-repository.js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { extraOriginHashV1, ExtraPersistenceError } from "@jobguard/core";
import { ExtraRepository, withTenant, auditPayloadV1Schema, verifyAuditChain, appendAuditBatch, type AuditEvent, type TenantTransaction } from "../src/index.js";
import { cluster, fixture, raise, rawVariation, rawOrigin, receipt, finishRaw, newTables, newOriginColumns, ownerTx, visitAndEvidence, originSql, originHashInput, noteCanary, descriptionCanary, extraIdFor, type Cluster, type Fixture } from "./extra-fixtures.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
let c: Cluster, repo: ExtraRepository;
beforeAll(async () => { c = await cluster(); repo = new ExtraRepository(c.runtime); }, 60_000);
afterAll(async () => { await c?.close(); });
const rawAttempt = async (f: Fixture, type = "LogSiteExtra", kind = "site_user", originFields: Record<string, unknown> = {}, receiptFields: { status?: string; semanticKey?: string } = {}, complete = false) => withTenant(c.runtime, f.ctx, async db => {
 const id = randomUUID(), command = await receipt(db, f.p.tenantId, f.jobId, id, f.p.membershipId, type, randomUUID(), receiptFields);
 await rawVariation(db, f.p.tenantId, f.jobId, id, kind);
 const row = await rawOrigin(db, f, id, command, { kind, ...originFields });
 if (complete) await finishRaw(db, f, id, command, row.origin_hash); return row;
});
async function checkChain(f: Fixture) {
 const rows = (await c.admin.query("SELECT * FROM app.audit_event WHERE tenant_id=$1 ORDER BY sequence", [f.p.tenantId])).rows;
 verifyAuditChain(rows.map(r => ({ id: r.id, version: r.version, tenantId: r.tenant_id, sequence: Number(r.sequence), actorRef: r.actor_ref, eventType: r.event_type, subjectType: r.subject_type, subjectRef: r.subject_ref, occurredAt: r.occurred_at, payload: r.payload, payloadHash: r.payload_hash, previousHash: r.previous_hash, eventHash: r.event_hash })) as AuditEvent[]);
}
describe("ENT-4b origin persistence", () => {
 it("[DW1] runtime cannot mutate immutable rows; owner triggers refuse UPDATE and DELETE", async () => {
  const f = await fixture(c); await repo.raiseExtra(f.ctx, raise(f));
  for (const table of ["extra_origin", ...newTables]) {
   for (const privilege of ["UPDATE", "DELETE", "TRUNCATE"]) expect((await c.admin.query("SELECT has_table_privilege('jobguard_runtime',$1,$2) allowed", [`app.${table}`, privilege])).rows[0].allowed).toBe(false);
   expect((await c.admin.query("SELECT count(*)::int n FROM information_schema.column_privileges WHERE grantee='jobguard_runtime' AND table_schema='app' AND table_name=$1 AND privilege_type='UPDATE'", [table])).rows[0].n).toBe(0);
   for (const sql of [`UPDATE app.${table} SET tenant_id=tenant_id`, `DELETE FROM app.${table}`, `TRUNCATE app.${table}`]) await expect(withTenant(c.runtime, f.ctx, db => db.$client.query(sql))).rejects.toMatchObject({ code: "42501" });
  }
  for (const table of ["extra_origin", "extra_event"]) for (const sql of [`UPDATE app.${table} SET tenant_id=tenant_id`, `DELETE FROM app.${table}`]) await expect(ownerTx(c, f.p.tenantId, db => db.$client.query(sql))).rejects.toMatchObject({ code: "55000" });
 });
 it("[DW2a] all mismatched raising command/kind pairs are refused", async () => {
  const f = await fixture(c), pairs = { LogSiteExtra: "site_user", ConfirmPrompt: "jobguard_surfaced_confirmed", RecordOfficeExtra: "office_entry", RecordClientInstruction: "client_instruction" };
  for (const [type, right] of Object.entries(pairs)) for (const kind of Object.values(pairs)) if (kind !== right) await expect(rawAttempt(f, type, kind)).rejects.toMatchObject({ code: "23514" });
 });
 it("[DW2b] receipt actor, processing status and exact semantic identity are required", async () => {
  const f = await fixture(c);
  for (const fields of [{ status: "succeeded" }, { semanticKey: `extra-origin:${randomUUID()}:${randomUUID()}` }, { semanticKey: `extra-origin:${f.jobId}:${randomUUID()}` }]) await expect(rawAttempt(f, "LogSiteExtra", "site_user", {}, fields)).rejects.toMatchObject({ code: "23514" });
  await expect(rawAttempt(f, "LogSiteExtra", "site_user", { raising_membership_id: f.demo.operativeMembershipId, raising_role: "operative" })).rejects.toMatchObject({ code: "23514" });
 });
 it("[DW2c] origin and client capture uniqueness reject second rows with 23505", async () => {
  const f = await fixture(c), capture = randomUUID(), a = await repo.raiseExtra(f.ctx, raise(f, { clientCaptureId: capture }));
  const old = (await c.admin.query("SELECT * FROM app.extra_origin WHERE tenant_id=$1 AND variation_id=$2", [f.p.tenantId, a.variationId])).rows[0];
  await expect(withTenant(c.runtime, f.ctx, async db => { await db.$client.query("UPDATE app.command_receipt SET status='processing',result=NULL,completed_at=NULL WHERE tenant_id=$1 AND command_id=$2", [f.p.tenantId, old.command_id]); return rawOrigin(db, f, a.variationId, old.command_id); })).rejects.toMatchObject({ code: "23505" });
  await expect(rawAttempt(f, "LogSiteExtra", "site_user", { client_capture_id: capture }, {}, true)).rejects.toMatchObject({ code: "23505" });
 });
 it("[DW2d] neither origin column accepts the other track's kinds", async () => {
  const f = await fixture(c);
  await expect(rawAttempt(f, "LogSiteExtra", "builder_logged")).rejects.toMatchObject({ code: "23514" });
  await expect(withTenant(c.runtime, f.ctx, async db => { const id = randomUUID(); const command = await receipt(db, f.p.tenantId, f.jobId, id, f.p.membershipId, "LogBuilderExtra"); await rawVariation(db, f.p.tenantId, f.jobId, id); await rawOrigin(db, f, id, command, { kind: "builder_logged" }); })).rejects.toMatchObject({ code: "23514" });
  const small = await smallFixture(f);
  await expect(withTenant(c.runtime, f.ctx, db => rawVariation(db, f.p.tenantId, small, randomUUID(), "site_user", "small_builder"))).rejects.toMatchObject({ code: "23514" });
  await expect(withTenant(c.runtime, f.ctx, async db => { const id = randomUUID(); await receipt(db, f.p.tenantId, small, id, f.p.membershipId, "LogBuilderExtra"); await rawVariation(db, f.p.tenantId, small, id, "builder_logged", "small_builder"); const command = await receipt(db, f.p.tenantId, small, id, f.p.membershipId, "LogSiteExtra"); await rawOrigin(db, { ...f, jobId: small }, id, command, { job_track: "small_builder", kind: "site_user", raising_grant_id: null }); })).rejects.toMatchObject({ code: "23514" });
 });
 it("[DW3] missing origin fails at commit; SH-1 deferred constraint remains singular", async () => {
  const f = await fixture(c), id = randomUUID();
  await expect(withTenant(c.runtime, f.ctx, db => rawVariation(db, f.p.tenantId, f.jobId, id))).rejects.toMatchObject({ code: "23503" });
  expect((await c.admin.query("SELECT 1 FROM app.variation WHERE tenant_id=$1 AND id=$2", [f.p.tenantId, id])).rowCount).toBe(0);
  const constraints = (await c.admin.query("SELECT conname,condeferrable,condeferred FROM pg_constraint WHERE conrelid='app.variation'::regclass AND confrelid='app.extra_origin'::regclass")).rows;
  expect(constraints).toEqual([{ conname: "variation_requires_origin", condeferrable: true, condeferred: true }]);
 });
 it("[DW5a] failures at each write, seam, audit and commit leave no facts or receipt", async () => {
  const f = await fixture(c);
  for (const fragment of ["INSERT INTO app.command_receipt", "INSERT INTO app.variation", "INSERT INTO app.extra_origin", "INSERT INTO app.extra_event", "INSERT INTO app.audit_event", "COMMIT"]) {
   const raw = raise(f, { clientCaptureId: randomUUID() }), capture = raw.clientCaptureId as string;
   const connect = c.runtime.connect.bind(c.runtime), spy = vi.spyOn(c.runtime, "connect");
   spy.mockImplementation((async () => { const client = await connect(); const original = client.query.bind(client); const querySpy = vi.spyOn(client, "query"); querySpy.mockImplementation((async (sql: any, params?: any) => { const value = await original(sql, params); if (String(sql).includes(fragment)) { if (fragment === "COMMIT") throw new Error("COMMIT injection must be before execution"); throw new Error(noteCanary); } return value; }) as any); if (fragment === "COMMIT") querySpy.mockImplementation((async (sql: any, params?: any) => { if (sql === "COMMIT") { await original("SET CONSTRAINTS ALL IMMEDIATE"); throw new Error(noteCanary); } return original(sql, params); }) as any); return client; }) as any);
   try { await expect(repo.raiseExtra(f.ctx, raw)).rejects.toBeInstanceOf(ExtraPersistenceError); } finally { vi.restoreAllMocks(); }
   const id = extraIdFor(f.p.tenantId, f.jobId, capture);
   for (const [table, column, value] of [["command_receipt", "command_id", raw.commandId], ["variation", "id", id], ["extra_origin", "variation_id", id], ["extra_event", "variation_id", id], ["audit_event", "subject_ref", id]]) expect((await c.admin.query(`SELECT count(*)::int n FROM app.${table} WHERE tenant_id=$1 AND ${column}=$2`, [f.p.tenantId, value])).rows[0].n).toBe(0);
   await checkChain(f);
  }
  const raw = raise(f); await expect(repo.raiseExtra(f.ctx, raw, async () => { throw new Error(descriptionCanary); })).rejects.toMatchObject({ code: "DATABASE_UNAVAILABLE", message: "DATABASE_UNAVAILABLE" });
  await expect(rawAttempt(f)).rejects.toMatchObject({ code: "23514" });
  for (const table of ["variation", "extra_origin", "extra_event"]) expect((await c.admin.query(`SELECT count(*)::int n FROM app.${table} WHERE tenant_id=$1`, [f.p.tenantId])).rows[0].n).toBe(0);
  expect((await c.admin.query("SELECT count(*)::int n FROM app.command_receipt WHERE tenant_id=$1 AND command_type='LogSiteExtra'", [f.p.tenantId])).rows[0].n).toBe(0);
  expect((await c.admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND event_type='contractor.extra.raised'", [f.p.tenantId])).rows[0].n).toBe(0);
  await checkChain(f);
 });
 it("[DW5b] command/capture replay and two-connection retry have one effect; conflicting payloads fail", async () => {
  const f = await fixture(c), raw = raise(f, { clientCaptureId: randomUUID() });
  const [a, b] = await Promise.all([repo.raiseExtra(f.ctx, raw), repo.raiseExtra(f.ctx, { ...raw, commandId: randomUUID() })]);
  expect(a).toEqual(b); expect(await repo.raiseExtra(f.ctx, raw)).toEqual(a); expect(await repo.raiseExtra(f.ctx, { ...raw, commandId: randomUUID() })).toEqual(a);
  for (const changed of [{ ...raw, note: "different" }, { ...raw, commandId: randomUUID(), description: "different" }, { ...raw, commandId: randomUUID(), commandType: "RecordOfficeExtra" }]) await expect(repo.raiseExtra(f.ctx, changed)).rejects.toMatchObject({ code: "COMMAND_CONFLICT" });
  for (const [table, column] of [["variation", "id"], ["extra_origin", "variation_id"], ["extra_event", "variation_id"], ["audit_event", "subject_ref"]]) expect((await c.admin.query(`SELECT count(*)::int n FROM app.${table} WHERE tenant_id=$1 AND ${column}=$2`, [f.p.tenantId, a.variationId])).rows[0].n).toBe(1);
 });
 it("[DW6] audit uses closed ID/hash keys; capture metadata never appears in audit or errors", async () => {
  const f = await fixture(c), raw = raise(f, { deviceId: "fictional-device-canary", deviceCapturedAt: "2026-10-01T01:02:03.000001Z" }); await repo.raiseExtra(f.ctx, raw);
  const events = (await c.admin.query("SELECT * FROM app.audit_event WHERE tenant_id=$1 AND event_type='contractor.extra.raised'", [f.p.tenantId])).rows;
  expect(events).toHaveLength(1); for (const row of events) { expect(auditPayloadV1Schema.safeParse(row.payload).success).toBe(true); expect(Object.keys(row.payload.references).sort()).toEqual(["command", "environment", "extra", "job"]); expect(Object.keys(row.payload.hashes)).toEqual(["origin"]); for (const value of Object.values(row.payload.references)) expect(value).toMatch(/^(?:[a-f0-9-]{36}|synthetic_demo)$/u); for (const canary of [noteCanary, descriptionCanary, raw.deviceId, raw.deviceCapturedAt]) expect(JSON.stringify(row)).not.toContain(canary); }
  await expect(repo.raiseExtra(f.ctx, { ...raw, kind: noteCanary })).rejects.toMatchObject({ message: "INVALID_COMMAND" });
 });
 it("[R1] office, instruction, import, parties, unknown commands cannot write or relabel site origins", async () => {
  const f = await fixture(c), a = await repo.raiseExtra(f.ctx, raise(f)); const old = await repo.readExtra(f.ctx, f.jobId, a.variationId);
  for (const type of ["RecordOfficeExtra", "RecordClientInstruction", "contractor_parties.bind", "work_order.import", "work-order-import.v1", "unknown"]) for (const kind of ["site_user", "jobguard_surfaced_confirmed"]) { await expect(rawAttempt(f, type, kind)).rejects.toMatchObject({ code: "23514" }); expect(await repo.readExtra(f.ctx, f.jobId, a.variationId)).toEqual(old); }
  await expect(withTenant(c.runtime, f.ctx, db => db.$client.query("UPDATE app.extra_origin SET kind='office_entry' WHERE variation_id=$1", [a.variationId]))).rejects.toMatchObject({ code: "42501" }); expect(await repo.readExtra(f.ctx, f.jobId, a.variationId)).toEqual(old);
 });
 it("[R4] earlier small-builder origins survive a later contractor assignment unchanged", async () => {
  const f = await fixture(c);
  await assignTrack(f, "small_builder");
  const jobId = await smallFixture(f);
  const id = await withTenant(c.runtime, f.ctx, async db => { const id = randomUUID(), command = await receipt(db, f.p.tenantId, jobId, id, f.p.membershipId, "LogBuilderExtra"); await rawVariation(db, f.p.tenantId, jobId, id, "builder_logged", "small_builder"); await rawOrigin(db, { ...f, jobId }, id, command, { job_track: "small_builder", kind: "builder_logged", raising_grant_id: null }); return id; });
  const old = (await c.admin.query("SELECT * FROM app.extra_origin WHERE tenant_id=$1 AND variation_id=$2", [f.p.tenantId, id])).rows[0];
  await assignTrack(f, "contractor");
  expect((await c.admin.query("SELECT * FROM app.extra_origin WHERE tenant_id=$1 AND variation_id=$2", [f.p.tenantId, id])).rows[0]).toEqual(old);
  await expect(withTenant(c.runtime, f.ctx, db => rawVariation(db, f.p.tenantId, jobId))).rejects.toMatchObject({ code: "23503" });
  expect((await repo.readExtra(f.ctx, jobId, id)).origin.origin.jobTrack).toBe("small_builder");
 });
 it("[S1] stamped per-call contexts fail closed; other tenant/job reads are NOT_FOUND", async () => {
  const a = await fixture(c), b = await fixture(c), e = await repo.raiseExtra(a.ctx, raise(a));
  for (const ctx of [b.ctx]) { await expect(repo.readExtra(ctx, a.jobId, e.variationId)).rejects.toMatchObject({ code: "NOT_FOUND" }); await expect(repo.readDuplicateGroup(ctx, a.jobId, e.variationId)).rejects.toMatchObject({ code: "NOT_FOUND" }); await expect(repo.raiseExtra(ctx, raise(a))).rejects.toMatchObject({ code: "NOT_FOUND" }); }
  await expect(repo.raiseExtra(b.ctx, { ...raise(a), jobId: b.jobId })).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(repo.readExtra(a.ctx, randomUUID(), e.variationId)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(repo.readExtra({ tenantId: a.p.tenantId } as any, a.jobId, e.variationId)).rejects.toMatchObject({ code: "INVALID_TENANT_CONTEXT" });
  for (const table of newTables) { expect((await c.runtime.query(`SELECT * FROM app.${table}`)).rowCount).toBe(0); await expect(c.runtime.query(`INSERT INTO app.${table}(tenant_id) VALUES($1)`, [a.p.tenantId])).rejects.toBeDefined(); }
 });
 it("[S2] new tenant tables have FORCE RLS, tenant policy and migration ownership", async () => {
  for (const table of newTables) {
   const row = (await c.admin.query("SELECT c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner) owner,p.polname,p.polcmd FROM pg_class c JOIN pg_policy p ON p.polrelid=c.oid WHERE c.oid=$1::regclass", [`app.${table}`])).rows;
   expect(row).toEqual([{ relrowsecurity: true, relforcerowsecurity: true, owner: "jobguard_migration", polname: "tenant_isolation", polcmd: "*" }]);
  }
 });
 it("[S3] exactly SELECT/INSERT; invoker functions uncallable by runtime/PUBLIC; least privilege preserved", async () => {
  for (const table of newTables) expect((await c.admin.query("SELECT privilege_type FROM information_schema.role_table_grants WHERE grantee='jobguard_runtime' AND table_schema='app' AND table_name=$1 ORDER BY privilege_type", [table])).rows.map(r => r.privilege_type)).toEqual(["INSERT", "SELECT"]);
  const funcs = (await c.admin.query("SELECT p.proname,p.prosecdef,pg_get_userbyid(p.proowner) owner,has_function_privilege('jobguard_runtime',p.oid,'EXECUTE') runtime,coalesce(p.proacl::text,'') acl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='app' AND p.proname LIKE 'ent4b_%'")).rows;
  expect(funcs.length).toBeGreaterThan(0); for (const f of funcs) { expect(f.prosecdef).toBe(false); expect(f.owner).toBe("jobguard_migration"); expect(f.runtime).toBe(false); expect(f.acl).not.toMatch(/(?:\{|,)=X/u); }
  expect((await c.admin.query("SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname='jobguard_runtime'")).rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
 });
 it("[S4] origin/event/audit share xmin; absent or mismatched audit/logged fact fails at commit", async () => {
  const f = await fixture(c), e = await repo.raiseExtra(f.ctx, raise(f));
  const rows = (await c.admin.query("SELECT o.xmin::text origin_x,e.xmin::text event_x,a.xmin::text audit_x FROM app.extra_origin o JOIN app.extra_event e ON(e.tenant_id,e.variation_id)=(o.tenant_id,o.variation_id) JOIN app.audit_event a ON(a.tenant_id,a.subject_ref)=(o.tenant_id,o.variation_id::text) WHERE o.tenant_id=$1 AND o.variation_id=$2", [f.p.tenantId, e.variationId])).rows;
  expect(rows).toHaveLength(1); expect(rows[0].origin_x).toBe(rows[0].event_x); expect(rows[0].origin_x).toBe(rows[0].audit_x);
  await expect(rawAttempt(f)).rejects.toMatchObject({ code: "23514" });
  for (const sql of ["UPDATE app.audit_event SET subject_ref=subject_ref", "DELETE FROM app.audit_event"]) await expect(withTenant(c.runtime, f.ctx, db => db.$client.query(sql))).rejects.toMatchObject({ code: "42501" });
 });
 it("[S5] server overwrites authority fields; grants, scope, visits, membership and prompt are guarded", async () => {
  const f = await fixture(c), proof = await visitAndEvidence(c, f);
  const row = await rawAttempt(f, "LogSiteExtra", "site_user", { work_order_id: randomUUID(), work_order_revision_id: randomUUID(), raiser_assigned: true, evidence_id: proof.evidenceId, evidence_hash: "f".repeat(64), command_type: "RecordOfficeExtra", server_recorded_at: "2000-01-01T00:00:00Z", origin_hash: "f".repeat(64), site_visit_id: proof.visitId }, {}, true);
  expect(row.work_order_id).toBe(f.orderId); expect(row.work_order_revision_id).toBe(f.revisionId); expect(row.raiser_assigned).toBe(false); expect(row.command_type).toBe("LogSiteExtra"); expect(row.evidence_hash).toBe(sha256Hex("fictional PNG")); expect(row.origin_hash).not.toBe("f".repeat(64)); expect(row.server_text).not.toContain("2000-01-01");
  for (const fields of [{ raising_grant_id: (await c.admin.query("SELECT id FROM app.role_grant WHERE tenant_id=$1 AND membership_id=$2", [f.p.tenantId, f.demo.operativeMembershipId])).rows[0].id }, { raising_role: "operative" }]) await expect(rawAttempt(f, "LogSiteExtra", "site_user", fields)).rejects.toMatchObject({ code: "23514" });
  await expect(rawAttempt(f, "ConfirmPrompt", "jobguard_surfaced_confirmed")).rejects.toMatchObject({ message: "PROMPT_ORIGIN_HELD" });
  const other = await fixture(c), otherVisit = await visitAndEvidence(c, other);
  await expect(rawAttempt(f, "LogSiteExtra", "site_user", { site_visit_id: otherVisit.visitId })).rejects.toMatchObject({ code: "23503" });
  await ownerTx(c, f.p.tenantId, db => db.$client.query("INSERT INTO app.role_grant_revocation(tenant_id,id,grant_id) VALUES($1,$2,$3)", [f.p.tenantId, randomUUID(), f.grantId]));
  await expect(rawAttempt(f)).rejects.toMatchObject({ code: "23514" });
 });
 it("[S4] origin requires exact logged and exact hash/command audit in the same transaction", async () => {
  const f = await fixture(c);
  for (const missing of ["logged", "audit", "origin_hash", "command"]) await expect(withTenant(c.runtime, f.ctx, async db => {
   const id = randomUUID(), command = await receipt(db, f.p.tenantId, f.jobId, id, f.p.membershipId); await rawVariation(db, f.p.tenantId, f.jobId, id); const row = await rawOrigin(db, f, id, command);
   if (missing !== "logged") await db.$client.query("INSERT INTO app.extra_event(tenant_id,id,job_id,variation_id,kind,command_id,actor_membership_id,sequence,server_recorded_at) VALUES($1,$2,$3,$4,'logged',$5,$6,999,'2000-01-01T00:00:00Z')", [f.p.tenantId, randomUUID(), f.jobId, id, command, f.p.membershipId]);
   if (missing !== "audit") await appendAuditBatch(db, [{ id: randomUUID(), version: "audit.v1", actorRef: `membership:${f.p.membershipId}`, eventType: "contractor.extra.raised", subjectType: "extra", subjectRef: id, payload: { references: { command: missing === "command" ? randomUUID() : command }, hashes: { origin: missing === "origin_hash" ? "f".repeat(64) : row.origin_hash } } }]);
  })).rejects.toMatchObject({ code: "23514" });
 });
 it("[S5] evidence and excess references preserve job identity and new scope lineage", async () => {
  const f = await fixture(c), evidence = await visitAndEvidence(c, f);
  const line = (await c.admin.query("SELECT * FROM app.work_order_line WHERE tenant_id=$1 AND job_id=$2 LIMIT 1", [f.p.tenantId, f.jobId])).rows[0];
  const e = await repo.raiseExtra(f.ctx, raise(f, { evidenceId: evidence.evidenceId, siteVisitId: evidence.visitId, sorItem: { versionId: f.demo.sorVersionId, code: "FIT-LOCK" }, excessOfScopeItemId: line.scope_item_id }));
  const v = (await c.admin.query("SELECT * FROM app.variation WHERE tenant_id=$1 AND id=$2", [f.p.tenantId, e.variationId])).rows[0];
  expect(v.scope_item_id).not.toBe(line.scope_item_id); expect(v.excess_of_scope_item_id).toBe(line.scope_item_id); expect(v.excess_of_revision_id).toBe(f.revisionId);
  expect((await c.admin.query("SELECT kind FROM app.scope_lineage WHERE tenant_id=$1 AND child_scope_item_id=$2 AND parent_scope_item_id=$3", [f.p.tenantId, v.scope_item_id, line.scope_item_id])).rows).toEqual([{ kind: "variation" }]);
  await expect(repo.raiseExtra(f.ctx, raise(f, { residentConfirmationEvidenceId: evidence.evidenceId }))).rejects.toMatchObject({ code: "INVALID_ORIGIN" });
 });
 it("[S5] grants cover exactly tenant/team/branch/region; visits bind member/job; inactive members fail", async () => {
  const f = await fixture(c), other = await fixture(c);
  const currentRegion = (await c.admin.query("SELECT parent_id FROM app.org_unit WHERE tenant_id=$1 AND id=$2", [f.p.tenantId, f.demo.branchId])).rows[0].parent_id;
  const outside = await ownerTx(c, f.p.tenantId, async db => {
   const region = randomUUID(), branch = randomUUID(), team = randomUUID();
   await db.$client.query("INSERT INTO app.org_unit(tenant_id,id,kind,parent_id,parent_kind,name) VALUES($1,$2,'region',$1,'tenant','Fictional other region'),($1,$3,'branch',$2,'region','Fictional other branch')", [f.p.tenantId, region, branch]);
   await db.$client.query("INSERT INTO app.team(tenant_id,id,branch_id,name) VALUES($1,$2,$3,'Fictional other team')", [f.p.tenantId, team, branch]); return { region, branch, team };
  });
  for (const [kind, good, bad] of [["tenant", f.p.tenantId, other.p.tenantId], ["team", f.demo.teamId, outside.team], ["branch", f.demo.branchId, outside.branch], ["region", currentRegion, outside.region]]) {
   const add = async (scope: string) => ownerTx(c, f.p.tenantId, async db => { const id = randomUUID(); await db.$client.query("INSERT INTO app.role_grant(tenant_id,id,membership_id,role,scope_kind,scope_id) VALUES($1,$2,$3,'owner',$4,$5)", [f.p.tenantId, id, f.p.membershipId, kind, scope]); return id; });
   const grant = kind === "tenant" ? f.grantId : await add(good!);
   expect((await rawAttempt(f, "LogSiteExtra", "site_user", { raising_grant_id: grant }, {}, true)).raising_grant_id).toBe(grant);
   // The merged tenant grant boundary cannot create a wrong-tenant tenant grant;
   // use a real grant belonging to that other tenant to exercise the origin guard.
   const wrong = kind === "tenant" ? other.grantId : await add(bad!);
   await expect(rawAttempt(f, "LogSiteExtra", "site_user", { raising_grant_id: wrong })).rejects.toMatchObject({ code: "23514" });
  }
  const visit = randomUUID();
  await ownerTx(c, f.p.tenantId, db => db.$client.query("INSERT INTO app.site_visit(tenant_id,id,job_id,work_order_id,membership_id) VALUES($1,$2,$3,$4,$5)", [f.p.tenantId, visit, f.jobId, f.orderId, f.demo.operativeMembershipId]));
  await expect(rawAttempt(f, "LogSiteExtra", "site_user", { site_visit_id: visit })).rejects.toMatchObject({ code: "23503" });
  const grant = await ownerTx(c, f.p.tenantId, async db => { const id = randomUUID(); await db.$client.query("INSERT INTO app.role_grant(tenant_id,id,membership_id,role,scope_kind,scope_id) VALUES($1,$2,$3,'supervisor','tenant',$1)", [f.p.tenantId, id, f.p.membershipId]); return id; });
  await expect(rawAttempt(f, "LogSiteExtra", "site_user", { raising_grant_id: grant })).rejects.toMatchObject({ code: "23514" });
  await ownerTx(c, f.p.tenantId, db => db.$client.query("INSERT INTO app.contractor_membership_revocation(tenant_id,id,membership_id) VALUES($1,$2,$3)", [f.p.tenantId, randomUUID(), f.p.membershipId]));
  await expect(rawAttempt(f)).rejects.toMatchObject({ code: "23514" });
 });
 it("[S6] every stored contractor hash equals the pure mirror with six-digit timestamp text", async () => {
  const f = await fixture(c); await repo.raiseExtra(f.ctx, raise(f, { deviceId: "fictional-device", deviceCapturedAt: "2026-10-01T01:02:03.123456Z" }));
  for (const row of (await c.admin.query(`${originSql} WHERE origin_hash IS NOT NULL`)).rows) { expect(row.server_text).toMatch(/\.\d{6}Z$/u); expect(extraOriginHashV1(originHashInput(row))).toBe(row.origin_hash); }
 });
 it("[S9] merged regression suites, scanner and seven pinned bridges stay byte-identical", async () => {
  const hashes = {
   "packages/db/test/shared-money-origin.integration.test.ts": "8095d33c25a5ea8ebf78a90fb0df926e958105df97a8901b109ee89fee1c1b56",
   "packages/db/test/work-order-import.integration.test.ts": "d2d9448e46c79fcba822fb8d3b0276e4b07df20309d53c2d31e3aba733324db4",
   "packages/db/test/work-order-concurrency.integration.test.ts": "c63bfde5e49701b698edb0b0d408390aaf5c93a6903cf0ee43a6ccd42fd7cf8e",
   "packages/db/test/job-scheduling.integration.test.ts": "f72ed51fa0cfd0f7241956ba593665992c0a963157c9cad482dfa11b1acd22b5",
   "packages/db/test/contractor.integration.test.ts": "6a024fb3e46e3db8b954c69838bddd22cc440c03bc68bcf29312c5a5f3f21ce9",
   "packages/db/test/variation.integration.test.ts": "c12456ca23db777f8deededc72ba1cc23a149fc00ef7764a48f8349a45998369",
   "packages/db/test/demo-bootstrap.integration.test.ts": "9105566ea61864253a0ee7de158dbe6b076b5538457b454e75d97f33ce684b8f",
   "packages/db/src/practice-session.ts": "9b765f410777c28334f9f7d8388e0a3c6e30f52bb6d4b4070c9b69e4ecbf1b14",
   "packages/db/src/contractor-repository.ts": "56b95b80360434f0cf58376ef2ec44d0354b194e5080bcfd9414ac283971006c",
   "packages/db/src/contractor-party-repository.ts": "e5852288e5355b53f7548c4d5741aef54ee55a2b8a66dd56a54b08963cd1fdb0",
   "packages/db/src/work-order-repository.ts": "4d101604ad160801f1d70b24ee7e3f55287bed2f3d53b9ed83b3d0113d4580a3",
   "packages/db/src/sor-repository.ts": "45e54b465b2a12747d838ea1cbb7c6a8d859f12894848940be5401ab17e000d5",
   "packages/db/src/job-scheduling-repository.ts": "ce9b3fee004db9e7e303511f169d55b4a8a2339521927816c9b378b79517e52d",
   "packages/db/src/work-order-fixtures.ts": "cfcd6d41a3618dd626544b3443e52fdba2c879accacb38637e49e531b4137386",
   "apps/api/src/auth/context-boundary.test.ts": "7f1914846f763c3534ffafc79701fc6f768e8e1546be2fe98e27bc32a99e0e8d"
};
  for (const [file, hash] of Object.entries(hashes)) expect(sha256Hex(await readFile(new URL(`../../../${file}`, import.meta.url), "utf8")), file).toBe(hash);
 });
 it("[C3] all fixtures are synthetic_demo and every raised identity is a new scope item", async () => {
  const f = await fixture(c), e = await repo.raiseExtra(f.ctx, raise(f));
  expect((await c.admin.query("SELECT environment FROM app.job_commercial_track WHERE tenant_id=$1 AND job_id=$2", [f.p.tenantId, f.jobId])).rows[0].environment).toBe("synthetic_demo");
  expect((await c.admin.query("SELECT scope_item_id,existing_scope_item_id FROM app.variation WHERE tenant_id=$1 AND id=$2", [f.p.tenantId, e.variationId])).rows[0].existing_scope_item_id).toBeNull();
 });
});
async function smallFixture(f: Fixture) {
 return ownerTx(c, f.p.tenantId, async db => { const id = randomUUID(); await db.$client.query("INSERT INTO app.job(tenant_id,id,title,status) VALUES($1,$2,'Fictional earlier small-builder job','live')", [f.p.tenantId, id]); return id; });
}

async function assignTrack(f: Fixture, track: string) {
 await ownerTx(c, f.p.tenantId, async db => { const assignment = randomUUID(); await db.$client.query("INSERT INTO app.commercial_track_assignment(tenant_id,id,revision,commercial_track,environment,agreement_reference,actor_ref) SELECT tenant_id,$2,max(revision)+1,$3,'synthetic_demo','synthetic-agreement:'||$4::text,$5 FROM app.commercial_track_assignment WHERE tenant_id=$1 GROUP BY tenant_id", [f.p.tenantId, assignment, track, randomUUID(), `membership:${f.p.membershipId}`]); await appendAuditBatch(db, [{ id: assignment, version: "audit.v1", actorRef: `membership:${f.p.membershipId}`, eventType: "commercial_track.assigned", subjectType: "tenant", subjectRef: f.p.tenantId, payload: { references: { assignment, environment: "synthetic_demo" } } }]); });
}
