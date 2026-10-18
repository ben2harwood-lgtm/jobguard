import { afterAll,beforeAll,expect,it } from "vitest";
import { company } from "./practice-worker-switch-fixtures.js";
import { migrate } from "../src/index.js";
import { own,startBeforeMigration,applyMigration,startSession,snapshot,catalogue,cluster,read,type Cluster } from "./contractor-retained-read-fixtures.js";
let c:Cluster;let before:Awaited<ReturnType<typeof snapshot>>;let prior:Awaited<ReturnType<typeof catalogue>>;
beforeAll(async()=>{process.env.JOBGUARD_ENV="synthetic_demo";c=await startBeforeMigration(own);await company(c);before=await snapshot(c.admin);prior=await catalogue(c.admin);await applyMigration(c,own);},120000);
afterAll(async()=>{await c?.close();});
it("own migration preserves populated predecessor rows and privileges",async()=>{expect(await snapshot(c.admin)).toEqual(before);expect(await catalogue(c.admin)).toEqual(prior);});
it("fresh install and repeat migration succeed",async()=>{
 const fresh=await cluster();try{const f=await startSession(fresh);await read(fresh,f);const rows=await snapshot(fresh.admin);await migrate(fresh.admin);await migrate(fresh.admin);expect(await snapshot(fresh.admin)).toEqual(rows);}finally{await fresh.close();}
},120000);
it("only the named reader gains runtime execute",async()=>{
 expect(await catalogue(c.admin)).toEqual(prior);
 const rows=(await c.admin.query(`SELECT pg_get_function_identity_arguments(p.oid) args,r.rolname owner,p.prosecdef,p.proconfig,has_function_privilege('jobguard_runtime',p.oid,'EXECUTE') runtime,
 (SELECT array_agg(CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END ORDER BY a.grantee) FROM aclexplode(p.proacl) a WHERE privilege_type='EXECUTE') executors
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner WHERE n.nspname='app' AND p.proname='mon8_retained_contractor_workspace'`)).rows;
 expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({args:"s uuid, q jsonb",owner:"jobguard_migration",prosecdef:true,proconfig:["search_path=pg_catalog"],runtime:true});expect(rows[0].executors.sort()).toEqual(["jobguard_migration","jobguard_runtime"]);
});
it("PUBLIC and infrastructure cannot execute the reader",async()=>{
 expect((await c.admin.query("SELECT has_function_privilege('jobguard_infrastructure','app.mon8_retained_contractor_workspace(uuid,jsonb)','EXECUTE') allowed")).rows[0].allowed).toBe(false);
 const db=await c.admin.connect();try{await db.query("BEGIN");await db.query("SET LOCAL ROLE jobguard_infrastructure");await expect(db.query("SELECT app.mon8_retained_contractor_workspace(NULL,'{}')")).rejects.toMatchObject({code:"42501"});}finally{await db.query("ROLLBACK");db.release();}
 expect((await c.admin.query("SELECT EXISTS(SELECT 1 FROM pg_proc p,aclexplode(p.proacl) a WHERE p.oid='app.mon8_retained_contractor_workspace(uuid,jsonb)'::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE') allowed")).rows[0].allowed).toBe(false);
});
it("upgrade comparator detects an unrelated grant or row change",async()=>{
 const rows=await snapshot(c.admin),cat=await catalogue(c.admin),db=await c.admin.connect();try{
 await db.query("BEGIN");await db.query("GRANT DELETE ON app.account TO jobguard_runtime");expect(await catalogue(db)).not.toEqual(cat);await db.query("ROLLBACK");
 await db.query("BEGIN");await db.query("UPDATE app.account SET name='Fictional negative control'");expect(await snapshot(db)).not.toEqual(rows);
 }finally{await db.query("ROLLBACK");db.release();}expect(await catalogue(c.admin)).toEqual(cat);expect(await snapshot(c.admin)).toEqual(rows);
});
