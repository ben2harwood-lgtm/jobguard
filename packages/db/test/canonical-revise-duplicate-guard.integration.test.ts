import { testActorContext } from "./tenant-context-test-utils.js";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { ExtraApprovalRepository, ExtraRepository } from "../src/index.js";
import { cluster, world, type World } from "./contractor-billing-fixtures.js";
import { approveInput, raiseOn, type Cluster } from "./extra-approval-chain-fixtures.js";

let c: Cluster;
beforeAll(async () => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); c = await cluster(); }, 240_000);
afterAll(async () => { await c?.close(); vi.unstubAllEnvs(); });

const approvals = () => new ExtraApprovalRepository(c.runtime);
const extras = () => new ExtraRepository(c.runtime);
const billing = (w: World) => w.repo.read(w.ctx, w.session, w.s.jobId);
const revisionInput = (w: World) => ({ version: "revise-extra.v1", commandId: randomUUID(), jobId: w.s.jobId, extraId: w.s.extraId, netPence: 24001 });
async function linkedPair(approved = true) {
  const w = await world(c), repo = approvals(), jobId = w.s.jobId;
  const duplicateId = await raiseOn(c, w.w, jobId);
  await repo.priceExtra(await testActorContext(c.admin, w.ctx, w.w.members.surveyor.member), w.w.members.surveyor.member, { version: "price-extra.v1", commandId: randomUUID(), jobId, extraId: duplicateId, netPence: 338 });
  const request = await repo.submitExtra(await testActorContext(c.admin, w.ctx, w.w.members.supervisor.member), w.w.members.supervisor.member, { version: "submit-extra.v1", commandId: randomUUID(), jobId, extraId: duplicateId });
  if (approved) await repo.approveExtraStep(await testActorContext(c.admin, w.ctx, w.w.members.supervisor.member), w.w.members.supervisor.member, approveInput({ jobId, requestId: String(request.requestId), hash: String(request.revisionHash), net: 338 }, 0));
  const link = await repo.markDuplicate(await testActorContext(c.admin, w.ctx, w.w.members.supervisor.member), w.w.members.supervisor.member, { version: "mark-duplicate.v1", commandId: randomUUID(), jobId, duplicateId, canonicalId: w.s.extraId });
  return { w, duplicateId, linkId: String(link.linkId) };
}
async function snapshot(w: World) {
  // Refusal must roll back revisions, approvals, receipts, audit and billing facts together.
  const tables = ["variation_revision", "extra_approval_revision_binding", "extra_approval_request", "extra_approval_outcome", "extra_event", "extra_duplicate_link", "billing_export_line", "command_receipt", "audit_event"];
  return Promise.all(tables.map(async table => (await c.admin.query(
    `SELECT row_to_json(x)::text value FROM app.${table} x WHERE tenant_id=$1 ORDER BY row_to_json(x)::text`, [w.w.p.tenantId])).rows));
}
async function refuseRevision(w: World, input = revisionInput(w)) {
  // The existing repository maps the trigger's 23514 to INVALID_COMMAND.
  await expect(approvals().reviseExtra(await testActorContext(c.admin, w.ctx, w.w.members.surveyor.member), w.w.members.surveyor.member, input)).rejects.toMatchObject({ code: "INVALID_COMMAND" });
}

it("refuses canonical revision without changing either approved extra or billing, then permits the same command after unlink", async () => {
  const { w, duplicateId, linkId } = await linkedPair();
  const beforeBilling = await billing(w), before = await snapshot(w), input = revisionInput(w);
  expect(beforeBilling.reconciliation.approvedNotExported).toEqual([{ extraId: w.s.extraId, net: { numerator: "24000", denominator: "1" } }]);
  expect((await extras().readDuplicateLinks(w.ctx, w.s.jobId)).activeLinks).toEqual([{ linkId, duplicateId, canonicalId: w.s.extraId }]);
  await refuseRevision(w, input);
  expect(await snapshot(w)).toEqual(before);
  expect(await billing(w)).toEqual(beforeBilling);
  await extras().unlinkDuplicate(await testActorContext(c.admin, w.ctx, w.w.members.supervisor.member), { version: "extra-duplicate-unlink.v1", commandId: randomUUID(), jobId: w.s.jobId,
    actorMembershipId: w.w.members.supervisor.member.membershipId, linkId,
    expectedRevision: (await extras().readDuplicateLinks(w.ctx, w.s.jobId)).revision, reasonCode: "linked_in_error" });
  expect((await extras().readDuplicateLinks(w.ctx, w.s.jobId)).activeLinks).toEqual([]);
  expect((await billing(w)).reconciliation.approvedNotExported.map(x => x.extraId).sort()).toEqual([w.s.extraId, duplicateId].sort());
  const revised = await approvals().reviseExtra(await testActorContext(c.admin, w.ctx, w.w.members.surveyor.member), w.w.members.surveyor.member, input);
  expect(revised).toMatchObject({ state: "awaiting_approval", requestRevision: 2, netPence: 24001 });
  expect(await approvals().reviseExtra(await testActorContext(c.admin, w.ctx, w.w.members.surveyor.member), w.w.members.surveyor.member, input)).toEqual(revised);
  expect((await billing(w)).reconciliation.approvedNotExported).toEqual([{ extraId: duplicateId, net: { numerator: "338", denominator: "1" } }]);
});

it("preserves first pricing, revision and subsequent re-pricing without active links", async () => {
  const w = await world(c); // includes the first pricing and approval through runtime
  const repo = approvals(), input = revisionInput(w);
  const revised = await repo.reviseExtra(await testActorContext(c.admin, w.ctx, w.w.members.surveyor.member), w.w.members.surveyor.member, input);
  expect(revised).toMatchObject({ state: "awaiting_approval", requestRevision: 2, netPence: 24001 });
  await repo.approveExtraStep(await testActorContext(c.admin, w.ctx, w.w.members.supervisor.member), w.w.members.supervisor.member, approveInput({ jobId: w.s.jobId,
    requestId: String(revised.requestId), hash: String(revised.revisionHash), net: 24001 }, 0));
  expect(await repo.reviseExtra(await testActorContext(c.admin, w.ctx, w.w.members.surveyor.member), w.w.members.surveyor.member, { ...input, commandId: randomUUID(), netPence: 24002 }))
    .toMatchObject({ state: "awaiting_approval", requestRevision: 3, netPence: 24002 });
  const extraId = await raiseOn(c, w.w, w.s.jobId);
  expect(await repo.priceExtra(await testActorContext(c.admin, w.ctx, w.w.members.surveyor.member), w.w.members.surveyor.member, { version: "price-extra.v1", commandId: randomUUID(), jobId: w.s.jobId, extraId, netPence: 339 }))
    .toMatchObject({ netPence: 339 });
});

it("does not treat a duplicate-dismissed pending request as an approved duplicate", async () => {
  const { w } = await linkedPair(false);
  expect(await approvals().reviseExtra(await testActorContext(c.admin, w.ctx, w.w.members.surveyor.member), w.w.members.surveyor.member, revisionInput(w)))
    .toMatchObject({ state: "awaiting_approval", requestRevision: 2 });
});

it("negative control: removing the check in a scratch SQL copy breaks the refusal assertion and reproduces the silent drop", async () => {
  const { w, linkId } = await linkedPair();
  const sql = await readFile(new URL("../migrations/0674_canonical_revise_duplicate_guard.sql", import.meta.url), "utf8");
  const functionSql = sql.slice(sql.indexOf("CREATE FUNCTION"), sql.indexOf("ALTER FUNCTION"))
    .replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION");
  const scratch = functionSql.replace(" IF EXISTS (", " IF false AND EXISTS (");
  expect(scratch).not.toBe(functionSql);
  try {
    await c.admin.query(scratch);
    // A successful revision makes this exact regression assertion fail.
    await expect(refuseRevision(w)).rejects.toThrow();
    expect((await billing(w)).reconciliation.approvedNotExported).toEqual([]);
    expect((await extras().readDuplicateLinks(w.ctx, w.s.jobId)).activeLinks).toMatchObject([{ linkId }]);
  } finally {
    await c.admin.query(functionSql);
  }
  // Verify restoration using a separate, still-approved pair.
  await refuseRevision((await linkedPair()).w);
});
