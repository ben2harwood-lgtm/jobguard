// Shared set-up for the ENT-3b database files. Builds on merged cluster()/fixture() and ENT-3a's site-extra-fixtures.ts (imported, never edited).
import { randomUUID } from "node:crypto";
import { WorkOrderRepository, demoFile, demoRow, withTenant, type AuthenticatedMembership } from "../src/index.js";
import { siteFixture, invite, chain, ownerTx, cluster, command, smallJob, type SiteFixture, type Actor } from "./site-extra-fixtures.js";
import type { Cluster } from "./extra-fixtures.js";
export { cluster, ownerTx, invite, command, chain, smallJob, siteFixture };
export type { Cluster, SiteFixture, Actor };
/** The seven roles that may not visit, in the order the rule names them. */
export const forbiddenRoles = ["owner", "admin", "surveyor", "commercial_manager", "finance", "read_only", "client_approver"] as const;
export type ForbiddenRole = typeof forbiddenRoles[number];
export const visitorsAndOthers = ["operative", "supervisor"] as const;

/** Re-import the order as a new revision naming exactly these members, so the current revision names them and nobody else. */
export async function reviseOrder(c: Cluster, f: SiteFixture, expectedRevision: number, assigned: string[], overrides: Record<string, unknown> = {}) {
 await new WorkOrderRepository(c.runtime).importCsv(f.p, { commandId: randomUUID(), name: "fictional-ent3b-revision.csv", kind: "csv", csv: demoFile([demoRow(f.demo, 1, { expectedRevision, assignedMembershipIds: assigned, ...overrides })]) });
}
/** The standard visit fixture: ENT-3a's roster plus a supervisor of the job's team who IS named on it (revision 2 names the demo operative and that supervisor). */
export async function visitFixture(c: Cluster) {
 const s = await siteFixture(c);
 const named = await invite(c, s, "supervisor", { kind: "team", id: s.demo.teamId });
 await reviseOrder(c, s, 1, [s.demo.operativeMembershipId, named.member.membershipId]);
 return { ...s, named, revision: 2 };
}
export type VisitFixture = Awaited<ReturnType<typeof visitFixture>>;
export const operative = (f: VisitFixture): Actor => f.members.operative;
export async function cancelOrder(c: Cluster, f: VisitFixture) {
 await reviseOrder(c, f, f.revision, [], { status: "cancelled", lines: [] });
 f.revision += 1;
}
/** Moves the work-order job off live as the table owner (the merged watchdog tests put jobs in other states by owner writes). */
export async function moveOffLive(c: Cluster, f: VisitFixture, status = "invoiced") {
 await ownerTx(c, f.p.tenantId, async db => { await db.$client.query("UPDATE app.job SET status=$3 WHERE tenant_id=$1 AND id=$2", [f.p.tenantId, f.jobId, status]); });
}
export async function backToLive(c: Cluster, f: VisitFixture) { await moveOffLive(c, f, "live"); }
/** The runtime role inside the tenant, exactly as a request would call it. */
export async function authority(c: Cluster, f: VisitFixture, member: string | null, job: string | null = f.jobId) {
 return withTenant(c.runtime, f.ctx, async db => (await db.$client.query("SELECT * FROM app.ent3b_visit_authority($1,$2)", [member, job])).rows);
}
export const expectedRefusal = { decision: "not_found", reason_code: "job_out_of_scope" };
/** Everything a refused command must leave alone, read as the cluster's superuser. Visit rows are compared as canonical text. */
export async function snapshot(c: Cluster, tenantId: string) {
 const one = async (sql: string) => (await c.admin.query(sql, [tenantId])).rows;
 return {
  receipts: await one("SELECT command_id,command_type,status,result::text FROM app.command_receipt WHERE tenant_id=$1 AND command_type IN('StartSiteVisit','CompleteSiteVisit') ORDER BY command_id"),
  visits: await one("SELECT row_to_json(v)::text row FROM app.site_visit v WHERE tenant_id=$1 ORDER BY id"),
  answers: await one("SELECT row_to_json(a)::text row FROM app.closeout_answer a WHERE tenant_id=$1 ORDER BY id"),
  events: await one("SELECT id,event_type FROM app.audit_event WHERE tenant_id=$1 AND event_type IN('contractor.visit.started','contractor.visit.completed') ORDER BY id"),
 };
}
export async function refusalEvents(c: Cluster, tenantId: string) {
 return (await c.admin.query("SELECT id,actor_ref,subject_type,subject_ref,payload FROM app.audit_event WHERE tenant_id=$1 AND event_type='contractor.visit.refused' ORDER BY sequence", [tenantId])).rows;
}
export async function auditHead(c: Cluster, tenantId: string): Promise<string | undefined> {
 return (await c.admin.query("SELECT event_hash FROM app.audit_event WHERE tenant_id=$1 ORDER BY sequence DESC LIMIT 1", [tenantId])).rows[0]?.event_hash;
}
/** Server clock before and after a call, read from the database itself (never the test machine's clock). */
export async function serverTime(c: Cluster): Promise<string> { return (await c.admin.query("SELECT clock_timestamp()::text value")).rows[0]!.value as string; }
export function asMember(f: VisitFixture, memberId: string, identityUserId: string): AuthenticatedMembership {
 return { tenantId: f.p.tenantId, membershipId: memberId, identityUserId } as AuthenticatedMembership;
}
export const startInput = (f: VisitFixture, fields: Record<string, unknown> = {}) => ({ commandId: randomUUID(), jobId: f.jobId, ...fields });
export const completeInput = (f: VisitFixture, visitId: string, answer: unknown = "yes", fields: Record<string, unknown> = {}) => ({ commandId: randomUUID(), jobId: f.jobId, visitId, closeoutAnswer: answer, ...fields });
/** An open visit written by the table owner, for the cases that need one without the command path. */
export async function ownerVisit(c: Cluster, f: VisitFixture, memberId: string, jobId = f.jobId, orderId = f.orderId): Promise<string> {
 const id = randomUUID();
 await ownerTx(c, f.p.tenantId, async db => { await db.$client.query("INSERT INTO app.site_visit(tenant_id,id,job_id,work_order_id,membership_id) VALUES($1,$2,$3,$4,$5)", [f.p.tenantId, id, jobId, orderId, memberId]); });
 return id;
}
