import { createHash } from "node:crypto";
import { UserCommandDispatcher } from "../src/commands.js";
import { afterAll, expect, it } from "vitest";
import { startBeforeMigration, applyMigration } from "./contractor-practice-session-fixtures.js";
import { fixture, newCase, command, type Cluster } from "./managed-recovery-fixtures.js";
import { ManagedRecoveryRepository } from "../src/managed-recovery-repository.js";
import { migrate } from "../src/migrate.js";
let c: Cluster;
afterAll(async()=>{await c?.close();});
it('upgrades from the immediate predecessor, revokes the bypass and preserves stored elections',async()=>{
 c=await startBeforeMigration('0583_managed_recovery_actor_bind.sql');
 const f=await fixture(c),id=await newCase(c,f);
 const input=command(id);
 const contentHash=createHash('sha256').update(['managed-recovery-election-command.v1',f.job,id,
  input.selection.service,input.selection.points,input.termsVersion].join('\n')).digest('hex');
 // The previously exposed signature creates a genuine pre-upgrade election.
 await new UserCommandDispatcher(c.runtime).dispatch(f.context,{
  version:'command.v1',commandId:input.commandId,commandType:'managed_recovery.elect',
  semanticKey:`managed-recovery:${f.job}:${id}`,actorMembershipId:f.actor.membershipId,
  subjectType:'recovery_case',subjectRef:id,
  action:{actionType:'managed_recovery.elect',recipient:null,contentHash,aggregateRevision:1,
   amountPence:null,currency:null,policyVersion:input.termsVersion,expiresAt:new Date('2099-01-01T00:00:00Z')},
 },{mutate:async(db,authorized)=>(await db.$client.query(
  'SELECT * FROM app.mon9_elect($1,$2,$3,$4,$5,$6,$7,$8)',
  [f.job,id,f.actor.membershipId,input.commandId,authorized.authorizationId,
   input.selection.service,input.selection.points,input.termsVersion])).rows[0]});
 const history=()=>c.admin.query('SELECT to_jsonb(e) row FROM app.managed_recovery_election e ORDER BY tenant_id,case_id');
 const before=(await history()).rows;
 const old='app.mon9_elect(uuid,uuid,uuid,uuid,uuid,text,integer,text)';
 const bound='app.mon9_elect(text,uuid,uuid,uuid,uuid,uuid,text,integer,text)';
 expect((await c.admin.query("SELECT has_function_privilege('jobguard_runtime',$1,'EXECUTE') allowed",[old])).rows[0].allowed).toBe(true);
 await applyMigration(c,'0583_managed_recovery_actor_bind.sql');
 expect((await history()).rows).toEqual(before);
 expect((await c.admin.query("SELECT has_function_privilege('jobguard_runtime',$1,'EXECUTE') old,has_function_privilege('jobguard_runtime',$2,'EXECUTE') bound",[old,bound])).rows).toEqual([{old:false,bound:true}]);
 const fresh=await newCase(c,f);
 await new ManagedRecoveryRepository(c.runtime,f.sessionDigest).elect(f.context,f.job,command(fresh),f.actor);
 const elected=(await history()).rows;
 await migrate(c.admin);
 expect((await history()).rows).toEqual(elected);
},120000);
