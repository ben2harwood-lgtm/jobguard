import { testActorContext } from "./tenant-context-test-utils.js";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { ExtraApprovalRepository, ExtraRepository, withTenant } from "../src/index.js";
import { cluster, world, code, type World } from "./contractor-billing-fixtures.js";
import { approveInput, raiseOn } from "./extra-approval-chain-fixtures.js";
import { ownerTx } from "./extra-fixtures.js";

let c: Awaited<ReturnType<typeof cluster>>;
let approvals: ExtraApprovalRepository;
let extras: ExtraRepository;
beforeAll(async () => {
 c = await cluster(); // Real embedded PostgreSQL; fresh migration from empty includes 0663.
 approvals = new ExtraApprovalRepository(c.runtime);
 extras = new ExtraRepository(c.runtime);
}, 240000);
afterAll(async () => { await c?.close(); vi.unstubAllEnvs(); });

const mark = (w: World, duplicateId: string, canonicalId: string) => ({
 version: "mark-duplicate.v1", commandId: randomUUID(), jobId: w.s.jobId, duplicateId, canonicalId,
});
const withdraw = (w: World, extraId: string) => ({
 version: "withdraw-extra.v1", commandId: randomUUID(), jobId: w.s.jobId, extraId, reasonCode: "not_done",
});
async function submit(w: World, extraId: string) {
 await approvals.priceExtra(await testActorContext(c.admin, w.ctx, w.w.members.surveyor.member), w.w.members.surveyor.member, {
  version: "price-extra.v1", commandId: randomUUID(), jobId: w.s.jobId, extraId, netPence: 338,
 });
 const result = await approvals.submitExtra(await testActorContext(c.admin, w.ctx, w.w.members.supervisor.member), w.w.members.supervisor.member, {
  version: "submit-extra.v1", commandId: randomUUID(), jobId: w.s.jobId, extraId,
 });
 return { jobId: w.s.jobId, requestId: String(result.requestId), hash: String(result.revisionHash), net: 338 };
}
async function latest(w: World, extraId: string) {
 return ownerTx(c, w.w.p.tenantId, async db => (await db.$client.query(
  "SELECT app.xa_latest_kind($1,$2,$3) kind", [w.w.p.tenantId, w.s.jobId, extraId],
 )).rows[0]!.kind as string);
}
async function unlink(w: World, linkId: string) {
 return extras.unlinkDuplicate(await testActorContext(c.admin, w.ctx, w.w.members.supervisor.member), {
  version: "extra-duplicate-unlink.v1", commandId: randomUUID(), jobId: w.s.jobId,
  actorMembershipId: w.w.members.supervisor.member.membershipId, linkId,
  expectedRevision: (await extras.readDuplicateLinks(w.ctx, w.s.jobId)).revision, reasonCode: "linked_in_error",
 });
}
async function unchangedOnRefusal(w: World, commandId: string) {
 const rows = await c.admin.query(`SELECT
  (SELECT count(*)::int FROM app.extra_event WHERE tenant_id=$1 AND command_id=$2) events,
  (SELECT count(*)::int FROM app.extra_approval_outcome WHERE tenant_id=$1 AND command_id=$2) outcomes,
  (SELECT count(*)::int FROM app.extra_duplicate_link WHERE tenant_id=$1 AND command_id=$2) links,
  (SELECT count(*)::int FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2 AND status='succeeded') succeeded`,
 [w.w.p.tenantId, commandId]);
 expect(rows.rows[0]).toEqual({ events: 0, outcomes: 0, links: 0, succeeded: 0 });
}

it.each(["rejected", "logged", "awaiting_approval"] as const)("refuses approved duplicate into %s canonical without effects", async state => {
 const w = await world(c), canonical = await raiseOn(c, w.w, w.s.jobId);
 if (state !== "logged") {
  const request = await submit(w, canonical);
  if (state === "rejected") await approvals.rejectExtra(await testActorContext(c.admin, w.ctx, w.w.members.supervisor.member), w.w.members.supervisor.member, {
   ...approveInput(request, 0), version: "reject-extra.v1", reasonCode: "price_not_agreed",
  });
 }
 expect(await latest(w, canonical)).toBe(state);
 const input = mark(w, w.s.extraId, canonical);
 expect(await code(approvals.markDuplicate(await testActorContext(c.admin, w.ctx, w.w.members.supervisor.member), w.w.members.supervisor.member, input))).toBe("INVALID_TRANSITION");
 await unchangedOnRefusal(w, input.commandId);
 expect(await latest(w, w.s.extraId)).toBe("approved");
}, 120000);

it("also refuses a logged duplicate into a rejected canonical", async () => {
 const w = await world(c), canonical = await raiseOn(c, w.w, w.s.jobId);
 const request = await submit(w, canonical), duplicate = await raiseOn(c, w.w, w.s.jobId);
 await approvals.rejectExtra(await testActorContext(c.admin, w.ctx, w.w.members.supervisor.member), w.w.members.supervisor.member, {
  ...approveInput(request, 0), version: "reject-extra.v1", reasonCode: "price_not_agreed",
 });
 const input = mark(w, duplicate, canonical);
 expect(await code(approvals.markDuplicate(await testActorContext(c.admin, w.ctx, w.w.members.supervisor.member), w.w.members.supervisor.member, input))).toBe("INVALID_TRANSITION");
 await unchangedOnRefusal(w, input.commandId);
}, 120000);

it("keeps logged-to-logged linking; active canonical withdrawal rolls back, then succeeds after unlink", async () => {
 const w = await world(c), duplicate = await raiseOn(c, w.w, w.s.jobId), canonical = await raiseOn(c, w.w, w.s.jobId);
 const linked = await approvals.markDuplicate(await testActorContext(c.admin, w.ctx, w.w.members.supervisor.member), w.w.members.supervisor.member, mark(w, duplicate, canonical));
 expect(await latest(w, duplicate)).toBe("duplicate");
 expect(await latest(w, canonical)).toBe("logged");
 // Keep an open request: xa_withdraw writes an outcome and dismisses its Decision
 // before xa_event hits our guard. All of those writes must roll back together.
 const request = await submit(w, canonical), input = withdraw(w, canonical);
 const resolutions = async () => (await c.admin.query(`SELECT r.* FROM app.decision_resolution r
  JOIN app.decision d ON(d.tenant_id,d.id)=(r.tenant_id,r.decision_id)
  WHERE d.tenant_id=$1 AND d.subject_ref LIKE $2 ORDER BY r.id`, [w.w.p.tenantId, `${request.requestId}:%`])).rows;
 const before = await resolutions();
 expect(await code(approvals.withdrawExtra(await testActorContext(c.admin, w.ctx, w.w.members.supervisor.member), w.w.members.supervisor.member, input))).toBe("INVALID_TRANSITION");
 await unchangedOnRefusal(w, input.commandId);
 expect((await c.admin.query("SELECT kind FROM app.extra_approval_outcome WHERE tenant_id=$1 AND request_id=$2", [w.w.p.tenantId, request.requestId])).rows).toEqual([]);
 expect(await resolutions()).toEqual(before);
 expect(await latest(w, canonical)).toBe("awaiting_approval");
 await unlink(w, String(linked.linkId));
 // Reuse the refused command: there is no successful receipt to replay.
 expect(await approvals.withdrawExtra(await testActorContext(c.admin, w.ctx, w.w.members.supervisor.member), w.w.members.supervisor.member, input)).toMatchObject({ state: "withdrawn" });
 expect(await latest(w, canonical)).toBe("withdrawn");
 expect((await c.admin.query("SELECT kind FROM app.extra_approval_outcome WHERE request_id=$1", [request.requestId])).rows).toEqual([{ kind: "withdrawn" }]);
}, 120000);

it("approved-to-approved linking keeps the canonical in the real 0243 billing read", async () => {
 const w = await world(c), canonical = await raiseOn(c, w.w, w.s.jobId), request = await submit(w, canonical);
 await approvals.approveExtraStep(await testActorContext(c.admin, w.ctx, w.w.members.supervisor.member), w.w.members.supervisor.member, approveInput(request, 0));
 await approvals.markDuplicate(await testActorContext(c.admin, w.ctx, w.w.members.supervisor.member), w.w.members.supervisor.member, mark(w, w.s.extraId, canonical));
 const lines = await withTenant(c.runtime, w.ctx, async db => (await db.$client.query(
  "SELECT app.cb_candidates($1,$2,$3) lines", [w.session, w.s.jobId, w.contract],
 )).rows[0]!.lines as Array<{ extraId: string }>);
 expect(lines.filter(line => line.extraId === canonical)).toHaveLength(1);
 expect(lines.some(line => line.extraId === w.s.extraId)).toBe(false);
 expect(await latest(w, canonical)).toBe("approved");
}, 120000);

// Scratch mutations affect only this file's isolated cluster. Restore the exact
// catalogue definition even when the control assertion fails; never edit SQL files.
async function withoutTrigger(table: string, trigger: string, run: () => Promise<void>) {
 const definition = (await c.admin.query(`SELECT pg_get_triggerdef(oid) definition FROM pg_trigger
  WHERE tgrelid=$1::regclass AND tgname=$2`, [table, trigger])).rows[0]!.definition as string;
 await c.admin.query(`DROP TRIGGER ${trigger} ON ${table}`);
 try { await run(); } finally { await c.admin.query(definition); }
}
it("mutation control: removing the link guard admits the refused approved-to-logged command", async () => {
 const w = await world(c), canonical = await raiseOn(c, w.w, w.s.jobId), input = mark(w, w.s.extraId, canonical);
 await withoutTrigger("app.extra_duplicate_link", "z_duplicate_canonical_guard", async () => {
  expect(await code(approvals.markDuplicate(await testActorContext(c.admin, w.ctx, w.w.members.supervisor.member), w.w.members.supervisor.member, input))).toBe("ok");
 });
}, 120000);
it("mutation control: removing the withdraw guard admits an active canonical withdrawal", async () => {
 const w = await world(c), duplicate = await raiseOn(c, w.w, w.s.jobId), canonical = await raiseOn(c, w.w, w.s.jobId);
 await approvals.markDuplicate(await testActorContext(c.admin, w.ctx, w.w.members.supervisor.member), w.w.members.supervisor.member, mark(w, duplicate, canonical));
 await submit(w, canonical);
 await withoutTrigger("app.extra_event", "z_active_canonical_withdraw_guard", async () => {
  expect(await code(approvals.withdrawExtra(await testActorContext(c.admin, w.ctx, w.w.members.supervisor.member), w.w.members.supervisor.member, withdraw(w, canonical)))).toBe("ok");
 });
}, 120000);

it("fresh migration installs private definer guards after the existing BEFORE guards", async () => {
 expect((await c.admin.query("SELECT migration_name FROM public.jobguard_schema_migration WHERE migration_name='0663_duplicate_canonical_guard.sql'")).rows).toHaveLength(1);
 for (const [table, original, added, routine] of [
  ["extra_duplicate_link", "extra_duplicate_link_insert_guard", "z_duplicate_canonical_guard", "xa_duplicate_canonical_guard"],
  ["extra_event", "extra_event_insert_guard", "z_active_canonical_withdraw_guard", "xa_active_canonical_withdraw_guard"],
 ]) {
  const triggers = (await c.admin.query(`SELECT tgname FROM pg_trigger
   WHERE tgrelid=('app.'||$1)::regclass AND (tgtype & 2)=2 AND (tgtype & 4)=4 ORDER BY tgname`, [table])).rows.map(r => r.tgname);
  expect(triggers).toContain(original); expect(triggers).toContain(added);
  expect(triggers.indexOf(original)).toBeLessThan(triggers.indexOf(added));
  const row = (await c.admin.query(`SELECT p.prosecdef,r.rolname,p.proconfig,
   has_function_privilege('jobguard_runtime',p.oid,'EXECUTE') runtime,
   has_function_privilege('jobguard_identity',p.oid,'EXECUTE') identity,
   has_function_privilege('jobguard_infrastructure',p.oid,'EXECUTE') infrastructure,
   EXISTS(SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') public
   FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner
   WHERE p.oid=('app.'||$1||'()')::regprocedure`, [routine])).rows[0];
  expect(row).toEqual({ prosecdef: true, rolname: "jobguard_migration", proconfig: ["search_path=pg_catalog"], runtime: false, identity: false, infrastructure: false, public: false });
 }
});
