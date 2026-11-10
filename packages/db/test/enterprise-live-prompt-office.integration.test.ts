import { testActorContext } from "./tenant-context-test-utils.js";
// PostgreSQL suite NOT RUN locally. Exercises the real persisted office-origin writer.
import { randomUUID } from "node:crypto";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { ExtraRepository, EnterpriseFeeRepository } from "../src/index.js";
import { EnterpriseLivePromptRepository } from "../src/enterprise-live-prompt-repository.js";
import { cluster,promptFixture,materialsInput,listInput,type PromptFixture } from "./enterprise-live-prompt-fixtures.js";
import { command } from "./site-extra-fixtures.js";
import { reference } from "./enterprise-fee-reference-fixtures.js";
let c:Awaited<ReturnType<typeof cluster>>,repo:EnterpriseLivePromptRepository;
beforeAll(async()=>{process.env.JOBGUARD_ENV="synthetic_demo";c=await cluster();repo=new EnterpriseLivePromptRepository(c.runtime);},120000);
afterAll(async()=>{await c?.close();});
async function office(f:PromptFixture){
 const line=(await c.admin.query("SELECT l.scope_item_id,l.sor_version_id FROM app.work_order_line l JOIN app.work_order_current w ON(w.tenant_id,w.revision_id)=(l.tenant_id,l.revision_id) WHERE l.tenant_id=$1 AND l.job_id=$2 AND l.sor_code='REPAIR-DOOR'",[f.p.tenantId,f.jobId])).rows[0]!;
 const cmd={version:"raise-extra.v1",commandId:randomUUID(),commandType:"RecordOfficeExtra",jobId:f.jobId,actorMembershipId:f.members.finance.member.membershipId,grantId:f.members.finance.grant,note:"Fictional office extra",description:"Fictional door excess",sorItem:{versionId:line.sor_version_id,code:"REPAIR-DOOR"},excessOfScopeItemId:line.scope_item_id};
 const extra=new ExtraRepository(c.runtime),context=await testActorContext(c.admin,f.ctx,f.members.finance.member);const result=await extra.raiseExtra(context,cmd);expect(await extra.raiseExtra(context,cmd)).toEqual(result);return result;
}
describe("ENT-8A-P office advisory",()=>{
 for(const state of ["surfaced","dismissed"] as const) it(`real office creation matching ${state} prompts emits one advisory and preserves zero fee eligibility`,async()=>{
  const f=await promptFixture(c);await repo.importMaterials(f.sessions.finance!,materialsInput(f,{unit:"each"}));const p=(await repo.list(f.sessions.supervisor!,listInput(f))).items[0]!;
  if(state==="dismissed")await repo.dismiss(f.sessions.supervisor!,{version:"dismiss-prompt.v1",commandId:randomUUID(),jobId:f.jobId,promptId:p.id,promptHash:p.promptHash,reason:"Fictional review"});
  const result=await office(f);
  const origins=(await c.admin.query("SELECT kind,origin_hash FROM app.extra_origin WHERE tenant_id=$1 AND variation_id=$2",[f.p.tenantId,result.variationId])).rows;
  expect(origins).toHaveLength(1);expect(origins[0]?.kind).toBe("office_entry");
  expect((await c.admin.query("SELECT prompt_id,variation_id,origin_hash FROM app.extra_office_prompt_signal WHERE tenant_id=$1",[f.p.tenantId])).rows).toEqual([{prompt_id:p.id,variation_id:result.variationId,origin_hash:origins[0]!.origin_hash}]);
  const agreementId=randomUUID();
  await c.admin.query(`INSERT INTO app.enterprise_agreement_version(tenant_id,id,agreement_ref,rate_numerator,rate_denominator,basis,policy_version,effective_from,end_of_job_check,content_hash,environment,operations_actor_ref)
   VALUES($1,$2,'fictional-office','1','10','on_payment','enterprise_site_capture_policy_v1','2000-01-01',false,$3,'synthetic_demo','operations:fictional')`,[f.p.tenantId,agreementId,"c".repeat(64)]);
  const fee=new EnterpriseFeeRepository(c.runtime);
  const period=(await c.admin.query("SELECT to_char(clock_timestamp() AT TIME ZONE 'Europe/London','YYYY-MM') p")).rows[0]!.p;
  const derive=async()=>{
   const d=await fee.derive(f.ctx,f.sessions.finance!,{version:"enterprise-fee-derive.v1",commandId:randomUUID(),agreementVersionId:agreementId,period});
   return fee.read(f.ctx,f.sessions.finance!,d.derivationId);
  };
  const before=await derive();
  expect(before).toMatchObject({cumulativeFeePence:0,contributions:[]});
  const page=await repo.officeSignals(f.sessions.supervisor!,{version:"office-signals.v1",jobId:f.jobId});
  expect(page).toEqual({items:[{promptId:p.id,variationId:result.variationId,recordedAt:expect.any(String)}],nextCursor:null});
  expect(await derive()).toEqual(before);
  expect((await c.admin.query("SELECT kind,origin_hash FROM app.extra_origin WHERE tenant_id=$1 AND variation_id=$2",[f.p.tenantId,result.variationId])).rows).toEqual(origins);
  // Even fully approved, billed and paid office work has zero fee in the independent core derivation.
  expect(reference({w:{w:{p:{tenantId:f.p.tenantId}},s:{jobId:f.jobId}},id:agreementId},[{id:result.variationId,approved:50000,billed:50000,paid:{numerator:"50000",denominator:"1"},kind:"office_entry"}]).cumulativeFee.pence).toBe(0);

 });
 it("confirming an exact office match coalesces and creates no origin or scope identity",async()=>{
  const f=await promptFixture(c);await repo.importMaterials(f.sessions.finance!,materialsInput(f,{unit:"each"}));const p=(await repo.list(f.sessions.supervisor!,listInput(f))).items[0]!;const extra=await office(f);
  const before=(await c.admin.query("SELECT count(*)::int n FROM app.scope_identity WHERE tenant_id=$1",[f.p.tenantId])).rows;
  await repo.confirm(f.sessions.supervisor!,{version:"confirm-prompt.v1",commandId:randomUUID(),jobId:f.jobId,promptId:p.id,promptHash:p.promptHash});
  expect((await c.admin.query("SELECT kind,variation_id FROM app.prompt_resolution WHERE tenant_id=$1",[f.p.tenantId])).rows).toEqual([{kind:"coalesced",variation_id:extra.variationId}]);
  expect((await c.admin.query("SELECT count(*)::int n FROM app.scope_identity WHERE tenant_id=$1",[f.p.tenantId])).rows).toEqual(before);
  expect((await c.admin.query("SELECT kind FROM app.extra_origin WHERE tenant_id=$1",[f.p.tenantId])).rows).toEqual([{kind:"office_entry"}]);
 });
 it("ambiguous exact matches require an explicit same-job existing extra without merging origins",async()=>{
  const f=await promptFixture(c);await repo.importMaterials(f.sessions.finance!,materialsInput(f,{unit:"each"}));const p=(await repo.list(f.sessions.supervisor!,listInput(f))).items[0]!;
  await office(f);const chosen=await office(f);
  const command={version:"confirm-prompt.v1",commandId:randomUUID(),jobId:f.jobId,promptId:p.id,promptHash:p.promptHash};
  await expect(repo.confirm(f.sessions.supervisor!,command)).rejects.toThrow("PROMPT_AMBIGUOUS");
  await expect(repo.confirm(f.sessions.supervisor!,{...command,commandId:randomUUID(),existingExtraId:randomUUID()})).rejects.toThrow("PROMPT_AMBIGUOUS");
  await repo.confirm(f.sessions.supervisor!,{...command,commandId:randomUUID(),existingExtraId:chosen.variationId});
  expect((await c.admin.query("SELECT kind,variation_id FROM app.prompt_resolution WHERE tenant_id=$1",[f.p.tenantId])).rows).toEqual([{kind:"coalesced",variation_id:chosen.variationId}]);
  expect((await c.admin.query("SELECT kind FROM app.extra_origin WHERE tenant_id=$1",[f.p.tenantId])).rows).toEqual([{kind:"office_entry"},{kind:"office_entry"}]);
 });

 it("reads an honest empty state, paginates without duplicates and rejects invalid bounds/cursors",async()=>{
  const f=await promptFixture(c),input={version:"office-signals.v1",jobId:f.jobId};
  await office(f);
  expect(await repo.officeSignals(f.sessions.supervisor!,input)).toEqual({items:[],nextCursor:null});
  await repo.importMaterials(f.sessions.finance!,materialsInput(f));
  await office(f);await office(f);await office(f);
  const first=await repo.officeSignals(f.sessions.supervisor!,{...input,limit:2});
  expect(first.items).toHaveLength(2);expect(first.nextCursor).not.toBeNull();
  const last=await repo.officeSignals(f.sessions.supervisor!,{...input,limit:2,after:first.nextCursor});
  expect(last.items).toHaveLength(1);expect(last.nextCursor).toBeNull();
  const all=[...first.items,...last.items];
  expect(new Set(all.map(i=>i.variationId)).size).toBe(3);
  expect(all.map(i=>i.recordedAt)).toEqual(all.map(i=>i.recordedAt).sort());
  for(const limit of [0,101])await expect(repo.officeSignals(f.sessions.supervisor!,{...input,limit})).rejects.toMatchObject({code:"INVALID_PROMPT_COMMAND"});
  await expect(repo.officeSignals(f.sessions.supervisor!,{...input,after:randomUUID()})).rejects.toMatchObject({code:"INVALID_PROMPT_COMMAND"});
 });
 it("rechecks detail roles, tenant/job scope, and revoked grants even for empty jobs",async()=>{
  const f=await promptFixture(c),foreign=await promptFixture(c),input={version:"office-signals.v1",jobId:f.jobId};
  for(const role of ["supervisor","surveyor","commercial_manager"])await expect(repo.officeSignals(f.sessions[role]!,input)).resolves.toEqual({items:[],nextCursor:null});
  for(const role of ["owner","admin","finance","operative","read_only","client_approver"])await expect(repo.officeSignals(f.sessions[role]!,input)).rejects.toMatchObject({code:"EXTRA_FORBIDDEN"});
  for(const jobId of [foreign.jobId,f.otherJob,randomUUID()])await expect(repo.officeSignals(f.sessions.supervisor!,{...input,jobId})).rejects.toMatchObject({code:"EXTRA_FORBIDDEN"});
  await command(c,f,{kind:"grant.revoke",grantId:f.members.supervisor.grant});
  await expect(repo.officeSignals(f.sessions.supervisor!,input)).rejects.toMatchObject({code:"EXTRA_FORBIDDEN"});
 });

});
