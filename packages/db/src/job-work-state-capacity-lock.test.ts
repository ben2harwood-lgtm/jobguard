import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { expect, it, vi } from "vitest";
import { JobWorkStateRepository } from "./job-work-state-repository.js";
import { verifiedTenantContextForQueuedJob } from "./tenant-context.js";

function fixture(allowed = true) {
 const tenantId=randomUUID(),jobId=randomUUID(),actor=randomUUID();
 const result={version:"job-work-state-read.v1",jobId,events:[],links:[],lock:null,environment:"synthetic_demo",realExternalActions:0};
 const query=vi.fn(async(sql:string,_values?:unknown[])=>({rows:
  sql.includes("SELECT EXISTS")?[{allowed}]:sql.includes(" result")?[{result}]:[]}));
 const pool={connect:async()=>({query,release:vi.fn()})} as unknown as Pool;
 return {repo:new JobWorkStateRepository(pool),query,tenantId,jobId,actor,context:verifiedTenantContextForQueuedJob(tenantId)};
}
it("a work command verifies its owner then serializes capacity before its job lock",async()=>{
 const f=fixture();
 await f.repo.command(f.context,f.jobId,f.actor,{version:"job-work-state-command.v1",commandId:randomUUID(),expectedRevision:0,action:"finish"});
 const calls=f.query.mock.calls,sql=calls.map(([text])=>text);
 const capacity=sql.indexOf("SELECT pg_advisory_xact_lock(hashtextextended($1,184))");
 expect(capacity).toBeGreaterThan(sql.findIndex(text=>text.includes("SELECT EXISTS")));
 expect(calls[capacity]).toEqual(["SELECT pg_advisory_xact_lock(hashtextextended($1,184))",[f.tenantId]]);
 expect(sql[capacity+1]).toBe("SELECT app.require_watchdog_live($1::uuid)");
 expect(sql[capacity+2]).toBe("SELECT app.ch4_record_work_state($1,$2,$3,$4::jsonb) result");
 expect(sql.at(-1)).toBe("COMMIT");
});
it("a refused owner takes no capacity or job lock",async()=>{
 const f=fixture(false);
 await expect(f.repo.command(f.context,f.jobId,f.actor,{version:"job-work-state-command.v1",commandId:randomUUID(),expectedRevision:0,action:"finish"})).rejects.toThrow("WORK_STATE_FORBIDDEN");
 expect(f.query.mock.calls.some(([sql])=>sql.includes("pg_advisory")||sql.includes("require_watchdog_live")||sql.includes("ch4_record_work_state"))).toBe(false);
 expect(f.query.mock.calls.at(-1)).toEqual(["ROLLBACK"]);
});
it("a public history read retains its ordinary tenant transaction without a capacity lock",async()=>{
 const f=fixture(); await f.repo.read(f.context,f.jobId,"a".repeat(64));
 expect(f.query.mock.calls.map(([sql])=>sql)).toEqual(["BEGIN","SELECT set_config('app.tenant_id', $1, true)","SELECT app.ch4_read_work_facts($1,$2,$3) result","COMMIT"]);
});
