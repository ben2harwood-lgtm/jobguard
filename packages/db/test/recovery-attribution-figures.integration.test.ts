// Storage round trips only. Source-backed figures and illustrated outputs remain DEPENDENCY-BOUND / HELD.
import { afterAll, beforeAll, expect, it } from "vitest";
import { recoveryAttributionRevisionV1 } from "@jobguard/core";
import { createLockFixture, closeLockFixture, asFixtureTenant, storedAttributionFixture, LOCK_OWNER, type LockFixture } from "./recovery-attribution-fixture.js";
let f: LockFixture;
beforeAll(async()=>{f=await createLockFixture();},90000);
afterAll(async()=>{if(f)await closeLockFixture(f);});
it.each([
 ["F4 exact fraction","2000000","43"],
 ["shadow-30000 paid principal","80000","1"],
 ["zero paid principal","0","1"],
])("private persisted principal %s remains unchanged (no fee authority)",async(_name,numerator,denominator)=>{
 const {p,document,command}=await storedAttributionFixture(f);
 const next={...document,remainingPrincipal:{numerator,denominator},assessmentOutcome:numerator==="0"?"excluded":"eligible_for_review",reasonCodes:numerator==="0"?["unpaid"]:[]};
 const parsed=recoveryAttributionRevisionV1.parse(next);
 await asFixtureTenant(f.owner,p.tenantId,db=>db.query("SELECT app.append_recovery_attribution($1,$2,$3,null,null)",[parsed,LOCK_OWNER,command]));
 const result=await asFixtureTenant(f.owner,p.tenantId,db=>db.query("SELECT document FROM app.recovery_attribution_revision WHERE tenant_id=$1 AND id=$2",[p.tenantId,parsed.assessmentId]));
 expect(result.rows[0].document.remainingPrincipal).toEqual({numerator,denominator});
 expect(result.rows[0].document).toEqual(parsed);
 for(const table of ["recovery_fee_journal","recovery_fee_derivation","landing_allocation"]){
  expect((await f.admin.query(`SELECT count(*)::int n FROM app.${table} WHERE tenant_id=$1 AND job_id=$2`,[p.tenantId,p.jobId])).rows).toEqual([{n:0}]);
 }
});
