import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { migrate, withTenant, type VerifiedTenantContext } from "../src/index.js";
import { listConfirmedPracticeScopes, listPracticeFindingScopes } from "../src/practice-scope.js";
import { closeTestPools } from "./pool-test-utils.js";

let postgres:EmbeddedPostgres,admin:Pool,runtime:Pool,directory:string;
const tenant=randomUUID(),otherTenant=randomUUID(),job=randomUUID();
const retired="00000000-0000-4000-8000-000000000001",reserved="00000000-0000-4000-8000-000000000002",confirmed="f0000000-0000-4000-8000-000000000001";
const context={tenantId:tenant} as VerifiedTenantContext;
beforeAll(async()=>{
 directory=await mkdtemp(join(tmpdir(),"jobguard-finding-scope-"));const port=59300+Math.floor(Math.random()*200);
 postgres=new EmbeddedPostgres({databaseDir:directory,port,user:"postgres",password:"synthetic",persistent:false,createPostgresUser:process.getuid?.()===0,initdbFlags:["--lc-messages=C"],onLog:()=>undefined});
 await postgres.initialise();await postgres.start();admin=new Pool({host:"127.0.0.1",port,user:"postgres",password:"synthetic",database:"postgres"});await migrate(admin);
 await admin.query(`INSERT INTO control_plane.tenant(id) VALUES('${tenant}'),('${otherTenant}');
 INSERT INTO app.job(id,tenant_id,title,status) VALUES('${job}','${tenant}','Synthetic draft finding scope','draft');
 INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES('${retired}','${tenant}','${job}','retired'),('${reserved}','${tenant}','${job}','reserved');
 CREATE ROLE finding_scope_login LOGIN PASSWORD 'synthetic' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;GRANT jobguard_runtime TO finding_scope_login;`);
 runtime=new Pool({host:"127.0.0.1",port,user:"finding_scope_login",password:"synthetic",database:"postgres"});
},60_000);
afterAll(async()=>{await closeTestPools(runtime,admin);await postgres?.stop();if(directory)await rm(directory,{recursive:true,force:true})});
it("keeps draft findings separate from operational proof, then uses confirmed work only",async()=>{
 expect(await withTenant(runtime,context,db=>listPracticeFindingScopes(db,tenant,job,2))).toEqual([{id:reserved}]);
 expect(await withTenant(runtime,context,db=>listConfirmedPracticeScopes(db,tenant,job,1))).toEqual([]);
 await admin.query("UPDATE app.job SET status='quoting' WHERE tenant_id=$1 AND id=$2",[tenant,job]);
 expect(await withTenant(runtime,context,db=>listPracticeFindingScopes(db,tenant,job,2))).toEqual([]);
 await admin.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')",[confirmed,tenant,job]);
 expect(await withTenant(runtime,context,db=>listPracticeFindingScopes(db,tenant,job,2))).toEqual([{id:confirmed}]);
 expect(await withTenant(runtime,context,db=>listConfirmedPracticeScopes(db,tenant,job,1))).toEqual([{id:confirmed}]);
});
it("does not bypass tenant isolation or borrow another job's finding subject",async()=>{
 expect(await withTenant(runtime,{tenantId:otherTenant} as VerifiedTenantContext,db=>listPracticeFindingScopes(db,tenant,job,2))).toEqual([]);
 expect(await withTenant(runtime,context,db=>listPracticeFindingScopes(db,tenant,randomUUID(),2))).toEqual([]);
});
