// Synthetic repository probe only; reuses the merged runtime-role cluster and fixture boundary.
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { expect } from "vitest";
import { extraOriginHashV1 } from "@jobguard/core";
import { parseOfflineIntentV1, toLogSiteExtraV1 } from "../../core/src/offline-contract.js";
import { SiteExtraRepository, WorkOrderRepository, demoFile, demoRow, type AuthenticatedMembership } from "../src/index.js";
import { originSql, originHashInput, type Cluster, type Fixture } from "./extra-fixtures.js";
import { siteFixture, invite, type SiteFixture } from "./site-extra-fixtures.js";

export { cluster, type Cluster } from "./extra-fixtures.js";
export { siteFixture, invite, command, ownerTx, chain, counts, type SiteFixture } from "./site-extra-fixtures.js";
export function intent(jobId: string, index = 0) {
 // Fictional v7 identity bytes, not a production UUID generator or a trusted time.
 const uuid = randomUUID();
 return parseOfflineIntentV1({ version: "offline-intent.v1", jobId,
  clientMetadata: { capturedAt: index % 2 ? "2099-01-01T00:00:00Z" : "1970-01-01T00:00:00Z", hlc: { wallTimeMs: index % 2 ? Number.MAX_SAFE_INTEGER : 0, logical: 0, nodeId: `fictional-crew-${index % 3}` } },
  body: { version: "log-site-extra.v1", commandId: `${uuid.slice(0, 14)}7${uuid.slice(15)}`, note: ` Fictional offline note ${index} `, description: `Fictional offline extra ${index}` },
 });
}
export type Intent = ReturnType<typeof intent>;
export function submit(pool: Pool, f: Fixture, actor: AuthenticatedMembership, raw: Intent) {
 const converted = toLogSiteExtraV1(parseOfflineIntentV1(JSON.parse(JSON.stringify(raw))));
 const { version: _version, ...body } = converted.body;
 return new SiteExtraRepository(pool).logSiteExtra(f.ctx, actor, { jobId: converted.jobId, ...body });
}
export async function freshRuntime<T>(c: Cluster, work: (pool: Pool) => Promise<T>) {
 // pg-pool makes options.password non-enumerable; a spread alone loses authentication.
 // Retain the runtime role and its credentials, never the cluster's admin user.
 const pool = new Pool({ ...c.runtime.options, password: c.runtime.options.password, max: 3 });
 try { return await work(pool); } finally { await pool.end(); }
}
/** Named columns as canonical text, including sub-millisecond server times. Refusal audit is separate. */
export async function facts(c: Cluster, f: Fixture) {
 const select = async (table: string, columns: string, order: string, condition = "") => (await c.admin.query(`SELECT row_to_json(t)::text row FROM (SELECT ${columns} FROM app.${table} WHERE tenant_id=$1 ${condition} ORDER BY ${order}) t`, [f.p.tenantId])).rows;
 return {
  receipts: await select("command_receipt", "command_id,command_type,request_hash,status,actor_membership_id,result,completed_at", "command_id", "AND command_type='LogSiteExtra'"),
  scopes: await select("scope_identity", "id,job_id", "id"),
  variations: await select("variation", "id,job_id,scope_item_id,capture_kind,capture_text,description", "id"),
  origins: await select("extra_origin", "variation_id,job_id,command_id,raising_membership_id,raising_role,raising_grant_id,work_order_revision_id,server_recorded_at,device_id,device_captured_at,origin_hash", "variation_id"),
  events: await select("extra_event", "id,job_id,variation_id,kind,command_id,actor_membership_id", "id"),
  audit: await select("audit_event", "id,version,sequence,actor_ref,event_type,subject_ref,event_hash", "sequence", "AND event_type='contractor.extra.raised'"),
 };
}
export async function committed(c: Cluster, f: Fixture, actor: AuthenticatedMembership, raw: Intent, first: { variationId: string }) {
 const receipt = (await c.admin.query("SELECT command_type,status,actor_membership_id,result,request_hash FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2", [f.p.tenantId, raw.body.commandId])).rows;
 expect(receipt).toHaveLength(1); expect(receipt[0]).toMatchObject({ command_type: "LogSiteExtra", status: "succeeded", actor_membership_id: actor.membershipId, result: first });
 const rows = (await c.admin.query(`${originSql} WHERE tenant_id=$1 AND variation_id=$2`, [f.p.tenantId, first.variationId])).rows;
 expect(rows).toHaveLength(1); const origin = rows[0]!;
 expect(origin).toMatchObject({ job_id: raw.jobId, command_id: raw.body.commandId, raising_membership_id: actor.membershipId, command_type: "LogSiteExtra", device_id: null, device_captured_at: null, client_capture_id: null });
 expect(origin.origin_hash).toBe(extraOriginHashV1(originHashInput(origin)));
 expect((await c.admin.query("SELECT v.job_id,v.capture_text,v.description,s.id scope FROM app.variation v JOIN app.scope_identity s ON(s.tenant_id,s.job_id,s.id)=(v.tenant_id,v.job_id,v.scope_item_id) WHERE v.tenant_id=$1 AND v.id=$2", [f.p.tenantId, first.variationId])).rows).toEqual([{ job_id: raw.jobId, capture_text: raw.body.note, description: raw.body.description, scope: expect.any(String) }]);
 expect((await c.admin.query("SELECT kind,command_id,actor_membership_id FROM app.extra_event WHERE tenant_id=$1 AND variation_id=$2", [f.p.tenantId, first.variationId])).rows).toEqual([{ kind: "logged", command_id: raw.body.commandId, actor_membership_id: actor.membershipId }]);
 expect((await c.admin.query("SELECT version,actor_ref FROM app.audit_event WHERE tenant_id=$1 AND subject_ref=$2 AND event_type='contractor.extra.raised'", [f.p.tenantId, first.variationId])).rows).toEqual([{ version: "audit.v1", actor_ref: `membership:${actor.membershipId}` }]);
 return origin;
}
export async function revise(c: Cluster, f: SiteFixture, assigned: string[], expectedRevision = 1) {
 // The initial demo row is already urgent. Alternate a content field so even an
 // unchanged assignment set produces a real revision rather than an import no-op.
 const priority = expectedRevision % 2 ? "routine" : "emergency";
 const result = await new WorkOrderRepository(c.runtime).importCsv(f.p, { commandId: randomUUID(), name: "fictional-offline-revision.csv", kind: "csv", csv: demoFile([demoRow(f.demo, 1, { expectedRevision, assignedMembershipIds: assigned, priority })]) });
 expect(result.rows).toEqual([expect.objectContaining({ outcome: "revised", errorCode: null, workOrderId: f.orderId, revisionId: expect.any(String) })]);
 return result;
}
export async function crews(c: Cluster) {
 const f = await siteFixture(c);
 const actors = [f.members.operative, await invite(c, f, "supervisor", { kind: "team", id: f.demo.teamId }), await invite(c, f, "supervisor", { kind: "team", id: f.demo.teamId })];
 await revise(c, f, actors.map(a => a.member.membershipId));
 return { f, actors };
}
export function seeded(seed: number) { let state = seed; return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state; }; }
export function shuffled<T>(items: readonly T[], next: () => number) {
 const result = [...items];
 for (let i = result.length - 1; i > 0; i--) { const j = next() % (i + 1); [result[i], result[j]] = [result[j]!, result[i]!]; }
 return result;
}
