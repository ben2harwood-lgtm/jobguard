// Real PostgreSQL command fixtures. NOT RUN in the restricted builder sandbox.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { EnterpriseLivePromptRepository } from "../src/enterprise-live-prompt-repository.js";
import { ContractorRepository, SorRepository, WorkOrderRepository, demoFile, demoRow } from "../src/index.js";
import { referenceApprovalRulesV1 } from "@jobguard/core";
import { SiteVisitRepository } from "../src/site-visit-repository.js";
import { cluster, promptFixture, materialsInput, evaluateInput, listInput, ownerTx, completionPhoto, moveOffLive, secondJob, type PromptFixture } from "./enterprise-live-prompt-fixtures.js";
import { startInput, completeInput } from "./site-visit-fixtures.js";
vi.setConfig({ testTimeout: 90000, hookTimeout: 120000 });
let c: Awaited<ReturnType<typeof cluster>>, repo: EnterpriseLivePromptRepository;
beforeAll(async () => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); c = await cluster(); repo = new EnterpriseLivePromptRepository(c.runtime); });
afterAll(async () => { await c?.close(); vi.unstubAllEnvs(); });
describe("persisted deterministic prompt rules", () => {
 it("materials strict excess is immediately visible from command-created issue facts", async () => {
  const f = await promptFixture(c);
  await repo.importMaterials(f.sessions.finance!, materialsInput(f));
  expect((await repo.list(f.sessions.named!, listInput(f))).items).toEqual(expect.arrayContaining([expect.objectContaining({ rule: "b" })]));
  const citations = (await c.admin.query("SELECT c.source_kind,c.evidence_id,c.object_version_id FROM app.extra_prompt_citation c WHERE tenant_id=$1 AND job_id=$2", [f.p.tenantId,f.jobId])).rows;
  expect(citations.length).toBeGreaterThan(0);
  expect(citations.every(row => row.source_kind === "materials" && row.evidence_id === null && row.object_version_id === null)).toBe(true);
 });
 it("materials equality and unknown mappings or units remain silent", async () => {
  for (const variant of ["equal", "unknown", "unit"] as const) {
   const f = await promptFixture(c);
   const line = (await c.admin.query("SELECT l.sor_code,l.unit,sum(l.quantity::numeric)::text quantity FROM app.work_order_line l JOIN app.work_order_current w ON(w.tenant_id,w.revision_id)=(l.tenant_id,l.revision_id) WHERE l.tenant_id=$1 AND l.job_id=$2 GROUP BY l.sor_code,l.unit ORDER BY l.sor_code LIMIT 1", [f.p.tenantId,f.jobId])).rows[0]!;
   await repo.importMaterials(f.sessions.finance!, materialsInput(f,{workIdentity:variant==='unknown'?'UNKNOWN':line.sor_code,unit:variant==='unit'?'pack':line.unit,quantity:line.quantity}));
   expect((await repo.list(f.sessions.named!,listInput(f))).items).toHaveLength(0);
  }
 });
 it("same-time contradictory facts quarantine a previously surfaced materials comparison", async () => {
  const f=await promptFixture(c), first=materialsInput(f);
  await repo.importMaterials(f.sessions.finance!,first);
  const prompt=(await repo.list(f.sessions.named!,listInput(f))).items[0]!;
  await repo.importMaterials(f.sessions.finance!,{...first,commandId:randomUUID(),eventId:randomUUID(),quantity:'101'});
  await expect(repo.confirm(f.sessions.named!,{version:'confirm-prompt.v1',commandId:randomUUID(),jobId:f.jobId,promptId:prompt.id,promptHash:prompt.promptHash})).rejects.toThrow();
  expect((await c.admin.query("SELECT count(*)::int n FROM app.extra_origin WHERE tenant_id=$1",[f.p.tenantId])).rows[0]!.n).toBe(0);
 });
 it("source replay deduplicates and changed source identity content conflicts atomically", async () => {
  const f = await promptFixture(c), input = materialsInput(f);
  const original = await repo.importMaterials(f.sessions.finance!,input);
  expect(await repo.importMaterials(f.sessions.finance!,input)).toEqual(original);
  await repo.importMaterials(f.sessions.finance!,{...input,commandId:randomUUID()});
  expect((await c.admin.query("SELECT count(*)::int n FROM app.materials_issue_fact WHERE tenant_id=$1",[f.p.tenantId])).rows[0]!.n).toBe(1);
  await expect(repo.importMaterials(f.sessions.finance!,{...input,commandId:randomUUID(),quantity:'101'})).rejects.toThrow();
  expect((await c.admin.query("SELECT count(*)::int n FROM app.materials_issue_fact WHERE tenant_id=$1",[f.p.tenantId])).rows[0]!.n).toBe(1);
 });
 it.each(['admin','supervisor','surveyor','commercial_manager','operative','read_only'])("unauthorized %s imports have no source or prompt effects", async role => {
  const f = await promptFixture(c);
  await expect(repo.importMaterials(f.sessions[role]!,materialsInput(f))).rejects.toMatchObject({code:'EXTRA_FORBIDDEN'});
  expect((await c.admin.query("SELECT count(*)::int n FROM app.materials_issue_fact WHERE tenant_id=$1",[f.p.tenantId])).rows[0]!.n).toBe(0);
 });
 it("completed visit yes creates a job-wide closeout prompt before the visit transaction commits", async () => {
  const f = await promptFixture(c), visits = new SiteVisitRepository(c.runtime), actor=f.members.operative.member;
  const started = await visits.startVisit(f.ctx,actor,startInput(f));
  await visits.completeVisit(f.ctx,actor,completeInput(f,started.visitId,'yes'));
  expect((await repo.list(f.sessions.named!,listInput(f))).items).toEqual(expect.arrayContaining([expect.objectContaining({rule:'d'})]));
  const citation = (await c.admin.query("SELECT c.source_id FROM app.extra_prompt_citation c JOIN app.extra_prompt p ON(p.tenant_id,p.id)=(c.tenant_id,c.prompt_id) WHERE c.tenant_id=$1 AND p.rule='d'",[f.p.tenantId])).rows[0]!;
  expect((await c.admin.query("SELECT site_visit_id FROM app.closeout_answer WHERE tenant_id=$1 AND id=$2",[f.p.tenantId,citation.source_id])).rows[0]!.site_visit_id).toBe(started.visitId);
 });
 it("closeout confirmation requires explicit work identity and creates no implicit price",async()=>{
  const f=await promptFixture(c),visits=new SiteVisitRepository(c.runtime),actor=f.members.operative.member;
  const start=await visits.startVisit(f.ctx,actor,startInput(f));
  await visits.completeVisit(f.ctx,actor,completeInput(f,start.visitId,'yes'));
  const page=await repo.list(f.sessions.named!,listInput(f));
  const prompt=page.items.find((p:{rule:string})=>p.rule==='d')!;
  const cmd={version:'confirm-prompt.v1',commandId:randomUUID(),jobId:f.jobId,promptId:prompt.id,promptHash:prompt.promptHash};
  await expect(repo.confirm(f.sessions.named!,cmd)).rejects.toMatchObject({code:'PROMPT_AMBIGUOUS'});
  await repo.confirm(f.sessions.named!,{...cmd,commandId:randomUUID(),confirmedWorkIdentity:'CLEAR-GUTTER'});
  const origin=(await c.admin.query("SELECT o.kind,v.sor_code FROM app.extra_origin o JOIN app.variation v ON(v.tenant_id,v.id)=(o.tenant_id,o.variation_id) WHERE o.tenant_id=$1",[f.p.tenantId])).rows;
  expect(origin).toEqual([{kind:'jobguard_surfaced_confirmed',sor_code:'CLEAR-GUTTER'}]);
  expect((await c.admin.query("SELECT kind FROM app.extra_event WHERE tenant_id=$1",[f.p.tenantId])).rows).toEqual([{kind:'logged'}]);
 });
 it("no answer suppresses closeout and missing factor suppresses visit duration", async () => {
  const f = await promptFixture(c), visits = new SiteVisitRepository(c.runtime), actor=f.members.operative.member;
  const started = await visits.startVisit(f.ctx,actor,startInput(f));
  await visits.completeVisit(f.ctx,actor,completeInput(f,started.visitId,'no'));
  expect((await repo.list(f.sessions.named!,listInput(f))).items).toHaveLength(0);
 });
 it("completed visits compare exact server microseconds to immutable contract factor", async () => {
  const f=await promptFixture(c), visits=new SiteVisitRepository(c.runtime), actor=f.members.operative.member;
  const sor=await new SorRepository(c.runtime).importVersion(f.p,{version:'sor-version-import.v1',environment:'synthetic_demo',commandId:randomUUID(),scheduleId:randomUUID(),reference:'Fictional prompt standards',effectiveFrom:'2026-01-01',items:[{code:'REPAIR-DOOR',description:'Fictional door',unit:'each',rate:{pence:10000,currency:'GBP'},standardMinutes:1}]});
  const contractors=new ContractorRepository(c.runtime), organisation=await contractors.query(f.p,{version:'contractor-query.v1',tenantId:f.p.tenantId,resource:'organisation'});
  const original=(await c.admin.query('SELECT document FROM app.client_contract_version WHERE tenant_id=$1 AND id=$2',[f.p.tenantId,f.demo.contractVersionId])).rows[0]!.document;
  const contract=await contractors.command(f.p,{version:'contractor-command.v1',environment:'synthetic_demo',commandId:randomUUID(),id:randomUUID(),expectedRevision:organisation.revision,kind:'contract.revise',clientId:f.demo.clientId,contractId:f.demo.contractId,document:{...original,sorVersionIds:[sor.versionId]},rules:referenceApprovalRulesV1});
  f.demo.contractVersionId=contract.id;
  await new WorkOrderRepository(c.runtime).importCsv(f.p,{commandId:randomUUID(),name:'fictional-standards.csv',kind:'csv',csv:demoFile([demoRow(f.demo,1,{expectedRevision:f.revision,assignedMembershipIds:[actor.membershipId,f.named.member.membershipId],lines:[{clientLineReference:'L1',sorCode:'REPAIR-DOOR',quantity:'1'}]})])});
  await ownerTx(c,f.p.tenantId,db=>db.$client.query("INSERT INTO app.extra_prompt_rule_settings(tenant_id,id,client_contract_version_id,version,factor_numerator,factor_denominator,recognition,content_hash) VALUES($1,$2,$3,'extra-prompt-rule-settings.v1',1,1000000000000,'[]',$4)",[f.p.tenantId,randomUUID(),f.demo.contractVersionId,'a'.repeat(64)]));
  const started=await visits.startVisit(f.ctx,actor,startInput(f));
  await visits.completeVisit(f.ctx,actor,completeInput(f,started.visitId,'no'));
  expect((await repo.list(f.sessions.named!,listInput(f))).items).toEqual(expect.arrayContaining([expect.objectContaining({rule:'c'})]));
  expect((await c.admin.query("SELECT count(*)::int n FROM app.extra_prompt_citation c JOIN app.extra_prompt p ON(p.tenant_id,p.id)=(c.tenant_id,c.prompt_id) WHERE c.tenant_id=$1 AND p.rule='c' AND c.source_id=$2",[f.p.tenantId,started.visitId])).rows[0]!.n).toBe(1);
 });
 it("an observation without immutable verified bytes refuses and leaves no prompt", async () => {
  const f=await promptFixture(c);
  await expect(repo.registerObservation(f.sessions.named!,{version:'completion-observation.v1',commandId:randomUUID(),jobId:f.jobId,evidenceId:randomUUID(),sha256:'a'.repeat(64),objectVersion:'v1',sourceText:'new vent',workIdentity:'NEW-VENT',locator:{kind:'text_span',start:0,end:8,quote:'new vent'}})).rejects.toThrow();
  expect((await repo.list(f.sessions.named!,listInput(f))).items).toHaveLength(0);
 });
 it("a successful no-op keeps its identity", async () => {
  const f=await promptFixture(c), input=evaluateInput(f), first=await repo.evaluate(f.sessions.named!,input);
  await repo.importMaterials(f.sessions.finance!,materialsInput(f));
  expect(await repo.evaluate(f.sessions.named!,input)).toEqual(first);
 });
});

async function photoObservation(f:PromptFixture,tag='new gutters',workIdentity='CLEAR-GUTTER') {
 const recognition=[{workId:'REPAIR-DOOR',terms:['REPAIR-DOOR','repaired door','entrance leaf']},{workId:'CLEAR-GUTTER',terms:['CLEAR-GUTTER','new gutters']}];
 await ownerTx(c,f.p.tenantId,db=>db.$client.query("INSERT INTO app.extra_prompt_rule_settings(tenant_id,id,client_contract_version_id,version,factor_numerator,factor_denominator,recognition,content_hash) VALUES($1,$2,$3,'extra-prompt-rule-settings.v1',1,1,$4::jsonb,$5)",[f.p.tenantId,randomUUID(),f.demo.contractVersionId,JSON.stringify(recognition),'a'.repeat(64)]));
 const photo=await completionPhoto(c,f,[tag]);
 return {version:'completion-observation.v1',commandId:randomUUID(),jobId:f.jobId,...photo,workIdentity,locator:{kind:'photo_tag',tag}};
}
describe('observation command identity and stored PNG provenance',()=>{
 it('rule a reads tags from command-finalized immutable PNG bytes and cites their native hash/version',async()=>{
  const f=await promptFixture(c),input=await photoObservation(f);
  await repo.registerObservation(f.sessions.named!,input);
  const page=await repo.list(f.sessions.named!,listInput(f));expect(page.items).toEqual(expect.arrayContaining([expect.objectContaining({rule:'a'})]));
  expect((await c.admin.query("SELECT evidence_id,object_version_id,source_hash FROM app.extra_prompt_citation WHERE tenant_id=$1 AND source_kind='observation'",[f.p.tenantId])).rows).toEqual([{evidence_id:input.evidenceId,object_version_id:input.objectVersion,source_hash:input.sha256}]);
 });
 it('ordered explicit synonym stays silent and forged tag/hash/version is refused',async()=>{
  const f=await promptFixture(c),input=await photoObservation(f,'entrance leaf','REPAIR-DOOR');
  await repo.registerObservation(f.sessions.named!,input);expect((await repo.list(f.sessions.named!,listInput(f))).items).toHaveLength(0);
  for(const bad of [{sha256:'b'.repeat(64)},{objectVersion:'forged'},{locator:{kind:'photo_tag',tag:'new gutters'},workIdentity:'CLEAR-GUTTER'}])await expect(repo.registerObservation(f.sessions.named!,{...input,...bad,commandId:randomUUID()})).rejects.toMatchObject({code:'PROMPT_SOURCE_INVALID'});
 });
 it('replaying a command id returns the first result, never the job\'s current state',async()=>{
  const f=await promptFixture(c),input=await photoObservation(f),first=await repo.registerObservation(f.sessions.named!,input);
  await repo.importMaterials(f.sessions.finance!,materialsInput(f));
  expect(await repo.registerObservation(f.sessions.named!,input)).toEqual(first);
 });
 it('the same command id with a changed payload conflicts',async()=>{
  const f=await promptFixture(c),input=await photoObservation(f);await repo.registerObservation(f.sessions.named!,input);
  await expect(repo.registerObservation(f.sessions.named!,{...input,workIdentity:'REPAIR-DOOR'})).rejects.toMatchObject({code:'PROMPT_CONFLICT'});
 });
 it('the same command id on another job conflicts',async()=>{
  const f=await promptFixture(c),input=await photoObservation(f);await repo.registerObservation(f.sessions.named!,input);const other=await secondJob(c,f);
  await expect(repo.registerObservation(f.sessions.named!,{...input,jobId:other.jobId})).rejects.toMatchObject({code:'PROMPT_CONFLICT'});
 });
 it('a successful no-op keeps its identity',async()=>{
  const f=await promptFixture(c),input=await photoObservation(f,'entrance leaf','REPAIR-DOOR'),first=await repo.registerObservation(f.sessions.named!,input);
  await repo.importMaterials(f.sessions.finance!,materialsInput(f));expect(await repo.registerObservation(f.sessions.named!,input)).toEqual(first);
 });
 it('a not-live contractor job is refused with JOB_NOT_LIVE and nothing is written',async()=>{
  const f=await promptFixture(c),input=await photoObservation(f);await moveOffLive(c,f);
  const before=(await c.admin.query('SELECT count(*)::int n FROM app.command_receipt WHERE tenant_id=$1',[f.p.tenantId])).rows;
  await expect(repo.registerObservation(f.sessions.named!,input)).rejects.toMatchObject({code:'JOB_NOT_LIVE'});
  expect((await c.admin.query('SELECT count(*)::int n FROM app.command_receipt WHERE tenant_id=$1',[f.p.tenantId])).rows).toEqual(before);
  expect((await c.admin.query('SELECT count(*)::int n FROM app.extra_completion_observation WHERE tenant_id=$1',[f.p.tenantId])).rows[0]!.n).toBe(0);
 });
 it('an unauthorised caller gets the identical EXTRA_FORBIDDEN for an unknown job, a foreign job, a not-live job and a live job',async()=>{
  const f=await promptFixture(c),input=await photoObservation(f),other=await promptFixture(c),closed=await secondJob(c,f);await moveOffLive(c,f,'invoiced',closed.jobId);
  for(const jobId of [randomUUID(),other.jobId,closed.jobId,f.jobId])await expect(repo.registerObservation(f.sessions.finance!,{...input,commandId:randomUUID(),jobId})).rejects.toMatchObject({code:'EXTRA_FORBIDDEN'});
 });
});
