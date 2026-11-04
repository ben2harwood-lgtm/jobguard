import { readFileSync } from "node:fs";
import { digestOf } from "./contractor-practice-session-fixtures.js";
import { resolveExtraDuplicateCandidates } from "../src/extra-duplicate-candidates.js";
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
 expect(result).toBe(truth); return result;
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
 const graph = (await c.admin.query("SELECT prosrc FROM pg_proc WHERE oid='app.extra_duplicate_groups(uuid,uuid)'::regprocedure")).rows[0]!.prosrc as string;
 const prior = readFileSync(new URL("../migrations/0243_contractor_billing.sql", import.meta.url), "utf8").split("CREATE FUNCTION app.cb_unresolved")[1]!.split("AS $$")[1]!.split("$$;")[0]!;
 const source = "WITH RECURSIVE members AS(SELECT * FROM jsonb_to_recordset($1::jsonb) AS m(id uuid,canonical uuid,sor_code text,excess_of_scope_item_id uuid,site_visit_id uuid,server_recorded_at timestamptz,description text)) ";
 const boolSql = source + prior.slice(prior.indexOf("SELECT EXISTS"));
 const graphSql = source + ", " + graph.slice(graph.indexOf("edges AS"), graph.indexOf("grouped AS")) + " grouped AS(SELECT group_id FROM components GROUP BY group_id) SELECT EXISTS(SELECT 1 FROM grouped) value";
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
  const result = (await c.admin.query(graphSql, [args[0]])).rows[0]!.value;
  expect(truth).toBe(expected); expect(result).toBe(truth);
 }
 await agreement(w);
}, 120000);

async function sessionFor(w: World, actor = w.w.members.supervisor.member) {
 const session = randomUUID();
 await c.admin.query("INSERT INTO control_plane.contractor_practice_session(session_id,tenant_id,membership_id,identity_user_id,session_digest,created_at,expires_at) VALUES($1,$2,$3,$4,$5,clock_timestamp(),clock_timestamp()+interval '1 day')", [session, actor.tenantId, actor.membershipId, actor.identityUserId, digestOf(session)]);
 return session;
}
const disposition = (group: { id: string; fingerprint: string }, extra = {}) => ({ version: "duplicate-disposition.v1", commandId: randomUUID(), groupId: group.id, fingerprint: group.fingerprint, disposition: "not_duplicates", reasonCode: "different_work", ...extra });
async function facts(w: World) {
 return (await c.admin.query("SELECT (SELECT count(*) FROM app.command_receipt WHERE tenant_id=$1) receipts,(SELECT count(*) FROM app.extra_duplicate_disposition WHERE tenant_id=$1) facts,(SELECT count(*) FROM app.audit_event WHERE tenant_id=$1) audits", [w.w.p.tenantId])).rows[0];
}
async function commercial(w: World) {
 return (await c.admin.query("SELECT (SELECT jsonb_agg(v ORDER BY v.id) FROM app.variation_revision v WHERE tenant_id=$1) revisions,(SELECT jsonb_agg(o ORDER BY o.variation_id) FROM app.extra_origin o WHERE tenant_id=$1) origins,(SELECT jsonb_agg(s ORDER BY s.id) FROM app.extra_approval_step_fact s WHERE tenant_id=$1) approvals,(SELECT jsonb_agg(l ORDER BY l.id) FROM app.extra_duplicate_link l WHERE tenant_id=$1) links", [w.w.p.tenantId])).rows[0];
}
it("dismissal is exact, append-only and reversible; replay is inert and export keeps distinct approved lines", async () => {
 const w = await world(c), [a,b] = await pair(w), session = await sessionFor(w);
 const group = (await agreement(w)).groups[0]!, input = disposition(group), before = await commercial(w);
 const run = (raw: unknown) => resolveExtraDuplicateCandidates(c.runtime,w.ctx,session,w.s.jobId,raw);
 const result = await run(input), written = await facts(w);
 expect(await run(input)).toEqual(result); expect(await facts(w)).toEqual(written);
 expect(await code(run({ ...input, reasonCode: "different_location" }))).toBe("COMMAND_CONFLICT");
 expect(await commercial(w)).toEqual(before); expect((await agreement(w)).groups).toEqual([]);
 await run(disposition(group,{ disposition: "reopen", reasonCode: "review_changed" }));
 expect((await agreement(w)).groups).toHaveLength(1); expect(await code(w.exported())).toBe("BILLING_DUPLICATES_UNRESOLVED");
 await run(disposition(group)); expect((await agreement(w)).groups).toEqual([]);
 await w.exported();
 const lines = (await w.repo.read(w.ctx,w.session,w.s.jobId)).exports.flatMap(x=>x.artifact.lines);
 expect(lines.filter(x=>x.extraId===a)).toHaveLength(1); expect(lines.filter(x=>x.extraId===b)).toHaveLength(1);
 for (const sql of ["UPDATE app.extra_duplicate_disposition SET disposition='reopen' WHERE tenant_id=$1", "DELETE FROM app.extra_duplicate_disposition WHERE tenant_id=$1"]) {
  await expect(ownerTx(c,w.w.p.tenantId,db=>db.$client.query(sql,[w.w.p.tenantId]))).rejects.toBeDefined();
 }
 await expect(withTenant(c.runtime,w.ctx,db=>db.$client.query("INSERT INTO app.extra_duplicate_disposition(tenant_id) VALUES($1)",[w.w.p.tenantId]))).rejects.toMatchObject({ code: "42501" });
},120000);
it("refuses reporters, pricers, forged actor, foreign tenant, uncovered and wrong roles, with no facts or receipts",async()=>{
 const w=await world(c); const [a]=await pair(w); const group=(await read(w)).groups[0]!;
 for(const [actor, expected] of [[w.w.members.surveyor.member,"SELF_DISMISSAL"],[w.w.members.operative.member,"PERMISSION_DENIED"],[w.w.members.owner.member,"PERMISSION_DENIED"],[w.w.members.finance.member,"PERMISSION_DENIED"],[w.w.otherSupervisor.member,"PERMISSION_DENIED"]] as const) {
  const session=await sessionFor(w,actor), before=await facts(w);
  expect(await code(resolveExtraDuplicateCandidates(c.runtime,w.ctx,session,w.s.jobId,disposition(group)))).toBe(expected); expect(await facts(w)).toEqual(before);
 }
 const own = await new ExtraRepository(c.runtime).raiseExtra(w.ctx,direct(w.w,w.w.members.supervisor,{jobId:w.s.jobId,sorItem:{versionId:w.w.demo.sorVersionId,code:"CLEAR-GUTTER"}}));
 expect(own.variationId).not.toBe(a);
 const session=await sessionFor(w), current=(await read(w)).groups[0]!, before=await facts(w);
 expect(await code(resolveExtraDuplicateCandidates(c.runtime,w.ctx,session,w.s.jobId,disposition(current)))).toBe("SELF_DISMISSAL");
 expect(await code(resolveExtraDuplicateCandidates(c.runtime,w.ctx,session,w.s.jobId,{...disposition(current),actorMembershipId:w.w.members.commercial_manager.member.membershipId}))).toBe("INVALID_COMMAND");
 expect(await code(resolveExtraDuplicateCandidates(c.runtime,w.ctx,randomUUID(),w.s.jobId,disposition(current)))).toBe("PERMISSION_DENIED");
 const other=await world(c), foreign=await sessionFor(other);
 expect(await code(resolveExtraDuplicateCandidates(c.runtime,w.ctx,foreign,w.s.jobId,disposition(current)))).toBe("PERMISSION_DENIED");
 expect(await code(resolveExtraDuplicateCandidates(c.runtime,w.ctx,session,other.s.jobId,disposition(current)))).toBe("PERMISSION_DENIED");
 expect(await facts(w)).toEqual(before);
},120000);
it("revision changes and a new extra racing dismissal raise the group again and keep export refused",async()=>{
 const w=await world(c), [a]=await pair(w), session=await sessionFor(w);
 const run=(raw:unknown)=>resolveExtraDuplicateCandidates(c.runtime,w.ctx,session,w.s.jobId,raw);
 const group=(await agreement(w)).groups[0]!; await run(disposition(group));
 await new ExtraApprovalRepository(c.runtime).reviseExtra(w.ctx,w.w.members.surveyor.member,{version:"revise-extra.v1",commandId:randomUUID(),jobId:w.s.jobId,extraId:a,netPence:339});
 const revised=(await agreement(w)).groups[0]!; expect(revised.fingerprint).not.toBe(group.fingerprint);
 expect(await code(run(disposition(group)))).toBe("STALE_REVISION"); expect(await code(w.exported())).toBe("BILLING_DUPLICATES_UNRESOLVED");
 const input=disposition(revised);
 const raising=new ExtraRepository(c.runtime).raiseExtra(w.ctx,direct(w.w,w.w.members.operative,{jobId:w.s.jobId,sorItem:{versionId:w.w.demo.sorVersionId,code:"CLEAR-GUTTER"}}));
 const results=await Promise.allSettled([run(input),raising]); expect(results[1]!.status).toBe("fulfilled");
 if(results[0]!.status==="rejected") expect((results[0] as PromiseRejectedResult).reason.code).toBe("STALE_REVISION");
 const current=(await agreement(w)).groups[0]!; expect(current.extras).toHaveLength(3); expect(current.fingerprint).not.toBe(revised.fingerprint);
 expect(await code(w.exported())).toBe("BILLING_DUPLICATES_UNRESOLVED");
},120000);
it("dismisses one group only; every other group still refuses export and concurrent replays create one fact",async()=>{
 const w=await world(c); await pair(w);
 // Another independent code forms a separate group, using the same real capture command.
 const codeRow=(await c.admin.query("SELECT code FROM app.sor_item WHERE tenant_id=$1 AND version_id=$2 AND code<>'CLEAR-GUTTER' ORDER BY code LIMIT 1",[w.w.p.tenantId,w.w.demo.sorVersionId])).rows[0]!;
 for(let n=0;n<2;n++) await new ExtraRepository(c.runtime).raiseExtra(w.ctx,direct(w.w,w.w.members.operative,{jobId:w.s.jobId,sorItem:{versionId:w.w.demo.sorVersionId,code:codeRow.code}}));
 const groups=(await agreement(w)).groups; expect(groups).toHaveLength(2);
 const session=await sessionFor(w), input=disposition(groups[0]!), before=await facts(w);
 const run=()=>resolveExtraDuplicateCandidates(c.runtime,w.ctx,session,w.s.jobId,input);
 const [left,right]=await Promise.all([run(),run()]); expect(left).toEqual(right);
 const after=await facts(w); expect(Number(after.facts)-Number(before.facts)).toBe(1); expect(Number(after.receipts)-Number(before.receipts)).toBe(1); expect(Number(after.audits)-Number(before.audits)).toBe(1);
 expect((await agreement(w)).groups.map(g=>g.id)).toEqual([groups[1]!.id]); expect(await code(w.exported())).toBe("BILLING_DUPLICATES_UNRESOLVED");
},120000);

it("independent surveyors and commercial managers may dismiss with a covering grant",async()=>{
 const w=await world(c);await pair(w);const group=(await read(w)).groups[0]!;
 const independent=await invite(c,w.w,"surveyor",{kind:"team",id:w.w.demo.teamId});
 for(const actor of [independent.member,w.w.members.commercial_manager.member]){
  const session=await sessionFor(w,actor);
  await resolveExtraDuplicateCandidates(c.runtime,w.ctx,session,w.s.jobId,disposition(group));
  expect((await agreement(w)).groups).toEqual([]);
  await resolveExtraDuplicateCandidates(c.runtime,w.ctx,session,w.s.jobId,disposition(group,{disposition:"reopen",reasonCode:"review_changed"}));
  expect((await agreement(w)).groups).toHaveLength(1);
 }
},120000);
