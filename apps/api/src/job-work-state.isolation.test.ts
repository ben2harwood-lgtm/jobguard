import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { describe,expect,it } from "vitest";
import { JobWorkStateRepository, verifiedTenantContextFromMembership, type AuthenticatedMembership } from "@jobguard/db";
const testTenantContext=(tenantId:string)=>verifiedTenantContextFromMembership({tenantId,membershipId:randomUUID(),identityUserId:randomUUID()} as AuthenticatedMembership);
/** Scripted query-shape boundary only. Actual PostgreSQL isolation remains dispatcher evidence. */
describe("CH-4 read statements and context stamping",()=>{
 it("CH4-A20 a copied context is refused before a connection is acquired",async()=>{
  const stamped=testTenantContext(randomUUID());let connections=0;const pool={connect:async()=>{connections++;throw new Error("unexpected connection")}} as unknown as Pool;
  await expect(new JobWorkStateRepository(pool).read({...stamped},randomUUID(),"a".repeat(64))).rejects.toThrow("A verified tenant context");expect(connections).toBe(0);
 });
 it("CH4-A22 public read statement has no signal-count input or shadow query (scripted boundary)",async()=>{
  const tenantId=randomUUID(),jobId=randomUUID(),statements:string[]=[];
  const row={version:"job-work-state-read.v1",jobId,events:[],links:[],lock:null,environment:"synthetic_demo",realExternalActions:0};
  const pool={connect:async()=>({query:async(sql:string)=>{statements.push(sql);return {rows:sql.includes("ch4_read_work_facts")?[{result:row}]:[]}},release:()=>undefined})} as unknown as Pool;
  const repo=new JobWorkStateRepository(pool);expect(await repo.read(testTenantContext(tenantId),jobId,"a".repeat(64))).toEqual(row);
  expect(statements).toEqual(["BEGIN","SELECT set_config('app.tenant_id', $1, true)","SELECT app.ch4_read_work_facts($1,$2,$3) result","COMMIT"]);
  expect(statements.join(" ")).not.toMatch(/shadow|signal|finding/iu);
 });
});
