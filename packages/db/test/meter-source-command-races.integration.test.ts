import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeWorkFixture, createWorkFixture, type WorkFixture } from "./job-work-state-fixtures.js";

// Only proves the private hold survives both wait orders. Source-vs-lock/plan/
// revocation command races remain STOP until actual source admission is supplied.
describe("MON1-I held boundary after tenant-lock wait", () => {
 let f: WorkFixture;
 beforeAll(async () => { f = await createWorkFixture(); }, 60000);
 afterAll(async () => closeWorkFixture(f));
 it.each([["switch_live", "resume"], ["resume", "switch_live"]])("%s before %s cannot release a permit", async (first, second) => {
  const tenant = randomUUID(), a = await f.admin.connect(), b = await f.admin.connect();
  const clients = [a, b];
  try {
   for (const db of clients) {
    await db.query("BEGIN");
    await db.query("SET LOCAL ROLE jobguard_migration");
    await db.query("SELECT set_config('app.tenant_id',$1,true)", [tenant]);
   }
   await a.query("SELECT pg_advisory_xact_lock(hashtextextended($1,184))", [tenant]);
   const pid = (await b.query("SELECT pg_backend_pid() pid")).rows[0].pid;
   const waiting = b.query("SELECT pg_advisory_xact_lock(hashtextextended($1,184))", [tenant]);
   // Observe an actual wait instead of assuming a timer establishes ordering.
   let blocked = false;
   for (let i = 0; i < 100 && !blocked; i++) {
    blocked = (await a.query("SELECT cardinality(pg_blocking_pids($1))>0 blocked", [pid])).rows[0].blocked;
   }
   expect(blocked).toBe(true);
   await expect(a.query("SELECT app.mon1_admit_place($1,$2,$3,$4)", [tenant, randomUUID(), first, randomUUID()]))
    .rejects.toThrow("METER_PLACE_SOURCE_HANDOFF_HELD");
   await a.query("ROLLBACK");
   await waiting;
   await expect(b.query("SELECT app.mon1_admit_place($1,$2,$3,$4)", [tenant, randomUUID(), second, randomUUID()]))
    .rejects.toThrow("METER_PLACE_SOURCE_HANDOFF_HELD");
  } finally {
   for (const db of clients) { await db.query("ROLLBACK"); db.release(); }
  }
 });
});
