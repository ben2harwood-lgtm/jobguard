import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { electManagedRecovery } from "@jobguard/core";
import { ManagedRecoveryRepository } from "../src/managed-recovery-repository.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
const tenantId=randomUUID(),jobId=randomUUID(),caseId=randomUUID(),membershipId=randomUUID(),identityUserId=randomUUID();
const command={version:'managed-recovery-election-command.v1',commandId:randomUUID(),caseId,termsVersion:'managed-recovery.synthetic-terms.v1',selection:{service:'drafted_for_you',points:5}};
const actor={membershipId,identityUserId};
function pool(elected=false,principal='80000') {
 const statements: string[]=[];
 const client={release:()=>undefined,query:async (sql:string)=>{
  statements.push(sql);
  if (sql.startsWith('SELECT id FROM app.membership') || sql.startsWith('SELECT c.id FROM app.recovery_case')) return {rows:[{id:membershipId}],rowCount:1};
  if (sql.startsWith('SELECT\n')) return {rows:[{principal,started_at:null,election:elected?{
   tenant_id:tenantId,job_id:jobId,case_id:caseId,command_id:command.commandId,actor_membership_id:membershipId,
   terms_version:command.termsVersion,service:'drafted_for_you',points:5,elected_at:'2026-10-30T12:00:00Z',
  }:null}]};
  return {rows:[]};
 }};
 return {pool:{connect:async()=>client} as unknown as Pool,statements};
}
describe('MON-9 repository boundary (fake source; PostgreSQL proof is separate)',()=>{
 it('uses stored qualifying principal only and the core election/fee projection',async()=>{
  const a=pool(),b=pool(true);
  const before=await new ManagedRecoveryRepository(a.pool).preview(testTenantContext(tenantId),jobId,caseId,actor);
  const after=await new ManagedRecoveryRepository(b.pool).preview(testTenantContext(tenantId),jobId,caseId,actor);
  expect(before.serviceChargeInvoice).toBeNull();expect(after.successFee).toEqual(before.successFee);
  expect(after.serviceChargeInvoice?.principal.pence).toBe(4000);
  expect(after.serviceChargeInvoice?.electionHash).toBe(electManagedRecovery({version:'managed-recovery-state.v1',environment:'synthetic_demo',tenantId,jobId,caseId,election:null,pursuitStartedAt:null},command,
   {environment:'synthetic_demo',tenantId,jobId,caseId,actorMembershipId:membershipId,canApprove:true,now:'2026-10-30T12:00:00.000Z'}).election?.bindingHash);
  expect(b.statements.some(s=>/INSERT|UPDATE|DELETE/u.test(s))).toBe(false);
 });
 it.each(['0','60000','10','30'])('projects current stored net after reversals (%s)',async principal=>{
  const a=pool(true,principal),b=pool(false,principal);
  const after=await new ManagedRecoveryRepository(a.pool).preview(testTenantContext(tenantId),jobId,caseId,actor);
  const before=await new ManagedRecoveryRepository(b.pool).preview(testTenantContext(tenantId),jobId,caseId,actor);
  expect(after.successFee).toEqual(before.successFee);expect(before.serviceChargeInvoice).toBeNull();
  expect(after.serviceChargeInvoice?.principal.pence).toBe(principal==='60000'?3000:principal==='30'?2:0);
 });
 it('rejects changed terms and injected money/tenant fields before connecting',async()=>{
  const a=pool(),repo=new ManagedRecoveryRepository(a.pool);
  for(const extra of [{termsVersion:'changed'},{tenantId},{principal:100000},{amountPence:1000},{selection:{service:'drafted_for_you',points:10}}])
   await expect(repo.elect(testTenantContext(tenantId),jobId,{...command,...extra},actor)).rejects.toThrow();
  expect(a.statements).toEqual([]);
 });
 it('refuses fabricated tenant contexts and rolls back an invalid stored principal',async()=>{
  const a=pool(true,'-1');
  await expect(new ManagedRecoveryRepository(a.pool).preview({tenantId} as ReturnType<typeof testTenantContext>,jobId,caseId,actor)).rejects.toMatchObject({code:'INVALID_TENANT_CONTEXT'});
  expect(a.statements).toEqual([]);
  await expect(new ManagedRecoveryRepository(a.pool).preview(testTenantContext(tenantId),jobId,caseId,actor)).rejects.toThrow();
  expect(a.statements.at(-1)).toBe('ROLLBACK');
 });
});
