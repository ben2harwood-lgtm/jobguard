/** ENT-10a2 D2. NOT RUN (sandbox cannot start PostgreSQL / a browser). */
import { randomUUID } from "node:crypto";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { ActionExecutor,appendOutboundAction,withTenant,type OutboundAction,type OutboundAdapter } from "../src/index.js";
import { auditRows,canonicalRows,createScimHarness,deactivate,fixture,memberIn,person,sha256,type ScimFixture,type ScimHarness,type ScimPerson } from "./scim-fixtures.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
let h:ScimHarness;
beforeAll(async()=>{h=await createScimHarness("jg-scim-access-");},120000);
afterAll(async()=>{await h?.close();});
async function runtimeCheck(f:ScimFixture,p:ScimPerson,permission:string,target=f.principal.tenantId) {
 return withTenant(h.runtime,testTenantContext(f.principal.tenantId),async db=>(await db.$client.query("SELECT app.contractor_member_active($1) active,app.contractor_allowed($1,$2,$3) allowed",[p.membershipId,permission,target])).rows[0]);
}
async function worker(f:ScimFixture,p:ScimPerson) {
 const context=await h.identityApp.context({...p.bound,requestedTenantId:f.principal.tenantId});
 const action={version:"sso-worker-action.v1",connectionId:f.connectionId,sessionId:p.sessionId,membershipId:p.membershipId,permission:"contract.read",scopeId:f.principal.tenantId};
 await f.app.checkWorkerAction(context,action);return {context,action};
}
async function approvedAction(f:ScimFixture,p:ScimPerson) {
 const tenant=f.principal.tenantId,decisionId=randomUUID(),resolutionId=randomUUID(),authorizationId=randomUUID(),content="Fictional reviewed document",contentHash=sha256(content),expiresAt=new Date(Date.now()+600000);
 // The merged executor fixture uses owner-seeded exact authorization, never a provider send.
 await h.admin.query("INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type) VALUES($1,$2,'quote','synthetic-document','send_quote')",[decisionId,tenant]);
 await h.admin.query("INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id) VALUES($1,$2,$3,'approved',$4)",[resolutionId,tenant,decisionId,p.membershipId]);
 await h.admin.query("INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,action_type,recipient,content_hash,aggregate_revision,policy_version,expires_at) VALUES($1,$2,$3,$4,$5,'send_quote','customer@synthetic.invalid',$6,1,'synthetic.v1',$7)",[authorizationId,tenant,decisionId,resolutionId,p.membershipId,contentHash,expiresAt]);
 const action:OutboundAction={version:"outbound-action.v1",id:randomUUID(),authorizationId,adapter:"fake_capture",providerEffectKey:randomUUID(),actionType:"send_quote",recipient:"customer@synthetic.invalid",contentHash,immutableContent:content,aggregateRevision:1,amountPence:null,currency:null,policyVersion:"synthetic.v1",authorizationExpiresAt:expiresAt};
 await withTenant(h.runtime,testTenantContext(tenant),db=>appendOutboundAction(db,tenant,action));return action;
}
const permissions={
 admin:["organisation.read","organisation.manage","client.invite","contract.read","contract.manage"],
 operative:["job.read","extra.log","resident.read"],
 supervisor:["contract.read","job.read","extra.log","extra.price","extra.approve","dashboard.read","resident.read"],
 surveyor:["contract.read","job.read","extra.price","extra.approve","dashboard.read","resident.read"],
 commercial_manager:["client.invite","contract.read","contract.manage","job.read","extra.price","extra.approve","dashboard.read","resident.read"],
 finance:["contract.read","data.export","data.import","statement.read"],
 read_only:["contract.read","job.read","dashboard.read"],
} as const;

describe("[D2] ENT-10a2 immediate request refusal",()=>{
 it("[G1] every bound session immediately loses authentication session and company context",async()=>{
  const f=await fixture(h),p=await person(f),second=await f.signin(p.email,p.subject,false,["finance"]);
  expect(await h.provider.authenticate(second.sessionToken)).toBeDefined();await deactivate(f,p);
  for(const credentials of [p.bound,second]){expect(await h.provider.authenticate(credentials.sessionToken)).toBeUndefined();await expect(h.identityApp.session(credentials.sessionToken)).rejects.toMatchObject({code:"UNAUTHENTICATED"});await expect(h.identityApp.context({...credentials,requestedTenantId:f.principal.tenantId})).rejects.toMatchObject({code:"UNAUTHENTICATED"});}
 });
 it("[G2] ordinary session remains valid with the other company alone and refuses the removed company",async()=>{
  const f=await fixture(h),other=await fixture(h,false,false),p=await person(f);await memberIn(h,p.userId,other.principal.tenantId);
  const row=await canonicalRows(h,"identity.session","token_digest=$1",[h.provider.digest(`session:${p.ordinary.sessionToken}`)]);await deactivate(f,p);
  expect(await h.provider.authenticate(p.ordinary.sessionToken)).toBeDefined();expect(await canonicalRows(h,"identity.session","token_digest=$1",[h.provider.digest(`session:${p.ordinary.sessionToken}`)])).toEqual(row);
  expect((await h.identityApp.session(p.ordinary.sessionToken)).memberships.map(m=>m.tenantId)).toEqual([other.principal.tenantId]);expect((await h.identityApp.context({...p.ordinary,requestedTenantId:other.principal.tenantId})).tenantId).toBe(other.principal.tenantId);
  await expect(h.identityApp.context({...p.ordinary,requestedTenantId:f.principal.tenantId})).rejects.toMatchObject({code:"TENANT_FORBIDDEN"});
 });
 it("[G3] deactivated administrator loses both administrative services through bound and ordinary sessions",async()=>{
  const f=await fixture(h),p=await person(f,"admin"),tables=["identity.sso_connection","identity.verified_domain","identity.idp_group_role_mapping","identity.sso_required_event"];
  await expect(f.app.view(f.principal.tenantId,p.bound)).resolves.toHaveProperty("connections");const before=await Promise.all(tables.map(table=>canonicalRows(h,table)));await deactivate(f,p);
  for(const credentials of [p.bound,p.ordinary]){
   await expect(f.app.view(f.principal.tenantId,credentials)).rejects.toMatchObject({code:"SSO_FORBIDDEN"});
   for(const input of [
    {version:"sso-admin.v1",requested_tenant_id:f.principal.tenantId,action:"connection.create",id:randomUUID(),idpCert:f.idp.idpCert},
    {version:"sso-admin.v1",requested_tenant_id:f.principal.tenantId,action:"domain.verify",connectionId:f.connectionId,domain:`${randomUUID()}.invalid`,proof:"invalid"},
    {version:"sso-admin.v1",requested_tenant_id:f.principal.tenantId,action:"mapping.set",connectionId:f.connectionId,group:"new",role:"read_only",scope:{kind:"tenant",id:f.principal.tenantId},enabled:true,expectedRevision:0},
   ])await expect(f.app.admin(input,credentials)).rejects.toMatchObject({code:"SSO_FORBIDDEN"});
   await expect(f.service.view({version:"sso-required-view.v1",requested_tenant_id:f.principal.tenantId},credentials)).rejects.toMatchObject({code:"SSO_REQUIRED_FORBIDDEN"});
   await expect(f.service.command(f.command(true,0),credentials)).rejects.toMatchObject({code:"SSO_REQUIRED_FORBIDDEN"});
  }
  expect(await Promise.all(tables.map(table=>canonicalRows(h,table)))).toEqual(before);
 });
 for(const role of Object.keys(permissions) as Array<keyof typeof permissions>)it(`[G4] ${role} loses every enumerated permission on company and its own scope`,async()=>{
  const f=await fixture(h),p=await person(f,role),team=(await h.admin.query("SELECT id FROM app.team WHERE tenant_id=$1 LIMIT 1",[f.principal.tenantId])).rows[0].id as string;
  if(role==="operative"){
   const revision=Number((await h.admin.query("SELECT count(*) n FROM app.command_receipt WHERE tenant_id=$1 AND command_type LIKE 'contractor.%'",[f.principal.tenantId])).rows[0].n);
   await f.contractor.command(f.principal,{version:"contractor-command.v1",environment:"synthetic_demo",commandId:randomUUID(),expectedRevision:revision,id:randomUUID(),kind:"team.move",membershipId:p.membershipId,fromTeamId:null,toTeamId:team});
  }
  const target=role==="operative"?team:f.principal.tenantId;expect((await runtimeCheck(f,p,permissions[role][0],target)).allowed).toBe(true);await deactivate(f,p);
  for(const permission of permissions[role])for(const scope of [f.principal.tenantId,target])expect(await runtimeCheck(f,p,permission,scope)).toEqual({active:false,allowed:false});
 });
 it("[G5] allowed background action and real executor both refuse before any attempt or adapter call",async()=>{
  const f=await fixture(h),p=await person(f,"commercial_manager"),work=await worker(f,p),action=await approvedAction(f,p);await f.app.checkWorkerAction(work.context,work.action);await deactivate(f,p);
  await expect(f.app.checkWorkerAction(work.context,work.action)).rejects.toMatchObject({code:"SSO_FORBIDDEN"});let calls=0;
  const adapter:OutboundAdapter={name:"fake_capture",supportsProviderDeduplication:false,deliver:async()=>{calls++;return {kind:"succeeded",providerReference:"synthetic:unexpected"};},reconcile:async()=>"unknown"};
  await new ActionExecutor(h.runtime,new Map([[adapter.name,adapter]]),{emit:()=>undefined}).execute(work.context,action.id);
  expect(calls).toBe(0);expect((await h.admin.query("SELECT status FROM app.action_outbox WHERE tenant_id=$1 AND id=$2",[f.principal.tenantId,action.id])).rows[0].status).toBe("pending");expect((await h.admin.query("SELECT count(*)::int n FROM app.action_attempt WHERE tenant_id=$1 AND action_id=$2",[f.principal.tenantId,action.id])).rows[0].n).toBe(0);
 });
 it("[G6] provider cannot re-sign-in or relink by address and a fresh code session lists nothing",async()=>{
  const f=await fixture(h),p=await person(f),tables=["identity.session","app.membership","app.role_grant"];const before=await Promise.all(tables.map(async table=>(await h.admin.query(`SELECT id::text FROM ${table} ORDER BY id`)).rows));await deactivate(f,p);
  await expect(f.signin(p.email,p.subject,false,["finance"])).rejects.toMatchObject({code:"MEMBERSHIP_REVOKED"});await expect(f.signin(p.email,randomUUID(),false,["finance"])).rejects.toMatchObject({code:"LINK_REQUIRED"});expect(await Promise.all(tables.map(async table=>(await h.admin.query(`SELECT id::text FROM ${table} ORDER BY id`)).rows))).toEqual(before);
  const request=await h.provider.requestCode({email:p.email,purpose:"signin",ip:randomUUID()}),credentials={...await h.provider.verifyCode(p.email,"signin",request.fixtureCode!),origin:f.ordinary.origin};
  expect((await h.identityApp.session(credentials.sessionToken)).memberships).toEqual([]);await expect(h.identityApp.context({...credentials,requestedTenantId:f.principal.tenantId})).rejects.toMatchObject({code:"TENANT_FORBIDDEN"});
 });
 it("[G7] required ON preserves switch history and all immediate request and background refusals",async()=>{
  const f=await fixture(h),p=await person(f,"commercial_manager"),work=await worker(f,p),action=await approvedAction(f,p);await f.enable();
  const switchRows=await canonicalRows(h,"identity.sso_required_event","tenant_id=$1",[f.principal.tenantId]),state=await f.service.view({version:"sso-required-view.v1",requested_tenant_id:f.principal.tenantId},f.bound!);await deactivate(f,p);
  expect(await h.provider.authenticate(p.bound.sessionToken)).toBeUndefined();await expect(h.identityApp.context({...p.bound,requestedTenantId:f.principal.tenantId})).rejects.toMatchObject({code:"UNAUTHENTICATED"});
  expect(await h.provider.authenticate(p.ordinary.sessionToken)).toBeDefined();expect((await h.identityApp.session(p.ordinary.sessionToken)).memberships).toEqual([]);await expect(h.identityApp.context({...p.ordinary,requestedTenantId:f.principal.tenantId})).rejects.toMatchObject({code:"TENANT_FORBIDDEN"});
  await expect(f.app.checkWorkerAction(work.context,work.action)).rejects.toMatchObject({code:"SSO_FORBIDDEN"});let calls=0;
  const adapter:OutboundAdapter={name:"fake_capture",supportsProviderDeduplication:false,deliver:async()=>{calls++;return {kind:"succeeded",providerReference:"synthetic:unexpected"};},reconcile:async()=>"unknown"};await new ActionExecutor(h.runtime,new Map([[adapter.name,adapter]]),{emit:()=>undefined}).execute(work.context,action.id);expect(calls).toBe(0);
  expect((await h.admin.query("SELECT status FROM app.action_outbox WHERE tenant_id=$1 AND id=$2",[f.principal.tenantId,action.id])).rows[0].status).toBe("pending");expect((await h.admin.query("SELECT count(*)::int n FROM app.action_attempt WHERE tenant_id=$1 AND action_id=$2",[f.principal.tenantId,action.id])).rows[0].n).toBe(0);
  await expect(f.signin(p.email,p.subject,false,["commercial_manager"])).rejects.toMatchObject({code:"MEMBERSHIP_REVOKED"});await expect(f.signin(p.email,randomUUID(),false,["commercial_manager"])).rejects.toMatchObject({code:"LINK_REQUIRED"});
  const request=await h.provider.requestCode({email:p.email,purpose:"signin",ip:randomUUID()}),credentials={...await h.provider.verifyCode(p.email,"signin",request.fixtureCode!),origin:f.ordinary.origin};expect((await h.identityApp.session(credentials.sessionToken)).memberships).toEqual([]);await expect(h.identityApp.context({...credentials,requestedTenantId:f.principal.tenantId})).rejects.toMatchObject({code:"TENANT_FORBIDDEN"});
  expect(await canonicalRows(h,"identity.sso_required_event","tenant_id=$1",[f.principal.tenantId])).toEqual(switchRows);expect(await f.service.view({version:"sso-required-view.v1",requested_tenant_id:f.principal.tenantId},f.bound!)).toEqual(state);expect(state.required).toBe(true);
 });
 it("[G7] removing the only re-admitted unlinked person reduces count and permits the original ON command",async()=>{
  const f=await fixture(h),p=await person(f);await deactivate(f,p);
  const invitation=await h.identityApp.invite({version:"identity-invitation.v1",requested_tenant_id:f.principal.tenantId,email:p.email,role:"finance"},f.ordinary),request=await h.provider.requestCode({email:p.email,purpose:"invitation",invitationId:invitation.id,ip:randomUUID()});await h.provider.verifyCode(p.email,"invitation",request.fixtureCode!,invitation.id);
  const before=await f.service.view({version:"sso-required-view.v1",requested_tenant_id:f.principal.tenantId},f.bound!);expect(before.unlinkedMembers).toBe(1);await expect(f.enable()).rejects.toMatchObject({code:"SSO_REQUIRED_UNLINKED_MEMBERS"});
  expect(await deactivate(f,p)).toMatchObject({outcome:"deactivated"});const after=await f.service.view({version:"sso-required-view.v1",requested_tenant_id:f.principal.tenantId},f.bound!);expect(after.unlinkedMembers).toBe(before.unlinkedMembers-1);await expect(f.enable()).resolves.toMatchObject({required:true});
 });
 it("[G8] another same-company administrator and another-company members retain request admin permission worker and executor authority",async()=>{
  const f=await fixture(h),p=await person(f,"admin"),q=await person(f,"admin"),other=await fixture(h),r=await person(other,"admin"),qWork=await worker(f,q),rWork=await worker(other,r),qAction=await approvedAction(f,q),rAction=await approvedAction(other,r);
  const stableTables=["app.membership","app.role_grant","app.role_grant_revocation","identity.sso_subject","identity.sso_session_binding","identity.sso_grant","identity.membership_locator"],tenant=other.principal.tenantId;
  const sameCompanyRows=await Promise.all([canonicalRows(h,"app.membership","tenant_id=$1 AND id=$2",[f.principal.tenantId,q.membershipId]),canonicalRows(h,"app.role_grant","tenant_id=$1 AND membership_id=$2",[f.principal.tenantId,q.membershipId]),canonicalRows(h,"app.role_grant_revocation","tenant_id=$1 AND grant_id IN(SELECT id FROM app.role_grant WHERE tenant_id=$1 AND membership_id=$2)",[f.principal.tenantId,q.membershipId]),canonicalRows(h,"identity.sso_subject","tenant_id=$1 AND user_id=$2",[f.principal.tenantId,q.userId]),canonicalRows(h,"identity.sso_session_binding","tenant_id=$1 AND session_id=$2",[f.principal.tenantId,q.sessionId])]);
  const otherRows=await Promise.all(stableTables.map(table=>canonicalRows(h,table,"tenant_id=$1",[tenant]))),qRows=await canonicalRows(h,"identity.session","user_id=$1",[q.userId]),rRows=await canonicalRows(h,"identity.session","user_id IN(SELECT identity_user_id FROM app.membership WHERE tenant_id=$1)",[tenant]),otherAudit=await canonicalRows(h,"app.audit_event","tenant_id=$1",[tenant]);
  await deactivate(f,p);expect(await h.provider.authenticate(q.bound.sessionToken)).toBeDefined();expect(await Promise.all([canonicalRows(h,"app.membership","tenant_id=$1 AND id=$2",[f.principal.tenantId,q.membershipId]),canonicalRows(h,"app.role_grant","tenant_id=$1 AND membership_id=$2",[f.principal.tenantId,q.membershipId]),canonicalRows(h,"app.role_grant_revocation","tenant_id=$1 AND grant_id IN(SELECT id FROM app.role_grant WHERE tenant_id=$1 AND membership_id=$2)",[f.principal.tenantId,q.membershipId]),canonicalRows(h,"identity.sso_subject","tenant_id=$1 AND user_id=$2",[f.principal.tenantId,q.userId]),canonicalRows(h,"identity.sso_session_binding","tenant_id=$1 AND session_id=$2",[f.principal.tenantId,q.sessionId])])).toEqual(sameCompanyRows);expect(await Promise.all(stableTables.map(table=>canonicalRows(h,table,"tenant_id=$1",[tenant])))).toEqual(otherRows);expect(await canonicalRows(h,"identity.session","user_id=$1",[q.userId])).toEqual(qRows);expect(await canonicalRows(h,"identity.session","user_id IN(SELECT identity_user_id FROM app.membership WHERE tenant_id=$1)",[tenant])).toEqual(rRows);expect(await canonicalRows(h,"app.audit_event","tenant_id=$1",[tenant])).toEqual(otherAudit);
  for(const [company,member,work,action] of [[f,q,qWork,qAction],[other,r,rWork,rAction]] as const){
   for(const credentials of [member.bound,member.ordinary]){expect(await h.provider.authenticate(credentials.sessionToken)).toBeDefined();expect((await h.identityApp.session(credentials.sessionToken)).memberships.map(m=>m.tenantId)).toContain(company.principal.tenantId);expect((await h.identityApp.context({...credentials,requestedTenantId:company.principal.tenantId})).tenantId).toBe(company.principal.tenantId);await expect(company.app.view(company.principal.tenantId,credentials)).resolves.toHaveProperty("connections");await expect(company.service.view({version:"sso-required-view.v1",requested_tenant_id:company.principal.tenantId},credentials)).resolves.toHaveProperty("required");}
   for(const credentials of [member.bound,member.ordinary]) {
    const connectionId=randomUUID(),domain=`${randomUUID()}.retained.invalid`;
    await expect(company.app.admin({version:"sso-admin.v1",requested_tenant_id:company.principal.tenantId,action:"connection.create",id:connectionId,idpCert:company.idp.idpCert},credentials)).resolves.toHaveProperty("connections");
    await expect(company.app.admin({version:"sso-admin.v1",requested_tenant_id:company.principal.tenantId,action:"domain.verify",connectionId,domain,proof:`synthetic-domain:${connectionId}:${domain}`},credentials)).resolves.toHaveProperty("domains");
    await expect(company.app.admin({version:"sso-admin.v1",requested_tenant_id:company.principal.tenantId,action:"mapping.set",connectionId,group:"retained",role:"read_only",scope:{kind:"tenant",id:company.principal.tenantId},enabled:true,expectedRevision:0},credentials)).resolves.toHaveProperty("mappings");
   }
   await expect(company.service.command(company.command(false,0),member.bound)).resolves.toMatchObject({required:false});
   for(const permission of permissions.admin)expect((await runtimeCheck(company,member,permission)).allowed).toBe(true);await expect(company.app.checkWorkerAction(work.context,work.action)).resolves.toBeUndefined();let calls=0;
   const adapter:OutboundAdapter={name:"fake_capture",supportsProviderDeduplication:false,deliver:async()=>{calls++;return {kind:"succeeded",providerReference:"synthetic:retained"};},reconcile:async()=>"unknown"};await new ActionExecutor(h.runtime,new Map([[adapter.name,adapter]]),{emit:()=>undefined}).execute(work.context,action.id);expect(calls).toBe(0);
  }
  await auditRows(h,f.principal.tenantId);await auditRows(h,other.principal.tenantId);
 });
});
