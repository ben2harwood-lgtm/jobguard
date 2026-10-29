import { randomUUID } from "node:crypto";
import { afterAll,beforeAll,expect,it } from "vitest";
import { ContractorRepository,ContractorRetainedReadRepository,issuePracticeSession,migrate } from "../src/index.js";
import { company } from "./practice-worker-switch-fixtures.js";
import { currentCommand,seedHomeOwner } from "./contractor-practice-session-fixtures.js";
import { cluster,startSession,resume,status,track,read,query,memberSession,unchanged,startBeforeMigration,type Cluster } from "./contractor-retained-read-fixtures.js";
let c:Cluster;
beforeAll(async()=>{process.env.JOBGUARD_ENV="synthetic_demo";c=await cluster();},120000);
afterAll(async()=>{await c?.close();});
it("historical organisation and contracts survive agreement loss",async()=>{
 const f=await company(c);await status(c,f,"active");const before=await read(c,f);expect(before.contracts.length).toBeGreaterThan(0);
 for(const value of ["inactive","suspended"] as const){await status(c,f,value);await unchanged(c,async()=>{expect(await read(c,f)).toEqual(before);expect((await resume(c,f)).units.length).toBeGreaterThan(0);});}
});
it("historical reads survive track change but not revocation",async()=>{
 const f=await company(c),before=await read(c,f);await track(c,f);expect(await read(c,f)).toEqual(before);expect((await read(c,f)).members.every(m=>m.membership_id!==f.p.membershipId||!m.revoked)).toBe(true);
 await c.admin.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2",[f.p.tenantId,f.p.membershipId]);await expect(read(c,f)).rejects.toThrow();
 const revoked=await startSession(c);await new ContractorRepository(c.runtime).command(revoked.p,await currentCommand(c,revoked,{kind:"membership.revoke",membershipId:revoked.p.membershipId}));await expect(read(c,revoked)).rejects.toThrow();
});
it("missing status does not hide authorized old records",async()=>{
 const legacy=await startBeforeMigration("0378_server_plan_entitlements.sql");
 try {
  const f=await company(legacy);expect((await legacy.admin.query("SELECT * FROM app.contractor_agreement_status_revision WHERE tenant_id=$1",[f.p.tenantId])).rows).toEqual([]);
  const before=await read(legacy,f);await migrate(legacy.admin);
  expect((await legacy.admin.query("SELECT * FROM app.contractor_agreement_status_revision WHERE tenant_id=$1",[f.p.tenantId])).rows).toEqual([]);
  expect(await read(legacy,f)).toEqual(before);
 }finally{await legacy.close();}
});
it("client and branch scopes remain unchanged",async()=>{
 const f=await company(c),legacy=new ContractorRepository(c.runtime);
 const branch=(await legacy.query(f.p,query(f,"organisation"))).units.find(u=>u.kind==="branch")!.id;
 const invited=await legacy.command(f.p,await currentCommand(c,f,{kind:"member.invite",role:"surveyor",email:"branch@fictional.invalid",clientId:null,contractId:null,scope:{kind:"branch",id:branch}}));
 const contract=(await read(c,f)).contracts[0]!;
 await legacy.command(f.p,await currentCommand(c,f,{kind:"contract.revise",clientId:contract.client_id,contractId:randomUUID(),document:contract.document,rules:contract.rules}));
 const bound=await legacy.command(f.p,await currentCommand(c,f,{kind:"member.invite",role:"client_approver",email:"bound@fictional.invalid",clientId:contract.client_id,contractId:contract.contract_id,scope:{kind:"client",id:contract.client_id}}));
 const readers=await Promise.all([memberSession(c,f,invited.id),memberSession(c,f,f.members.client_approver!),memberSession(c,f,bound.id)]);
 const before=await Promise.all(readers.map(async r=>{const old=await legacy.query(r.p,query(r));expect(await read(c,r)).toEqual(old);expect(old.contracts.length).toBeGreaterThan(0);return old;}));
 expect(before[2]!.contracts).toHaveLength(1);expect(before[2]!.clients).toEqual([]);
 await track(c,f);
 for(let i=0;i<readers.length;i++){expect(await read(c,readers[i]!)).toEqual(before[i]);await expect(read(c,readers[i]!,"contracts",randomUUID())).rejects.toMatchObject({code:"NOT_FOUND"});}
 // Revoking the actual reader grant is still effective after track loss.
 const grant=(await c.admin.query("SELECT id FROM app.role_grant WHERE tenant_id=$1 AND membership_id=$2",[f.p.tenantId,invited.id])).rows[0].id;
 await c.admin.query("INSERT INTO app.role_grant_revocation(tenant_id,id,grant_id) VALUES($1,gen_random_uuid(),$2)",[f.p.tenantId,grant]);expect((await read(c,readers[0]!)).contracts).toEqual([]);
});
it("restricted readers cannot infer administrative activity",async()=>{
 const f=await company(c);const readers=await Promise.all([memberSession(c,f,f.members.read_only!),memberSession(c,f,f.members.client_approver!)]);
 const commercial=await memberSession(c,f,f.members.commercial_manager!);
 const commercialBefore=await read(c,commercial);
 expect(commercialBefore).toEqual(await new ContractorRepository(c.runtime).query(commercial.p,query(commercial)));
 expect(commercialBefore.revision).toBeGreaterThan(0);expect(commercialBefore.members).toEqual([]);
 const before=await Promise.all(readers.map(r=>read(c,r)));for(const v of before){expect(v.revision).toBe(0);expect(v.members).toEqual([]);expect(v.grants).toEqual([]);}
 await new ContractorRepository(c.runtime).command(f.p,await currentCommand(c,f,{kind:"unit.create",unitKind:"region",parentId:f.p.tenantId,name:"Unrelated administrative activity"}));
 for(let i=0;i<readers.length;i++)expect(await read(c,readers[i]!)).toEqual(before[i]);
 expect((await read(c,commercial)).revision).toBe(commercialBefore.revision+1);
});
it("new small-builder accounts gain no contractor visibility",async()=>{
 await seedHomeOwner(c);const session=await issuePracticeSession(c.runtime);const f=await startSession(c);
 await unchanged(c,()=>expect(new ContractorRetainedReadRepository(c.runtime).query(session,query(f))).rejects.toThrow());
});
