import { afterAll,beforeAll,expect,it } from "vitest";
import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { MIGRATION_URLS, migrate } from "../src/migrate.js";
import { own,startBeforeMigration,applyMigration,startSession,status,snapshot,predecessorCatalogue,unchanged,type Cluster } from "./contractor-entitlement-fixtures.js";
import { proofBefore, proofDifferences, rolledBack, scratchReplaceFunction } from "./upgrade-proof-utils.js";

/* An upgrade proof proves ITS OWN migration only: install everything before N, snapshot, apply N alone, compare; then apply everything after N and require success twice. Compare existing rows by named pre-existing columns after all migrations. Never assert that later migrations add no column or replace no function; the fingerprinted-table guard owns 'may never gain a column'. */
type Proof = Awaited<ReturnType<typeof proofBefore>>;
const preserved = { rows: [], types: [] };
const authoritySpine = ["control_plane.tenant", "identity.identity_user", "app.account", "app.membership", "control_plane.contractor_practice_session", "app.commercial_track_assignment", "app.extra_origin"];
const ident = (name: string) => `"${name.replaceAll('"', '""')}"`;
async function capture(db: Pool | PoolClient) {
 const tables = (await db.query("SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN ('app','identity','control_plane','audit_control') ORDER BY 1,2")).rows.map(t => `${t.schemaname}.${t.tablename}`);
 // proofBefore fails with the exact table name on an unkeyed predecessor; none may be omitted.
 const proof = await proofBefore(db, tables);
 expect(Object.keys(proof)).toEqual(tables);
 for (const table of tables) {
  const count = (await db.query(`SELECT count(*)::text n FROM ${table.split(".").map(ident).join(".")}`)).rows[0]!.n;
  expect(String(Object.keys(proof[table]!.rows).length), `${table}: all original PK identities, including honestly empty tables`).toBe(count);
 }
 for (const table of authoritySpine) expect(Object.keys(proof[table]!.rows).length, `${table}: seeded authority spine`).toBeGreaterThan(0);
 return proof;
}
let original: Proof;
let catalogue:Awaited<ReturnType<typeof predecessorCatalogue>>;
let c:Cluster;let previous:Awaited<ReturnType<typeof snapshot>>;
beforeAll(async()=>{process.env.JOBGUARD_ENV="synthetic_demo";c=await startBeforeMigration(own);await startSession(c);previous=await snapshot(c.admin);original=await capture(c.admin);expect(Object.keys(original)).toEqual(Object.keys(previous));catalogue=await predecessorCatalogue(c.admin);await applyMigration(c,own);},120000);
afterAll(async()=>{await c?.close();});
it("own migration preserves populated predecessors",async()=>{expect(await snapshot(c.admin)).toEqual({...previous,"app.contractor_agreement_status_revision":[]});expect(await predecessorCatalogue(c.admin)).toEqual(catalogue);expect(await proofDifferences(c.admin,original)).toEqual(preserved);});
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
it("repeat migration and later successors succeed",async()=>{
 // Include status rows produced by the authorization tests as well as every original predecessor.
 const before = await capture(c.admin);
 for (let pass=0;pass<2;pass++) {
  await migrate(c.admin);
  expect(await proofDifferences(c.admin,original)).toEqual(preserved);
  expect(await proofDifferences(c.admin,before)).toEqual(preserved);
  expect((await c.admin.query("SELECT migration_name FROM public.jobguard_schema_migration ORDER BY migration_name")).rows.map(r=>r.migration_name)).toEqual(MIGRATION_URLS.map(url=>url.pathname.split("/").at(-1)!));
 }
});
it("negative controls detect changed prior rows grants and shapes",async()=>{
 const before=await snapshot(c.admin), prior=await predecessorCatalogue(c.admin), proof=await capture(c.admin);
 const db=await c.admin.connect();
 try {
  await db.query("BEGIN");await db.query("UPDATE app.account SET name='Negative control changed prior row'");
  expect(await snapshot(db)).not.toEqual(before);expect((await proofDifferences(db,proof)).rows).not.toEqual([]);await db.query("ROLLBACK");
  await db.query("BEGIN");await db.query("GRANT DELETE ON app.account TO jobguard_runtime");
  expect(await predecessorCatalogue(db)).not.toEqual(prior);await db.query("ROLLBACK");
  await db.query("BEGIN");await db.query("ALTER TABLE app.account ADD COLUMN mon8_negative_control text");
  expect(await predecessorCatalogue(db)).not.toEqual(prior);
  expect(await proofDifferences(db,proof)).toEqual(preserved);
 }finally{await db.query("ROLLBACK");db.release();}
 expect(await snapshot(c.admin)).toEqual(before);expect(await predecessorCatalogue(c.admin)).toEqual(prior);
});

it("same comparator detects original value, microsecond and full-type corruption",async()=>{
 const proof=await capture(c.admin);
 const identity=JSON.parse(Object.keys(proof["app.account"]!.rows)[0]!) as {id:string};
 for (const sql of [
  "UPDATE app.account SET name=name || ' damaged' WHERE id=$1",
  "UPDATE app.account SET updated_at=updated_at+interval '1 microsecond' WHERE id=$1",
 ]) await rolledBack(c.admin,async db=>{
  expect((await db.query(sql,[identity.id])).rowCount).toBe(1);
  const difference=await proofDifferences(db,proof);
  expect(difference.rows).toHaveLength(1);expect(difference.types).toEqual([]);
 });
 await rolledBack(c.admin,async db=>{
  await db.query("ALTER TABLE app.account ALTER COLUMN name TYPE varchar(201)");
  expect((await proofDifferences(db,proof)).types).toContain("app.account: name character varying(200) -> character varying(201)");
 });
 expect(await proofDifferences(c.admin,proof)).toEqual(preserved);
});
it("same comparator permits successor columns, rows, tables and routine replacement",async()=>{
 const proof=await capture(c.admin), prior=await predecessorCatalogue(c.admin);
 await rolledBack(c.admin,async db=>{
  await db.query("ALTER TABLE app.account ADD COLUMN mon8_successor_note text");
  expect(await proofDifferences(db,proof)).toEqual(preserved);
  expect(await predecessorCatalogue(db)).not.toEqual(prior);
 });
 await rolledBack(c.admin,async db=>{
  // Replace only the body comment of an existing harmless mutation-rejection function.
  expect(await scratchReplaceFunction(db,"app.reject_audit_mutation()")).toBe(true);
  expect(await proofDifferences(db,proof)).toEqual(preserved);
  expect(await predecessorCatalogue(db)).not.toEqual(prior);
 });
 await rolledBack(c.admin,async db=>{
  const tenant=(await db.query("SELECT tenant_id FROM app.account ORDER BY id LIMIT 1")).rows[0]!.tenant_id;
  expect((await db.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Fictional successor builder')",[randomUUID(),tenant])).rowCount).toBe(1);
  expect(await proofDifferences(db,proof)).toEqual(preserved);
 });
 await rolledBack(c.admin,async db=>{
  await db.query("CREATE TABLE app.mon8_successor_scratch(id integer PRIMARY KEY, note text)");
  expect(await proofDifferences(db,proof)).toEqual(preserved);
  expect(await predecessorCatalogue(db)).not.toEqual(prior);
 });
 expect(await proofDifferences(c.admin,proof)).toEqual(preserved);
 expect(await predecessorCatalogue(c.admin)).toEqual(prior);
});
it("same comparator detects a missing original identity without deleting a row",async()=>{
 await rolledBack(c.admin,async db=>{
  await db.query("CREATE TABLE app.mon8_identity_scratch(id integer PRIMARY KEY, note text)");
  await db.query("INSERT INTO app.mon8_identity_scratch VALUES(1,'Fictional original')");
  const proof=await proofBefore(db,["app.mon8_identity_scratch"]);
  // Move the scratch PK: the original identity is absent, with no DELETE or production-row mutation.
  await db.query("UPDATE app.mon8_identity_scratch SET id=2 WHERE id=1");
  expect(await proofDifferences(db,proof)).toEqual({rows:['app.mon8_identity_scratch {"id":1}: missing'],types:[]});
 });
});
