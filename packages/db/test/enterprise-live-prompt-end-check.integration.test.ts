import { contractorSessionContext } from "../src/index.js";
import { testActorContext } from "./tenant-context-test-utils.js";
// ENT-8a: caller-supplied completion events remain invalid; only the owner finish command creates completion.
// NOT RUN locally: PostgreSQL execution belongs to CI.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { EnterpriseLivePromptRepository } from "../src/enterprise-live-prompt-repository.js";
import { appendAuditBatch } from "../src/audit.js";
import { withTenant } from "../src/tenant-context.js";
import { readStoredCompletionPhoto } from "../src/enterprise-live-prompt-source-reader.js";
import { SiteVisitRepository } from "../src/site-visit-repository.js";
import { cluster, promptFixture, ownerTx, completionPhoto, type PromptFixture } from "./enterprise-live-prompt-fixtures.js";
import { startInput, completeInput } from "./site-visit-fixtures.js";
vi.setConfig({testTimeout:90000,hookTimeout:120000});
let c:Awaited<ReturnType<typeof cluster>>, repo:EnterpriseLivePromptRepository;
beforeAll(async()=>{vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");c=await cluster();repo=new EnterpriseLivePromptRepository(c.runtime);});
afterAll(async()=>{await c?.close();vi.unstubAllEnvs();});
describe('caller completion event rejection',()=>{
 it.each(['missing','disabled','wrong-version'] as const)('%s agreement cannot authorize an end check',async scenario=>{
  const f=await promptFixture(c);
  const before=(await c.admin.query('SELECT count(*)::int n FROM app.extra_prompt WHERE tenant_id=$1',[f.p.tenantId])).rows[0]!.n;
  await expect(repo.endCheck(f.sessions.owner!,{version:'end-check.v1',commandId:randomUUID(),jobId:f.jobId,...(scenario==='missing'?{}:{agreementVersionId:randomUUID()}),completionEventId:randomUUID()})).rejects.toMatchObject({code:'INVALID_PROMPT_COMMAND'});
  expect((await c.admin.query('SELECT count(*)::int n FROM app.extra_prompt WHERE tenant_id=$1',[f.p.tenantId])).rows[0]!.n).toBe(before);
 });
 it('a completed visit cannot substitute for authoritative job completion',async()=>{
  const f=await promptFixture(c),visits=new SiteVisitRepository(c.runtime),actor=f.members.operative.member;
  const start=await visits.startVisit(await testActorContext(c.admin, f.ctx, actor),actor,startInput(f));
  await visits.completeVisit(await testActorContext(c.admin, f.ctx, actor),actor,completeInput(f,start.visitId,'no'));
  await expect(repo.endCheck(f.sessions.owner!,{version:'end-check.v1',commandId:randomUUID(),jobId:f.jobId,agreementVersionId:randomUUID(),completionEventId:start.visitId})).rejects.toMatchObject({code:'INVALID_PROMPT_COMMAND'});
  expect((await c.admin.query("SELECT status FROM app.job WHERE tenant_id=$1 AND id=$2",[f.p.tenantId,f.jobId])).rows[0]!.status).toBe('live');
 });
 // Positive owner completion is covered by contractor-job-finish.integration.test.ts.
});

/** Owner-only fixture for stored evidence awaiting evaluation; no prompt is fabricated.
 * An ordered stored identity deliberately disagrees with the recognized PNG locator. */
async function pendingCompletion(f: PromptFixture, storedIdentity: string) {
 const photo = await completionPhoto(c, f, ['new gutters']);
 const bytes = await withTenant(c.runtime, await contractorSessionContext(c.runtime, f.sessions.named!), db => readStoredCompletionPhoto(db, f.sessions.named!, {jobId: f.jobId, ...photo}));
 const agreement = randomUUID(), hash = 'c'.repeat(64);
 await ownerTx(c, f.p.tenantId, async db => {
  await db.$client.query(`INSERT INTO app.enterprise_agreement_version
   (tenant_id,id,agreement_ref,rate_numerator,rate_denominator,basis,policy_version,effective_from,end_of_job_check,content_hash,environment,operations_actor_ref)
   VALUES($1,$2,'fictional-rule-a',1,10,'on_payment','enterprise_site_capture_policy_v1','2020-01-01',true,$3,'synthetic_demo','fictional-test')`, [f.p.tenantId,agreement,hash]);
  await db.$client.query(`INSERT INTO app.extra_prompt_rule_settings
   (tenant_id,id,client_contract_version_id,version,factor_numerator,factor_denominator,recognition,content_hash)
   VALUES($1,$2,$3,'extra-prompt-rule-settings.v1',1,1,'[{"workId":"CLEAR-GUTTER","terms":["new gutters"]}]',$4)`, [f.p.tenantId,randomUUID(),f.demo.contractVersionId,hash]);
  for (const identity of storedIdentity === 'REPAIR-DOOR' ? ['CLEAR-GUTTER', storedIdentity] : [storedIdentity]) {
   const command = randomUUID(), observation = randomUUID(), result = {observationId: observation};
   await db.$client.query(`INSERT INTO app.command_receipt
    (tenant_id,command_id,command_type,semantic_key,request_hash,status,actor_membership_id,result,completed_at)
    VALUES($1,$2,'RegisterCompletionObservation',$3,$4,'succeeded',$5,$6,clock_timestamp())`, [f.p.tenantId,command,`live-prompt:${f.jobId}:${command}`,hash,f.p.membershipId,result]);
   await db.$client.query(`INSERT INTO app.extra_completion_observation
    (tenant_id,job_id,id,evidence_id,object_version_id,sha256,source_kind,source_bytes,photo_tags,locator,work_identity,command_id,actor_membership_id)
    VALUES($1,$2,$3,$4,$5,$6,'completion_photo',$7,'["new gutters"]','{"kind":"photo_tag","tag":"new gutters"}',$8,$9,$10)`,
    [f.p.tenantId,f.jobId,observation,photo.evidenceId,photo.objectVersion,photo.sha256,bytes,identity,command,f.p.membershipId]);
   const resultHash = (await db.$client.query("SELECT encode(sha256(convert_to($1::jsonb::text,'UTF8')),'hex') hash", [JSON.stringify(result)])).rows[0]!.hash as string;
   await appendAuditBatch(db, [{id: command,version: 'audit.v1',actorRef: `membership:${f.p.membershipId}`,eventType: 'contractor.prompt.command',subjectType: 'job',subjectRef: f.jobId,
    payload: {references: {command,job: f.jobId},hashes: {input: hash,result: resultHash}}}]);
  }
 });
 return agreement;
}
async function finishSnapshot(f: PromptFixture) {
 const snapshot: Record<string, unknown> = {};
 for (const table of ['app.extra_prompt','app.extra_prompt_citation','app.extra_completion_observation','app.contractor_job_finish','app.command_receipt','app.audit_event','audit_control.audit_head','app.job']) {
  snapshot[table] = (await c.admin.query(`SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),'[]') data FROM ${table} r WHERE tenant_id=$1`, [f.p.tenantId])).rows[0]!.data;
 }
 return snapshot;
}
describe('end-check stored rule (a) recheck', () => {
 it('finishes without evaluating a recognised off-order observation when the end check is disabled', async () => {
  const f = await promptFixture(c);
  await pendingCompletion(f, 'CLEAR-GUTTER');
  const agreementVersionId = randomUUID();
  await ownerTx(c, f.p.tenantId, db => db.$client.query(`INSERT INTO app.enterprise_agreement_version
   (tenant_id,id,agreement_ref,rate_numerator,rate_denominator,basis,policy_version,effective_from,end_of_job_check,content_hash,environment,operations_actor_ref)
   VALUES($1,$2,'fictional-disabled-rule-a',1,10,'on_payment','enterprise_site_capture_policy_v1','2021-01-01',false,$3,'synthetic_demo','fictional-test')`, [f.p.tenantId,agreementVersionId,'d'.repeat(64)]));
  // Recognised stored work is off-order and has no prompt awaiting the optional evaluation.
  const before = await finishSnapshot(f);
  expect(before['app.extra_prompt']).toEqual([]);
  const cmd = {version: 'end-check.v1',commandId: randomUUID(),jobId: f.jobId,agreementVersionId};
  const result = await repo.endCheck(f.sessions.owner!, cmd);
  expect(result).toEqual({jobId: f.jobId,finishedAt: expect.any(String),checkRan: false,promptsRaised: 0});
  expect((await c.admin.query('SELECT agreement_version_id,check_ran,command_id,actor_membership_id FROM app.contractor_job_finish WHERE tenant_id=$1 AND job_id=$2', [f.p.tenantId,f.jobId])).rows).toEqual([
   {agreement_version_id: agreementVersionId,check_ran: false,command_id: cmd.commandId,actor_membership_id: f.p.membershipId},
  ]);
  expect((await c.admin.query('SELECT status,result FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2', [f.p.tenantId,cmd.commandId])).rows).toEqual([{status: 'succeeded',result}]);
  expect((await c.admin.query('SELECT event_type FROM app.audit_event WHERE tenant_id=$1 AND id=$2', [f.p.tenantId,cmd.commandId])).rows).toEqual([{event_type: 'contractor.prompt.command'}]);
  const after = await finishSnapshot(f);
  for (const table of ['app.extra_prompt','app.extra_prompt_citation','app.extra_completion_observation','app.job']) expect(after[table]).toEqual(before[table]);
  await expect(repo.endCheck(f.sessions.owner!, cmd)).resolves.toEqual(result);
  expect(await finishSnapshot(f)).toEqual(after);
 });
 it('refuses a stored identity/PNG finding mismatch and rolls back the entire finish', async () => {
  const f = await promptFixture(c), agreementVersionId = await pendingCompletion(f, 'REPAIR-DOOR');
  const before = await finishSnapshot(f);
  // SQL creates a prompt for the valid observation but skips the ordered identity.
  // The independent stored-PNG calculation also finds CLEAR-GUTTER for that mismatched observation.
  // Main succeeds here without the repository recheck, so this rejection is the regression assertion.
  await expect(repo.endCheck(f.sessions.owner!, {version: 'end-check.v1',commandId: randomUUID(),jobId: f.jobId,agreementVersionId})).rejects.toMatchObject({code: 'PROMPT_SOURCE_INVALID'});
  expect(await finishSnapshot(f)).toEqual(before);
 });
 it('does not let an unfinished owner finish authorize another job projection', async () => {
  const f = await promptFixture(c), agreementVersionId = await pendingCompletion(f, 'CLEAR-GUTTER');
  const before = await finishSnapshot(f);
  // LP-6d: raw calls run in the owner session's own bound request.
  await expect(withTenant(c.runtime, await contractorSessionContext(c.runtime, f.sessions.owner!), async db => {
   await db.$client.query('SELECT app.lp_command($1,$2::jsonb)', [f.sessions.owner!, JSON.stringify({version: 'end-check.v1',commandId: randomUUID(),jobId: f.jobId,agreementVersionId})]);
   await db.$client.query('SELECT app.lp_sources($1,$2)', [f.sessions.owner!,f.otherJob]);
  })).rejects.toMatchObject({message: 'EXTRA_FORBIDDEN'});
  expect(await finishSnapshot(f)).toEqual(before);
 });
 it('creates a checked rule (a) prompt and closes owner projection access before replay', async () => {
  const f = await promptFixture(c), agreementVersionId = await pendingCompletion(f, 'CLEAR-GUTTER');
  const cmd = {version: 'end-check.v1',commandId: randomUUID(),jobId: f.jobId,agreementVersionId};
  const ownerSources = async () => withTenant(c.runtime, await contractorSessionContext(c.runtime, f.sessions.owner!), db => db.$client.query('SELECT app.lp_sources($1,$2)', [f.sessions.owner!,f.jobId]));
  await expect(ownerSources()).rejects.toMatchObject({message: 'EXTRA_FORBIDDEN'});
  const result = await repo.endCheck(f.sessions.owner!, cmd);
  expect(result).toMatchObject({checkRan: true,promptsRaised: 1});
  const page = await repo.list(f.sessions.named!, {version: 'live-prompt-list.v1',jobId: f.jobId});
  expect(page.items).toEqual([expect.objectContaining({rule: 'a'})]);
  await expect(ownerSources()).rejects.toMatchObject({message: 'EXTRA_FORBIDDEN'});
  const beforeReplay = await finishSnapshot(f);
  await expect(repo.endCheck(f.sessions.owner!, cmd)).resolves.toEqual(result);
  expect(await finishSnapshot(f)).toEqual(beforeReplay);
 });
});
