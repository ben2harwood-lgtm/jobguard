// Real PostgreSQL only; CI executes this file. All records are fictional synthetic fixtures.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { appendAuditBatch, EnterpriseLivePromptRepository, withTenant } from "../src/index.js";
import { cluster, promptFixture, ownerTx, materialsInput, listInput, type PromptFixture } from "./enterprise-live-prompt-fixtures.js";
import { ownerVisit } from "./site-visit-fixtures.js";
vi.setConfig({ testTimeout: 90000, hookTimeout: 120000 });
let c: Awaited<ReturnType<typeof cluster>>, repo: EnterpriseLivePromptRepository;
beforeAll(async () => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); c = await cluster(); repo = new EnterpriseLivePromptRepository(c.runtime); });
afterAll(async () => { await c?.close(); vi.unstubAllEnvs(); });
const input = (f: PromptFixture, overrides: Record<string, unknown> = {}) => ({ version: "end-check.v1", jobId: f.jobId, commandId: randomUUID(), ...overrides });
async function agreement(f: PromptFixture, enabled: boolean, effective = "2020-01-01T00:00:00Z") {
 const id = randomUUID();
 await ownerTx(c, f.p.tenantId, db => db.$client.query(`INSERT INTO app.enterprise_agreement_version
 (tenant_id,id,agreement_ref,rate_numerator,rate_denominator,basis,policy_version,effective_from,end_of_job_check,content_hash,environment,operations_actor_ref)
 VALUES($1,$2,'fictional-finish',1,10,'on_payment','enterprise_site_capture_policy_v1',$3,$4,$5,'synthetic_demo','fictional-test')`, [f.p.tenantId, id, effective, enabled, "a".repeat(64)]));
 return id;
}
/** Owner-seeded pending stored issue fact, with its exact receipt/audit. No detector is run by this fixture.
 * This represents already imported evidence waiting for evaluation, rather than fabricating a prompt. */
async function pendingMaterials(f: PromptFixture) {
 const cid = randomUUID(), source = randomUUID(), hash = "b".repeat(64), result = { sourceId: source };
 await ownerTx(c, f.p.tenantId, async db => {
  await db.$client.query(`INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,actor_membership_id,result,completed_at)
   VALUES($1,$2,'ImportMaterialsIssue',$3,$4,'succeeded',$5,$6,clock_timestamp())`, [f.p.tenantId,cid,`live-prompt:${f.jobId}:${cid}`,hash,f.p.membershipId,result]);
  await db.$client.query(`INSERT INTO app.materials_issue_fact(tenant_id,job_id,id,version,fact_kind,source_id,event_id,work_identity,unit,quantity,occurred_at_micros,source_hash,command_id,actor_membership_id)
   VALUES($1,$2,$3,'materials-issue.v1','issue','fictional-pending',$4,'REPAIR-DOOR','each',100,1792310400000000,$5,$6,$7)`, [f.p.tenantId,f.jobId,source,randomUUID(),hash,cid,f.p.membershipId]);
  // PostgreSQL jsonb canonical text differs from JS serialization; hash the stored result in the database.
  const resultHash = (await db.$client.query("SELECT encode(sha256(convert_to($1::jsonb::text,'UTF8')),'hex') hash", [JSON.stringify(result)])).rows[0]!.hash as string;
  await appendAuditBatch(db, [{ id: cid, version: "audit.v1", actorRef: `membership:${f.p.membershipId}`, eventType: "contractor.prompt.command", subjectType: "job", subjectRef: f.jobId, payload: { references: { command: cid, job: f.jobId }, hashes: { input: hash, result: resultHash } } }]);
 });
 return source;
}
async function unchangedCounts(f: PromptFixture) {
 const tables = (await c.admin.query(`SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE c.relkind='r' AND n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'
  AND (c.relname ~ '(extra|fee|billing|statement|shadow)' OR n.nspname LIKE '%shadow%' OR c.relname IN('variation','scope_identity','scope_lineage','prompt_resolution'))
  AND c.relname NOT IN('extra_prompt','extra_prompt_citation')
  AND EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname='tenant_id' AND NOT a.attisdropped)`)).rows;
 const counts: Record<string, string> = {};
 for (const table of tables) {
  const name = `"${String(table.nspname).replaceAll('"','""')}"."${String(table.relname).replaceAll('"','""')}"`;
  counts[name] = (await c.admin.query(`SELECT count(*) n FROM ${name} WHERE tenant_id=$1`, [f.p.tenantId])).rows[0]!.n as string;
 }
 return counts;
}
describe("ENT-8a owner contractor job finish", () => {
 it("runs the enabled evaluator, cites stored evidence, immediately surfaces and coalesces without financial or shadow effects", async () => {
  const f = await promptFixture(c), ag = await agreement(f, true), source = await pendingMaterials(f);
  const before = await unchangedCounts(f), cmd = input(f, { agreementVersionId: ag });
  const result = await repo.endCheck(f.sessions.owner!, cmd);
  expect(result).toMatchObject({ jobId: f.jobId, checkRan: true, promptsRaised: 1 });
  const lane = await repo.list(f.sessions.supervisor!, listInput(f));
  expect(lane.items).toEqual([expect.objectContaining({ jobId: f.jobId, rule: "b" })]);
  const detail = await repo.detail(f.sessions.supervisor!, { version: "live-prompt-detail.v1", jobId: f.jobId, promptId: lane.items[0]!.id });
  expect(detail.citations).toEqual(expect.arrayContaining([expect.objectContaining({ sourceId: source, sha256: "b".repeat(64) })]));
  await expect(repo.endCheck(f.sessions.owner!, cmd)).resolves.toEqual(result);
  await expect(repo.endCheck(f.sessions.owner!, input(f))).rejects.toMatchObject({ code: "PROMPT_CONFLICT" });
  expect((await c.admin.query("SELECT count(*)::int n FROM app.contractor_job_finish WHERE tenant_id=$1", [f.p.tenantId])).rows[0]!.n).toBe(1);
  expect(await unchangedCounts(f)).toEqual(before);
  expect((await c.admin.query("SELECT status FROM app.job WHERE tenant_id=$1 AND id=$2", [f.p.tenantId,f.jobId])).rows[0]!.status).toBe("live");
  expect(await repo.finishStatus(f.sessions.owner!, f.jobId)).toEqual({ canFinish: true, finish: result });
  const coalesced = await promptFixture(c); await agreement(coalesced, true);
  await repo.importMaterials(coalesced.sessions.finance!, materialsInput(coalesced));
  const original = await repo.list(coalesced.sessions.supervisor!, listInput(coalesced));
  expect(await repo.endCheck(coalesced.sessions.owner!, input(coalesced))).toMatchObject({ checkRan: true, promptsRaised: 0 });
  expect(await repo.list(coalesced.sessions.supervisor!, listInput(coalesced))).toEqual(original);
 });
 it.each(["disabled", "missing"])("records a finish with %s agreement without evaluating evidence", async mode => {
  const f = await promptFixture(c); const ag = mode === "disabled" ? await agreement(f, false) : null;
  await pendingMaterials(f); const before = await unchangedCounts(f);
  expect(await repo.endCheck(f.sessions.owner!, input(f))).toMatchObject({ checkRan: false, promptsRaised: 0 });
  expect((await repo.list(f.sessions.supervisor!, listInput(f))).items).toEqual([]);
  expect((await c.admin.query("SELECT agreement_version_id,check_ran FROM app.contractor_job_finish WHERE tenant_id=$1 AND job_id=$2", [f.p.tenantId,f.jobId])).rows).toEqual([{ agreement_version_id: ag, check_ran: false }]);
  expect(await unchangedCounts(f)).toEqual(before);
 });
 it("uses the current server agreement and refuses altered ids including on replay", async () => {
  const f = await promptFixture(c), foreign = await promptFixture(c);
  const old = await agreement(f, false), current = await agreement(f, true, "2021-01-01T00:00:00Z"), other = await agreement(foreign, true);
  await agreement(f, false, "2099-01-01T00:00:00Z");
  for (const agreementVersionId of [old, other, randomUUID()]) await expect(repo.endCheck(f.sessions.owner!, input(f, { agreementVersionId }))).rejects.toMatchObject({ code: "PROMPT_CONFLICT" });
  const cmd = input(f, { agreementVersionId: current }); await repo.endCheck(f.sessions.owner!, cmd);
  await expect(repo.endCheck(f.sessions.owner!, { ...cmd, agreementVersionId: old })).rejects.toMatchObject({ code: "PROMPT_CONFLICT" });
 });
 it.each(["supervisor", "surveyor", "operative", "finance", "commercial_manager", "admin"])("refuses %s for writes and finish-state reads", async role => {
  const f = await promptFixture(c);
  await expect(repo.endCheck(f.sessions[role]!, input(f))).rejects.toMatchObject({ code: "EXTRA_FORBIDDEN" });
  await expect(repo.finishStatus(f.sessions[role]!, f.jobId)).rejects.toMatchObject({ code: "EXTRA_FORBIDDEN" });
 });
 it("rechecks a removed owner's authority before replay", async () => {
  const f = await promptFixture(c), session = f.sessions.owner!, cmd = input(f); await repo.endCheck(session, cmd);
  await c.admin.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2", [f.p.tenantId, f.p.membershipId]);
  await expect(repo.endCheck(session, cmd)).rejects.toBeDefined();
  await expect(repo.finishStatus(session, f.jobId)).rejects.toBeDefined();
 });
 it("returns the same refusal for foreign, out-of-scope and absent jobs", async () => {
  const f = await promptFixture(c), other = await promptFixture(c);
  for (const jobId of [other.jobId, randomUUID()]) {
   await expect(repo.endCheck(f.sessions.owner!, input(f, { jobId }))).rejects.toMatchObject({ code: "EXTRA_FORBIDDEN" });
   await expect(repo.finishStatus(f.sessions.owner!, jobId)).rejects.toMatchObject({ code: "EXTRA_FORBIDDEN" });
  }
 });
 it("refuses an open visit and caller-supplied authority/time/check fields", async () => {
  const f = await promptFixture(c); await ownerVisit(c, f, f.members.operative.member.membershipId);
  await expect(repo.endCheck(f.sessions.owner!, input(f))).rejects.toMatchObject({ code: "PROMPT_CONFLICT" });
  for (const key of ["actorId", "tenantId", "finishedAt", "checkRan", "completionEventId", "visitId"]) await expect(repo.endCheck(f.sessions.owner!, input(f, { [key]: randomUUID() }))).rejects.toMatchObject({ code: "INVALID_PROMPT_COMMAND" });
 });
 it("rejects raw SQL authority fields without creating a finish or receipt", async () => {
  const f = await promptFixture(c);
  for (const field of ["tenantId", "actorId", "finishedAt", "checkRan"]) {
   const raw = input(f, { [field]: randomUUID() });
   await expect(withTenant(c.runtime, f.ctx, db => db.$client.query("SELECT app.lp_command($1,$2::jsonb)", [f.sessions.owner!,JSON.stringify(raw)]))).rejects.toMatchObject({ message: "INVALID_PROMPT_COMMAND" });
   expect((await c.admin.query("SELECT count(*)::int n FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2", [f.p.tenantId,raw.commandId])).rows[0]!.n).toBe(0);
  }
 });
 it("serializes competing finishes and keeps the record private, forced-RLS and immutable", async () => {
  const f = await promptFixture(c), results = await Promise.allSettled([repo.endCheck(f.sessions.owner!, input(f)), repo.endCheck(f.sessions.owner!, input(f))]);
  expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
  expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
  const row = (await c.admin.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='app.contractor_job_finish'::regclass")).rows[0];
  expect(row).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
  for (const role of ["jobguard_runtime", "jobguard_infrastructure", "jobguard_shadow"]) expect((await c.admin.query("SELECT has_table_privilege($1,'app.contractor_job_finish','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') allowed", [role])).rows[0]!.allowed).toBe(false);
  for (const sql of ["UPDATE app.contractor_job_finish SET check_ran=false", "DELETE FROM app.contractor_job_finish", "TRUNCATE app.contractor_job_finish"]) await expect(ownerTx(c, f.p.tenantId, db => db.$client.query(sql))).rejects.toBeDefined();
  await expect(withTenant(c.runtime, f.ctx, db => db.$client.query("SELECT * FROM app.contractor_job_finish"))).rejects.toMatchObject({ code: "42501" });
 });
});
