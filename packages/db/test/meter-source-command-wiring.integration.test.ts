import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeWorkFixture, createWorkFixture, workTenant, type WorkFixture } from "./job-work-state-fixtures.js";

// CI PostgreSQL preflight only. These labels are probes, not accepted source kinds
// or real-command success evidence. MON1-I cannot wire this held owner-only seam.
describe("MON1-I source handoff STOP", () => {
 let f: WorkFixture;
 beforeAll(async () => { f = await createWorkFixture(); }, 60000);
 afterAll(async () => closeWorkFixture(f));
 it("the installed boundary grants neither runtime nor meter an execution path", async () => {
  const row = (await f.admin.query(`SELECT pg_get_userbyid(proowner) owner, prosecdef,
   has_function_privilege('jobguard_runtime',oid,'EXECUTE') runtime,
   has_function_privilege('jobguard_meter',oid,'EXECUTE') meter
   FROM pg_proc WHERE oid='app.mon1_admit_place(uuid,uuid,text,uuid)'::regprocedure`)).rows[0];
  expect(row).toEqual({ owner: "jobguard_migration", prosecdef: false, runtime: false, meter: false });
 });
 it.each(["switch_live", "resume", "reopen", "live_import", "site_evidence", "stage_completion", "builder_extra", "small_trip", "day31"])(
  "%s cannot turn checked-looking IDs into admission, including replay", async sourceKind => {
   const tenant = randomUUID(), job = randomUUID(), source = randomUUID();
   for (let replay = 0; replay < 2; replay++) {
    await expect(workTenant(f.admin, tenant, async db => {
     await db.query("SET LOCAL ROLE jobguard_migration");
     await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,184))", [tenant]);
     return db.query("SELECT app.mon1_admit_place($1,$2,$3,$4)", [tenant, job, sourceKind, source]);
    })).rejects.toThrow("METER_PLACE_SOURCE_HANDOFF_HELD");
   }
  });
});
