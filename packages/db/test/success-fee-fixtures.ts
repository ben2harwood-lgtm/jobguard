// Administrative boundary fixture only. Creates no qualifying recovery, allocation,
// attribution, approved statement or fee. Never use it as business posting proof.
import { randomUUID } from "node:crypto";
import {
 DEMO_TENANT_ID,DEMO_ACCOUNT_ID,DEMO_IDENTITY_USER_ID,DEMO_MEMBERSHIP_ID,
 issuePracticeSession,authenticatePracticeSession,
} from "../src/index.js";
import { seedAccount,type LockFixture,asFixtureTenant } from "./recovery-attribution-fixture.js";
export { createLockFixture,closeLockFixture,asFixtureTenant } from "./recovery-attribution-fixture.js";
export async function feeBoundaryFixture(f:LockFixture){
 const T=DEMO_TENANT_ID;
 await f.admin.query("INSERT INTO control_plane.tenant(id) VALUES($1) ON CONFLICT DO NOTHING",[T]);
 await f.admin.query("INSERT INTO identity.identity_user(id) VALUES($1) ON CONFLICT DO NOTHING",[DEMO_IDENTITY_USER_ID]);
 await f.admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Fictional fee boundary') ON CONFLICT DO NOTHING",[DEMO_ACCOUNT_ID,T]);
 await f.admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner') ON CONFLICT DO NOTHING",[DEMO_MEMBERSHIP_ID,T,DEMO_ACCOUNT_ID,DEMO_IDENTITY_USER_ID]);
 const token=await issuePracticeSession(f.runtime),auth=await authenticatePracticeSession(f.runtime,token);
 const p=await seedAccount(f.admin,T,3360000,auth.digest);
 await asFixtureTenant(f.admin,T,async db=>{
  await db.query("UPDATE app.job SET provenance='system_generated_quote',baseline_quote_version_id=$1,accepted_net_value_pence=3360000,fee_policy_version='reference_fee_policy_v3' WHERE tenant_id=$2 AND id=$3",[p.baselineId,T,p.jobId]);
  await db.query("INSERT INTO app.job_commercial_track(tenant_id,job_id,job_track,environment,provenance) VALUES($1,$2,'small_builder','synthetic_demo','legacy_synthetic_live_fixture') ON CONFLICT DO NOTHING",[T,p.jobId]);
 });
 return {p,auth,token,command:{version:"success-fee-command.v1",action:"review",commandId:randomUUID(),expectedPostingRevision:0}};
}
export async function protectedSnapshot(f:LockFixture){
 // Every existing fact is compared, not just a fee-table count. No new tables in 0218.
 const tables=(await f.admin.query("SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN('app','identity','control_plane','audit_control') ORDER BY 1,2")).rows;
 const result:Record<string,unknown>={};
 for(const t of tables)result[`${t.schemaname}.${t.tablename}`]=(await f.admin.query(`SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),'[]') rows FROM "${t.schemaname}"."${t.tablename}" r`)).rows[0].rows;
 return result;
}
