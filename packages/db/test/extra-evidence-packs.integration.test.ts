import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { buildExtraSourcePack, inspectExtraSourcePack, residentConfirmationStatementV1, verifyExtraSourcePack } from "@jobguard/core";
import { ExtraApprovalRepository, withTenant, type VerifiedTenantContext } from "../src/index.js";
import { loadExtraEvidenceSources } from "../src/extra-evidence-pack-sources.js";
import { assembleExtraSourcePack } from "../src/extra-evidence-pack-repository.js";
import { approvalFixture, cluster, storage, ownerTx, type Cluster } from "./extra-approval-fixtures.js";
import { invalidate } from "./site-extra-evidence-fixtures.js";
let c: Cluster;
beforeAll(async () => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); c = await cluster(); }, 180_000);
afterAll(async () => { await c?.close(); vi.unstubAllEnvs(); });
it("E5-18 extra sources and shared verifier — issued sources only", async () => {
  const f = await approvalFixture(c);
  const context: VerifiedTenantContext = await f.ctx;
  const loaded = await withTenant(c.runtime, context, db => loadExtraEvidenceSources(db, { version: "extra-source-query.v1", jobId: f.jobId, extraId: f.captured.variationId }));
  const captured = await assembleExtraSourcePack(loaded, storage);
  await expect(assembleExtraSourcePack(loaded, { ...storage, readExactVersion: async () => { throw new Error("exact version unavailable"); }, createUploadUrl: storage.createUploadUrl, createDownloadUrl: storage.createDownloadUrl, deleteExactVersion: storage.deleteExactVersion })).rejects.toMatchObject({ code: "EXTRA_SOURCE_INVALID" });
  expect(captured.integrity.sources.map(s => s.sourceId.split(":")[0])).toEqual(expect.arrayContaining(["extra_origin", "evidence_object"]));
  expect(captured.integrity.sources.some(s => s.label.includes(residentConfirmationStatementV1))).toBe(true);
  expect(captured.completeApprovalPack).toBe(false);
  const priced = await withTenant(c.runtime, context, db => loadExtraEvidenceSources(db, { version: "extra-source-query.v1", jobId: f.jobId, extraId: f.priced.variationId }));
  expect(priced.sources.map(s => s.sourceId.split(":")[0])).toEqual(expect.arrayContaining(["extra_sor_revision", "extra_pricing_basis"]));
  const pack = buildExtraSourcePack(f.jobId, f.priced.variationId, priced.sources, priced.omissions);
  expect(inspectExtraSourcePack(pack, priced.sources.slice(1)).findings).toContain("Missing original source");
  expect(inspectExtraSourcePack(pack, priced.sources.map((s, i) => i ? s : { ...s, content: "tampered" })).findings).toContain("Content hash mismatch");
  expect(inspectExtraSourcePack(pack, priced.sources.map((s, i) => i ? s : { ...s, version: 2 })).findings).toContain("Wrong source version");
  // A fresh storage read and transaction re-loads real rows, never a template or in-memory projection.
  const loadedAgain = await withTenant(c.runtime, context, db => loadExtraEvidenceSources(db, { version: "extra-source-query.v1", jobId: f.jobId, extraId: f.captured.variationId }));
  const again = await assembleExtraSourcePack(loadedAgain, storage);
  expect(again).toEqual(captured);
  const raw = (await c.admin.query("SELECT net_pence::text n FROM app.extra_sor_revision WHERE tenant_id=$1 AND variation_id=$2", [f.p.tenantId, f.priced.variationId])).rows[0]!.n;
  expect(priced.sources.find(s => s.sourceId.startsWith("extra_sor_revision:"))!.content).toContain(raw);
});
it("E5-19 pending rejected foreign and wrong-version source controls refuse", async () => {
  const f = await approvalFixture(c);
  const context: VerifiedTenantContext = await f.ctx;
  for (const sql of ["UPDATE app.evidence_upload SET state='pending', server_verified_at=NULL WHERE tenant_id=$1 AND id=$2", "UPDATE app.evidence_upload SET state='rejected', rejection_code='SYNTHETIC' WHERE tenant_id=$1 AND id=$2", "UPDATE app.evidence_object SET job_id=$3 WHERE tenant_id=$1 AND id=$2", "UPDATE app.evidence_object SET object_version_id='wrong-version' WHERE tenant_id=$1 AND id=$2"]) {
    await expect(withTenant(c.admin, context, async db => {
      await db.$client.query("SET LOCAL session_replication_role=replica");
      // Specimen rolled back when the source check refuses; never visible to a runtime success path.
      await db.$client.query(sql, sql.includes("$3") ? [f.p.tenantId, f.original.id, f.otherJob] : [f.p.tenantId, f.original.id]);
      return loadExtraEvidenceSources(db, { version: "extra-source-query.v1", jobId: f.jobId, extraId: f.captured.variationId });
    })).rejects.toMatchObject({ code: "EXTRA_SOURCE_INVALID" });
  }
});
it("E5-19 evidence lifecycle and confirmation limits — issued sources only", async () => {
  const f = await approvalFixture(c);
  const context: VerifiedTenantContext = await f.ctx;
  const query = { version: "extra-source-query.v1", jobId: f.jobId, extraId: f.captured.variationId };
  await expect(withTenant(c.runtime, context, db => loadExtraEvidenceSources(db, { ...query, jobId: f.otherJob }))).rejects.toMatchObject({ code: "EXTRA_SOURCE_NOT_FOUND" });
  const priced = await withTenant(c.runtime, context, db => loadExtraEvidenceSources(db, { ...query, extraId: f.priced.variationId }));
  expect(priced.omissions).toContain("Optional photo absent"); expect(priced.omissions).toContain("Optional confirmation absent");
  await invalidate(c, f, f.original.id);
  await expect(withTenant(c.runtime, context, db => loadExtraEvidenceSources(db, query))).rejects.toMatchObject({ code: "EXTRA_SOURCE_INVALID" });
});
it("E5-18 tampered stored sources are detected through persisted hashes", async () => {
  const f = await approvalFixture(c);
  const context: VerifiedTenantContext = await f.ctx;
  const db = await c.admin.connect();
  try {
    await db.query("BEGIN"); await db.query("SET LOCAL session_replication_role=replica");
    await db.query("UPDATE app.extra_sor_revision SET quantity='999' WHERE tenant_id=$1 AND variation_id=$2", [f.p.tenantId, f.priced.variationId]);
    await db.query("COMMIT"); // isolated specimen cluster; never a business write
    await expect(withTenant(c.runtime, context, tx => loadExtraEvidenceSources(tx, { version: "extra-source-query.v1", jobId: f.jobId, extraId: f.priced.variationId }))).rejects.toMatchObject({ code: "EXTRA_SOURCE_INVALID" });
  } finally { await db.query("ROLLBACK"); db.release(); }
  // No subsequent success case uses the specimen.
  expect(await ownerTx(c, f.p.tenantId, tx => tx.$client.query("SELECT id FROM app.extra_sor_revision WHERE variation_id=$1", [f.priced.variationId]))).toBeDefined();
});


// Synthetic issued commands create the history; the source reader still uses the existing runtime grants.
const loadPackSources = async (ctx: VerifiedTenantContext, jobId: string, extraId: string) =>
  withTenant(c.runtime, ctx, db => loadExtraEvidenceSources(db, { version: "extra-source-query.v1", jobId, extraId }));
it("requirement, step actors and outcome are exact persisted versioned sources", async () => {
  const { chainWorld, submitted, approveInput, newToken, emailOf } = await import("./extra-approval-chain-fixtures.js");
  const w = await chainWorld(c), ctx = await w.ctx, repo = new ExtraApprovalRepository(c.runtime);
  const s = await submitted(c, w, 150000);
  const before = await loadPackSources(ctx, s.jobId, s.extraId);
  expect(before.omissions.join(" ")).toContain("pending; 0/3");
  const frozen = buildExtraSourcePack(s.jobId, s.extraId, before.sources, before.omissions);
  await repo.approveExtraStep(ctx, w.members.supervisor.member, approveInput(s, 0));
  await repo.approveExtraStep(ctx, w.supervisor2.member, approveInput(s, 1));
  const token = newToken(), recipient = await emailOf(c, w, w.members.client_approver.member.membershipId);
  const sent = await repo.issueClientApproval(ctx, w.members.surveyor.member, { version: "issue-client-approval.v1", commandId: randomUUID(), jobId: s.jobId, requestId: s.requestId,
    approverMembershipId: w.members.client_approver.member.membershipId, recipient, linkToken: token, expiresAt: new Date(Date.now() + 3600_000) });
  await repo.revokeClientApproval(ctx, w.members.owner.member, { version: "revoke-client-approval.v1", commandId: randomUUID(), jobId: s.jobId, linkId: sent.linkId });
  const decide = (linkToken: string) => repo.decideClientApproval(ctx, w.members.client_approver.member, { version: "decide-client-approval.v1", commandId: randomUUID(), jobId: s.jobId, requestId: s.requestId,
    linkToken, email: recipient, revisionHash: s.hash, netPence: s.net, decision: "approve", fictionalRoleName: "Fictional Approver", actualTesterReference: "synthetic-tester" });
  await expect(decide(token)).rejects.toMatchObject({ code: "LINK_REVOKED" });
  const revoked = await loadPackSources(ctx, s.jobId, s.extraId);
  expect(revoked.omissions.join(" ")).toContain("pending; 2/3");
  const replacement = newToken();
  await repo.issueClientApproval(ctx, w.members.surveyor.member, { version: "issue-client-approval.v1", commandId: randomUUID(), jobId: s.jobId, requestId: s.requestId,
    approverMembershipId: w.members.client_approver.member.membershipId, recipient, linkToken: replacement, expiresAt: new Date(Date.now() + 3600_000) });
  await decide(replacement);
  const approved = await loadPackSources(ctx, s.jobId, s.extraId);
  expect(approved.omissions.join(" ")).not.toContain("Approval not complete");
  const request = approved.sources.find(x => x.sourceId === `extra_approval_request:${s.requestId}`)!;
  expect(JSON.parse(request.content)).toMatchObject({ id: s.requestId, revision_hash: s.hash, requirement: { version: "extra-approval-requirement.v1" } });
  const steps = approved.sources.filter(x => x.sourceId.startsWith("extra_approval_step_fact:"));
  expect(steps.map(x => JSON.parse(x.content).actor_kind)).toEqual(["member", "member", "client_approver"]);
  expect(JSON.parse(steps[2]!.content).actor_membership_id).toBe(w.members.client_approver.member.membershipId);
  const pack = buildExtraSourcePack(s.jobId, s.extraId, approved.sources, approved.omissions);
  expect(pack.completeApprovalPack).toBe(false);
  expect(frozen.integrity.manifest.omissions!.join(" ")).toContain("pending; 0/3");
  expect(JSON.stringify(pack)).not.toContain(recipient);
  expect(JSON.stringify(pack)).not.toContain(replacement);
  expect(JSON.stringify(pack)).not.toContain("synthetic-tester");
  for (const source of [request, ...steps]) {
    expect(inspectExtraSourcePack(pack, approved.sources.map(x => x === source ? { ...x, content: x.content + "edited" } : x)).findings).toContain("Content hash mismatch");
    const removed = structuredClone(pack);
    removed.integrity.sources = removed.integrity.sources.filter(x => x.sourceId !== source.sourceId);
    expect(verifyExtraSourcePack(JSON.stringify(removed)).findings).toContain("Missing original source");
  }
  // A later revision has a new request identity; it cannot satisfy the earlier manifest.
  await repo.reviseExtra(ctx, w.members.surveyor.member, { version: "revise-extra.v1", commandId: randomUUID(), jobId: s.jobId, extraId: s.extraId, netPence: 160000 });
  const revised = await loadPackSources(ctx, s.jobId, s.extraId);
  expect(inspectExtraSourcePack(pack, revised.sources).findings).toContain("Missing original source");
  expect(revised.omissions.join(" ")).toContain("pending; 0/3");
});
it("withdrawn and rejected requests remain explicit and cannot acquire a later approval", async () => {
  const { chainWorld, submitted, approveInput } = await import("./extra-approval-chain-fixtures.js");
  const w = await chainWorld(c), ctx = await w.ctx, repo = new ExtraApprovalRepository(c.runtime);
  for (const kind of ["withdrawn", "rejected"] as const) {
    const s = await submitted(c, w, 40000);
    if (kind === "withdrawn") await repo.withdrawExtra(ctx, w.supervisor2.member, { version: "withdraw-extra.v1", commandId: randomUUID(), jobId: s.jobId, extraId: s.extraId, reasonCode: "not_done" });
    else await repo.rejectExtra(ctx, w.supervisor2.member, { ...approveInput(s, 0), version: "reject-extra.v1", reasonCode: "not_done" });
    await expect(repo.approveExtraStep(ctx, w.members.supervisor.member, approveInput(s, 0))).rejects.toMatchObject({ code: "ALREADY_DECIDED" });
    const loaded = await loadPackSources(ctx, s.jobId, s.extraId);
    expect(loaded.omissions.join(" ")).toContain(`is ${kind}; 0/1`);
    expect(JSON.parse(loaded.sources.find(x => x.sourceId.startsWith("extra_approval_outcome:"))!.content).kind).toBe(kind);
    expect(buildExtraSourcePack(s.jobId, s.extraId, loaded.sources, loaded.omissions).completeApprovalPack).toBe(false);
  }
});
it("foreign step sources cannot replace a bound fact, and missing required facts stay incomplete", async () => {
  const { chainWorld, submitted, approveInput } = await import("./extra-approval-chain-fixtures.js");
  const w = await chainWorld(c), other = await chainWorld(c), ctx = await w.ctx;
  const repo = new ExtraApprovalRepository(c.runtime);
  const s = await submitted(c, w, 40000), sameTenant = await submitted(c, w, 40000), foreign = await submitted(c, other, 40000);
  for (const [world, item] of [[w, s], [w, sameTenant], [other, foreign]] as const)
    await repo.approveExtraStep(await world.ctx, world.supervisor2.member, approveInput(item, 0));
  const loaded = await loadPackSources(ctx, s.jobId, s.extraId);
  const pack = buildExtraSourcePack(s.jobId, s.extraId, loaded.sources, loaded.omissions);
  const bound = loaded.sources.find(x => x.sourceId.startsWith("extra_approval_step_fact:"))!;
  for (const [world, item] of [[w, sameTenant], [other, foreign]] as const) {
    const swapped = (await loadPackSources(await world.ctx, item.jobId, item.extraId)).sources.find(x => x.sourceId.startsWith("extra_approval_step_fact:"))!;
    expect(inspectExtraSourcePack(pack, loaded.sources.map(x => x === bound ? swapped : x)).findings).toContain("Missing original source");
    // Forging the source envelope's identity still leaves the wrong persisted content hash.
    expect(inspectExtraSourcePack(pack, loaded.sources.map(x => x === bound ? { ...bound, content: swapped.content } : x)).findings).toContain("Content hash mismatch");
  }
  await expect(loadPackSources(ctx, foreign.jobId, foreign.extraId)).rejects.toMatchObject({ code: "EXTRA_SOURCE_NOT_FOUND" });
  await expect(loadPackSources(ctx, sameTenant.jobId, s.extraId)).rejects.toMatchObject({ code: "EXTRA_SOURCE_NOT_FOUND" });
  // Corrupt isolated specimen, rolled back after proving an approved outcome cannot hide a missing step.
  const sentinel = new Error("rollback specimen");
  await expect(withTenant(c.admin, ctx, async db => {
    await db.$client.query("SET LOCAL session_replication_role=replica");
    await db.$client.query("DELETE FROM app.extra_approval_step_fact WHERE tenant_id=$1 AND request_id=$2", [w.p.tenantId, s.requestId]);
    const missing = await loadExtraEvidenceSources(db, { version: "extra-source-query.v1", jobId: s.jobId, extraId: s.extraId });
    expect(missing.omissions.join(" ")).toContain("is approved; 0/1 required steps recorded");
    expect(buildExtraSourcePack(s.jobId, s.extraId, missing.sources, missing.omissions).completeApprovalPack).toBe(false);
    throw sentinel;
  })).rejects.toBe(sentinel);
});
