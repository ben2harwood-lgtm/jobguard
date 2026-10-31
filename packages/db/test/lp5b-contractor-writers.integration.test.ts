import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { ExtraRepository } from "../src/extra-repository.js";
import { ExtraApprovalRepository } from "../src/extra-approval-chain-repository.js";
import { SiteVisitRepository } from "../src/site-visit-repository.js";
import { beginRepositoryCommand, completeRepositoryCommand } from "../src/repository-command.js";
import { withTenant } from "../src/tenant-context.js";
import { canonicalJson } from "../src/work-order-repository.js";
import { cluster, fixture, raise, type Cluster } from "./extra-fixtures.js";
import { chainWorld, submitted, approveInput, command } from "./extra-approval-chain-fixtures.js";
import { visitFixture, startInput, completeInput } from "./site-visit-fixtures.js";
let db: Cluster;
beforeAll(async () => { db=await cluster(); }, 300_000);
afterAll(async () => { await db?.close(); });

it("LP-5b primitive capture first/replay/conflict and duplicate client captures keep the same result", async () => {
 const f=await fixture(db), repo=new ExtraRepository(db.runtime), input=raise(f,{clientCaptureId:randomUUID()});
 const first=await repo.raiseExtra(f.ctx,input);
 expect(await repo.raiseExtra(f.ctx,input)).toEqual(first);
 const retry={...input,commandId:randomUUID()};
 expect(await repo.raiseExtra(f.ctx,retry)).toEqual(first);
 expect(await repo.raiseExtra(f.ctx,retry)).toEqual(first);
 const completion=(await db.admin.query("SELECT payload->'references' refs FROM app.audit_event WHERE tenant_id=$1 AND event_type='command.succeeded' AND payload->'references'->>'commandId'=$2",[f.p.tenantId,retry.commandId])).rows;
 expect(completion).toEqual([{refs:expect.objectContaining({outcome:"succeeded_noop",reason:"client_capture_already_exists"})}]);
 await expect(repo.raiseExtra(f.ctx,{...retry,note:"Different fictional capture"})).rejects.toMatchObject({code:"COMMAND_CONFLICT"});
 expect((await db.admin.query("SELECT count(*)::int n FROM app.extra_origin WHERE tenant_id=$1 AND client_capture_id=$2",[f.p.tenantId,input.clientCaptureId])).rows[0].n).toBe(1);
 await db.admin.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2",[f.p.tenantId,f.p.membershipId]);
 await expect(repo.raiseExtra(f.ctx,retry)).rejects.toMatchObject({code:"NOT_FOUND"});
});

it("LP-5b approval replay checks the original step's current grant and cannot repeat the effect", async () => {
 const w=await chainWorld(db), repo=new ExtraApprovalRepository(db.runtime), s=await submitted(db,w,40000);
 const input=approveInput(s,0), actor=w.members.supervisor.member;
 const first=await repo.approveExtraStep(w.ctx,actor,input);
 expect(await repo.approveExtraStep(w.ctx,actor,input)).toEqual(first);
 await expect(repo.approveExtraStep(w.ctx,actor,{...input,netPence:40001})).rejects.toMatchObject({code:"COMMAND_CONFLICT"});
 expect((await db.admin.query("SELECT count(*)::int n FROM app.extra_approval_step_fact WHERE tenant_id=$1 AND command_id=$2",[w.p.tenantId,input.commandId])).rows[0].n).toBe(1);
 await command(db,w,{kind:"grant.revoke",grantId:w.members.supervisor.grant});
 await expect(repo.approveExtraStep(w.ctx,actor,input)).rejects.toMatchObject({code:"PERMISSION_DENIED"});
});

it("LP-5b visits preserve microsecond result DTOs, conflicts and current membership on replay", async () => {
 const f=await visitFixture(db), repo=new SiteVisitRepository(db.runtime), actor=f.members.operative.member;
 const start=startInput(f), first=await repo.startVisit(f.ctx,actor,start);
 expect(await repo.startVisit(f.ctx,actor,start)).toEqual(first);
 const complete=completeInput(f,first.visitId), result=await repo.completeVisit(f.ctx,actor,complete);
 expect(await repo.completeVisit(f.ctx,actor,complete)).toEqual(result);
 expect(result).toEqual({visitId:first.visitId,completedAt:expect.stringMatching(/\.\d{6}Z$/),closeoutAnswer:"yes"});
 await expect(repo.completeVisit(f.ctx,actor,{...complete,closeoutAnswer:"no"})).rejects.toMatchObject({code:"IDEMPOTENCY_CONFLICT"});
 await db.admin.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2",[f.p.tenantId,actor.membershipId]);
 await expect(repo.startVisit(f.ctx,actor,start)).rejects.toMatchObject({code:"VISIT_FORBIDDEN"});
 await expect(repo.completeVisit(f.ctx,actor,complete)).rejects.toMatchObject({code:"VISIT_FORBIDDEN"});
});

it("LP-5b unknown types and completion without each contractor effect are refused and rolled back", async () => {
 const w=await chainWorld(db), f=await visitFixture(db);
 for(const [context,actor,job,type,input] of [
  [w.ctx,w.members.supervisor.member.membershipId,w.jobId,"SubmitExtra",{type:"SubmitExtra",actor:w.members.supervisor.member.membershipId,content:{jobId:w.jobId,extraId:randomUUID()}}],
  [f.ctx,f.members.operative.member.membershipId,f.jobId,"StartSiteVisit",{commandType:"StartSiteVisit",jobId:f.jobId,membershipId:f.members.operative.member.membershipId}],
  [w.ctx,w.members.owner.member.membershipId,w.jobId,"RecordOfficeExtra",{version:"raise-extra.v1",commandType:"RecordOfficeExtra",jobId:w.jobId,actorMembershipId:w.members.owner.member.membershipId,grantId:w.members.owner.grant,note:"Fictional",description:"Fictional"}],
 ] as const){
  for(const commandType of [type,"unknown.contractor.command"]){
   const commandId=randomUUID();
   await expect(withTenant(db.runtime,context,async tx=>{
    await beginRepositoryCommand(tx,{tenantId:context.tenantId,actorMembershipId:actor,commandId,commandType,
     semanticKey:commandId,jobId:job,legacyJson:canonicalJson(input)});
    await completeRepositoryCommand(tx,commandId);
   })).rejects.toMatchObject({message:commandType===type?"AUTHORIZATION_INVALID":actor===w.members.owner.member.membershipId?"AUTHORIZATION_INVALID":"FORBIDDEN"});
   expect((await db.admin.query("SELECT 1 FROM app.command_receipt WHERE command_id=$1",[commandId])).rowCount).toBe(0);
  }
 }
});
