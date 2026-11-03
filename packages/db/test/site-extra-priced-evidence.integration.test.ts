import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { siteExtraContentSha256V1 } from "@jobguard/core";
import { SiteExtraRepository } from "../src/site-extra-repository.js";
import { cluster, siteFixture, photo, pendingPhoto, type Cluster } from "./site-extra-evidence-fixtures.js";
import { written } from "./site-extra-pricing-fixtures.js";
let c: Cluster;
beforeAll(async () => { c = await cluster(); }, 90_000);
afterAll(async () => { await c?.close(); });
it("priced v2 preserves evidence, origin, replay and cross-customer boundaries", async () => {
  const f = await siteFixture(c), other = await siteFixture(c), actor = f.members.operative.member;
  const repo = new SiteExtraRepository(c.runtime), where = { ctx: f.ctx, jobId: f.jobId };
  const image = await photo(c, where), pending = await pendingPhoto(c, where), foreign = await photo(c, { ctx: other.ctx, jobId: other.jobId });
  const description = "Fictional extra", note = "Reviewed fictional note";
  const raw = { version: "log-sor-site-extra.v2", commandId: randomUUID(), jobId: f.jobId, sorCode: "CLEAR-GUTTER", quantity: "100", description, note, photoEvidenceId: image.id, residentConfirmation: { shownContentSha256: siteExtraContentSha256V1({ jobId: f.jobId, description, note, photoSha256: image.sha256 }) } };
  const before = await written(c, f.p.tenantId);
  for (const photoEvidenceId of [pending.id, foreign.id, randomUUID()]) {
    await expect(repo.logSorSiteExtra(f.ctx, actor, { ...raw, commandId: randomUUID(), photoEvidenceId })).rejects.toMatchObject({ code: "PHOTO_NOT_ACCEPTED" });
    expect(await written(c, f.p.tenantId)).toEqual(before);
  }
  await expect(repo.logSorSiteExtra(f.ctx, actor, { ...raw, residentConfirmation: { shownContentSha256: "a".repeat(64) } })).rejects.toMatchObject({ code: "CONFIRMATION_MISMATCH" });
  await expect(repo.logSorSiteExtra(f.ctx, other.members.operative.member, raw)).rejects.toMatchObject({ code: "EXTRA_FORBIDDEN" });
  await expect(repo.logSorSiteExtra(f.ctx, f.unassigned.member, raw)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(repo.logSorSiteExtra(f.ctx, actor, { ...raw, jobId: other.jobId })).rejects.toMatchObject({ code: "NOT_FOUND" });
  const [first, retry] = await Promise.all([repo.logSorSiteExtra(f.ctx, actor, raw), repo.logSorSiteExtra(f.ctx, actor, raw)]);
  expect(retry).toEqual(first);
  const after = await written(c, f.p.tenantId);
  expect(after.extra_origin).toBe(before.extra_origin! + 1);
  expect(after.extra_sor_revision).toBe(before.extra_sor_revision! + 1);
  expect(await repo.logSorSiteExtra(f.ctx, actor, raw)).toEqual(first);
  expect(await written(c, f.p.tenantId)).toEqual(after);
  for (const change of [{ quantity: "101" }, { note: "Changed" }, { description: "Changed" }, { photoEvidenceId: pending.id }, { siteVisitId: randomUUID() }]) {
    await expect(repo.logSorSiteExtra(f.ctx, actor, { ...raw, ...change })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  }
  const origin = (await c.admin.query("SELECT evidence_id,resident_confirmation_evidence_id,raising_membership_id FROM app.extra_origin WHERE tenant_id=$1 AND variation_id=$2", [f.p.tenantId, first.variationId])).rows[0]!;
  expect(origin).toMatchObject({ evidence_id: image.id, resident_confirmation_evidence_id: expect.any(String), raising_membership_id: actor.membershipId });
  const second = await repo.logSorSiteExtra(f.ctx, actor, { ...raw, commandId: randomUUID() });
  expect(second.variationId).not.toBe(first.variationId);
  expect((await written(c, f.p.tenantId)).extra_duplicate_link).toBe(before.extra_duplicate_link);
});
