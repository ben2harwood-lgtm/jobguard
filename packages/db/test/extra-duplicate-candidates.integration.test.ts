import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { ExtraApprovalRepository, ExtraRepository, readExtraDuplicateCandidates, withTenant } from "../src/index.js";
import { cluster, world, code, type World } from "./contractor-billing-fixtures.js";
import { direct, invite } from "./site-extra-fixtures.js";
import { approveInput } from "./extra-approval-chain-fixtures.js";
import { ownerTx } from "./extra-fixtures.js";
let c: Awaited<ReturnType<typeof cluster>>;
beforeAll(async () => { c = await cluster(); }, 240000);
afterAll(async () => { await c?.close(); });
const read = (w: World, job = w.s.jobId, actor = w.w.members.supervisor.member) => readExtraDuplicateCandidates(c.runtime, w.ctx, actor, job);
async function agreement(w: World) {
 const result = await read(w);
 const truth = await ownerTx(c, w.w.p.tenantId, async db => (await db.$client.query("SELECT app.cb_unresolved($1,$2) value", [w.w.p.tenantId, w.s.jobId])).rows[0]!.value);
 expect(result.groups.length > 0).toBe(truth); return result;
}
async function pair(w: World) {
 const second = await invite(c, w.w, "operative", { kind: "team", id: w.w.demo.teamId });
 // Direct merged raise preserves two distinct site actors; price through the existing surveyor command.
 const result: string[] = [];
 for (const actor of [w.w.members.operative, second]) {
  const raised = await new ExtraRepository(c.runtime).raiseExtra(w.ctx, direct(w.w, actor, { jobId: w.s.jobId, sorItem: { versionId: w.w.demo.sorVersionId, code: "CLEAR-GUTTER" } }));
  await new ExtraApprovalRepository(c.runtime).priceExtra(w.ctx, w.w.members.surveyor.member, { version: "price-extra.v1", commandId: randomUUID(), jobId: w.s.jobId, extraId: raised.variationId, netPence: 338 });
  const submitted = await new ExtraApprovalRepository(c.runtime).submitExtra(w.ctx, w.w.members.supervisor.member, { version: "submit-extra.v1", commandId: randomUUID(), jobId: w.s.jobId, extraId: raised.variationId });
  await new ExtraApprovalRepository(c.runtime).approveExtraStep(w.ctx, w.w.members.supervisor.member, approveInput({ jobId: w.s.jobId, requestId: String(submitted.requestId), hash: String(submitted.revisionHash), net: 338 }, 0));
  result.push(raised.variationId);
 }
 return result as [string, string];
}
it("two operatives remain separate and priced; linking and unlinking agree with the export blocker, including replays", async () => {
 const w = await world(c), [a, b] = await pair(w), approvals = new ExtraApprovalRepository(c.runtime);
 const first = await agreement(w); expect(first.groups).toHaveLength(1); expect(first.groups[0]!.extras.map(x => x.extraId).sort()).toEqual([a, b].sort());
 expect(JSON.stringify(first)).not.toMatch(/pence|price|amount/i);
 const prices = (await c.admin.query("SELECT variation_id,signed_delta_pence::integer net FROM app.variation_revision WHERE variation_id=ANY($1::uuid[])", [[a, b]])).rows;
 expect(prices.map(x => x.net)).toEqual([338, 338]);
 expect(await code(w.exported())).toBe("BILLING_DUPLICATES_UNRESOLVED");
 const mark = { version: "mark-duplicate.v1", commandId: randomUUID(), jobId: w.s.jobId, duplicateId: a, canonicalId: b };
 const linked = await approvals.markDuplicate(w.ctx, w.w.members.supervisor.member, mark);
 expect(await approvals.markDuplicate(w.ctx, w.w.members.supervisor.member, mark)).toEqual(linked);
 expect(await code(approvals.markDuplicate(w.ctx, w.w.members.supervisor.member, { ...mark, canonicalId: w.s.extraId }))).toBe("COMMAND_CONFLICT");
 expect((await agreement(w)).groups).toEqual([]);
 const candidates = await withTenant(c.runtime, w.ctx, async db => (await db.$client.query("SELECT app.cb_candidates($1,$2,$3) lines", [w.session, w.s.jobId, w.contract])).rows[0]!.lines as Array<{ extraId: string }>);
 expect(candidates.filter(x => x.extraId === b)).toHaveLength(1);
 expect(candidates.some(x => x.extraId === a)).toBe(false);
 const group = await new ExtraRepository(c.runtime).readDuplicateGroup(w.ctx, w.s.jobId, b);
 expect(group.effectiveOrigin.origin.variationId).toBe(a); // earliest origin survives choosing the later canonical
 const state = await read(w);
 const unlink = { version: "extra-duplicate-unlink.v1", commandId: randomUUID(), jobId: w.s.jobId, actorMembershipId: w.w.members.supervisor.member.membershipId, linkId: linked.linkId, expectedRevision: state.revision, reasonCode: "linked_in_error" };
 const extras = new ExtraRepository(c.runtime), unlinked = await extras.unlinkDuplicate(w.ctx, unlink);
 expect(await extras.unlinkDuplicate(w.ctx, unlink)).toEqual(unlinked);
 expect(await code(extras.unlinkDuplicate(w.ctx, { ...unlink, reasonCode: "wrong_pair" }))).toBe("COMMAND_CONFLICT");
 expect((await agreement(w)).groups).toHaveLength(1);
 expect(await code(w.exported())).toBe("BILLING_DUPLICATES_UNRESOLVED");
}, 120000);
it("cross-tenant jobs, uncovered grants and wrong roles fail closed", async () => {
 const w = await world(c), other = await world(c);
 expect(await code(read(w, other.s.jobId))).toBe("NOT_FOUND");
 expect(await code(read(w, w.s.jobId, w.w.otherSupervisor.member))).toBe("NOT_FOUND");
 for (const role of ["operative", "owner", "admin", "finance"] as const) expect(await code(read(w, w.s.jobId, w.w.members[role].member))).toBe("PERMISSION_DENIED");
 expect(await code(read(w, randomUUID()))).toBe("NOT_FOUND");
 const mark = { version: "mark-duplicate.v1", commandId: randomUUID(), jobId: w.s.jobId, duplicateId: w.s.extraId, canonicalId: other.s.extraId };
 const approvals = new ExtraApprovalRepository(c.runtime);
 expect(await code(approvals.markDuplicate(w.ctx, w.w.members.operative.member, mark))).toBe("PERMISSION_DENIED");
 expect(await code(approvals.markDuplicate(w.ctx, w.w.members.supervisor.member, { ...mark, commandId: randomUUID() }))).toBe("NOT_FOUND");
 await agreement(w);
}, 120000);
it("stale unlinks and linking racing an export cannot export duplicate captures", async () => {
 const w = await world(c), [a, b] = await pair(w), approvals = new ExtraApprovalRepository(c.runtime);
 const marking = approvals.markDuplicate(w.ctx, w.w.members.supervisor.member, { version: "mark-duplicate.v1", commandId: randomUUID(), jobId: w.s.jobId, duplicateId: a, canonicalId: b });
 const result = await Promise.allSettled([marking, w.exported()]); expect(result[0]!.status).toBe("fulfilled");
 const linked = await marking;
 expect(await code(new ExtraRepository(c.runtime).unlinkDuplicate(w.ctx, { version: "extra-duplicate-unlink.v1", commandId: randomUUID(), jobId: w.s.jobId, actorMembershipId: w.w.members.supervisor.member.membershipId, linkId: linked.linkId, expectedRevision: 999, reasonCode: "wrong_pair" }))).toBe("STALE_REVISION");
 await agreement(w);
 const exports = (await w.repo.read(w.ctx, w.session, w.s.jobId)).exports.flatMap(x => x.artifact.lines);
 await w.exported();
 const finalLines = (await w.repo.read(w.ctx, w.session, w.s.jobId)).exports.flatMap(x => x.artifact.lines);
 expect(exports.some(x => x.extraId === a)).toBe(false);
 expect(finalLines.filter(x => x.extraId === b)).toHaveLength(1);
 expect(finalLines.some(x => x.extraId === a)).toBe(false);
}, 120000);

it("installed routines agree on the UTC day, visit, code, excess-line and canonical matrix", async () => {
 const w = await world(c);
 // Run the installed predicates over fictional rows without editing immutable
 // origins or server clocks. The stored-job cases above check actual RLS reads.
 const rows = (await c.admin.query("SELECT proname,prosrc FROM pg_proc WHERE oid IN('app.cb_unresolved(uuid,uuid)'::regprocedure,'app.extra_duplicate_candidates(uuid,uuid)'::regprocedure)")).rows;
 const cb = rows.find(r => r.proname === "cb_unresolved")!.prosrc as string;
 const listing = rows.find(r => r.proname === "extra_duplicate_candidates")!.prosrc as string;
 const source = "WITH RECURSIVE members AS(SELECT * FROM jsonb_to_recordset($1::jsonb) AS m(id uuid,canonical uuid,sor_code text,excess_of_scope_item_id uuid,site_visit_id uuid,server_recorded_at timestamptz,description text)) ";
 const boolSql = source + cb.slice(cb.indexOf("SELECT EXISTS"));
 const listSql = (source + ", " + listing.slice(listing.indexOf("edges AS"), listing.indexOf(" INTO result;"))).replace(/\bp_job\b/g, "$3::uuid").replace(/\bt\b/g, "$2::uuid");
 const a = { id: "40000000-0000-4000-8000-000000000001", canonical: "40000000-0000-4000-8000-000000000001", sor_code: "GUTTER", excess_of_scope_item_id: null, site_visit_id: null, server_recorded_at: "2026-11-01T23:59:59Z", description: "Fictional gutter" };
 const b = { ...a, id: "40000000-0000-4000-8000-000000000002", canonical: "40000000-0000-4000-8000-000000000002" };
 const visit = randomUUID(), line = randomUUID();
 const cases: Array<[Record<string, unknown>, Record<string, unknown>, boolean]> = [
  [a, b, true], [a, { ...b, server_recorded_at: "2026-11-02T00:00:00Z" }, false],
  [a, { ...b, sor_code: "DOOR" }, false],
  [{ ...a, site_visit_id: visit }, { ...b, site_visit_id: randomUUID(), server_recorded_at: "2026-11-02T00:00:00Z" }, false],
  [{ ...a, site_visit_id: visit }, { ...b, site_visit_id: visit, server_recorded_at: "2026-11-02T00:00:00Z" }, true],
  [{ ...a, sor_code: null, excess_of_scope_item_id: line }, { ...b, sor_code: null, excess_of_scope_item_id: line }, true],
  [{ ...a, sor_code: null, excess_of_scope_item_id: line }, { ...b, sor_code: null, excess_of_scope_item_id: randomUUID() }, false],
  [a, { ...b, canonical: a.canonical }, false],
  // Existing OR semantics: same UTC day matches despite a different visit, and
  // same SoR code matches despite a different excess line. Do not narrow export.
  [{ ...a, site_visit_id: visit }, { ...b, site_visit_id: randomUUID() }, true],
  [{ ...a, excess_of_scope_item_id: line }, { ...b, excess_of_scope_item_id: randomUUID() }, true],
 ];
 for (const [left, right, expected] of cases) {
  const args = [JSON.stringify([left, right]), w.w.p.tenantId, w.s.jobId];
  const truth = (await c.admin.query(boolSql, [args[0]])).rows[0]!.exists;
  const result = (await c.admin.query(listSql, args)).rows[0]!.jsonb_build_object;
  expect(truth).toBe(expected); expect(result.groups.length > 0).toBe(truth);
 }
 await agreement(w);
}, 120000);
