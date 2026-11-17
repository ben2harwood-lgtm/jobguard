import { randomUUID } from "node:crypto";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { closeWorkFixture,createWorkFixture,type WorkFixture } from "./job-work-state-fixtures.js";

describe("MON1-A lock wait held boundary; positive M1A-05 races STOP pending source handoff",()=>{
 let f:WorkFixture;beforeAll(async()=>{f=await createWorkFixture()},60000);afterAll(async()=>closeWorkFixture(f));
 it.each(["resume","reopen","live_import"])("M1A-05/07 %s waits behind tenant lock and then still refuses",async kind=>{
  const t=randomUUID(),a=await f.admin.connect(),b=await f.admin.connect();
  try {
   await a.query("BEGIN");await b.query("BEGIN");
   await a.query("SELECT pg_advisory_xact_lock(hashtextextended($1,184))",[t]);
   const pid=(await b.query("SELECT pg_backend_pid() pid")).rows[0].pid;
   const waiting=b.query("SELECT pg_advisory_xact_lock(hashtextextended($1,184))",[t]);
   let blocked=false;
   for(let tries=0;tries<100 && !blocked;tries++)blocked=(await a.query("SELECT cardinality(pg_blocking_pids($1))>0 blocked",[pid])).rows[0].blocked;
   expect(blocked).toBe(true);
   await a.query("COMMIT");await waiting;
   await b.query("SET LOCAL ROLE jobguard_migration");
   await b.query("SELECT set_config('app.tenant_id',$1,true)",[t]);
   await expect(b.query("SELECT app.mon1_admit_place($1,$2,$3,$4)",[t,randomUUID(),kind,randomUUID()])).rejects.toThrow("METER_PLACE_SOURCE_HANDOFF_HELD");
  } finally {await a.query("ROLLBACK");await b.query("ROLLBACK");a.release();b.release();}
 });
});
