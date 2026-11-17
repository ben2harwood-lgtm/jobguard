// PostgreSQL suite NOT RUN locally. Exercises the real persisted office-origin writer.
import { randomUUID } from "node:crypto";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { ExtraRepository } from "../src/index.js";
import { EnterpriseLivePromptRepository } from "../src/enterprise-live-prompt-repository.js";
import { cluster,promptFixture,materialsInput,listInput,type PromptFixture } from "./enterprise-live-prompt-fixtures.js";
let c:Awaited<ReturnType<typeof cluster>>,repo:EnterpriseLivePromptRepository;
beforeAll(async()=>{process.env.JOBGUARD_ENV="synthetic_demo";c=await cluster();repo=new EnterpriseLivePromptRepository(c.runtime);},120000);
afterAll(async()=>{await c?.close();});
async function office(f:PromptFixture){
 const line=(await c.admin.query("SELECT l.scope_item_id,l.sor_version_id FROM app.work_order_line l JOIN app.work_order_current w ON(w.tenant_id,w.revision_id)=(l.tenant_id,l.revision_id) WHERE l.tenant_id=$1 AND l.job_id=$2 AND l.sor_code='REPAIR-DOOR'",[f.p.tenantId,f.jobId])).rows[0]!;
 const cmd={version:"raise-extra.v1",commandId:randomUUID(),commandType:"RecordOfficeExtra",jobId:f.jobId,actorMembershipId:f.members.finance.member.membershipId,grantId:f.members.finance.grant,note:"Fictional office extra",description:"Fictional door excess",sorItem:{versionId:line.sor_version_id,code:"REPAIR-DOOR"},excessOfScopeItemId:line.scope_item_id};
 const extra=new ExtraRepository(c.runtime);const result=await extra.raiseExtra(f.ctx,cmd);expect(await extra.raiseExtra(f.ctx,cmd)).toEqual(result);return result;
}
describe("ENT-8A-P office advisory",()=>{
 for(const state of ["surfaced","dismissed"] as const) it(`real office creation matching ${state} prompts emits one advisory and preserves zero fee eligibility`,async()=>{
  const f=await promptFixture(c);await repo.importMaterials(f.sessions.finance!,materialsInput(f,{unit:"each"}));const p=(await repo.list(f.sessions.supervisor!,listInput(f))).items[0]!;
  if(state==="dismissed")await repo.dismiss(f.sessions.supervisor!,{version:"dismiss-prompt.v1",commandId:randomUUID(),jobId:f.jobId,promptId:p.id,promptHash:p.promptHash,reason:"Fictional review"});
  const result=await office(f);
  const origins=(await c.admin.query("SELECT kind,origin_hash FROM app.extra_origin WHERE tenant_id=$1 AND variation_id=$2",[f.p.tenantId,result.variationId])).rows;
  expect(origins).toHaveLength(1);expect(origins[0]?.kind).toBe("office_entry");
  expect((await c.admin.query("SELECT prompt_id,variation_id,origin_hash FROM app.extra_office_prompt_signal WHERE tenant_id=$1",[f.p.tenantId])).rows).toEqual([{prompt_id:p.id,variation_id:result.variationId,origin_hash:origins[0]!.origin_hash}]);
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

});
