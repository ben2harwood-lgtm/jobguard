// Written first. PostgreSQL tests NOT RUN in the builder sandbox.
import { randomUUID } from "node:crypto";
import { ContractorRepository, WorkOrderRepository, addBranchClient, demoFile, demoRow, withTenant, appendAuditBatch, verifyAuditChain, type AuthenticatedMembership, type AuditEvent } from "../src/index.js";
import { fixture, ownerTx, type Cluster, type Fixture } from "./extra-fixtures.js";
export { cluster, ownerTx, originSql, originHashInput } from "./extra-fixtures.js";
export const roles = ["owner", "admin", "operative", "supervisor", "surveyor", "commercial_manager", "finance", "read_only", "client_approver"] as const;
export type Role = typeof roles[number];
export type Actor = { member: AuthenticatedMembership; grant: string };
export const note = "Fictional ENT3A note canary";
export const description = "Fictional ENT3A description canary";
export const input = (f: Fixture) => ({ commandId: randomUUID(), jobId: f.jobId, note, description });
export async function command(c: Cluster, f: Fixture, fields: Record<string, unknown>) {
 const repo = new ContractorRepository(c.runtime);
 const view = await repo.query(f.p, { version: "contractor-query.v1", tenantId: f.p.tenantId, resource: "organisation" });
 return repo.command(f.p, { version: "contractor-command.v1", environment: "synthetic_demo", commandId: randomUUID(), id: randomUUID(), expectedRevision: view.revision, ...fields });
}
export async function actor(c: Cluster, f: Fixture, memberId: string): Promise<Actor> {
 const row = (await c.admin.query("SELECT m.identity_user_id,g.id FROM app.membership m JOIN app.role_grant g ON(g.tenant_id,g.membership_id)=(m.tenant_id,m.id) WHERE m.tenant_id=$1 AND m.id=$2 AND NOT EXISTS(SELECT 1 FROM app.role_grant_revocation r WHERE(r.tenant_id,r.grant_id)=(g.tenant_id,g.id)) ORDER BY g.id", [f.p.tenantId, memberId])).rows[0]!;
 return { member: { tenantId: f.p.tenantId, membershipId: memberId, identityUserId: row.identity_user_id } as AuthenticatedMembership, grant: row.id };
}
export async function invite(c: Cluster, f: Fixture, role: Role, scope: { kind: string; id: string }): Promise<Actor> {
 const result = await command(c, f, { kind: "member.invite", role, email: `fictional.${randomUUID()}@fictional.invalid`, scope, clientId: role === "client_approver" ? f.demo.clientId : null, contractId: role === "client_approver" ? f.demo.contractId : null });
 return actor(c, f, result.id);
}
export async function siteFixture(c: Cluster) {
 const f = await fixture(c), members = {} as Record<Role, Actor>;
 members.owner = { member: f.p, grant: f.grantId };
 members.operative = await actor(c, f, f.demo.operativeMembershipId);
 for (const role of roles.filter(r => r !== "owner" && r !== "operative")) {
  const scope = role === "supervisor" ? { kind: "team", id: f.demo.teamId } : role === "surveyor" || role === "commercial_manager" ? { kind: "branch", id: f.demo.branchId } : role === "client_approver" ? { kind: "client", id: f.demo.clientId } : { kind: "tenant", id: f.p.tenantId };
  members[role] = await invite(c, f, role, scope);
 }
 const otherDemo = await addBranchClient(c.runtime, f.p, f.demo, "ENT3A Other");
 await new WorkOrderRepository(c.runtime).importCsv(f.p, { commandId: randomUUID(), name: "fictional-other.csv", kind: "csv", csv: demoFile([demoRow(otherDemo, 2, { assignedMembershipIds: [] })]) });
 const otherJob = (await c.admin.query("SELECT job_id FROM app.work_order WHERE tenant_id=$1 AND client_id=$2", [f.p.tenantId, otherDemo.clientId])).rows[0]!.job_id as string;
 const unassigned = await invite(c, f, "operative", { kind: "team", id: f.demo.teamId });
 const otherSupervisor = await invite(c, f, "supervisor", { kind: "team", id: otherDemo.teamId });
 const otherSurveyor = await invite(c, f, "surveyor", { kind: "branch", id: otherDemo.branchId });
 return { ...f, members, otherDemo, otherJob, unassigned, otherSupervisor, otherSurveyor };
}
export type SiteFixture = Awaited<ReturnType<typeof siteFixture>>;
export async function decision(c: Cluster, f: Fixture, member: AuthenticatedMembership, type: string | null, job: string | null = f.jobId) {
 return withTenant(c.runtime, f.ctx, async db => (await db.$client.query("SELECT * FROM app.ent3a_extra_authority($1,$2,$3)", [member.membershipId, type, job])).rows);
}
export async function counts(c: Cluster, f: Fixture) {
 const result: Record<string, number> = {};
 for (const table of ["command_receipt", "scope_identity", "scope_lineage", "variation", "extra_origin", "extra_event", "extra_duplicate_link"]) result[table] = (await c.admin.query(`SELECT count(*)::int n FROM app.${table} WHERE tenant_id=$1`, [f.p.tenantId])).rows[0]!.n;
 result.raised = (await c.admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND event_type='contractor.extra.raised'", [f.p.tenantId])).rows[0]!.n;
 return result;
}
export async function chain(c: Cluster, f: Fixture) {
 const rows = (await c.admin.query("SELECT * FROM app.audit_event WHERE tenant_id=$1 ORDER BY sequence", [f.p.tenantId])).rows;
 verifyAuditChain(rows.map(r => ({ id: r.id, version: r.version, tenantId: r.tenant_id, sequence: Number(r.sequence), actorRef: r.actor_ref, eventType: r.event_type, subjectType: r.subject_type, subjectRef: r.subject_ref, occurredAt: r.occurred_at, payload: r.payload, payloadHash: r.payload_hash, previousHash: r.previous_hash, eventHash: r.event_hash })) as AuditEvent[]);
 return rows.at(-1)?.event_hash as string | undefined;
}
export async function smallJob(c: Cluster, f: Fixture) {
 return ownerTx(c, f.p.tenantId, async db => { const id = randomUUID(); await db.$client.query("INSERT INTO app.job(tenant_id,id,title,status) VALUES($1,$2,'Fictional small-builder job','live')", [f.p.tenantId, id]); return id; });
}
export async function smallTrack(c: Cluster, f: Fixture) {
 await ownerTx(c, f.p.tenantId, async db => {
  const assignment = randomUUID();
  await db.$client.query("INSERT INTO app.commercial_track_assignment(tenant_id,id,revision,commercial_track,environment,agreement_reference,actor_ref) SELECT tenant_id,$2,max(revision)+1,'small_builder','synthetic_demo','synthetic-agreement:'||$3::text,$4 FROM app.commercial_track_assignment WHERE tenant_id=$1 GROUP BY tenant_id", [f.p.tenantId, assignment, randomUUID(), `membership:${f.p.membershipId}`]);
  await appendAuditBatch(db, [{ id: assignment, version: "audit.v1", actorRef: `membership:${f.p.membershipId}`, eventType: "commercial_track.assigned", subjectType: "tenant", subjectRef: f.p.tenantId, payload: { references: { assignment, environment: "synthetic_demo" } } }]);
 });
}
export async function cancel(c: Cluster, f: Fixture) {
 await new WorkOrderRepository(c.runtime).importCsv(f.p, { commandId: randomUUID(), name: "fictional-cancel.csv", kind: "csv", csv: demoFile([demoRow(f.demo, 1, { expectedRevision: 1, status: "cancelled", lines: [] })]) });
}
export const direct = (f: Fixture, a: Actor, fields: Record<string, unknown> = {}) => ({ version: "raise-extra.v1", ...input(f), commandType: "LogSiteExtra", actorMembershipId: a.member.membershipId, grantId: a.grant, ...fields });
