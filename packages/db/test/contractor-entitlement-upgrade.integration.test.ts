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
it("repeat migration and later successors succeed",async()=>{const before=await snapshot(c.admin);await migrate(c.admin);await migrate(c.admin);expect(await snapshot(c.admin)).toEqual(before);});
it("negative controls detect changed prior rows grants and shapes",async()=>{
 const before=await snapshot(c.admin), prior=await predecessorCatalogue(c.admin);
 const db=await c.admin.connect();
 try {
  await db.query("BEGIN");await db.query("UPDATE app.account SET name='Negative control changed prior row'");
  expect(await snapshot(db)).not.toEqual(before);await db.query("ROLLBACK");
  await db.query("BEGIN");await db.query("GRANT DELETE ON app.account TO jobguard_runtime");
  expect(await predecessorCatalogue(db)).not.toEqual(prior);await db.query("ROLLBACK");
  await db.query("BEGIN");await db.query("ALTER TABLE app.account ADD COLUMN mon8_negative_control text");
  expect(await predecessorCatalogue(db)).not.toEqual(prior);
 }finally{await db.query("ROLLBACK");db.release();}
 expect(await snapshot(c.admin)).toEqual(before);expect(await predecessorCatalogue(c.admin)).toEqual(prior);
});

// Dispatcher r1: additive routine inventory for 0227 (no new tables).
it("0227 routines retain exact ownership and execution boundaries",async()=>{
 await migrate(c.admin);
 const rows=(await c.admin.query(`SELECT p.proname,pg_get_function_identity_arguments(p.oid) args,r.rolname owner,p.prosecdef,p.proconfig,
 has_function_privilege('jobguard_runtime',p.oid,'EXECUTE') runtime,
 has_function_privilege('jobguard_shadow',p.oid,'EXECUTE') shadow,
 has_function_privilege('jobguard_infrastructure',p.oid,'EXECUTE') infrastructure,
 EXISTS(SELECT 1 FROM aclexplode(p.proacl) WHERE grantee=0 AND privilege_type='EXECUTE') public
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner
 WHERE n.nspname='app' AND left(p.proname,4)='ch6_' ORDER BY p.proname`)).rows;
 const identities=[
  ["ch6_append_integrity_review_audit", "t uuid, j uuid, actor uuid, command_id uuid, request_hash text, snapshot_hash text"],
  ["ch6_guard_integrity_review_receipt", ""],
  ["ch6_integrity_authority", "t uuid, j uuid, digest text"],
  ["ch6_integrity_canonical", "v jsonb"],
  ["ch6_integrity_family", "t uuid, j uuid"],
  ["ch6_integrity_source_fingerprint", "t uuid, j uuid, digest text, source_snapshot jsonb"],
  ["ch6_record_integrity_review", "t uuid, j uuid, digest text, review jsonb, source_snapshot jsonb"],
 ];
 expect(rows).toEqual(identities.map(([proname,args])=>({proname,args,owner:"jobguard_migration",prosecdef:proname==="ch6_record_integrity_review",proconfig:["search_path=pg_catalog"],runtime:proname==="ch6_record_integrity_review",shadow:false,infrastructure:false,public:false})));
});
