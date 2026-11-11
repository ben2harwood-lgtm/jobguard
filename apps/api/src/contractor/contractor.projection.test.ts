import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { ContractorRepository } from '@jobguard/db';
const id='11111111-1111-4111-8111-111111111111',session='22222222-2222-4222-8222-222222222222';
// Adapter-level only. PostgreSQL proves the persisted grant checks in contractor.integration.test.ts.
function repository(role:'commercial_manager'|'client_approver'|'read_only') {
 const query=vi.fn(async(sql:string)=>{
  // LP-6d: the persisted contractor session resolves and binds this request to its own member.
  if(sql.includes('app.contractor_session('))return {rows:[{tenant_id:id,membership_id:id,identity_user_id:id}]};
  if(sql.includes('app.current_actor() actor'))return {rows:[{actor:id,tenant:id}]};
  if(sql.includes('SELECT 1 FROM app.membership'))return {rows:[{}]};
  if(sql.includes('SELECT count(*)'))return {rows:[{n:'7'}]};
  if(sql.includes('contractor_allowed')&&sql.includes('contract.manage'))return {rows:[{allowed:role==='commercial_manager'}]};
  return {rows:[]};
 });
 const client={query,release:vi.fn()};
 return new ContractorRepository({connect:async()=>client,query} as unknown as Pool);
}
describe('contractor command revision projection',()=>{
 it('exposes the command revision to a commercial writer without organisation.read',async()=>{
  const repo=repository('commercial_manager'),view=await repo.query(await repo.resolveSession(session),{version:'contractor-query.v1',tenantId:id,resource:'contracts'});
  expect(view.revision).toBe(7);expect(view.units).toEqual([]);expect(view.members).toEqual([]);expect(view.grants).toEqual([]);
 });
 for(const role of ['client_approver','read_only'] as const)it(`${role} cannot infer administrative activity from revision`,async()=>{
  const repo=repository(role),view=await repo.query(await repo.resolveSession(session),{version:'contractor-query.v1',tenantId:id,resource:'contracts'});
  expect(view.revision).toBe(0);
 });
});
