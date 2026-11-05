import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, expect, it } from "vitest";
import { ExtraApprovalRepository } from "../src/index.js";
import { cluster, chainWorld, submitted, approveInput, emailOf, newToken, type Cluster, type ChainWorld } from "./extra-approval-chain-fixtures.js";
import { command as contractorCommand } from "./site-extra-fixtures.js";
let c:Cluster,w:ChainWorld;
beforeAll(async()=>{c=await cluster();w=await chainWorld(c);},120000);
afterAll(async()=>{await c?.close();});
const d="d".repeat(64),session="e".repeat(64);
async function fixture() {
 const repo=new ExtraApprovalRepository(c.runtime),ctx=await w.ctx,s=await submitted(c,w,150000);
 await repo.approveExtraStep(ctx,w.members.supervisor.member,approveInput(s,0));await repo.approveExtraStep(ctx,w.supervisor2.member,approveInput(s,1));
 const token=newToken(),signinDigest=randomUUID().replaceAll("-","").repeat(2),sd=randomUUID().replaceAll("-","").repeat(2),actor=w.members.client_approver.member.membershipId;
 const raw={version:"issue-client-approval.v1",commandId:randomUUID(),jobId:s.jobId,requestId:s.requestId,approverMembershipId:actor,recipient:await emailOf(c,w,actor),linkToken:token,signinDigest,expiresAt:new Date(Date.now()+7*86400000)};
 await expect(repo.issueClientApproval(ctx,w.members.owner.member,raw)).rejects.toMatchObject({code:"PERMISSION_DENIED"});
 const sent=await repo.issueClientApproval(ctx,w.members.surveyor.member,raw);
 expect((await c.admin.query("SELECT adapter,recipient,status FROM app.action_outbox WHERE id=$1",[sent.outboxActionId])).rows).toEqual([{adapter:"fake_email",recipient:raw.recipient,status:"pending"}]);
 expect((await c.admin.query("SELECT 1 FROM app.action_attempt WHERE action_id=$1",[sent.outboxActionId])).rows).toEqual([]);
 const use=(digest:string,operation="resolve",who=actor,job=s.jobId,tenant=w.p.tenantId)=>c.admin.query("SELECT identity.extra_customer_use($1,$2,$3,$4,$5,$6) result",[tenant,job,who,digest,operation==="redeem"?sd:null,operation]).then(r=>r.rows[0].result);
 const command={version:"extra-customer.v1",action:"decide",jobId:s.jobId,requestId:s.requestId,commandId:randomUUID(),revisionHash:s.hash,netPence:s.net,decision:"approve"};
 const run=(input:unknown=command,digest=sd)=>c.admin.query("SELECT identity.extra_customer_approval($1,$2,$3,$4,$5::jsonb) result",[w.p.tenantId,s.jobId,actor,digest,input]).then(r=>r.rows[0].result);
 return {repo,ctx,s,sent,raw,actor,signinDigest,sd,use,command,run};
}
it("ENT-5 sign-in requires a fresh link and current scoped named grant; replay is one effect",async()=>{
 const f=await fixture();await expect(f.run(f.command,d)).rejects.toMatchObject({code:"42501"});
 expect(await f.use(f.signinDigest,"redeem")).toMatchObject({extraApprover:true});
 await expect(f.run({...f.command,requestId:randomUUID()})).rejects.toMatchObject({code:"42501"});
 await expect(c.admin.query("SELECT identity.extra_customer_approval($1,$2,$3,$4,$5::jsonb)",[randomUUID(),f.s.jobId,f.actor,f.sd,f.command])).rejects.toMatchObject({code:"42501"});
 await expect(c.admin.query("SELECT identity.extra_customer_approval($1,$2,$3,$4,$5::jsonb)",[w.p.tenantId,f.s.jobId,w.client2.member.membershipId,f.sd,f.command])).rejects.toMatchObject({code:"42501"});
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
it("ENT-5 replaced, expired, foreign-job and revoked grants refuse",async()=>{
 const f=await fixture();await expect(f.use(f.signinDigest,"redeem",f.actor,randomUUID())).rejects.toMatchObject({code:"42501"});
 await f.repo.issueClientApproval(f.ctx,w.members.commercial_manager.member,{...f.raw,commandId:randomUUID(),linkToken:newToken(),signinDigest:session});
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
 const results=await Promise.allSettled([f.run(),f.repo.withdrawExtra(f.ctx,w.members.supervisor.member,{version:"withdraw-extra.v1",commandId:randomUUID(),jobId:f.s.jobId,extraId:f.s.extraId,reasonCode:"not_done"})]);
 expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
 expect((await c.admin.query("SELECT kind FROM app.extra_approval_outcome WHERE request_id=$1",[f.s.requestId])).rows).toHaveLength(1);
});
