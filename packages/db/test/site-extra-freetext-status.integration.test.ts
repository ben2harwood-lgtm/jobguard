import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { SiteExtraRepository } from "../src/site-extra-repository.js";
import { cluster, siteFixture, photo, pendingPhoto, chain, type Cluster } from "./site-extra-evidence-fixtures.js";
let c: Cluster;
beforeAll(async () => { c = await cluster(); }, 90_000);
afterAll(async () => { await c?.close(); });

it("free-text statuses replay one immutable server statement, remain unpriced, and reject changed status and hidden targets", async () => {
 const f = await siteFixture(c), other = await siteFixture(c), actor = f.members.operative.member;
 const repo = new SiteExtraRepository(c.runtime);
 for (const workStatus of ["not_started", "under_way", "finished"]) {
  const raw = { version: "log-site-extra.v4", commandId: randomUUID(), jobId: f.jobId, note: "Fictional reviewed note", description: "Fictional unpriced extra", workStatus };
  const [first, replay] = await Promise.all([repo.logSiteExtra(f.ctx, actor, raw), repo.logSiteExtra(f.ctx, actor, raw)]);
  expect(replay).toEqual(first);
  const read = async () => (await c.admin.query(`SELECT s.*,o.kind,o.site_visit_id,(s.recorded_at>=o.server_recorded_at AND s.recorded_at<=clock_timestamp()) server_time
   FROM app.site_extra_work_status s JOIN app.extra_origin o ON(o.tenant_id,o.variation_id)=(s.tenant_id,s.variation_id)
   WHERE s.tenant_id=$1 AND s.variation_id=$2`, [f.p.tenantId, first.variationId])).rows;
  const stored = await read();
  expect(stored).toHaveLength(1);
  expect(stored[0]).toMatchObject({ work_status: workStatus, operative_membership_id: actor.membershipId, kind: "site_user", site_visit_id: null, server_time: true });
  expect(await repo.logSiteExtra(f.ctx, actor, raw)).toEqual(first);
  await expect(repo.logSiteExtra(f.ctx, actor, { ...raw, workStatus: workStatus === "finished" ? "not_started" : "finished" })).rejects.toMatchObject({ code: "COMMAND_CONFLICT" });
  expect(await read()).toEqual(stored);
  const audit = await c.admin.query("SELECT payload FROM app.audit_event WHERE tenant_id=$1 AND subject_ref=$2 AND event_type='contractor.extra.work_status_recorded'", [f.p.tenantId, first.variationId]);
  expect(audit.rows).toEqual([{ payload: {
   references: { job: f.jobId, extra: first.variationId, command: raw.commandId, workStatus, source: "operative_statement", auditTrust: "checked_operation" },
   classifications: { action: "operational" },
  } }]);
  expect((await c.admin.query("SELECT kind FROM app.extra_event WHERE tenant_id=$1 AND variation_id=$2 ORDER BY sequence", [f.p.tenantId, first.variationId])).rows).toEqual([{ kind: "logged" }]);
  for (const table of ["extra_sor_revision", "extra_approval_request"]) expect((await c.admin.query(`SELECT 1 FROM app.${table} WHERE tenant_id=$1 AND variation_id=$2`, [f.p.tenantId, first.variationId])).rows).toEqual([]);
  for (const key of ["origin", "time", "actor", "role", "track"]) await expect(repo.logSiteExtra(f.ctx, actor, { ...raw, commandId: randomUUID(), [key]: "forged" })).rejects.toMatchObject({ code: "INVALID_COMMAND" });
  await expect(repo.logSiteExtra(f.ctx, f.unassigned.member, { ...raw, commandId: randomUUID() })).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(repo.logSiteExtra(f.ctx, actor, { ...raw, commandId: randomUUID(), jobId: other.jobId })).rejects.toMatchObject({ code: "NOT_FOUND" });
 }
 await chain(c, f);
});
it("v4 keeps verified-photo enforcement and refuses no note and no verified photo", async () => {
 const f = await siteFixture(c), actor = f.members.operative.member, repo = new SiteExtraRepository(c.runtime);
 const raw = { version: "log-site-extra.v4", workStatus: "finished", commandId: randomUUID(), jobId: f.jobId, description: "Fictional extra", note: "Fictional note" };
 await expect(repo.logSiteExtra(f.ctx, actor, { ...raw, note: "" })).rejects.toMatchObject({ code: "INVALID_COMMAND" });
 const pending = await pendingPhoto(c, { ctx: f.ctx, jobId: f.jobId });
 await expect(repo.logSiteExtra(f.ctx, actor, { ...raw, photoEvidenceId: pending.id })).rejects.toMatchObject({ code: "PHOTO_NOT_ACCEPTED" });
 const image = await photo(c, { ctx: f.ctx, jobId: f.jobId });
 const result = await repo.logSiteExtra(f.ctx, actor, { ...raw, photoEvidenceId: image.id });
 expect(result.evidence?.photoEvidenceId).toBe(image.id);
});
