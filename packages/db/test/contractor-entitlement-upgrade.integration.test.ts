import { afterAll,beforeAll,expect,it } from "vitest";
import { migrate } from "../src/migrate.js";
import { own,startBeforeMigration,applyMigration,startSession,status,snapshot,predecessorCatalogue,unchanged,type Cluster } from "./contractor-entitlement-fixtures.js";
let catalogue:Awaited<ReturnType<typeof predecessorCatalogue>>;
let c:Cluster;let previous:Awaited<ReturnType<typeof snapshot>>;
beforeAll(async()=>{process.env.JOBGUARD_ENV="synthetic_demo";c=await startBeforeMigration(own);await startSession(c);previous=await snapshot(c.admin);catalogue=await predecessorCatalogue(c.admin);await applyMigration(c,own);},120000);
afterAll(async()=>{await c?.close();});
it("own migration preserves populated predecessors",async()=>{expect(await snapshot(c.admin)).toEqual({...previous,"app.contractor_agreement_status_revision":[]});expect(await predecessorCatalogue(c.admin)).toEqual(catalogue);});
it("legacy origin fixtures acquire no agreement status",async()=>{expect((await c.admin.query("SELECT count(*)::int n FROM app.extra_origin")).rows[0].n).toBeGreaterThan(0);expect((await c.admin.query("SELECT * FROM app.contractor_agreement_status_revision")).rows).toEqual([]);});
it("runtime cannot manufacture or mutate status",async()=>{
 const f=await startSession(c);await status(c,f,"active");
 for(const sql of ["SELECT * FROM app.contractor_agreement_status_revision","INSERT INTO app.contractor_agreement_status_revision DEFAULT VALUES","UPDATE app.contractor_agreement_status_revision SET status='active'","DELETE FROM app.contractor_agreement_status_revision","TRUNCATE app.contractor_agreement_status_revision"])await unchanged(c,()=>expect(c.runtime.query(sql)).rejects.toMatchObject({code:"42501"}));
 for(const sql of ["UPDATE app.contractor_agreement_status_revision SET status='inactive'","DELETE FROM app.contractor_agreement_status_revision"])await unchanged(c,()=>expect(c.admin.query(sql)).rejects.toThrow("AGREEMENT_STATUS_IMMUTABLE"));
});
it("actual catalogs retain least privilege",async()=>{
 expect((await c.admin.query(`SELECT r.rolname owner,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner WHERE c.oid='app.contractor_agreement_status_revision'::regclass`)).rows).toEqual([{owner:"jobguard_migration",relrowsecurity:true,relforcerowsecurity:true}]);
 expect((await c.admin.query("SELECT polname FROM pg_policy WHERE polrelid='app.contractor_agreement_status_revision'::regclass")).rows).toEqual([{polname:"tenant_isolation"}]);
 expect((await c.admin.query("SELECT pg_get_constraintdef(oid) def FROM pg_constraint WHERE conrelid='app.contractor_agreement_status_revision'::regclass AND contype='f'")).rows.map(r=>r.def)).toContain("FOREIGN KEY (tenant_id, assignment_id) REFERENCES app.commercial_track_assignment(tenant_id, id)");
 for(const role of ["jobguard_runtime","jobguard_infrastructure"]){expect((await c.admin.query("SELECT has_table_privilege($1,'app.contractor_agreement_status_revision','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') allowed",[role])).rows[0].allowed).toBe(false);}
 const routines=(await c.admin.query(`SELECT p.proname,r.rolname owner,p.prosecdef,p.proconfig,has_function_privilege('jobguard_runtime',p.oid,'EXECUTE') runtime,has_function_privilege('jobguard_infrastructure',p.oid,'EXECUTE') infrastructure,EXISTS(SELECT 1 FROM aclexplode(p.proacl) WHERE grantee=0 AND privilege_type='EXECUTE') public FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner WHERE n.nspname='app' AND p.proname IN('mon8_contractor_agreement_context','mon8_agreement_status_guard') ORDER BY p.proname`)).rows;
 expect(routines).toEqual([{proname:"mon8_agreement_status_guard",owner:"jobguard_migration",prosecdef:false,proconfig:["search_path=pg_catalog"],runtime:false,infrastructure:false,public:false},{proname:"mon8_contractor_agreement_context",owner:"jobguard_migration",prosecdef:true,proconfig:["search_path=pg_catalog"],runtime:true,infrastructure:false,public:false}]);
});
// C239: SV5PRE owns the six shared tables; SV-5 adds processing and result persistence. Every pre-existing row still compares in full.
const finalCheckTables=["final_check_manifest","final_check_manifest_source","shadow_final_check_completion","shadow_final_check_reveal_proof","shadow_final_check_run_binding","shadow_final_check_source_attempt","final_check_processing_source","final_check_disposition_binding","final_check_reveal_proof","final_check_run_binding","final_check_source_attempt"];
it("repeat migration and later successors succeed",async()=>{const before=await snapshot(c.admin);await migrate(c.admin);const expected={...before,
 "app.tenant_key_version":[],
 "app.tenant_key_revocation":[],
 "app.recovery_timeline_run":[],
 "app.recovery_timeline_signal":[],
 "app.customer_variation_approval":[],
 "app.customer_portal_grant":[],
 "app.customer_portal_session":[],
 "app.job_import_v3":[],
 "app.payment_fee_command":[],
 "app.payment_fee_statement":[],
 "app.lp_job_insert_permit":[],
 "identity.oidc_assertion_use":[],
 "identity.oidc_request":[],
 "app.small_builder_demo_run":[],
 "app.small_builder_demo_receipt":[],
 "app.small_builder_demo_report":[],
 "app.evidence_pack_v3":[],
 "app.evidence_pack_v3_approval":[],
 "app.evidence_pack_v3_check":[],
 "app.evidence_pack_v3_request":[],
 "app.job_small_trip_event":[],
 "app.job_small_trip_observation":[],
 "app.meter_lifecycle_alert":[],
 "app.meter_lifecycle_computation":[],
 "app.meter_lifecycle_correction":[],
 "app.meter_lifecycle_day_ledger":[],
 "app.meter_lifecycle_place_binding":[],
 "app.meter_lifecycle_scope":[],
 "app.meter_lifecycle_source":[],
 "app.meter_lifecycle_source_ref":[],
 "app.meter_work_ledger":[],
 "app.trial_admission":[],
 "app.trial_start":[],
 "app.trial_end_source":[],
 "app.trial_subscription_source":[],
 "app.trial_business_verification":[],
 "app.trial_card_attempt":[],
 "app.trial_card_result":[],
 "app.enterprise_baseline_batch":[],
 "app.enterprise_baseline_team":[],
