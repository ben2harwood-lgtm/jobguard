import { testActorContext, testBoundTenantContext } from "./tenant-context-test-utils.js";
import { Pool, type PoolClient } from "pg";
import { createHash, randomUUID } from "node:crypto";
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
 const credential=createHash("sha256").update(`lp6-test:${w.p.tenantId}:${actor}`).digest("hex");
 await testBoundTenantContext(c.admin,w.p.tenantId,actor,credential);
 const bindIdentity=async(db:PoolClient)=>{
  await db.query("SELECT app.bind_request('real',$1,$2)",[credential,w.p.tenantId]);
  await db.query("SET LOCAL ROLE jobguard_identity");
  expect((await db.query("SELECT current_user")).rows[0].current_user).toBe("jobguard_identity");
 };
 const run=async(input:unknown=command,digest=sd,db:Pool|PoolClient=identity):Promise<any>=>{
  if(db!==identity)return (await db.query("SELECT identity.extra_customer_approval($1,$2,$3,$4,$5::jsonb) result",[w.p.tenantId,s.jobId,actor,digest,input])).rows[0].result;
  const client=await c.admin.connect();
  try{await client.query("BEGIN");await bindIdentity(client);const result=await run(input,digest,client);await client.query("COMMIT");return result;}
  catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
 };
 return {repo,ctx,s,sent,raw,actor,signinDigest,sd,use,command,run,bindIdentity};
}
it("ENT-5 sign-in requires a fresh link and current scoped named grant; replay is one effect",async()=>{
 const f=await fixture();await expect(f.run(f.command,d)).rejects.toMatchObject({code:"42501"});
 expect(await f.use(f.signinDigest,"redeem")).toMatchObject({extraApprover:true});
 await expect(f.run({...f.command,requestId:randomUUID()})).rejects.toMatchObject({code:"42501"});
 await expect(identity.query("SELECT identity.extra_customer_approval($1,$2,$3,$4,$5::jsonb)",[randomUUID(),f.s.jobId,f.actor,f.sd,f.command])).rejects.toMatchObject({code:"42501"});
 await expect(identity.query("SELECT identity.extra_customer_approval($1,$2,$3,$4,$5::jsonb)",[w.p.tenantId,f.s.jobId,w.client2.member.membershipId,f.sd,f.command])).rejects.toMatchObject({code:"42501"});
 await expect(f.use(f.signinDigest,"redeem")).rejects.toMatchObject({code:"42501"});
 await expect(f.use(f.sd,"resolve",w.client2.member.membershipId)).rejects.toMatchObject({code:"42501"});
 await expect(f.run({...f.command,revisionHash:"a".repeat(64)})).rejects.toMatchObject({message:"HASH_MISMATCH"});
 await expect(f.run({...f.command,netPence:150001})).rejects.toMatchObject({message:"HASH_MISMATCH"});
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
