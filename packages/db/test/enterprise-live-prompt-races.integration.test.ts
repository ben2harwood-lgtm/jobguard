// Two-connection PostgreSQL races; NOT RUN in the builder sandbox.
import { randomUUID } from "node:crypto";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { ExtraRepository, SiteVisitRepository } from "../src/index.js";
import { EnterpriseLivePromptRepository } from "../src/enterprise-live-prompt-repository.js";
import { cluster,promptFixture,materialsInput,listInput,moveOffLive,type PromptFixture } from "./enterprise-live-prompt-fixtures.js";
import { ObservedPool } from "./lock-observer.js";
import { reviseOrder, startInput, completeInput } from "./site-visit-fixtures.js";
let c:Awaited<ReturnType<typeof cluster>>,repo:EnterpriseLivePromptRepository;
beforeAll(async()=>{process.env.JOBGUARD_ENV="synthetic_demo";c=await cluster();repo=new EnterpriseLivePromptRepository(c.runtime);},120000);
afterAll(async()=>{await c?.close();});
async function setup(){const f=await promptFixture(c);await repo.importMaterials(f.sessions.finance!,materialsInput(f,{unit:"each"}));const p=(await repo.list(f.sessions.supervisor!,listInput(f))).items[0]!;return{f,p,cmd:{version:"confirm-prompt.v1",commandId:randomUUID(),jobId:f.jobId,promptId:p.id,promptHash:p.promptHash}};}
async function unique(f:PromptFixture){const r=(await c.admin.query("SELECT (SELECT count(*) FROM app.prompt_resolution WHERE tenant_id=$1)::int resolutions,(SELECT count(*) FROM app.extra_origin WHERE tenant_id=$1 AND kind='jobguard_surfaced_confirmed')::int origins",[f.p.tenantId])).rows[0]!;expect(r.resolutions).toBeLessThanOrEqual(1);expect(r.origins).toBeLessThanOrEqual(1);return r;}
function noDeadlock(results:PromiseSettledResult<unknown>[]){for(const r of results)if(r.status==="rejected")expect((r.reason as {code?:string}).code).not.toBe("40P01");}
describe("ENT-8A-P command races",()=>{
 it("b2: first completion holds key 417 before the live lock; replay holds only authority and never locks the baseline",async()=>{
  const f=await promptFixture(c), actor=f.members.operative.member, visits=new SiteVisitRepository(c.runtime);
  const open=await visits.startVisit(f.ctx,actor,startInput(f)), input=completeInput(f,open.visitId,"yes");
  const observed=new ObservedPool(c.runtime,c.admin), watched=new SiteVisitRepository(observed.pool);
  const first=await observed.record(()=>watched.completeVisit(f.ctx,actor,input));
  const tx=first.transactions.find(t=>t.statements.some(s=>s.sql.includes("app.lp_visit_evaluate")))!;
  expect(tx.outcome).toBe("commit");
  const keyIndex=tx.statements.findIndex(s=>s.sql.includes(",417)"));
  const liveIndex=tx.statements.findIndex(s=>s.sql.includes("app.require_watchdog_live"));
  const readIndex=tx.statements.findIndex(s=>s.sql.includes("SELECT 1 FROM app.command_receipt"));
  const claimIndex=tx.statements.findIndex(s=>/(?:INSERT INTO app.command_receipt|SELECT app\.begin_command\()/.test(s.sql));
  expect(readIndex).toBeGreaterThan(-1); expect(keyIndex).toBeGreaterThan(readIndex);
  expect(liveIndex).toBeGreaterThan(keyIndex); expect(claimIndex).toBeGreaterThan(liveIndex);
  const authority=tx.statements.find(s=>s.sql.includes("pg_advisory_xact_lock_shared"))!.footprint.advisory;
  const keys=[...tx.statements[keyIndex]!.footprint.advisory].filter(k=>!authority.has(k));
  expect(keys).toHaveLength(1);
  for(const s of tx.statements.slice(keyIndex)) expect(s.footprint.advisory.has(keys[0]!)).toBe(true);
  const evaluated=tx.statements.find(s=>s.sql.includes("app.lp_visit_evaluate"))!;
  expect([...evaluated.footprint.rows].some(([row,strength])=>row.startsWith("app.work_order_current#")&&strength>=2)).toBe(true);
  const replay=await observed.record(()=>watched.completeVisit(f.ctx,actor,input));
  expect(replay.value).toEqual(first.value);
  const replayTx=replay.transactions.find(t=>t.statements.some(s=>/(?:SELECT request_hash,status,result FROM app.command_receipt|SELECT app\.begin_command\()/.test(s.sql)))!;
  expect(replayTx.outcome).toBe("commit");
  const held=replayTx.statements.find(s=>s.sql.includes("pg_advisory_xact_lock_shared"))!.footprint.advisory;
  expect(held.size).toBe(1);
  for(const s of replayTx.statements){
   expect(s.sql).not.toMatch(/,417\)|app\.lp_visit_evaluate/u);
   expect([...s.footprint.advisory].every(k=>held.has(k))).toBe(true);
   expect([...s.footprint.rows.keys()].some(row=>row.startsWith("app.work_order_current#"))).toBe(false);
  }
 });
 it("b2: concurrent duplicate completions return one result and one closeout answer",async()=>{
  const f=await promptFixture(c), actor=f.members.operative.member, visits=new SiteVisitRepository(c.runtime);
  const open=await visits.startVisit(f.ctx,actor,startInput(f)), input=completeInput(f,open.visitId,"yes");
  const results=await Promise.all([visits.completeVisit(f.ctx,actor,input),visits.completeVisit(f.ctx,actor,input)]);
  expect(results[0]).toEqual(results[1]);
  expect((await c.admin.query("SELECT count(*)::int n FROM app.closeout_answer WHERE tenant_id=$1 AND command_id=$2",[f.p.tenantId,input.commandId])).rows).toEqual([{n:1}]);
 });
 it("two-connection confirm/confirm produces one resolution and origin",async()=>{const {f,cmd}=await setup();const r=await Promise.allSettled([repo.confirm(f.sessions.supervisor!,cmd),repo.confirm(f.sessions.surveyor!,{...cmd,commandId:randomUUID()})]);noDeadlock(r);expect(r.filter(x=>x.status==="fulfilled")).toHaveLength(1);expect(await unique(f)).toEqual({resolutions:1,origins:1});});
 it("two-connection confirm/dismiss produces one final resolution or typed conflict",async()=>{const {f,cmd}=await setup();const r=await Promise.allSettled([repo.confirm(f.sessions.supervisor!,cmd),repo.dismiss(f.sessions.surveyor!,{...cmd,version:"dismiss-prompt.v1",commandId:randomUUID(),reason:"Fictional dismissal"})]);noDeadlock(r);expect(r.filter(x=>x.status==="fulfilled")).toHaveLength(1);expect((await unique(f)).resolutions).toBe(1);const rejected=r.find(x=>x.status==="rejected");expect(rejected?.status==="rejected"?rejected.reason:undefined).toMatchObject({code:"PROMPT_CONFLICT"});});
 it("two-connection source replay keeps one source and original result",async()=>{const f=await promptFixture(c),input=materialsInput(f,{unit:"each"});const r=await Promise.all([repo.importMaterials(f.sessions.finance!,input),repo.importMaterials(f.sessions.finance!,input)]);expect(r[0]).toEqual(r[1]);expect((await c.admin.query("SELECT count(*)::int n FROM app.materials_issue_fact WHERE tenant_id=$1",[f.p.tenantId])).rows).toEqual([{n:1}]);});
 it("confirm/office capture cannot duplicate a prompt origin or change office origin",async()=>{const {f,cmd}=await setup();const line=(await c.admin.query("SELECT l.scope_item_id,l.sor_version_id FROM app.work_order_line l JOIN app.work_order_current w ON(w.tenant_id,w.revision_id)=(l.tenant_id,l.revision_id) WHERE l.tenant_id=$1 AND l.job_id=$2 AND l.sor_code='REPAIR-DOOR'",[f.p.tenantId,f.jobId])).rows[0]!;
  const r=await Promise.allSettled([repo.confirm(f.sessions.supervisor!,cmd),new ExtraRepository(c.runtime).raiseExtra(f.ctx,{version:"raise-extra.v1",commandId:randomUUID(),commandType:"RecordOfficeExtra",jobId:f.jobId,actorMembershipId:f.members.finance.member.membershipId,grantId:f.members.finance.grant,note:"Fictional racing office capture",description:"Fictional excess",sorItem:{versionId:line.sor_version_id,code:"REPAIR-DOOR"},excessOfScopeItemId:line.scope_item_id})]);noDeadlock(r);await unique(f);expect(r.every(x=>x.status==="fulfilled")).toBe(true);expect((await c.admin.query("SELECT count(*)::int n FROM app.extra_origin WHERE tenant_id=$1 AND kind='office_entry'",[f.p.tenantId])).rows).toEqual([{n:1}]);
 });
 it("baseline change races refuse stale binding or preserve the locked baseline",async()=>{const {f,cmd}=await setup();const r=await Promise.allSettled([repo.confirm(f.sessions.supervisor!,cmd),reviseOrder(c,f,f.revision,[f.demo.operativeMembershipId,f.named.member.membershipId])]);noDeadlock(r);await unique(f);if(r[0]?.status==="rejected")expect(r[0].reason).toMatchObject({code:"PROMPT_CONFLICT"});});
 it("job-leaves-live race never writes after the live guard loses",async()=>{const {f,cmd}=await setup();const r=await Promise.allSettled([repo.confirm(f.sessions.supervisor!,cmd),moveOffLive(c,f)]);noDeadlock(r);await unique(f);await expect(repo.confirm(f.sessions.supervisor!,{...cmd,commandId:randomUUID()})).rejects.toMatchObject({code:"JOB_NOT_LIVE"});});
});
