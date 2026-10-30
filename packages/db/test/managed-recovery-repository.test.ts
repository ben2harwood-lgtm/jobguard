import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { electManagedRecovery } from "@jobguard/core";
import { ManagedRecoveryRepository } from "../src/managed-recovery-repository.js";
import { UserCommandDispatcher } from "../src/commands.js";
import { withTenant } from "../src/tenant-context.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
const tenantId=randomUUID(),jobId=randomUUID(),caseId=randomUUID(),membershipId=randomUUID(),identityUserId=randomUUID();
const command={version:'managed-recovery-election-command.v1',commandId:randomUUID(),caseId,termsVersion:'managed-recovery.synthetic-terms.v1',selection:{service:'drafted_for_you',points:5}};
const actor={membershipId,identityUserId};
const sessionDigest="a".repeat(64);
function pool(elected=false,principal='80000') {
 const statements: string[]=[];
 const client={release:()=>undefined,query:async (sql:string)=>{
  statements.push(sql);
  if (sql.startsWith('SELECT role FROM app.membership')) return {rows:[{role:'owner'}],rowCount:1};
  if (sql.startsWith('SELECT app.mon9_session')) return {rows:[{identity_user_id:identityUserId}],rowCount:1};
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
 it.each(['elect','preview'] as const)('refuses forged identity before %s can read or replay',async operation=>{
  const a=pool(),repo=new ManagedRecoveryRepository(a.pool,sessionDigest);
  const forged={...actor,identityUserId:randomUUID()};
  const request=operation==='elect'?repo.elect(testTenantContext(tenantId),jobId,command,forged):repo.preview(testTenantContext(tenantId),jobId,caseId,forged);
  await expect(request).rejects.toMatchObject({code:'MANAGED_RECOVERY_FORBIDDEN'});
  expect(a.statements.some(s=>s.startsWith('SELECT id FROM app.membership')||s.includes('app.command_receipt')||s.includes('app.recovery_case'))).toBe(false);
  expect(a.statements.some(s=>s.includes('app.mon9_session'))).toBe(true);
  expect(a.statements.at(-1)).toBe('ROLLBACK');
 });
 it('keeps the normal election binding after resolving the session identity',async()=>{
  const a=pool(),context=testTenantContext(tenantId);
  const expected=electManagedRecovery({version:'managed-recovery-state.v1',environment:'synthetic_demo',tenantId,jobId,caseId,election:null,pursuitStartedAt:null},command,
   {environment:'synthetic_demo',tenantId,jobId,caseId,actorMembershipId:membershipId,canApprove:true,now:'2026-10-30T12:00:00.000Z'});
  // Dispatcher is a test double here; durable election/replay assertions run against PostgreSQL in CI.
  const dispatch=vi.spyOn(UserCommandDispatcher.prototype,'dispatch').mockImplementation(async (_context,_command,handler)=>{
   await withTenant(a.pool,context,db=>handler.lock!(db,_command));
   return expected;
  });
  try {
   expect(await new ManagedRecoveryRepository(a.pool,sessionDigest).elect(context,jobId,command,actor)).toEqual(expected);
   expect(a.statements.findIndex(s=>s.includes('app.mon9_session'))).toBeLessThan(a.statements.findIndex(s=>s.includes('app.membership')));
  } finally {dispatch.mockRestore();}
 });
 it('uses stored qualifying principal only and the core election/fee projection',async()=>{
  const a=pool(),b=pool(true);
  const before=await new ManagedRecoveryRepository(a.pool,sessionDigest).preview(testTenantContext(tenantId),jobId,caseId,actor);
  const after=await new ManagedRecoveryRepository(b.pool,sessionDigest).preview(testTenantContext(tenantId),jobId,caseId,actor);
  expect(before.serviceChargeInvoice).toBeNull();expect(after.successFee).toEqual(before.successFee);
  expect(after.serviceChargeInvoice?.principal.pence).toBe(4000);
  expect(after.serviceChargeInvoice?.electionHash).toBe(electManagedRecovery({version:'managed-recovery-state.v1',environment:'synthetic_demo',tenantId,jobId,caseId,election:null,pursuitStartedAt:null},command,
   {environment:'synthetic_demo',tenantId,jobId,caseId,actorMembershipId:membershipId,canApprove:true,now:'2026-10-30T12:00:00.000Z'}).election?.bindingHash);
  expect(b.statements.some(s=>/INSERT|UPDATE|DELETE/u.test(s))).toBe(false);
 });
 it.each(['0','60000','10','30'])('projects current stored net after reversals (%s)',async principal=>{
  const a=pool(true,principal),b=pool(false,principal);
  const after=await new ManagedRecoveryRepository(a.pool,sessionDigest).preview(testTenantContext(tenantId),jobId,caseId,actor);
  const before=await new ManagedRecoveryRepository(b.pool,sessionDigest).preview(testTenantContext(tenantId),jobId,caseId,actor);
  expect(after.successFee).toEqual(before.successFee);expect(before.serviceChargeInvoice).toBeNull();
  expect(after.serviceChargeInvoice?.principal.pence).toBe(principal==='60000'?3000:principal==='30'?2:0);
 });
 it('rejects changed terms and injected money/tenant fields before connecting',async()=>{
  const a=pool(),repo=new ManagedRecoveryRepository(a.pool,sessionDigest);
  for(const extra of [{termsVersion:'changed'},{tenantId},{principal:100000},{amountPence:1000},{selection:{service:'drafted_for_you',points:10}}])
   await expect(repo.elect(testTenantContext(tenantId),jobId,{...command,...extra},actor)).rejects.toThrow();
  expect(a.statements).toEqual([]);
 });
 it('refuses fabricated tenant contexts and rolls back an invalid stored principal',async()=>{
  const a=pool(true,'-1');
  await expect(new ManagedRecoveryRepository(a.pool,sessionDigest).preview({tenantId} as ReturnType<typeof testTenantContext>,jobId,caseId,actor)).rejects.toMatchObject({code:'INVALID_TENANT_CONTEXT'});
  expect(a.statements).toEqual([]);
  await expect(new ManagedRecoveryRepository(a.pool,sessionDigest).preview(testTenantContext(tenantId),jobId,caseId,actor)).rejects.toThrow();
  expect(a.statements.at(-1)).toBe('ROLLBACK');
 });
});
