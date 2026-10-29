import { seedActiveContractorAgreement } from "./contractor-agreement-test-fixture.js";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { expect } from "vitest";
import { ContractorRepository, PracticeWorkerSwitchRepository, WorkOrderRepository, prepareWorkOrderDemo, demoFile, demoRow, withTenant } from "../src/index.js";
import { startSession, seedHomeOwner, currentCommand, type Cluster, type SessionFixture } from "./contractor-practice-session-fixtures.js";
export { cluster, ownerTx, startBeforeMigration, applyMigration, startSession, makeSessionExpired, endHomeRecord, digestOf, resolvers, companyRows } from "./contractor-practice-session-fixtures.js";
export async function startSessionWithHomeRecord(c: Cluster) {
 // The full-migration cluster has no shared HOME owner. Seed through the
 // existing admin-only fixture; LP-1 deliberately forbids runtime setup writes.
 await seedHomeOwner(c);
 return startSession(c, true);
}
export const migrationName = "0165_practice_worker_switch.sql";
export const restoreHardenedLookup = `CREATE OR REPLACE FUNCTION app.contractor_session(s uuid) RETURNS TABLE(tenant_id uuid,membership_id uuid,identity_user_id uuid) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT l.tenant_id,l.membership_id,l.identity_user_id FROM app.contractor_practice_session_live(s) l $$;`;
export const disableSwitchOn = "REVOKE EXECUTE ON FUNCTION app.practice_worker_switch_on(uuid,uuid,uuid) FROM jobguard_runtime;";
export const on = () => ({ version: "practice-worker-switch-on.v1", commandId: randomUUID() });
export const off = () => ({ version: "practice-worker-switch-off.v1", commandId: randomUUID() });
export async function company(c: Cluster) {
 const f = await startSession(c), demo = await prepareWorkOrderDemo(c.runtime, f.p, { siteCount: 1 });
 await new WorkOrderRepository(c.runtime).importCsv(f.p, { commandId: randomUUID(), name: "fictional.csv", kind: "csv", csv: demoFile([demoRow(demo, 1)]) });
 const members: Record<string, string> = { owner: f.p.membershipId, operative: demo.operativeMembershipId };
 for (const role of ["supervisor", "surveyor", "admin", "commercial_manager", "finance", "read_only", "client_approver"]) {
  const client = role === "client_approver";
  const result = await new ContractorRepository(c.runtime).command(f.p, await currentCommand(c, f, { kind: "member.invite", role, email: `${role}@fictional.invalid`, scope: { kind: client ? "client" : role === "finance" ? "tenant" : "team", id: client ? demo.clientId : role === "finance" ? f.p.tenantId : demo.teamId }, clientId: client ? demo.clientId : null, contractId: null }));
  members[role] = result.id;
 }
 for (const label of ["second", "revoked", "wider"]) {
  const made = await new ContractorRepository(c.runtime).command(f.p, await currentCommand(c, f, { kind: "member.invite", role: "operative", email: `${label}@fictional.invalid`, scope: { kind: "team", id: demo.teamId }, clientId: null, contractId: null }));
  members[label] = made.id;
  if (label === "revoked") await new ContractorRepository(c.runtime).command(f.p, await currentCommand(c, f, { kind: "membership.revoke", membershipId: made.id }));
  if (label === "wider") await new ContractorRepository(c.runtime).command(f.p, await currentCommand(c, f, { kind: "grant.create", membershipId: made.id, role: "read_only", scope: { kind: "team", id: demo.teamId }, contractId: null }));
 }
 const jobId = (await c.admin.query("SELECT job_id FROM app.work_order WHERE tenant_id=$1", [f.p.tenantId])).rows[0]!.job_id as string;
 const sessionRef = (await c.admin.query("SELECT session_id FROM control_plane.contractor_practice_session WHERE tenant_id=$1 AND membership_id=$2", [f.p.tenantId, f.p.membershipId])).rows[0]!.session_id as string;
 return { ...f, demo, members, jobId, sessionRef };
}
export type Company = Awaited<ReturnType<typeof company>>;
export const repo = (c: Cluster) => new PracticeWorkerSwitchRepository(c.runtime);
export const start = (c: Cluster, f: Company, role = "operative", command = on()) => repo(c).switchOn(f.context, f.p, f.session, { ...command, workerId: f.members[role]! });
export const end = (c: Cluster, f: SessionFixture, command = off()) => repo(c).switchOff(f.context, f.p, f.session, command);
export const state = (c: Cluster, f: SessionFixture) => repo(c).state(f.context, f.session);
export const lookup = (c: Cluster, f: SessionFixture) => new ContractorRepository(c.runtime).resolveSession(f.session);
export async function text(c: Cluster, table: string, tenant?: string) {
 return (await c.admin.query(`SELECT row_to_json(t)::text bytes FROM ${table} t ${tenant ? "WHERE tenant_id=$1" : ""} ORDER BY row_to_json(t)::text COLLATE "C"`, tenant ? [tenant] : [])).rows.map(r => r.bytes);
}
export async function expireSwitch(c: Cluster, f: Company, minutes = 31) {
 const client = await c.admin.connect();
 try { await client.query("BEGIN"); await client.query("ALTER TABLE control_plane.practice_worker_switch DISABLE TRIGGER USER");
  await client.query("WITH reading AS MATERIALIZED(SELECT clock_timestamp()-make_interval(mins=>$2::int) t) UPDATE control_plane.practice_worker_switch s SET started_at=reading.t,expires_at=reading.t+interval '30 minutes' FROM reading WHERE s.session_ref=$1 AND s.ended_at IS NULL", [f.sessionRef, minutes]);
  await client.query("ALTER TABLE control_plane.practice_worker_switch ENABLE TRIGGER USER"); await client.query("COMMIT");
 } catch(error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}
export async function raw(c: Cluster, f: Company, sql: string, args: unknown[] = []) {
 return withTenant(c.runtime, f.context, db => db.$client.query(sql, args));
}
export async function refusedCode(work: Promise<unknown>, code: string) { await expect(work).rejects.toMatchObject({ code }); }
export async function savepoint(db: PoolClient, work: () => Promise<unknown>, code: string) {
 await db.query("SAVEPOINT pws_control"); await expect(work()).rejects.toMatchObject({ code }); await db.query("ROLLBACK TO SAVEPOINT pws_control");
}
/** A table-owner construction, never a product bootstrap: the explicit origin limit. */
export async function handBuilt(c: Cluster, signIn = false) {
 const tenant = randomUUID(), account = randomUUID(), user = randomUUID(), member = randomUUID(), region = randomUUID(), branch = randomUUID(), team = randomUUID(), session = randomUUID(), sessionRef = randomUUID(), assignment = randomUUID();
 const { digestOf } = await import("./contractor-practice-session-fixtures.js");
 const { ownerTx } = await import("./extra-fixtures.js");
 const { appendAuditBatch, contractorSessionContext } = await import("../src/index.js");
 await c.admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [tenant]);
 await ownerTx(c, tenant, async db => {
  await db.$client.query("INSERT INTO identity.identity_user(id) VALUES($1)", [user]);
  await db.$client.query("INSERT INTO app.account(tenant_id,id,name) VALUES($1,$2,'Fictional hand-built company')", [tenant, account]);
  await db.$client.query("INSERT INTO app.membership(tenant_id,id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [tenant, member, account, user]);
  await db.$client.query("INSERT INTO control_plane.contractor_practice_session(session_id,tenant_id,membership_id,identity_user_id,session_digest,created_at,expires_at) SELECT $1,$2,$3,$4,$5,r.t,r.t+interval '7 days' FROM (SELECT clock_timestamp() t) r", [sessionRef, tenant, member, user, digestOf(session)]);
  await db.$client.query("SELECT app.assign_commercial_track($1,$2,'contractor',$3,0,'operations:pws-fixture')", [tenant, assignment, `synthetic-agreement:${tenant}`]);
  await db.$client.query("INSERT INTO app.contractor_member VALUES($1,$2,NULL,'owner@fictional.invalid')", [tenant, member]);
  await db.$client.query("INSERT INTO app.org_unit VALUES($1,$1,'tenant',NULL,NULL,'Fictional'),($1,$2,'region',$1,'tenant','Fictional region'),($1,$3,'branch',$2,'region','Fictional branch')", [tenant, region, branch]);
  await db.$client.query("INSERT INTO app.team(tenant_id,id,branch_id,name) VALUES($1,$2,$3,'Fictional team')", [tenant, team, branch]);
  await db.$client.query("INSERT INTO app.role_grant VALUES($1,$2,$3,'owner','tenant',$1,NULL)", [tenant, randomUUID(), member]);
  await appendAuditBatch(db, [{ id: assignment, version: "audit.v1", actorRef: "operations:pws-fixture", eventType: "commercial_track.assigned", subjectType: "tenant", subjectRef: tenant, payload: { references: { assignment, environment: "synthetic_demo" }, classifications: { action: "security" } } }]);
 });
 await seedActiveContractorAgreement(c.admin, tenant);
 const p = await new ContractorRepository(c.runtime).resolveSession(session);
 const context = await contractorSessionContext(c.runtime, session);
 const f = { p, session, context, home: false };
 const worker = await new ContractorRepository(c.runtime).command(p, await currentCommand(c, f, { kind: "member.invite", role: "operative", email: "worker@fictional.invalid", scope: { kind: "team", id: team }, clientId: null, contractId: null }));
 if (signIn) { await c.admin.query("INSERT INTO identity.user_email(email,user_id) VALUES($1,$2)", [`${randomUUID()}@fictional.invalid`, user]); await c.admin.query("INSERT INTO identity.membership_locator VALUES($1,$2,$3)", [user, tenant, member]); }
 return { ...f, sessionRef, workerId: worker.id };
}
