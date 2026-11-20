import { testActorContext } from "./tenant-context-test-utils.js";
import { Pool, type PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, expect, it } from "vitest";
import { ExtraApprovalRepository } from "../src/index.js";
import { cluster, chainWorld, submitted, approveInput, emailOf, newToken, type Cluster, type ChainWorld } from "./extra-approval-chain-fixtures.js";
import { command as contractorCommand } from "./site-extra-fixtures.js";
let c:Cluster,w:ChainWorld,identity:Pool;
beforeAll(async()=>{
 c=await cluster();
 await c.admin.query("ALTER ROLE jobguard_identity LOGIN PASSWORD 'synthetic'");
 identity=new Pool({...c.config,database:c.admin.options.database,user:"jobguard_identity",max:2});
 expect((await identity.query("SELECT session_user,current_user,has_schema_privilege(current_user,'app','USAGE') app_usage")).rows)
  .toEqual([{session_user:"jobguard_identity",current_user:"jobguard_identity",app_usage:false}]);
 w=await chainWorld(c);
},120000);
afterAll(async()=>{await identity?.end();await c?.close();});
const d="d".repeat(64),session="e".repeat(64);
async function fixture() {
 const repo=new ExtraApprovalRepository(c.runtime),ctx=await w.ctx,s=await submitted(c,w,150000);
 await repo.approveExtraStep(await testActorContext(c.admin, ctx, w.members.supervisor.member),w.members.supervisor.member,approveInput(s,0));await repo.approveExtraStep(await testActorContext(c.admin, ctx, w.supervisor2.member),w.supervisor2.member,approveInput(s,1));
 const token=newToken(),signinDigest=randomUUID().replaceAll("-","").repeat(2),sd=randomUUID().replaceAll("-","").repeat(2),actor=w.members.client_approver.member.membershipId;
 const raw={version:"issue-client-approval.v1",commandId:randomUUID(),jobId:s.jobId,requestId:s.requestId,approverMembershipId:actor,recipient:await emailOf(c,w,actor),linkToken:token,signinDigest,expiresAt:new Date(Date.now()+7*86400000)};
 await expect(repo.issueClientApproval(await testActorContext(c.admin, ctx, w.members.owner.member),w.members.owner.member,raw)).rejects.toMatchObject({code:"PERMISSION_DENIED"});
 const sent=await repo.issueClientApproval(await testActorContext(c.admin, ctx, w.members.surveyor.member),w.members.surveyor.member,raw);
 expect((await c.admin.query("SELECT adapter,recipient,status FROM app.action_outbox WHERE id=$1",[sent.outboxActionId])).rows).toEqual([{adapter:"fake_email",recipient:raw.recipient,status:"pending"}]);
 expect((await c.admin.query("SELECT 1 FROM app.action_attempt WHERE action_id=$1",[sent.outboxActionId])).rows).toEqual([]);
 const use=(digest:string,operation="resolve",who=actor,job=s.jobId,tenant=w.p.tenantId)=>identity.query("SELECT identity.extra_customer_use($1,$2,$3,$4,$5,$6) result",[tenant,job,who,digest,operation==="redeem"?sd:null,operation]).then(r=>r.rows[0].result);
 const command={version:"extra-customer.v1",action:"decide",jobId:s.jobId,requestId:s.requestId,commandId:randomUUID(),revisionHash:s.hash,netPence:s.net,decision:"approve"};
 const bindIdentity=async(db:PoolClient)=>{
  // Real customer boundary: no member credential or protected binding is supplied.
  await db.query("SET LOCAL ROLE jobguard_identity");
  expect((await db.query("SELECT current_user")).rows[0].current_user).toBe("jobguard_identity");
 };
 const run=async(input:unknown=command,digest=sd,db:Pool|PoolClient=identity):Promise<any>=>{
  if(db!==identity)return (await db.query("SELECT identity.extra_customer_approval($1,$2,$3,$4,$5::jsonb) result",[w.p.tenantId,s.jobId,actor,digest,input])).rows[0].result;
  const client=await identity.connect();
  try{await client.query("BEGIN");const result=await run(input,digest,client);await client.query("COMMIT");return result;}
  catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
 };
 return {repo,ctx,s,sent,raw,actor,signinDigest,sd,use,command,run,bindIdentity};
}
it("ENT-5 sign-in requires a fresh link and current scoped named grant; replay is one effect",async()=>{
 const f=await fixture();await expect(f.run(f.command,d)).rejects.toMatchObject({code:"42501"});
 expect(await f.use(f.signinDigest,"redeem")).toMatchObject({extraApprover:true});const before=await unchangedFacts();
 await expect(f.run({...f.command,requestId:randomUUID()})).rejects.toMatchObject({code:"42501"});
 await expect(identity.query("SELECT identity.extra_customer_approval($1,$2,$3,$4,$5::jsonb)",[randomUUID(),f.s.jobId,f.actor,f.sd,f.command])).rejects.toMatchObject({code:"42501"});
 await expect(identity.query("SELECT identity.extra_customer_approval($1,$2,$3,$4,$5::jsonb)",[w.p.tenantId,f.s.jobId,w.client2.member.membershipId,f.sd,f.command])).rejects.toMatchObject({code:"42501"});
 await expect(f.use(f.signinDigest,"redeem")).rejects.toMatchObject({code:"42501"});
 await expect(f.use(f.sd,"resolve",w.client2.member.membershipId)).rejects.toMatchObject({code:"42501"});
 await expect(f.run({...f.command,revisionHash:"a".repeat(64)})).rejects.toMatchObject({message:"HASH_MISMATCH"});
 await expect(f.run({...f.command,netPence:150001})).rejects.toMatchObject({message:"HASH_MISMATCH"});
 expect(await unchangedFacts()).toEqual(before);
 const result=await f.run();expect(result).toMatchObject({state:"approved"});expect(await f.run()).toEqual(result);
 await expect(f.run({...f.command,commandId:randomUUID()})).rejects.toMatchObject({message:"LINK_REPLAYED"});
 const rows=await c.admin.query("SELECT actor_membership_id,actual_tester_reference FROM app.extra_approval_step_fact WHERE request_id=$1 AND actor_kind='client_approver'",[f.s.requestId]);
 expect(rows.rows).toHaveLength(1);expect(rows.rows[0].actor_membership_id).toBe(f.actor);expect(rows.rows[0].actual_tester_reference).toMatch(/^customer-session:/);
 expect(await f.run({version:"extra-customer.v1",action:"history",jobId:f.s.jobId})).toMatchObject({items:[{requestId:f.s.requestId,decision:"approve"}]});
});
it.each(["approve","reject"])("ENT-5 real identity %s commits while unrelated checks remain deferred",async decision=>{
 const f=await fixture();await f.use(f.signinDigest,"redeem");
 const db=await c.admin.connect();
 try {
  await db.query("BEGIN");await f.bindIdentity(db);
  // A real unrelated deferred FK must survive both the approval call and later statements.
  // SET CONSTRAINTS ALL IMMEDIATE would reject the first child inside that call.
  await db.query("CREATE TEMP TABLE approval_deferred_parent(id integer PRIMARY KEY) ON COMMIT DROP");
  await db.query("CREATE TEMP TABLE approval_deferred_child(parent_id integer REFERENCES approval_deferred_parent(id) DEFERRABLE INITIALLY DEFERRED) ON COMMIT DROP");
  await db.query("INSERT INTO approval_deferred_child VALUES(1)");
  const result=await f.run({...f.command,decision},f.sd,db);
  expect(result).toMatchObject({state:decision==="approve"?"approved":"rejected"});
  await db.query("INSERT INTO approval_deferred_child VALUES(2)");
  await db.query("INSERT INTO approval_deferred_parent VALUES(1),(2)");
  await db.query("COMMIT");
  expect((await c.admin.query("SELECT kind FROM app.extra_approval_outcome WHERE request_id=$1",[f.s.requestId])).rows)
   .toEqual([{kind:decision==="approve"?"approved":"rejected"}]);
  expect(await f.run({...f.command,decision})).toEqual(result);
 } catch(error) {await db.query("ROLLBACK");throw error;} finally {db.release();}
});
it("ENT-5 replaced, expired, foreign-job and revoked grants refuse",async()=>{
 const f=await fixture();await expect(f.use(f.signinDigest,"redeem",f.actor,randomUUID())).rejects.toMatchObject({code:"42501"});
 await f.repo.issueClientApproval(await testActorContext(c.admin, f.ctx, w.members.commercial_manager.member),w.members.commercial_manager.member,{...f.raw,commandId:randomUUID(),linkToken:newToken(),signinDigest:session});
 await expect(f.use(f.signinDigest,"redeem")).rejects.toMatchObject({code:"42501"});
 const expiredLink=await fixture();
 const owner=await c.admin.connect();
 try {await owner.query("BEGIN");await owner.query("SET LOCAL session_replication_role='replica'");
 await owner.query("UPDATE app.extra_client_link SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[expiredLink.sent.linkId]);await owner.query("COMMIT");
 } catch(e) {await owner.query("ROLLBACK");throw e;} finally {owner.release();}
 await expect(expiredLink.use(expiredLink.signinDigest,"redeem")).rejects.toMatchObject({code:"42501"});
 const expired=await fixture();
 // Owner fixture changes only the un-fingerprinted session, never production time.
 await expired.use(expired.signinDigest,"redeem");
 await c.admin.query("UPDATE app.extra_client_session SET issued_at=clock_timestamp()-interval '2 hours',expires_at=clock_timestamp()-interval '1 hour' WHERE tenant_id=$1 AND token_digest=$2",[w.p.tenantId,expired.sd]);
 await expect(expired.run()).rejects.toMatchObject({code:"42501"});
 const expiredDecide=await fixture();await expiredDecide.use(expiredDecide.signinDigest,"redeem");
 await c.admin.query("UPDATE app.extra_client_session SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND token_digest=$2",[w.p.tenantId,expiredDecide.sd]);
 const before=await unchangedFacts();await expect(expiredDecide.run()).rejects.toMatchObject({code:"42501"});expect(await unchangedFacts()).toEqual(before);
 const revoke=await fixture();await revoke.use(revoke.signinDigest,"redeem");
 await contractorCommand(c,w,{kind:"grant.revoke",grantId:w.members.client_approver.grant});
 await expect(revoke.run()).rejects.toMatchObject({code:"42501"});
});
it("ENT-5 client approve racing withdraw commits exactly one outcome",async()=>{
 // Independent world because the preceding refusal test revokes its client grant.
 w=await chainWorld(c);const f=await fixture();await f.use(f.signinDigest,"redeem");
 const results=await Promise.allSettled([f.run(),f.repo.withdrawExtra(await testActorContext(c.admin, f.ctx, w.members.supervisor.member),w.members.supervisor.member,{version:"withdraw-extra.v1",commandId:randomUUID(),jobId:f.s.jobId,extraId:f.s.extraId,reasonCode:"not_done"})]);
 expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
 expect((await c.admin.query("SELECT kind FROM app.extra_approval_outcome WHERE request_id=$1",[f.s.requestId])).rows).toHaveLength(1);
});

it.each([true,false])("LATER-SAFETY-60 customer timing matches contractor timing with proceed=%s",async proceeded=>{
 // Independent world: earlier refusal coverage deliberately revokes its client grant.
 w=await chainWorld(c);const f=await fixture();
 const {extraProceed}=await import("../src/extra-proceed.js");
 const {withTenant}=await import("../src/tenant-context.js");
 const {deriveVisitApprovalTiming,readExtraApprovalTiming}=await import("../src/extra-approval-timing.js");
 if(proceeded) await extraProceed(c.runtime,await testActorContext(c.admin,f.ctx,w.members.operative.member),w.members.operative.member,f.s.jobId,f.s.extraId,
  {version:"record-extra-proceed.v1",commandId:randomUUID(),requestId:f.s.requestId,reason:"Fictional work proceeded before client approval"});
 await f.use(f.signinDigest,"redeem");
 type TimingInputs={visit:Parameters<typeof deriveVisitApprovalTiming>[0]|null;requests:Parameters<typeof deriveVisitApprovalTiming>[1];
  facts:Parameters<typeof deriveVisitApprovalTiming>[2];workStatus:Parameters<typeof deriveVisitApprovalTiming>[4]|null;proceedIds?:string[]};
 const project=(timing:TimingInputs)=>deriveVisitApprovalTiming(timing.visit??undefined,timing.requests,timing.facts,f.s.requestId,timing.workStatus??undefined,timing.proceedIds??[]);
 const expected=proceeded?true:"not_derived";
 const contractor=await withTenant(c.runtime,f.ctx,db=>readExtraApprovalTiming(db,w.p.tenantId,f.s.jobId,f.s.extraId,f.s.requestId));
 expect(contractor.doneWithoutRequiredPreapproval).toBe(expected);
 for(const action of ["view","queue"]) {
  const response=await f.run({version:"extra-customer.v1",action,jobId:f.s.jobId,...(action==="view"?{requestId:f.s.requestId}:{})});
  const item=action==="queue"?response.items[0]:response;
  expect(item.requestId).toBe(f.s.requestId);
  expect(item.timingInputs.proceedIds).toEqual(proceeded?[f.s.requestId]:[]);
  expect(project(item.timingInputs).doneWithoutRequiredPreapproval).toBe(expected);
  expect(project(item.timingInputs)).toEqual(contractor);
 }
 // Real customer approval consumes the invitation. It cannot erase the proceed fact
 // in the same customer timing seam, nor reopen the consumed customer view/queue.
 await f.run();
 expect(await f.run({version:"extra-customer.v1",action:"queue",jobId:f.s.jobId})).toEqual({items:[]});
 await expect(f.run({version:"extra-customer.v1",action:"view",jobId:f.s.jobId,requestId:f.s.requestId})).rejects.toMatchObject({message:"LINK_REPLAYED"});
 const after=await withTenant(c.runtime,f.ctx,async db=>(await db.$client.query<{timing:TimingInputs}>(
  "SELECT app.xc_timing($1,$2,$3,$4) timing",[w.p.tenantId,f.s.jobId,f.s.extraId,f.s.requestId])).rows[0]!.timing);
 expect(after.facts.some(fact=>fact.step_role==="client_approver")).toBe(true);
 expect(project(after).doneWithoutRequiredPreapproval).toBe(expected);
 expect(project(after)).toEqual(await withTenant(c.runtime,f.ctx,db=>readExtraApprovalTiming(db,w.p.tenantId,f.s.jobId,f.s.extraId,f.s.requestId)));
});

// LP-6C-CLIENT-EXTRA-DECISION: privileged setup is confined to adversarial controls.
const clientBinder="app.lp6_bind_client_approver(uuid,uuid,uuid,text,text)";
async function rollbackControl(body:(db:PoolClient)=>Promise<void>) {
 const db=await c.admin.connect();
 try {await db.query("BEGIN");await body(db);} finally {await db.query("ROLLBACK");db.release();}
}
async function bindClient(db:PoolClient,f:Awaited<ReturnType<typeof fixture>>,overrides:unknown[]=[]) {
 const token=(await db.query("SELECT token_hash FROM app.extra_client_link WHERE tenant_id=$1 AND id=$2",[w.p.tenantId,f.sent.linkId])).rows[0].token_hash;
 await db.query("SET LOCAL ROLE jobguard_migration");
 return db.query("SELECT app.lp6_bind_client_approver($1,$2,$3,$4,$5) actor",overrides.length?overrides:[w.p.tenantId,f.s.jobId,f.actor,token,f.raw.recipient]);
}
async function unchangedFacts() {
 return (await c.admin.query(`SELECT
 (SELECT count(*)::int FROM app.command_receipt) receipts,
 (SELECT count(*)::int FROM app.command_lifecycle_claim) claims,
 (SELECT count(*)::int FROM app.action_outbox) outbox,
 (SELECT count(*)::int FROM control_plane.request_binding) bindings,
 (SELECT count(*)::int FROM app.extra_approval_step_fact) steps,
 (SELECT count(*)::int FROM app.extra_approval_outcome) outcomes,
 (SELECT count(*)::int FROM app.extra_client_command_session) sessions,
 (SELECT count(*)::int FROM app.audit_event) audits`)).rows[0];
}
async function assertOtherScopeRefused(db:PoolClient,f:Awaited<ReturnType<typeof fixture>>,type='IssueCustomerInvoice',job=f.s.jobId,tenant=w.p.tenantId) {
 // The exact scope guard runs before registry/permission/input-shape checks.
 await db.query("SELECT set_config('app.tenant_id',$1,true)",[tenant]);
 await expect(db.query("SELECT app.begin_command('repository-command.v1',$1,$2,$3,$4::jsonb,'{}',$5::jsonb)",
  [randomUUID(),type,randomUUID(),{tenantId:tenant,actorMembershipId:f.actor,subjectType:'job',subjectRef:job},
   {version:'repository-command.v1',actorMembershipId:f.actor,input:{jobId:job}}])).rejects.toMatchObject({code:'42501',message:'REQUEST_BINDING_REFUSED'});
}
it("LP-6c records the customer's own actor and delegated credential in the command claim",async()=>{
 w=await chainWorld(c);const f=await fixture();await f.use(f.signinDigest,'redeem');await f.run();
 expect((await c.admin.query("SELECT actor_membership_id,resource->>'credential_kind' credential_kind FROM app.command_lifecycle_claim WHERE tenant_id=$1 AND command_id=$2",[w.p.tenantId,f.command.commandId])).rows)
  .toEqual([{actor_membership_id:f.actor,credential_kind:'customer_portal_delegated'}]);
});
it.each(['type','job','tenant'] as const)("LP-6c delegated extra authority refuses another %s without writes",async field=>{
 w=await chainWorld(c);const f=await fixture();await f.use(f.signinDigest,'redeem');const before=await unchangedFacts();
 await rollbackControl(async db=>{await bindClient(db,f);
  await assertOtherScopeRefused(db,f,field==='type'?'IssueCustomerInvoice':'ClientDecideExtra',field==='job'?randomUUID():f.s.jobId,field==='tenant'?randomUUID():w.p.tenantId);
 });expect(await unchangedFacts()).toEqual(before);
});
it("LP-6c refuses a rebind and hides delegated identity from general actor access",async()=>{
 w=await chainWorld(c);const f=await fixture();await f.use(f.signinDigest,'redeem');const before=await unchangedFacts();
 await rollbackControl(async db=>{
  expect((await bindClient(db,f)).rows).toEqual([{actor:f.actor}]);
  expect((await db.query("SELECT app.current_actor() actor,app.current_tenant() tenant")).rows).toEqual([{actor:null,tenant:null}]);
  await db.query('RESET ROLE');
  expect((await db.query("SELECT actor_id,scope_job_id,scope_command_type,credential_kind,expires_at>clock_timestamp() AND expires_at<=clock_timestamp()+interval '1 minute' short_lived FROM control_plane.request_binding WHERE transaction_id=pg_current_xact_id()")).rows)
   .toEqual([{actor_id:f.actor,scope_job_id:f.s.jobId,scope_command_type:'ClientDecideExtra',credential_kind:'customer_portal_delegated',short_lived:true}]);
  await expect(bindClient(db,f)).rejects.toMatchObject({code:'42501',message:'REQUEST_BINDING_REFUSED'});
 });expect(await unchangedFacts()).toEqual(before);
});
it.each(['token','recipient','approver','job','tenant'] as const)("LP-6c binder refuses wrong %s without writes",async field=>{
 w=await chainWorld(c);const f=await fixture();await f.use(f.signinDigest,'redeem');const before=await unchangedFacts();
 await rollbackControl(async db=>{
  const token=(await db.query("SELECT token_hash FROM app.extra_client_link WHERE id=$1",[f.sent.linkId])).rows[0].token_hash;
  const args=[w.p.tenantId,f.s.jobId,f.actor,token,f.raw.recipient];
  args[{tenant:0,job:1,approver:2,token:3,recipient:4}[field]]=field==='token'?'0'.repeat(64):field==='recipient'?'other@example.invalid':randomUUID();
  await expect(bindClient(db,f,args)).rejects.toMatchObject({code:'42501',message:'CUSTOMER_REFUSED'});
 });expect(await unchangedFacts()).toEqual(before);
});
it("LP-6c binder has no PUBLIC, person-facing or login execute capability",async()=>{
 const acl=(await c.admin.query(`SELECT p.proowner::regrole::text owner,a.grantee::regrole::text grantee,a.privilege_type
 FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a WHERE p.oid=$1::regprocedure`,[clientBinder])).rows;
 expect(acl.sort((a,b)=>a.grantee.localeCompare(b.grantee))).toEqual([
  {owner:'jobguard_binding_owner',grantee:'jobguard_binding_owner',privilege_type:'EXECUTE'},
  {owner:'jobguard_binding_owner',grantee:'jobguard_migration',privilege_type:'EXECUTE'}]);
 for(const role of ['jobguard_runtime','jobguard_identity']) await rollbackControl(async db=>{
  await db.query(`SET LOCAL ROLE ${role}`);
  await expect(db.query("SELECT app.lp6_bind_client_approver($1,$2,$3,$4,$5)",[randomUUID(),randomUUID(),randomUUID(),'0'.repeat(64),'fictional@example.invalid'])).rejects.toMatchObject({code:'42501'});
 });
 const logins=(await c.admin.query("SELECT rolname FROM pg_roles WHERE rolcanlogin AND NOT rolsuper AND rolname NOT IN('jobguard_migration','jobguard_binding_owner')")).rows;
 for(const {rolname} of logins) expect((await c.admin.query("SELECT has_function_privilege($1,$2,'EXECUTE') allowed",[rolname,clientBinder])).rows[0].allowed).toBe(false);
});
it("mutation: removing command-type scope breaks the other-command refusal",async()=>{
 w=await chainWorld(c);const f=await fixture();await f.use(f.signinDigest,'redeem');
 await rollbackControl(async db=>{
  const original=(await db.query("SELECT pg_get_functiondef('app.lp6_delegated_actor(uuid,text,uuid)'::regprocedure) sql")).rows[0].sql as string;
  const mutant=original.replace('b.scope_command_type IS NOT DISTINCT FROM p_command_type','true');expect(mutant).not.toBe(original);await db.query(mutant);
  await bindClient(db,f);
  await expect(assertOtherScopeRefused(db,f)).rejects.toThrow();
 });
});
it("mutation: removing the private binder breaks a real unbound customer decision",async()=>{
 w=await chainWorld(c);const f=await fixture();await f.use(f.signinDigest,'redeem');const before=await unchangedFacts();
 await rollbackControl(async db=>{
  const original=(await db.query("SELECT pg_get_functiondef('identity.extra_customer_approval(uuid,uuid,uuid,text,jsonb)'::regprocedure) sql")).rows[0].sql as string;
  const mutant=original.replace('PERFORM app.lp6_bind_client_approver(t,j,c,k.token_hash,k.recipient);','NULL;');expect(mutant).not.toBe(original);await db.query(mutant);
  await f.bindIdentity(db);
  await expect(f.run(f.command,f.sd,db)).rejects.toMatchObject({code:'42501',message:'REQUEST_BINDING_REFUSED'});
 });expect(await unchangedFacts()).toEqual(before);
});
it("LP-6c catalogue identifies the approved binder; queue/view bind read-only ClientViewExtra and history stays unbound",async()=>{
 w=await chainWorld(c);const f=await fixture();await f.use(f.signinDigest,'redeem');
 const source=(await c.admin.query("SELECT prosrc FROM pg_proc WHERE oid='identity.extra_customer_approval(uuid,uuid,uuid,text,jsonb)'::regprocedure")).rows[0].prosrc as string;
 expect(source.match(/PERFORM app\.lp6_bind_client_approver\(/gu)).toHaveLength(1);
 // Checker r11 (option 1): the read-only queue/view binds exactly one ClientViewExtra request for this job.
 expect(source.match(/PERFORM app\.lp6d_bind_client_viewer\(/gu)).toHaveLength(1);
 for(const action of ['queue','view','history']) await rollbackControl(async db=>{
  await f.bindIdentity(db);
  await f.run({version:'extra-customer.v1',jobId:f.s.jobId,action,...(action==='view'?{requestId:f.s.requestId}:{})},f.sd,db);
  await db.query('RESET ROLE');
  const rows=(await db.query('SELECT credential_kind,scope_command_type,scope_job_id,actor_id,expires_at<=clock_timestamp()+interval \'1 minute\' short FROM control_plane.request_binding WHERE transaction_id=pg_current_xact_id()')).rows;
  expect(rows).toEqual(action==='history'?[]:[{credential_kind:'customer_portal_delegated',scope_command_type:'ClientViewExtra',scope_job_id:f.s.jobId,actor_id:f.actor,short:true}]);
 });
});
// Checker r11: ClientViewExtra reaches only the read-only status reader, for its own job and tenant, while live.
async function delegated(db:PoolClient,tenant:string,job:string,actor:string,scope:string,expires="1 minute") {
 await db.query("SELECT set_config('app.tenant_id',$1,true)",[w.p.tenantId]);
 await db.query(`INSERT INTO control_plane.request_binding(environment_id,transaction_id,credential_kind,session_ref,tenant_id,actor_id,expires_at,scope_job_id,scope_command_type)
  VALUES(extract(epoch FROM pg_postmaster_start_time())::text||':'||(SELECT d.oid::text FROM pg_catalog.pg_database d WHERE d.datname=current_database()),
   pg_current_xact_id(),'customer_portal_delegated','lp6d-fixture',$1,$2,clock_timestamp()+$5::interval,$3,$4)`,[tenant,actor,job,scope,expires]);
}
const workStatus=(db:PoolClient,job:string)=>db.query("SELECT app.ent3_extra_work_status($1,$2) status",[job,randomUUID()]);
it("ClientViewExtra reads extra work status only for its own job and tenant while live; it never decides",async()=>{
 w=await chainWorld(c);const f=await fixture();
 await rollbackControl(async db=>{await delegated(db,w.p.tenantId,f.s.jobId,f.actor,'ClientViewExtra');
  expect((await workStatus(db,f.s.jobId)).rows).toEqual([{status:null}]);});
 const refused={code:'42501',message:'REQUEST_BINDING_REFUSED'};
 const cases:[string,(db:PoolClient)=>Promise<void>,string][]= [
  ['wrong job',db=>delegated(db,w.p.tenantId,randomUUID(),f.actor,'ClientViewExtra'),f.s.jobId],
  ['wrong scope',db=>delegated(db,w.p.tenantId,f.s.jobId,f.actor,'ClientDecideExtra'),f.s.jobId],
  ['other tenant',db=>delegated(db,randomUUID(),f.s.jobId,f.actor,'ClientViewExtra'),f.s.jobId],
 ];
 for(const [name,bind,job] of cases) await rollbackControl(async db=>{await bind(db);
  await expect(workStatus(db,job),name).rejects.toMatchObject(refused);});
 // Expired: the binding row exists but is past its expiry.
 await rollbackControl(async db=>{await delegated(db,w.p.tenantId,f.s.jobId,f.actor,'ClientViewExtra','-1 second');
  await expect(workStatus(db,f.s.jobId),'expired').rejects.toMatchObject(refused);});
 // No decide routine accepts ClientViewExtra: the decide-path guards refuse before any lookup.
 for(const call of ["SELECT app.xa_covers($1,ARRAY['client_approver'],$2,'extra.approve')","SELECT app.xa_begin($2,gen_random_uuid(),ARRAY['ClientDecideExtra'],$1)"])
  await rollbackControl(async db=>{await delegated(db,w.p.tenantId,f.s.jobId,f.actor,'ClientViewExtra');
   await expect(db.query(call,[f.actor,f.s.jobId]),call).rejects.toMatchObject(refused);});
});
