import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { D11_POLICY_VERSION, type D11CandidatePolicy } from "@jobguard/core";
import { getCommercialIntegrityReviewQueue, migrate, type VerifiedTenantContext, withTenant } from "../src/index.js";
import { closeTestPools } from "./pool-test-utils.js";

const A="10000000-0000-4000-8000-000000000001",B="20000000-0000-4000-8000-000000000002",JA="30000000-0000-4000-8000-000000000003",JB="40000000-0000-4000-8000-000000000004";
const context=(tenantId:string)=>({tenantId}) as VerifiedTenantContext;
const policy:D11CandidatePolicy={version:D11_POLICY_VERSION,minimumWonJobsForRatio:1,maximumUnswitchedBasisPoints:1000,materialVarianceBasisPoints:1000,liveActivityWindowMilliseconds:100,recoveryLandingWindowMilliseconds:100};
let pg:EmbeddedPostgres,admin:Pool,runtime:Pool,dir:string;
beforeAll(async()=>{dir=await mkdtemp(join(tmpdir(),"integrity-pg-"));const port=58100+Math.floor(Math.random()*100);pg=new EmbeddedPostgres({databaseDir:dir,port,user:"postgres",password:"synthetic",persistent:false,createPostgresUser:process.getuid?.()===0,initdbFlags:["--lc-messages=C"],onLog:()=>undefined});await pg.initialise();await pg.start();admin=new Pool({host:"127.0.0.1",port,user:"postgres",password:"synthetic"});await migrate(admin);await admin.query(`INSERT INTO control_plane.tenant(id)VALUES('${A}'),('${B}');INSERT INTO app.job(id,tenant_id,title,status,revision)VALUES('${JA}','${A}','A','draft',0),('${JB}','${B}','B','draft',0);INSERT INTO app.commercial_integrity_activity_fact VALUES(gen_random_uuid(),'${A}','${JA}','recovery_discussed',to_timestamp(0),true), (gen_random_uuid(),'${A}','${JA}','outside_app_settlement',to_timestamp(1),true),(gen_random_uuid(),'${B}','${JB}','site_activity',now(),true);CREATE ROLE integrity_login LOGIN PASSWORD 'synthetic' NOSUPERUSER NOBYPASSRLS;GRANT jobguard_runtime TO integrity_login;`);runtime=new Pool({host:"127.0.0.1",port,database:"postgres",user:"integrity_login",password:"synthetic"});},60_000);
afterAll(async()=>{await closeTestPools(runtime,admin);await pg.stop();await rm(dir,{recursive:true,force:true});});
describe("commercial-integrity PostgreSQL boundary",()=>{
 it("returns a strictly tenant-scoped advisory queue",async()=>{const a=await withTenant(runtime,context(A),db=>getCommercialIntegrityReviewQueue(db,policy,2_000));expect(a.findings).toEqual([expect.objectContaining({jobId:JA,kind:"recovery_settled_outside_app"})]);expect(a.findings.some(x=>x.jobId===JB)).toBe(false);const b=await withTenant(runtime,context(B),db=>getCommercialIntegrityReviewQueue(db,policy,2_000));expect(b.findings.some(x=>x.jobId===JA)).toBe(false);});
 it("performs no money or authorization writes and has no write-path access",async()=>{const protectedTables=["journal","journal_line","financial_authorization","action_authorization","cap_snapshot","recovery_fee_journal"];const before=await Promise.all(protectedTables.map(async table=>(await admin.query(`SELECT count(*)::int n FROM app.${table}`)).rows[0].n));await withTenant(runtime,context(A),db=>getCommercialIntegrityReviewQueue(db,policy,2_000));const after=await Promise.all(protectedTables.map(async table=>(await admin.query(`SELECT count(*)::int n FROM app.${table}`)).rows[0].n));expect(after).toEqual(before);const source=await readFile(new URL("../src/commercial-integrity-repository.ts",import.meta.url),"utf8");expect(source).not.toMatch(/\b(INSERT|UPDATE|DELETE|money-repository|commands|ledger)\b/iu);});
});
