// ENT-5 owner specimens are structural checks only; there is no issued approval writer.
import { randomUUID } from "node:crypto";
import { SiteExtraRepository, contractorSessionContext, withTenant, type VerifiedTenantContext } from "../src/index.js";
import { cluster, siteFixture, ownerTx, smallTrack } from "./site-extra-fixtures.js";
import type { Cluster } from "./extra-fixtures.js";
import { photo, shownFor, v3, storage } from "./site-extra-evidence-fixtures.js";
export { cluster, ownerTx, storage };
export type { Cluster };
export async function approvalFixture(c: Cluster) {
  const f = await siteFixture(c);
  const session = (await c.admin.query("SELECT session_id FROM control_plane.contractor_practice_session WHERE tenant_id=$1", [f.p.tenantId])).rows[0]!.session_id as string;
  const context: VerifiedTenantContext = await contractorSessionContext(c.runtime, session);
  const repo = new SiteExtraRepository(c.runtime);
  const priced = await repo.logSorSiteExtra(context, f.members.supervisor.member, { commandId: randomUUID(), jobId: f.jobId, sorCode: "CLEAR-GUTTER", quantity: "100", note: "Fictional ENT5 SoR" });
  const original = await photo(c, { ctx: f.ctx, jobId: f.jobId });
  const captured = await repo.logSiteExtra(context, f.members.supervisor.member, v3(f, { photoEvidenceId: original.id, shownContentSha256: shownFor(f, original.sha256) }));
  const source = (await c.admin.query("SELECT id,content_hash,command_id,raising_membership_id,net_pence FROM app.extra_sor_revision WHERE tenant_id=$1 AND variation_id=$2", [f.p.tenantId, priced.variationId])).rows[0]!;
  return { ...f, session, priced, captured, source, original };
}
export type ApprovalFixture = Awaited<ReturnType<typeof approvalFixture>>;
export async function approvalWorld(c: Cluster) {
  const a = await approvalFixture(c), b = await approvalFixture(c), small = await siteFixture(c);
  await smallTrack(c, small);
  return { a, b, small };
}
export const bindingValues = (f: ApprovalFixture, changes: Record<string, unknown> = {}) => ({ tenant_id: f.p.tenantId, id: randomUUID(), job_id: f.jobId, variation_id: f.priced.variationId, logical_revision: 1, source_kind: "server_sor", source_revision_id: f.source.id,
  sor_revision_id: f.source.id, variation_revision_id: null, source_hash: f.source.content_hash, predecessor_binding_id: null, command_id: f.source.command_id, actor_membership_id: f.source.raising_membership_id, ...changes });
export async function insertBinding(c: Cluster, f: ApprovalFixture, changes: Record<string, unknown> = {}) {
  const values = bindingValues(f, changes), entries = Object.entries(values);
  return ownerTx(c, f.p.tenantId, async db => (await db.$client.query(`INSERT INTO app.extra_approval_revision_binding(${entries.map(([n]) => n).join(",")}) VALUES(${entries.map((_, i) => `$${i + 1}`).join(",")}) RETURNING id,binding_hash`, entries.map(([, v]) => v))).rows[0]!);
}
export async function insertPack(c: Cluster, f: ApprovalFixture) {
  const id = randomUUID();
  await ownerTx(c, f.p.tenantId, async db => { await db.$client.query("INSERT INTO app.extra_evidence_pack(tenant_id,id,job_id,variation_id,command_id,actor_membership_id) VALUES($1,$2,$3,$4,$5,$6)", [f.p.tenantId, id, f.jobId, f.priced.variationId, f.source.command_id, f.source.raising_membership_id]); });
  return id;
}
/** Fresh connection from the real pool, existing persisted session bridge passed whole. No new context maker. */
export async function bindingCount(c: Cluster, f: ApprovalFixture) {
  const context: VerifiedTenantContext = await contractorSessionContext(c.runtime, f.session);
  return withTenant(c.runtime, context, async db => (await db.$client.query("SELECT count(*)::int n FROM app.extra_approval_revision_binding")).rows[0]!.n as number);
}
