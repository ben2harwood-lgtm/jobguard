import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterEach, expect, it, vi } from "vitest";
import { InboxRelevanceRepository } from "./inbox-relevance-repository.js";
import { PreventionCheckRepository } from "./prevention-check-repository.js";
import { verifiedTenantContextForQueuedJob } from "./tenant-context.js";

vi.mock("./audit.js", () => ({ appendAuditBatch: async () => [{ id: randomUUID() }] }));
afterEach(() => vi.unstubAllEnvs());
const context=verifiedTenantContextForQueuedJob(randomUUID()),member=randomUUID();
type Row=Record<string,unknown>;
function poolFor(answer:(sql:string,values:unknown[])=>Row[]) {
 const query=vi.fn(async(sql:string,values:unknown[]=[])=>{const rows=answer(sql,values);return {rows,rowCount:rows.length};});
 return {pool:{connect:async()=>({query,release(){}})} as unknown as Pool,query};
}

// SQL protocol doubles exercise repository behavior; PostgreSQL suites prove
// the actual predicates, uniqueness, blocking and commit/rollback guarantees.
it("S24: session A's zero budget leaves session B's advisories visible",async()=>{
 const preferences:Row[]=[];
 const {pool}=poolFor((sql,v)=>{
  if(sql.startsWith("SELECT payload_hash"))return preferences.filter(p=>p.command_id===v[1]);
  if(sql.startsWith("SELECT count(*)"))return [{n:preferences.length}];
  if(sql.startsWith("INSERT INTO app.inbox_preference_revision"))preferences.push({command_id:v[4],advisory_budget:v[5],actor_ref:v[6],payload_hash:v[7]});
  if(sql.startsWith("SELECT p.advisory_budget"))return preferences.filter(p=>!sql.includes("p.actor_ref=")||p.actor_ref===v[3]).slice(-1);
  if(sql.startsWith("SELECT d.*"))return [{id:randomUUID(),lane:"advisory",rule_id:"supplier-check",rule_revision:"supplier-check.v1",finding_revision:1,source_references:["invoice:A"],resolved:false}];
  return [];
 });
 const repo=new InboxRelevanceRepository(pool),aj=randomUUID(),bj=randomUUID();
 const input={commandId:randomUUID(),advisoryBudget:0};
 await repo.setBudget(context,aj,input,member,"a".repeat(64));
 const b=await repo.view(context,bj,member,"b".repeat(64));
 expect(b.advisoryBudget).toBe(100);expect(b.advisory).toHaveLength(1);
 expect((await repo.view(context,aj,member,"a".repeat(64))).advisory).toHaveLength(0);
 await repo.setBudget(context,aj,input,member,"a".repeat(64));
 expect(preferences).toHaveLength(1);
 await expect(repo.setBudget(context,bj,input,member,"b".repeat(64))).rejects.toMatchObject({code:"IDEMPOTENCY_CONFLICT"});
 await expect(repo.setBudget(context,bj,input,member,"a".repeat(64))).rejects.toMatchObject({code:"IDEMPOTENCY_CONFLICT"});
 expect(preferences).toHaveLength(1);
});

it("S25: a revocation observed by the membership fence refuses before any command write",async()=>{
 vi.stubEnv("JOBGUARD_ENV","synthetic_demo");
 const {pool,query}=poolFor(sql=>{
  // Model a revoker owning the row: an unlocked snapshot sees the old active
  // owner; a share-lock read resumes after revocation and finds no authority.
  if(sql.includes("FROM app.membership"))return /FOR SHARE/u.test(sql)?[]:[{active:true}];
  if(sql.includes("SELECT 1 FROM app.job"))return [{exists:true}];
  if(sql.startsWith("INSERT"))throw new Error("UNAUTHORIZED_COMMAND_WRITE");
  return [];
 });
 await expect(new PreventionCheckRepository(pool).command(context,member,randomUUID(),{
  version:"prevention-command.v1",commandId:randomUUID(),action:"property",expectedBindingId:randomUUID(),scenarioNow:"2026-10-07T13:00:00.000Z",fixture:"mixed",
 })).rejects.toMatchObject({code:"FORBIDDEN"});
 expect(query.mock.calls.some(([sql])=>sql.startsWith("INSERT"))).toBe(false);
 expect(query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
});
