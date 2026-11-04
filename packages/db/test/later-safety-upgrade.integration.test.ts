import { createHash } from "node:crypto";
import { UserCommandDispatcher } from "../src/commands.js";
import { withTenant } from "../src/tenant-context.js";
import { readFile } from "node:fs/promises";
import { afterAll, expect, it } from "vitest";
import { startBeforeMigration, applyMigration } from "./contractor-practice-session-fixtures.js";
import { fixture, newCase, command, type Cluster } from "./managed-recovery-fixtures.js";
import { ManagedRecoveryRepository } from "../src/managed-recovery-repository.js";
import { proofBefore, proofDifferences } from "./upgrade-proof-utils.js";
let c:Cluster;
afterAll(async()=>{await c?.close();});
it("0960-0962 preserve stored rows and exact replay through repeat application",async()=>{
 c=await startBeforeMigration("0970_mon9_database_gate.sql");
 const f=await fixture(c),id=await newCase(c,f),input=command(id);
 const repo=new ManagedRecoveryRepository(c.runtime,f.sessionDigest);
 const first=await repo.elect(f.context,f.job,input,f.actor);
 const before=await proofBefore(c.admin,["app.managed_recovery_election","app.command_receipt","app.action_authorization","app.audit_event"]);
 for(const name of ["0970_mon9_database_gate.sql","0971_success_fee_changed_proof.sql","0972_payment_fee_current_review.sql"]){
  await applyMigration(c,name);
  await c.admin.query(await readFile(new URL(`../migrations/${name}`,import.meta.url),"utf8"));
 }
 expect(await proofDifferences(c.admin,before)).toEqual({rows:[],types:[]});
 expect(await repo.elect(f.context,f.job,input,f.actor)).toEqual(first);
},120000);

it("MON-9 refuses a differently named database before election or command history changes",async()=>{
 await c.close();
 c=await startBeforeMigration("0970_mon9_database_gate.sql","jobguard_later_safety_test");
 const f=await fixture(c),id=await newCase(c,f),input=command(id);
 const contentHash=createHash("sha256").update(["managed-recovery-election-command.v1",f.job,id,input.selection.service,input.selection.points,input.termsVersion].join("\n")).digest("hex");
 let authorizationId="";
 const args=()=>[f.job,id,f.actor.membershipId,input.commandId,authorizationId,input.selection.service,input.selection.points,input.termsVersion];
 // Genuine predecessor authorization/election proves the old private overload
 // admitted this database; after upgrade even its exact replay must refuse.
 await new UserCommandDispatcher(c.admin).dispatch(f.context,{
  version:"command.v1",commandId:input.commandId,commandType:"managed_recovery.elect",semanticKey:`managed-recovery:${f.job}:${id}`,
  actorMembershipId:f.actor.membershipId,subjectType:"recovery_case",subjectRef:id,
  action:{actionType:"managed_recovery.elect",recipient:null,contentHash,aggregateRevision:1,amountPence:null,currency:null,policyVersion:input.termsVersion,expiresAt:new Date("2099-01-01")},
 },{mutate:async(db,authorized)=>{
  authorizationId=authorized.authorizationId;
  return (await db.$client.query("SELECT * FROM app.mon9_elect($1,$2,$3,$4,$5,$6,$7,$8)",args())).rows[0];
 }});
 await applyMigration(c,"0970_mon9_database_gate.sql");
 const before=await proofBefore(c.admin,["app.managed_recovery_election","app.command_receipt","app.action_authorization","app.audit_event"]);
 await expect(c.runtime.query("SELECT * FROM app.mon9_elect($1,$2,$3,$4,$5,$6,$7,$8,$9)",[f.sessionDigest,f.job,id,f.actor.membershipId,input.commandId,input.commandId,input.selection.service,input.selection.points,input.termsVersion])).rejects.toMatchObject({code:"42501",message:"MANAGED_RECOVERY_FORBIDDEN"});
 await expect(withTenant(c.admin,f.context,db=>db.$client.query("SELECT * FROM app.mon9_elect($1,$2,$3,$4,$5,$6,$7,$8)",args()))).rejects.toMatchObject({code:"42501",message:"MANAGED_RECOVERY_FORBIDDEN"});
 expect(await proofDifferences(c.admin,before)).toEqual({rows:[],types:[]});
},120000);
