import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { ContractorRepository, type AuthenticatedMembership } from '@jobguard/db';
const id='11111111-1111-4111-8111-111111111111';
// Adapter-level only. PostgreSQL proves the persisted grant checks in contractor.integration.test.ts.
function repository(role:'commercial_manager'|'client_approver'|'read_only') {
 const query=vi.fn(async(sql:string)=>{
  if(sql.includes('SELECT 1 FROM app.membership'))return {rows:[{}]};
  if(sql.includes('SELECT count(*)'))return {rows:[{n:'7'}]};
  if(sql.includes('contractor_allowed')&&sql.includes('contract.manage'))return {rows:[{allowed:role==='commercial_manager'}]};
  return {rows:[]};
 });
 const client={query,release:vi.fn()};
 return new ContractorRepository({connect:async()=>client} as unknown as Pool);
}
describe('contractor command revision projection',()=>{
 it('exposes the command revision to a commercial writer without organisation.read',async()=>{
  const view=await repository('commercial_manager').query({tenantId:id,membershipId:id,identityUserId:id} as AuthenticatedMembership,{version:'contractor-query.v1',tenantId:id,resource:'contracts'});
  expect(view.revision).toBe(7);expect(view.units).toEqual([]);expect(view.members).toEqual([]);expect(view.grants).toEqual([]);
 });
 for(const role of ['client_approver','read_only'] as const)it(`${role} cannot infer administrative activity from revision`,async()=>{
  const view=await repository(role).query({tenantId:id,membershipId:id,identityUserId:id} as AuthenticatedMembership,{version:'contractor-query.v1',tenantId:id,resource:'contracts'});
  expect(view.revision).toBe(0);
 });
});
