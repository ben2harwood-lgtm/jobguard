import { afterAll, beforeAll, expect, it } from "vitest";
import { ContractorRepository, migrate } from "../src/index.js";
import { startBeforeMigration, applyMigration, status, snapshot, unchanged, type Cluster } from "./contractor-entitlement-fixtures.js";
import { company } from "./practice-worker-switch-fixtures.js";
import { currentCommand } from "./contractor-practice-session-fixtures.js";
import { ownerTx } from "./extra-fixtures.js";
const first="0352_server_plan_entitlements.sql", second="0353_contractor_feature_guards.sql";
let c:Cluster,f:Awaited<ReturnType<typeof company>>,before:Awaited<ReturnType<typeof snapshot>>;
beforeAll(async()=>{
 process.env.JOBGUARD_ENV="synthetic_demo";c=await startBeforeMigration(first);f=await company(c);
 // Real populated predecessor: operative membership and grants, but no status fact.
 expect((await c.admin.query("SELECT * FROM app.contractor_agreement_status_revision")).rows).toEqual([]);
 before=await snapshot(c.admin);await applyMigration(c,first);await applyMigration(c,second);
},120000);
afterAll(async()=>{await c?.close();});
it("combined upgrade and repeated migrator preserve every predecessor row without inventing active agreements",async()=>{
 expect(await snapshot(c.admin)).toEqual(before);await migrate(c.admin);await migrate(c.admin);expect(await snapshot(c.admin)).toEqual(before);
 const view=await new ContractorRepository(c.runtime).query(f.p,{version:"contractor-query.v1",tenantId:f.p.tenantId,resource:"organisation"});
 expect(view.members.some(m=>m.membership_id===f.members.operative)).toBe(true);
});
it("legacy missing status refuses new grants until an explicit fictional active status exists",async()=>{
 const next=await currentCommand(c,f,{kind:"member.invite",role:"operative",email:"new@fictional.invalid",scope:{kind:"tenant",id:f.p.tenantId},clientId:null,contractId:null});
 await unchanged(c,()=>expect(new ContractorRepository(c.runtime).command(f.p,next)).rejects.toMatchObject({code:"FORBIDDEN"}));
 await status(c,f,"active");expect((await new ContractorRepository(c.runtime).command(f.p,next)).id).toBe(next.id);
});
it("revocation and expiry updates remain possible after suspension",async()=>{
 await status(c,f,"suspended");
 await ownerTx(c,f.p.tenantId,db=>db.$client.query("UPDATE app.membership SET revoked_at=clock_timestamp(),expires_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2",[f.p.tenantId,f.members.operative]));
 expect((await c.admin.query("SELECT revoked_at IS NOT NULL AND expires_at IS NOT NULL closed FROM app.membership WHERE tenant_id=$1 AND id=$2",[f.p.tenantId,f.members.operative])).rows[0].closed).toBe(true);
 const command=await currentCommand(c,f,{kind:"grant.revoke",grantId:(await c.admin.query("SELECT id FROM app.role_grant WHERE tenant_id=$1 AND membership_id=$2 LIMIT 1",[f.p.tenantId,f.members.operative])).rows[0].id});
 expect((await new ContractorRepository(c.runtime).command(f.p,command)).kind).toBe("grant.revoke");
});
