import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { ContractorRepository, migrate } from "../src/index.js";
import { startBeforeMigration, applyMigration, startSession, status, snapshot, unchanged, type Cluster } from "./contractor-entitlement-fixtures.js";
import { ownerTx } from "./extra-fixtures.js";
const own="0402_operative_entitlements.sql";
let c:Cluster,f:Awaited<ReturnType<typeof startSession>>,before:Awaited<ReturnType<typeof snapshot>>,raw:Record<string,unknown>;
beforeAll(async()=>{
 process.env.JOBGUARD_ENV="synthetic_demo";c=await startBeforeMigration(own);f=await startSession(c);
 // A genuinely populated predecessor: historical operative exists without an agreement status.
 raw={version:"contractor-command.v1",environment:"synthetic_demo",commandId:randomUUID(),id:randomUUID(),expectedRevision:0,kind:"member.invite",role:"operative",email:"legacy@fictional.invalid",scope:{kind:"tenant",id:f.p.tenantId},clientId:null,contractId:null};
 await new ContractorRepository(c.runtime).command(f.p,raw);before=await snapshot(c.admin);await applyMigration(c,own);
},120000);
afterAll(async()=>{await c?.close();});
it("upgrade and repeated migrator preserve every predecessor row without inventing active agreements",async()=>{
 expect(await snapshot(c.admin)).toEqual(before);await migrate(c.admin);expect(await snapshot(c.admin)).toEqual(before);
 const view=await new ContractorRepository(c.runtime).query(f.p,{version:"contractor-query.v1",tenantId:f.p.tenantId,resource:"organisation"});
 expect(view.members.some(m=>m.membership_id===raw.id)).toBe(true);
});
it("legacy missing status refuses new grants until an explicit fictional active status exists",async()=>{
 const next={...raw,commandId:randomUUID(),id:randomUUID(),email:"new@fictional.invalid",expectedRevision:1};
 await unchanged(c,()=>expect(new ContractorRepository(c.runtime).command(f.p,next)).rejects.toMatchObject({code:"FORBIDDEN"}));
 await status(c,f,"active");expect((await new ContractorRepository(c.runtime).command(f.p,next)).id).toBe(next.id);
});
it("revocation and expiry updates remain possible after suspension",async()=>{
 await status(c,f,"suspended");
 await ownerTx(c,f.p.tenantId,db=>db.$client.query("UPDATE app.membership SET revoked_at=clock_timestamp(),expires_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2",[f.p.tenantId,raw.id]));
 expect((await c.admin.query("SELECT revoked_at IS NOT NULL AND expires_at IS NOT NULL closed FROM app.membership WHERE tenant_id=$1 AND id=$2",[f.p.tenantId,raw.id])).rows[0].closed).toBe(true);
});
