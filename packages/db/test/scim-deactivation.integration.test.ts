/** ENT-10a2 D1. NOT RUN (sandbox cannot start PostgreSQL / a browser). */
import { createHash,randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { afterAll,beforeAll,describe,expect,it,vi } from "vitest";
import { EvidenceService,LedgerRepository,MIGRATION_URLS,ScimRepository,migrate } from "../src/index.js";
import { ScimApplication } from "../../../apps/api/src/auth/sso/scim.application.js";
import { scimBearerFor } from "../../../apps/api/src/auth/sso/scim.contracts.js";
import { auditRows,canonicalRows,createScimHarness,deactivate,fixture,memberIn,person,sha256,type ScimFixture,type ScimHarness,type ScimPerson } from "./scim-fixtures.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { importWatchdogFixtureJob } from "./watchdog-fixtures.js";
let h:ScimHarness;
beforeAll(async()=>{h=await createScimHarness("jg-scim-deactivation-");},120000);
afterAll(async()=>{await h?.close();});
const untouched=["identity.sso_subject","identity.sso_session_binding","identity.sso_grant","identity.membership_locator","identity.identity_user","identity.user_email","identity.invitation","identity.sso_required_event","app.role_grant"];
const writes=["app.membership","identity.session","app.role_grant_revocation","identity.scim_event","app.audit_event"];
async function snapshot(tables:string[]) {return Object.fromEntries(await Promise.all(tables.map(async table=>[table,await canonicalRows(h,table)])));}
async function companySnapshot(tenant:string) {
 const tables=["app.membership","app.role_grant","app.role_grant_revocation","identity.sso_subject","identity.sso_session_binding","identity.sso_grant","identity.scim_event","app.audit_event","audit_control.audit_head"];
 const result=Object.fromEntries(await Promise.all(tables.map(async table=>[table,await canonicalRows(h,table,"tenant_id=$1",[tenant])])));
 result["identity.session"]=await canonicalRows(h,"identity.session","id IN(SELECT session_id FROM identity.sso_session_binding WHERE tenant_id=$1) OR (user_id IN(SELECT identity_user_id FROM app.membership WHERE tenant_id=$1) AND NOT EXISTS(SELECT 1 FROM identity.sso_session_binding WHERE session_id=identity.session.id))",[tenant]);return result;
}
async function historyFixture(f:ScimFixture) {
 const tenant=f.principal.tenantId,book=randomUUID(),receivable=randomUUID(),deferred=randomUUID(),authorizationId=randomUUID(),journalId=randomUUID(),artifactHash=sha256("Synthetic historical obligation");
 await h.admin.query("INSERT INTO app.ledger_book(id,tenant_id,code,currency,chart_status) VALUES($1,$2,'scim-history','GBP','synthetic')",[book,tenant]);
 await h.admin.query("INSERT INTO app.ledger_account(id,tenant_id,book_id,currency,code,class,mapping_status) VALUES($1,$2,$3,'GBP','AR','receivable','synthetic'),($4,$2,$3,'GBP','DEF','deferred_income','synthetic')",[receivable,tenant,book,deferred]);
 await h.admin.query("INSERT INTO app.financial_authorization(id,tenant_id,membership_id,purpose,amount_pence,currency,artifact_hash,status) VALUES($1,$2,$3,'plan_obligation',1000,'GBP',$4,'approved')",[authorizationId,tenant,f.principal.membershipId,artifactHash]);
 await new LedgerRepository(h.runtime).postPlanObligation(testTenantContext(tenant),{authorizationId,actorRef:"operations:synthetic-history",permission:"finance:approve"},{schemaVersion:1,journalId,bookId:book,amountPence:1000,currency:"GBP",sourceEventId:`history:${journalId}`,provenanceRef:"synthetic:history-fixture",artifactHash,authorizationId,actorRef:"operations:synthetic-history",receivableAccountId:receivable,deferredIncomeAccountId:deferred,provenanceKind:"synthetic_authorized_plan"});
 const jobId=randomUUID();await importWatchdogFixtureJob(h.admin,tenant,jobId,"Fictional retained history");
 const bytes=new Uint8Array([255,216,0,0,255,217]);let objectKey="";
 const service=new EvidenceService(h.runtime,{
  createUploadUrl:async()=>"synthetic-upload",createDownloadUrl:async()=>"synthetic-download",
  readExactVersion:async()=>({key:objectKey,versionId:"synthetic-history-v1",bytes,byteLength:bytes.length,contentType:"image/jpeg"}),deleteExactVersion:async()=>undefined,
 });
 const upload=await service.beginUpload(testTenantContext(tenant),{jobId,scopeItemId:null,expectedSha256:createHash("sha256").update(bytes).digest("hex"),contentType:"image/jpeg",maximumBytes:100,expiresAt:new Date(Date.now()+600000)});
 objectKey=upload.objectKey;await service.finalize(testTenantContext(tenant),{uploadId:upload.id,objectVersionId:"synthetic-history-v1",evidenceType:"site_photo"});
}
async function refusalCount() {return Number((await h.admin.query("SELECT count(*) n FROM identity.sso_refusal_event")).rows[0].n);}
async function record(f:ScimFixture,eventId:string) {return (await h.admin.query("SELECT * FROM identity.scim_event WHERE tenant_id=$1 AND connection_id=$2 AND source_event_id=$3",[f.principal.tenantId,f.connectionId,eventId])).rows[0];}
async function reinvite(f:ScimFixture,p:ScimPerson) {
 const invitation=await h.identityApp.invite({version:"identity-invitation.v1",requested_tenant_id:f.principal.tenantId,email:p.email,role:"finance"},f.ordinary);
 const request=await h.provider.requestCode({email:p.email,purpose:"invitation",invitationId:invitation.id,ip:randomUUID()});
 await h.provider.verifyCode(p.email,"invitation",request.fixtureCode!,invitation.id);
 return (await h.admin.query("SELECT membership_id FROM identity.membership_locator WHERE user_id=$1 AND tenant_id=$2",[p.userId,f.principal.tenantId])).rows[0].membership_id as string;
}
async function seedBinding(f:ScimFixture,p:ScimPerson,connectionId:string,membershipId:string) {
 const subjectHash=sha256(p.subject),sessionId=randomUUID(),value=randomUUID(),csrf=randomUUID();
 await h.admin.query("INSERT INTO identity.sso_subject(tenant_id,connection_id,subject_hash,email_hash,user_id,membership_id) VALUES($1,$2,$3,$4,$5,$6)",[f.principal.tenantId,connectionId,subjectHash,sha256(p.email),p.userId,membershipId]);
 await h.admin.query("INSERT INTO identity.session(id,user_id,environment,token_digest,csrf_token,expires_at) VALUES($1,$2,'synthetic_demo',$3,$4,clock_timestamp()+interval '15 minutes')",[sessionId,p.userId,h.provider.digest(`session:${value}`),csrf]);
 await h.admin.query("INSERT INTO identity.sso_session_binding(tenant_id,connection_id,subject_hash,session_id) VALUES($1,$2,$3,$4)",[f.principal.tenantId,connectionId,subjectHash,sessionId]);
 return {sessionId,sessionToken:value,csrfToken:csrf,origin:f.ordinary.origin};
}

describe("[D1] ENT-10a2 database deactivation",()=>{
 it("[A3] provider proof scopes access before SQL and unknown connections leave only a global refusal",async()=>{
  const a=await fixture(h),b=await fixture(h),p=await person(a),beforeA=await companySnapshot(a.principal.tenantId),beforeB=await companySnapshot(b.principal.tenantId),global=await refusalCount();
  const bearer=scimBearerFor(h.seed,a.connectionId),body={version:"scim-deactivation.v1",eventId:randomUUID(),subject:p.subject,active:false};
  await expect(h.scim.deactivate(b.connectionId,["Bearer",bearer].join(" "),body)).rejects.toMatchObject({code:"SCIM_REFUSED"});
  expect(await companySnapshot(a.principal.tenantId)).toEqual(beforeA);expect(await companySnapshot(b.principal.tenantId)).toEqual(beforeB);expect(await refusalCount()).toBe(global+1);
  const missing=randomUUID(),presented=scimBearerFor(h.seed,missing);
  await expect(h.scim.deactivate(missing,["Bearer",presented].join(" "),body)).rejects.toMatchObject({code:"SCIM_REFUSED"});
  expect(await companySnapshot(a.principal.tenantId)).toEqual(beforeA);expect(await companySnapshot(b.principal.tenantId)).toEqual(beforeB);expect(await refusalCount()).toBe(global+2);
  await expect(deactivate(a,p)).resolves.toMatchObject({outcome:"deactivated",cause:"SCIM_DEACTIVATED"});
  await h.admin.query("CREATE DATABASE jobguard_scim_other");
  const alternate=new Pool({...h.admin.options,database:"jobguard_scim_other"});
  try {await migrate(alternate);const before=(await alternate.query("SELECT count(*)::int n FROM identity.scim_event")).rows[0].n;
   await expect(alternate.query("SELECT identity.scim_deactivate($1,'{}'::jsonb)",[a.connectionId])).rejects.toMatchObject({code:"42501",message:"SCIM_ROUTE_BLOCKED"});
   expect((await alternate.query("SELECT count(*)::int n FROM identity.scim_event")).rows[0].n).toBe(before);
  }finally{await alternate.end();}
 },120000);
 it("[B1] exact membership/session/grant revocations share one database time and preserve every other row",async()=>{
  const f=await fixture(h),p=await person(f),q=await person(f),other=await fixture(h),earlier=p.sessionId;
  const second=await f.signin(p.email,p.subject,false,["finance"]),secondId=(await h.provider.authenticate(second.sessionToken))!.sessionId;
  const grantId=randomUUID(),revision=Number((await h.admin.query("SELECT count(*) n FROM app.command_receipt WHERE tenant_id=$1 AND command_type LIKE 'contractor.%'",[f.principal.tenantId])).rows[0].n);
  await f.contractor.command(f.principal,{version:"contractor-command.v1",environment:"synthetic_demo",commandId:randomUUID(),expectedRevision:revision,id:grantId,kind:"grant.create",membershipId:p.membershipId,role:"read_only",scope:{kind:"tenant",id:f.principal.tenantId},contractId:null});
  await h.identityApp.invite({version:"identity-invitation.v1",requested_tenant_id:f.principal.tenantId,email:`${randomUUID()}@${f.domain}`,role:"finance"},f.ordinary);await f.enable();
  const stable=await snapshot(untouched),oldSession=await canonicalRows(h,"identity.session","id=$1",[earlier]),ordinary=await canonicalRows(h,"identity.session","token_digest=$1",[h.provider.digest(`session:${p.ordinary.sessionToken}`)]),previousRevocations=await canonicalRows(h,"app.role_grant_revocation");
  const otherMemberships=await canonicalRows(h,"app.membership","id<>$1",[p.membershipId]),otherSessions=await canonicalRows(h,"identity.session","id<>$1",[secondId]),otherCompany=await companySnapshot(other.principal.tenantId),eventId=randomUUID();
  expect(await deactivate(f,p,eventId)).toMatchObject({version:"scim-deactivation-result.v1",environment:"synthetic_demo",eventId,outcome:"deactivated",cause:"SCIM_DEACTIVATED"});
  expect(await record(f,eventId)).toMatchObject({user_id:p.userId,memberships_revoked:1,sessions_revoked:1,grants_revoked:2});
  expect((await h.admin.query("SELECT m.revoked_at::text membership,s.revoked_at::text session,e.created_at::text recorded FROM app.membership m JOIN identity.session s ON s.id=$2 JOIN identity.scim_event e ON e.tenant_id=m.tenant_id AND e.source_event_id=$3 WHERE m.tenant_id=$4 AND m.id=$1",[p.membershipId,secondId,eventId,f.principal.tenantId])).rows[0]).toEqual(expect.objectContaining({membership:expect.any(String)}));
  const times=(await h.admin.query("SELECT m.revoked_at=s.revoked_at AND s.revoked_at=e.created_at equal FROM app.membership m JOIN identity.session s ON s.id=$2 JOIN identity.scim_event e ON e.tenant_id=m.tenant_id AND e.source_event_id=$3 WHERE m.tenant_id=$4 AND m.id=$1",[p.membershipId,secondId,eventId,f.principal.tenantId])).rows[0];expect(times.equal).toBe(true);
  expect(await snapshot(untouched)).toEqual(stable);expect(await canonicalRows(h,"identity.session","id=$1",[earlier])).toEqual(oldSession);expect(await canonicalRows(h,"identity.session","token_digest=$1",[h.provider.digest(`session:${p.ordinary.sessionToken}`)])).toEqual(ordinary);
  expect(await canonicalRows(h,"app.membership","id<>$1",[p.membershipId])).toEqual(otherMemberships);expect(await canonicalRows(h,"identity.session","id<>$1",[secondId])).toEqual(otherSessions);expect(await companySnapshot(other.principal.tenantId)).toEqual(otherCompany);
  expect((await canonicalRows(h,"app.role_grant_revocation")).filter(text=>previousRevocations.includes(text))).toEqual(previousRevocations);
  expect((await h.admin.query("SELECT count(*)::int n FROM app.role_grant_revocation WHERE tenant_id=$1 AND grant_id=$2",[f.principal.tenantId,grantId])).rows[0].n).toBe(1);expect(await h.provider.authenticate(q.bound.sessionToken)).toBeDefined();
 });
 it("[B2] hashes match the real sign-in subject exactly including case and trailing whitespace",async()=>{
  const f=await fixture(h),p=await person(f,"finance",`Person-${randomUUID()}`);
  for(const subject of [p.subject.replace("Person","Persom"),p.subject.toLowerCase(),`${p.subject} `])expect(await deactivate(f,{subject})).toMatchObject({outcome:"ignored",cause:"SCIM_SUBJECT_NOT_LINKED"});
  expect(await h.provider.authenticate(p.bound.sessionToken)).toBeDefined();expect(await deactivate(f,p)).toMatchObject({outcome:"deactivated"});
 });
 it("[B3] identity email subject and locator remain canonical text unchanged and code request still works",async()=>{
  const f=await fixture(h),p=await person(f),tables=["identity.identity_user","identity.user_email","identity.sso_subject","identity.membership_locator"],before=await snapshot(tables);
  await deactivate(f,p);expect(await snapshot(tables)).toEqual(before);
  expect(await h.provider.requestCode({email:p.email,purpose:"signin",ip:randomUUID()})).toMatchObject({accepted:true});
 });
 it("[B4] linked owner is refused whole even with a second active membership and keeps the next request",async()=>{
  const f=await fixture(h),account=(await h.admin.query("SELECT account_id FROM app.membership WHERE tenant_id=$1 AND id=$2",[f.principal.tenantId,f.principal.membershipId])).rows[0].account_id;
  await h.admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'read_only')",[randomUUID(),f.principal.tenantId,account,f.principal.identityUserId]);
  const before=await snapshot(["app.membership","identity.session","app.role_grant","app.role_grant_revocation"]),eventId=randomUUID();
  expect(await deactivate(f,{subject:f.principal.identityUserId},eventId)).toMatchObject({outcome:"refused",cause:"SCIM_OWNER_PROTECTED"});
  expect(await snapshot(["app.membership","identity.session","app.role_grant","app.role_grant_revocation"])).toEqual(before);expect(await record(f,eventId)).toMatchObject({memberships_revoked:0,sessions_revoked:0,grants_revoked:0});
  expect((await auditRows(h,f.principal.tenantId)).filter(r=>r.event_type==="sso.scim.refused")).toHaveLength(1);expect(await h.provider.authenticate(f.bound!.sessionToken)).toBeDefined();expect((await h.identityApp.session(f.bound!.sessionToken)).memberships).toHaveLength(1);
 });
 it("[B5] unknown subject and an existing member address neither create nor link a person",async()=>{
  const f=await fixture(h),p=await person(f),tables=["identity.identity_user","identity.user_email","identity.sso_subject","app.membership","app.contractor_member","app.role_grant","identity.session"],before=await snapshot(tables);
  for(const subject of [randomUUID(),p.email])expect(await deactivate(f,{subject})).toMatchObject({outcome:"ignored",cause:"SCIM_SUBJECT_NOT_LINKED"});
  expect(await snapshot(tables)).toEqual(before);expect(await h.provider.authenticate(p.bound.sessionToken)).toBeDefined();
 });
 it("[B6] new messages revoke re-admitted membership while a replay never acts again",async()=>{
  const f=await fixture(h),p=await person(f),firstId=randomUUID(),first=await deactivate(f,p,firstId),times=await canonicalRows(h,"app.membership","id=$1",[p.membershipId]);
  expect(await deactivate(f,p)).toMatchObject({outcome:"ignored",cause:"SCIM_ALREADY_INACTIVE"});expect(await canonicalRows(h,"app.membership","id=$1",[p.membershipId])).toEqual(times);
  const newId=await reinvite(f,p);expect(newId).not.toBe(p.membershipId);expect(await deactivate(f,p,firstId)).toEqual(first);
  expect((await h.admin.query("SELECT revoked_at IS NULL active FROM app.membership WHERE tenant_id=$1 AND id=$2",[f.principal.tenantId,newId])).rows[0].active).toBe(true);
  expect(await deactivate(f,p)).toMatchObject({outcome:"deactivated"});expect((await h.admin.query("SELECT revoked_at IS NOT NULL revoked FROM app.membership WHERE tenant_id=$1 AND id=$2",[f.principal.tenantId,newId])).rows[0].revoked).toBe(true);expect(await canonicalRows(h,"app.membership","id=$1",[p.membershipId])).toEqual(times);
 });
 it("[B7] owned source has exactly two one-way UPDATE statements and active true never re-enables",async()=>{
  const sql=await readFile(new URL("../migrations/0137_scim_deactivation.sql",import.meta.url),"utf8"),repository=await readFile(new URL("../src/scim-repository.ts",import.meta.url),"utf8");
  const updates=[...sql.matchAll(/\bUPDATE\s+(app\.membership|identity\.session)\s+(?:\w+\s+)?SET\s+([\s\S]*?);/giu)];expect(updates).toHaveLength(2);
  for(const update of updates){expect(update[2]).toMatch(/^revoked_at\s*=/iu);expect(update[2]).toMatch(/revoked_at\s+IS\s+NULL/iu);expect(update[2]).not.toMatch(/revoked_at\s*=\s*NULL/iu);}
  expect(repository).not.toMatch(/\bUPDATE\s/iu);
  const f=await fixture(h),p=await person(f);await deactivate(f,p);const before=await snapshot(writes),bearer=scimBearerFor(h.seed,f.connectionId);
  await expect(h.scim.deactivate(f.connectionId,["Bearer",bearer].join(" "),{version:"scim-deactivation.v1",eventId:randomUUID(),subject:p.subject,active:true})).rejects.toMatchObject({code:"INVALID_SCIM_INPUT"});
  const after=await snapshot(writes);for(const table of writes.filter(t=>t!=="app.audit_event"))expect(after[table]).toEqual(before[table]);expect(await h.provider.authenticate(p.bound.sessionToken)).toBeUndefined();
 });
 for(const boundOther of [false,true])it(`[T1] same person retains the other company's ${boundOther?"bound and ordinary":"ordinary"} access and exact rows`,async()=>{
  const a=await fixture(h),b=await fixture(h),p=await person(a),otherMember=await memberIn(h,p.userId,b.principal.tenantId),otherBound=boundOther?await seedBinding(b,p,b.connectionId,otherMember):undefined;
  const otherRows=await companySnapshot(b.principal.tenantId),otherSessions=await canonicalRows(h,"identity.session",otherBound?"id=$1":"user_id=$1",[otherBound?.sessionId??b.principal.identityUserId]);
  await deactivate(a,p);expect(await companySnapshot(b.principal.tenantId)).toEqual(otherRows);expect(await canonicalRows(h,"identity.session",otherBound?"id=$1":"user_id=$1",[otherBound?.sessionId??b.principal.identityUserId])).toEqual(otherSessions);
  expect((await h.identityApp.session(p.ordinary.sessionToken)).memberships.map(m=>m.tenantId)).toEqual([b.principal.tenantId]);expect((await h.identityApp.context({...p.ordinary,requestedTenantId:b.principal.tenantId})).tenantId).toBe(b.principal.tenantId);
  await expect(h.identityApp.context({...p.ordinary,requestedTenantId:a.principal.tenantId})).rejects.toMatchObject({code:"TENANT_FORBIDDEN"});if(otherBound){expect(await h.provider.authenticate(otherBound.sessionToken)).toBeDefined();expect((await h.identityApp.context({...otherBound,requestedTenantId:b.principal.tenantId})).tenantId).toBe(b.principal.tenantId);}
 });
 it("[T2] another company's subject is indistinguishable from an unlinked subject",async()=>{
  const a=await fixture(h),b=await fixture(h),p=await person(b),before=await companySnapshot(b.principal.tenantId),eventId=randomUUID();
  const linked=await deactivate(a,p,eventId),missing=await deactivate(a,{subject:randomUUID()});expect({...linked,eventId:missing.eventId}).toEqual(missing);expect(await companySnapshot(b.principal.tenantId)).toEqual(before);expect(await h.provider.authenticate(p.bound.sessionToken)).toBeDefined();
 });
 it("[T3] all same-company connections lose the person's sessions and event identities are connection-scoped",async()=>{
  const f=await fixture(h),p=await person(f),second=randomUUID();
  await f.app.admin({version:"sso-admin.v1",requested_tenant_id:f.principal.tenantId,action:"connection.create",id:second,idpCert:f.idp.idpCert},f.ordinary);
  const bound=await seedBinding(f,p,second,p.membershipId),eventId=randomUUID();await deactivate(f,p,eventId);
  expect(await h.provider.authenticate(p.bound.sessionToken)).toBeUndefined();expect(await h.provider.authenticate(bound.sessionToken)).toBeUndefined();
  const bearer=scimBearerFor(h.seed,second);expect(await h.scim.deactivate(second,["Bearer",bearer].join(" "),{version:"scim-deactivation.v1",eventId,subject:p.subject,active:false})).toMatchObject({outcome:"ignored",cause:"SCIM_ALREADY_INACTIVE"});
  expect((await h.admin.query("SELECT count(*)::int n FROM identity.scim_event WHERE tenant_id=$1 AND source_event_id=$2",[f.principal.tenantId,eventId])).rows[0].n).toBe(2);
 });
 it("[T4] FORCE RLS hides other-company records and missing empty invalid settings",async()=>{
  const a=await fixture(h),b=await fixture(h);await deactivate(a,{subject:randomUUID()});await deactivate(b,{subject:randomUUID()});
  const client=await h.admin.connect();try{
   for(const setting of [undefined,"","invalid",a.principal.tenantId,randomUUID()]){
    await client.query("BEGIN; SET LOCAL ROLE jobguard_migration");if(setting!==undefined)await client.query("SELECT set_config('app.tenant_id',$1,true)",[setting]);
    const rows=(await client.query("SELECT tenant_id FROM identity.scim_event")).rows;expect(rows).toEqual(setting===a.principal.tenantId?[{tenant_id:a.principal.tenantId}]:[]);await client.query("ROLLBACK");
   }
  }finally{await client.query("ROLLBACK");client.release();}
 });
 it("[H1] each outcome stores and audits exactly once with only approved identifiers and hashes",async()=>{
  const f=await fixture(h),p=await person(f),cases=[{subject:randomUUID(),outcome:"ignored",cause:"SCIM_SUBJECT_NOT_LINKED"},{subject:f.principal.identityUserId,outcome:"refused",cause:"SCIM_OWNER_PROTECTED"},{subject:p.subject,outcome:"deactivated",cause:"SCIM_DEACTIVATED"},{subject:p.subject,outcome:"ignored",cause:"SCIM_ALREADY_INACTIVE"}];
  for(const c of cases){const eventId=randomUUID(),before=(await auditRows(h,f.principal.tenantId)).length;expect(await deactivate(f,c,eventId)).toMatchObject({outcome:c.outcome,cause:c.cause});
   const row=await record(f,eventId),events=(await auditRows(h,f.principal.tenantId)).slice(before);expect(events).toHaveLength(1);expect(events[0]).toMatchObject({event_type:`sso.scim.${c.outcome}`,actor_ref:"identity:scim",subject_type:"sso-connection",subject_ref:f.connectionId});
   expect(events[0].payload).toEqual({references:{environment:"synthetic_demo",code:c.cause},hashes:{document:row.event_hash},classifications:{action:"security"}});expect(JSON.stringify(events[0].payload)).not.toContain(c.subject);expect(JSON.stringify(events[0].payload)).not.toContain(p.email);
  }
  expect((await h.admin.query("SELECT count(*)::int n FROM identity.scim_event WHERE tenant_id=$1",[f.principal.tenantId])).rows[0].n).toBe(4);
 });
 it("[H2] audit failure rolls back every revocation and the exact message succeeds once on retry",async()=>{
  const f=await fixture(h),p=await person(f),eventId=randomUUID(),before=await snapshot(writes);
  const spy=vi.spyOn(h.repository.enterprise,"audit").mockRejectedValueOnce(new Error("invalid audit fixture"));
  try{await expect(deactivate(f,p,eventId)).rejects.toMatchObject({code:"SCIM_UNAVAILABLE"});}finally{spy.mockRestore();}
  expect(await snapshot(writes)).toEqual(before);expect(await h.provider.authenticate(p.bound.sessionToken)).toBeDefined();expect(await deactivate(f,p,eventId)).toMatchObject({outcome:"deactivated"});expect(await record(f,eventId)).toBeDefined();
 });
 for(const failAt of ["routine","commit"] as const)it(`[H2] ${failAt} failure rolls back all domain audit and record writes`,async()=>{
  const f=await fixture(h),p=await person(f),eventId=randomUUID(),before=await snapshot(writes);
  const failing=new Proxy(h.identity,{get(target,name){if(name!=="connect"){const value=Reflect.get(target,name);return typeof value==="function"?value.bind(target):value;}
   return async()=>{const client=await target.connect();return new Proxy(client,{get(db,field){if(field!=="query"){const value=Reflect.get(db,field);return typeof value==="function"?value.bind(db):value;}
    return async(...args:Parameters<typeof db.query>)=>{const text=typeof args[0]==="string"?args[0]:"";if((failAt==="commit"&&text==="COMMIT")||(failAt==="routine"&&text.includes("identity.scim_deactivate")))throw new Error("invalid statement fixture");return Reflect.apply(db.query,db,args);};}});};}});
  const app=new ScimApplication(new ScimRepository(failing),"synthetic_demo",h.seed),bearer=scimBearerFor(h.seed,f.connectionId);
  await expect(app.deactivate(f.connectionId,["Bearer",bearer].join(" "),{version:"scim-deactivation.v1",eventId,subject:p.subject,active:false})).rejects.toMatchObject({code:"SCIM_UNAVAILABLE"});
  expect(await snapshot(writes)).toEqual(before);expect(await h.provider.authenticate(p.bound.sessionToken)).toBeDefined();expect(await deactivate(f,p,eventId)).toMatchObject({outcome:"deactivated"});
 });
 it("[H3] commercial identity and earlier audit history stays byte-identical and record mutation fails for owner",async()=>{
  const f=await fixture(h),p=await person(f);await historyFixture(f);const tables=["app.journal","app.journal_line","app.evidence_object","identity.sso_connection","identity.verified_domain","identity.idp_group_role_mapping","identity.sso_grant","identity.sso_subject","identity.sso_session_binding","app.role_grant","identity.sso_required_event"],before=await snapshot(tables),earlier=await canonicalRows(h,"app.audit_event"),ids=(await h.admin.query("SELECT id FROM app.audit_event")).rows.map(r=>r.id);
  for(const table of ["app.journal","app.journal_line","app.evidence_object"])expect(before[table]!.length).toBeGreaterThan(0);
  await deactivate(f,{subject:f.principal.identityUserId});await deactivate(f,{subject:randomUUID()});const eventId=randomUUID();await deactivate(f,p,eventId);
  expect(await snapshot(tables)).toEqual(before);expect(await canonicalRows(h,"app.audit_event","id=ANY($1::uuid[])",[ids])).toEqual(earlier);
  for(const query of ["UPDATE identity.scim_event SET outcome=outcome WHERE tenant_id=$1 AND source_event_id=$2","DELETE FROM identity.scim_event WHERE tenant_id=$1 AND source_event_id=$2"]){const client=await h.admin.connect();try{await client.query("BEGIN; SET LOCAL ROLE jobguard_migration");await client.query("SELECT set_config('app.tenant_id',$1,true)",[f.principal.tenantId]);await expect(client.query(query,[f.principal.tenantId,eventId])).rejects.toMatchObject({code:"55000"});}finally{await client.query("ROLLBACK");client.release();}}
 });
 it("[H4] public refusals remain global and proved invalid input or conflict audits only its company",async()=>{
  const a=await fixture(h),b=await fixture(h),p=await person(a),routeHash=sha256("scim"),beforeGlobal=await refusalCount(),beforeA=await companySnapshot(a.principal.tenantId),beforeB=await companySnapshot(b.principal.tenantId);
  await expect(h.scim.deactivate(a.connectionId,undefined,{})).rejects.toMatchObject({code:"SCIM_REFUSED"});expect(await refusalCount()).toBe(beforeGlobal+1);expect(await companySnapshot(a.principal.tenantId)).toEqual(beforeA);expect(await companySnapshot(b.principal.tenantId)).toEqual(beforeB);
  expect((await h.admin.query("SELECT code FROM identity.sso_refusal_event WHERE route_hash=$1 ORDER BY created_at DESC LIMIT 1",[routeHash])).rows[0].code).toBe("SCIM_BEARER_REFUSED");
  const bearer=scimBearerFor(h.seed,a.connectionId),count=(await auditRows(h,a.principal.tenantId)).length;
  await expect(h.scim.deactivate(a.connectionId,["Bearer",bearer].join(" "),{})).rejects.toMatchObject({code:"INVALID_SCIM_INPUT"});expect(await refusalCount()).toBe(beforeGlobal+2);expect((await auditRows(h,a.principal.tenantId)).slice(count)).toHaveLength(1);
  const eventId=randomUUID();await deactivate(a,p,eventId);const afterFirst=await canonicalRows(h,"identity.scim_event","tenant_id=$1",[a.principal.tenantId]),beforeConflict=(await auditRows(h,a.principal.tenantId)).length;
  await expect(deactivate(a,{subject:randomUUID()},eventId)).rejects.toMatchObject({code:"SCIM_EVENT_CONFLICT"});expect(await canonicalRows(h,"identity.scim_event","tenant_id=$1",[a.principal.tenantId])).toEqual(afterFirst);expect((await auditRows(h,a.principal.tenantId)).slice(beforeConflict)).toMatchObject([{event_type:"sso.refused",payload:{references:{code:"SCIM_EVENT_CONFLICT"}}}]);expect(await companySnapshot(b.principal.tenantId)).toEqual(beforeB);
 });
 it("[K1] catalog verifies tenant keys FORCE RLS immutable trigger and explicit least privileges",async()=>{
  const table=(await h.admin.query("SELECT relrowsecurity,relforcerowsecurity,pg_get_userbyid(relowner) owner FROM pg_class WHERE oid='identity.scim_event'::regclass")).rows[0];expect(table).toEqual({relrowsecurity:true,relforcerowsecurity:true,owner:"jobguard_migration"});
  expect((await h.admin.query("SELECT attnotnull FROM pg_attribute WHERE attrelid='identity.scim_event'::regclass AND attname='tenant_id'")).rows[0].attnotnull).toBe(true);
  const constraints=(await h.admin.query("SELECT contype,pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conrelid='identity.scim_event'::regclass")).rows;
  expect(constraints).toEqual(expect.arrayContaining([expect.objectContaining({contype:"p",definition:"PRIMARY KEY (tenant_id, id)"}),expect.objectContaining({contype:"u",definition:"UNIQUE (tenant_id, connection_id, source_event_id)"}),expect.objectContaining({contype:"f",definition:expect.stringContaining("FOREIGN KEY (tenant_id, connection_id) REFERENCES identity.sso_connection(tenant_id, id)")})]));
  expect((await h.admin.query("SELECT count(*)::int n FROM pg_trigger WHERE tgrelid='identity.scim_event'::regclass AND NOT tgisinternal AND tgfoid='app.reject_immutable_authorization_record()'::regprocedure")).rows[0].n).toBe(1);
  for(const role of ["jobguard_identity","jobguard_runtime","jobguard_infrastructure"])for(const privilege of ["SELECT","INSERT","UPDATE","DELETE","TRUNCATE","REFERENCES","TRIGGER"])expect((await h.admin.query("SELECT has_table_privilege($1,'identity.scim_event',$2) allowed",[role,privilege])).rows[0].allowed).toBe(false);
  const routine=(await h.admin.query("SELECT prosecdef,proconfig,pg_get_userbyid(proowner) owner FROM pg_proc WHERE oid='identity.scim_deactivate(uuid,jsonb)'::regprocedure")).rows[0];expect(routine).toEqual({prosecdef:true,proconfig:["search_path=pg_catalog"],owner:"jobguard_migration"});
  for(const role of ["jobguard_identity","jobguard_runtime","jobguard_infrastructure"])expect((await h.admin.query("SELECT has_function_privilege($1,'identity.scim_deactivate(uuid,jsonb)','EXECUTE') allowed",[role])).rows[0].allowed).toBe(role==="jobguard_identity");
  expect((await h.admin.query("SELECT count(*)::int n FROM pg_proc p,LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='identity.scim_deactivate(uuid,jsonb)'::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE'")).rows[0].n).toBe(0);
  await expect(h.runtime.query("SELECT identity.scim_deactivate(NULL,'{}'::jsonb)")).rejects.toMatchObject({code:"42501"});
  const f=await fixture(h),p=await person(f),eventId=randomUUID();await deactivate(f,p,eventId);const valid=await record(f,eventId);
  const changes=[{subject_hash:"invalid"},{event_hash:"invalid"},{user_id:null},{outcome:"invalid"},{cause_code:"INVALID"},{memberships_revoked:-1},{sessions_revoked:-1},{grants_revoked:-1},{outcome:"ignored",cause_code:"SCIM_DEACTIVATED"},{cause_code:"SCIM_SUBJECT_NOT_LINKED",outcome:"ignored",memberships_revoked:0,sessions_revoked:0,grants_revoked:0},{outcome:"deactivated",memberships_revoked:0},{outcome:"ignored",cause_code:"SCIM_ALREADY_INACTIVE",memberships_revoked:0,sessions_revoked:1,grants_revoked:0}];
  for(const change of changes){await expect(h.admin.query("INSERT INTO identity.scim_event SELECT (jsonb_populate_record(NULL::identity.scim_event,$1::jsonb)).*",[JSON.stringify({...valid,id:randomUUID(),source_event_id:randomUUID(),...change})])).rejects.toMatchObject({code:"23514"});}
  const migration=await readFile(MIGRATION_URLS.find(url=>url.pathname.endsWith("/0137_scim_deactivation.sql"))!,"utf8");expect(migration).not.toMatch(/GRANT\s+(?:INSERT|UPDATE|DELETE)/iu);
 });
});
