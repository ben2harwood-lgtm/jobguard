// Real PostgreSQL, fictional data only. cluster() applies every discovered migration.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { EnterpriseLivePromptRepository, SiteVisitRepository, withTenant } from "../src/index.js";
import { cluster, promptFixture, type PromptFixture } from "./enterprise-live-prompt-fixtures.js";
import { chain, command, reviseOrder, secondJob, type Actor } from "./site-visit-fixtures.js";
vi.setConfig({ testTimeout: 90000, hookTimeout: 120000 });
let c: Awaited<ReturnType<typeof cluster>>, visits: SiteVisitRepository, prompts: EnterpriseLivePromptRepository;
beforeAll(async () => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); c = await cluster(); visits = new SiteVisitRepository(c.runtime); prompts = new EnterpriseLivePromptRepository(c.runtime); });
afterAll(async () => { await c?.close(); vi.unstubAllEnvs(); });
const reason = "Fictional operative no longer assigned";
const start = (f: PromptFixture) => visits.startVisit(f.ctx, f.members.operative.member, { commandId: randomUUID(), jobId: f.jobId });
const close = (f: PromptFixture, visit: string, actor: Actor = f.members.owner, cid = randomUUID(), job = f.jobId, why = reason) =>
 withTenant(c.runtime, f.ctx, async db => (await db.$client.query("SELECT app.ent3b_close_abandoned_visit($1,$2,$3,$4,$5) answer", [actor.member.membershipId,cid,job,visit,why])).rows[0]!.answer as string);
const finish = (f: PromptFixture) => prompts.endCheck(f.sessions.owner!, { version: "end-check.v1", commandId: randomUUID(), jobId: f.jobId });
async function state(f: PromptFixture) {
 const rows = async (table: string) => (await c.admin.query(`SELECT row_to_json(x)::text row FROM app.${table} x WHERE tenant_id=$1 ORDER BY row_to_json(x)::text`, [f.p.tenantId])).rows;
 return { visits: await rows("site_visit"), answers: await rows("closeout_answer"), receipts: await rows("command_receipt"), events: await rows("audit_event") };
}
async function refused(f: PromptFixture, run: () => Promise<unknown>, message: string) {
 const before = await state(f);
 await expect(run()).rejects.toMatchObject({ message });
 expect(await state(f)).toEqual(before);
}
describe("LATER-SAFETY-79 abandoned site visits", () => {
 it.each(["revoked", "unassigned"] as const)("closes a %s operative's visit, replays once, and releases EndCheck", async loss => {
  const f = await promptFixture(c), visit = await start(f), cid = randomUUID();
  if (loss === "revoked") await command(c, f, { kind: "membership.revoke", membershipId: f.members.operative.member.membershipId });
  else await reviseOrder(c, f, f.revision, [f.named.member.membershipId]);
  await expect(visits.completeVisit(f.ctx, f.members.operative.member, { commandId: randomUUID(), jobId: f.jobId, visitId: visit.visitId, closeoutAnswer: "no" })).rejects.toBeDefined();
  await expect(finish(f)).rejects.toMatchObject({ code: "PROMPT_CONFLICT" });
  const answer = await close(f, visit.visitId, f.members.owner, cid), beforeReplay = await state(f);
  expect(await close(f, visit.visitId, f.members.owner, cid)).toBe(answer);
  expect(await state(f)).toEqual(beforeReplay);
  const stored = (await c.admin.query(`SELECT a.id,a.answer,a.membership_id,a.server_recorded_at=v.completed_at same_time,
   r.status,r.actor_membership_id FROM app.closeout_answer a JOIN app.site_visit v ON(v.tenant_id,v.id)=(a.tenant_id,a.site_visit_id)
   JOIN app.command_receipt r ON(r.tenant_id,r.command_id)=(a.tenant_id,a.command_id) WHERE a.tenant_id=$1 AND a.site_visit_id=$2`, [f.p.tenantId,visit.visitId])).rows;
  expect(stored).toEqual([{ id: answer, answer: "no", membership_id: f.members.operative.member.membershipId, same_time: true, status: "succeeded", actor_membership_id: f.p.membershipId }]);
  const events = (await c.admin.query("SELECT id,actor_ref,payload FROM app.audit_event WHERE tenant_id=$1 AND subject_ref=$2 AND event_type='contractor.visit.completed'", [f.p.tenantId,visit.visitId])).rows;
  expect(events).toEqual([expect.objectContaining({ id: answer, actor_ref: `membership:${f.p.membershipId}`, payload: expect.objectContaining({ references: expect.objectContaining({ closeKind: "abandoned", command: cid }) }) })]);
  expect(JSON.stringify(events)).not.toContain(reason);
  await refused(f, () => close(f, visit.visitId, f.members.owner, cid, f.jobId, "changed reason"), "COMMAND_CONFLICT");
  await refused(f, () => close(f, visit.visitId), "NOT_FOUND");
  await expect(finish(f)).resolves.toMatchObject({ jobId: f.jobId });
  await chain(c, f);
 });
 it("refuses an authoritative operative, non-admins, wrong-job/tenant visits, missing visits and invalid reasons without effects", async () => {
  const f = await promptFixture(c), foreign = await promptFixture(c), visit = await start(f), otherVisit = await start(foreign), other = await secondJob(c, f);
  await refused(f, () => close(f, visit.visitId), "VISIT_NOT_ABANDONED");
  await command(c, f, { kind: "membership.revoke", membershipId: f.members.operative.member.membershipId });
  for (const role of ["supervisor", "surveyor", "finance", "commercial_manager", "read_only"] as const)
   await refused(f, () => close(f, visit.visitId, f.members[role]), "PERMISSION_DENIED");
  for (const id of [otherVisit.visitId, randomUUID()]) await refused(f, () => close(f, id), "NOT_FOUND");
  await refused(f, () => close(f, visit.visitId, f.members.owner, randomUUID(), other.jobId), "NOT_FOUND");
  for (const why of ["", " ", "x".repeat(1001)]) await refused(f, () => close(f, visit.visitId, f.members.owner, randomUUID(), f.jobId, why), "INVALID_COMMAND");
  const beforeForeign = await state(foreign);
  await close(f, visit.visitId, f.members.admin);
  expect(await state(foreign)).toEqual(beforeForeign);
 });
 it("rechecks the administrator's current membership before replay", async () => {
  const f = await promptFixture(c), visit = await start(f), cid = randomUUID();
  await command(c, f, { kind: "membership.revoke", membershipId: f.members.operative.member.membershipId });
  await close(f, visit.visitId, f.members.admin, cid);
  await command(c, f, { kind: "membership.revoke", membershipId: f.members.admin.member.membershipId });
  await refused(f, () => close(f, visit.visitId, f.members.admin, cid), "PERMISSION_DENIED");
 });
 it("keeps owner, SECURITY DEFINER, search_path and the normal completion execute boundary", async () => {
  const definition = (await c.admin.query(`SELECT pg_get_userbyid(proowner) owner,prosecdef,proconfig FROM pg_proc
   WHERE oid='app.ent3b_close_abandoned_visit(uuid,uuid,uuid,uuid,text)'::regprocedure`)).rows[0];
  expect(definition).toEqual({ owner: "jobguard_migration", prosecdef: true, proconfig: ["search_path=pg_catalog"] });
  for (const role of ["jobguard_runtime", "jobguard_infrastructure", "jobguard_identity", "jobguard_shadow"]) {
   const row = (await c.admin.query(`SELECT has_function_privilege($1,'app.ent3b_close_abandoned_visit(uuid,uuid,uuid,uuid,text)','EXECUTE') new,
    has_function_privilege($1,'app.ent3b_complete_visit(uuid,uuid,uuid,uuid,text)','EXECUTE') existing`, [role])).rows[0]!;
   expect(row.new, role).toBe(row.existing);
  }
 });
 it("kills removal of the visit authority guard (transactional scratch mutation, rolled back)", async () => {
  const f = await promptFixture(c), visit = await start(f);
  await refused(f, () => close(f, visit.visitId), "VISIT_NOT_ABANDONED");
  const client = await c.admin.connect();
  try {
   await client.query("BEGIN");
   const source = (await client.query("SELECT pg_get_functiondef('app.ent3b_close_abandoned_visit(uuid,uuid,uuid,uuid,text)'::regprocedure) source")).rows[0]!.source as string;
   const mutated = source.replace("IF EXISTS(SELECT 1 FROM app.ent3b_visit_authority(visit_row.membership_id,p_job) a WHERE a.decision='allowed') THEN", "IF false THEN");
   expect(mutated).not.toBe(source);
   await client.query(mutated);
   await client.query("SELECT set_config('app.tenant_id',$1,true)", [f.p.tenantId]);
   await client.query("SET LOCAL ROLE jobguard_runtime");
   // The same boundary assertion must fail if the guard is removed.
   const boundary = async () => {
    await expect(client.query("SELECT app.ent3b_close_abandoned_visit($1,$2,$3,$4,$5)", [f.p.membershipId,randomUUID(),f.jobId,visit.visitId,reason])).rejects.toMatchObject({ message: "VISIT_NOT_ABANDONED" });
   };
   await expect(boundary()).rejects.toThrow();
  } finally { await client.query("ROLLBACK"); client.release(); }
  await refused(f, () => close(f, visit.visitId), "VISIT_NOT_ABANDONED");
 });
});
