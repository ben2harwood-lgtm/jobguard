import { afterEach, describe, expect, it, vi } from "vitest";
import { Pool } from "pg";
import { ContractorApplication, contractorHttpStatus } from "./contractor.application.js";
const prior=process.env.JOBGUARD_ENV;
afterEach(()=>{if(prior===undefined)delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=prior;});
describe('contractor application boundaries',()=>{
 it('refuses production/pilot initialization and forged synthetic requests before database access',async()=>{
  const app=new ContractorApplication(new Pool());
  for(const mode of ['production_billing','pilot_no_charge']){process.env.JOBGUARD_ENV=mode;await expect(app.start({version:'contractor-principal.v1',sessionId:'11111111-1111-4111-8111-111111111111'},{version:'contractor-practice.v1',environment:'synthetic_demo'})).rejects.toMatchObject({code:'MODE_FORBIDDEN'});}
 });
 it('rejects absent/malformed authentication and malformed queries before database access',async()=>{
  process.env.JOBGUARD_ENV='synthetic_demo';const app=new ContractorApplication(new Pool());
  await expect(app.resume(null)).rejects.toMatchObject({code:'UNAUTHENTICATED'});
  await expect(app.start({version:'contractor-principal.v1',sessionId:'11111111-1111-4111-8111-111111111111'},{version:'contractor-practice.v1',environment:'production_billing'})).rejects.toMatchObject({code:'INVALID_COMMAND'});
  await expect(app.read({version:'contractor-principal.v1',sessionId:'11111111-1111-4111-8111-111111111111'},{tenantId:'not-a-uuid'})).rejects.toMatchObject({code:'INVALID_COMMAND'});
  expect(contractorHttpStatus({code:'STALE_REVISION'})).toBe(409);expect(contractorHttpStatus({code:'NOT_FOUND'})).toBe(404);expect(contractorHttpStatus({code:'INVALID_RULE_DOCUMENT'})).toBe(422);
 });
});

describe('invalid contractor role/scope boundary',()=>{
 it('returns typed 422 for invitations and grants without executing a database command',async()=>{
  process.env.JOBGUARD_ENV='synthetic_demo';
  const id='11111111-1111-4111-8111-111111111111';
  const pool={query:vi.fn(async()=>({rows:[{tenant_id:id,membership_id:id,identity_user_id:id}]})),connect:vi.fn(async()=>{throw new Error('must not execute SQL for invalid input');})};
  const app=new ContractorApplication(pool as unknown as Pool);
  for(const kind of ['member.invite','grant.create'])for(const fields of [
   {role:'finance',scope:{kind:'team',id},contractId:null},
   {role:'operative',scope:{kind:'client',id},contractId:null},
   {role:'client_approver',scope:{kind:'tenant',id},contractId:null},
   {role:'supervisor',scope:{kind:'branch',id},contractId:id},
  ]){
   const raw={version:'contractor-command.v1',environment:'synthetic_demo',commandId:id,id,expectedRevision:0,kind,...fields,...(kind==='member.invite'?{email:'member@fictional.invalid',clientId:fields.role==='client_approver'?id:null}:{membershipId:id})};
   const error=await app.command({version:'contractor-principal.v1',sessionId:id},raw).catch(e=>e);
   expect(error).toMatchObject({code:'INVALID_COMMAND'});expect(contractorHttpStatus(error)).toBe(422);
  }
  expect(pool.connect).not.toHaveBeenCalled();
 });
});
