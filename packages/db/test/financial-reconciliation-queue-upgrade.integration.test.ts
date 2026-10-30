// CI only: apply 0479 alone, preserve populated predecessor rows and routine bodies,
// then apply all successors twice. No PostgreSQL startup in the builder sandbox.
import { afterAll, beforeAll, expect, it } from "vitest";
import { startBeforeMigration, applyMigration, startSession, type Cluster } from "./contractor-practice-session-fixtures.js";
import { proofBefore, proofDifferences } from "./upgrade-proof-utils.js";
import { migrate } from "../src/migrate.js";
let c:Cluster;
const own="0479_financial_reconciliation_queue.sql";
const tables=["financial_reconciliation_run","financial_reconciliation_difference","financial_reconciliation_adjustment","financial_reconciliation_approval","financial_reconciliation_command"];
beforeAll(async()=>{process.env.JOBGUARD_ENV="synthetic_demo";c=await startBeforeMigration(own);},240000);
afterAll(async()=>{await c?.close();});
it("adds only its tables and one runtime routine while preserving populated history",async()=>{
 await startSession(c);
 const old=(await c.admin.query("SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('app','identity','control_plane','audit_control') AND c.relkind='r' AND EXISTS(SELECT 1 FROM pg_index i WHERE i.indrelid=c.oid AND i.indisprimary) ORDER BY 1,2")).rows;
 const proof=await proofBefore(c.admin,old.map(r=>`${r.nspname}.${r.relname}`));
 const routines=async()=>(await c.admin.query("SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args,pg_get_functiondef(p.oid) body,p.proacl,p.proowner FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('app','identity','control_plane','audit_control') AND p.prokind='f' AND p.proname<>'financial_reconciliation_queue' ORDER BY 1,2,3")).rows;
 const before=await routines();await applyMigration(c,own);
 expect(await proofDifferences(c.admin,proof)).toEqual({rows:[],types:[]});expect(await routines()).toEqual(before);
 for(const t of tables){
  expect((await c.admin.query(`SELECT * FROM app.${t}`)).rows).toEqual([]);
  const catalog=(await c.admin.query("SELECT relrowsecurity,relforcerowsecurity,pg_get_userbyid(relowner) owner,has_table_privilege('jobguard_runtime',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') runtime,has_table_privilege('jobguard_infrastructure',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') infrastructure FROM pg_class WHERE oid=$1::regclass",['app.'+t])).rows[0];
  expect(catalog).toEqual({relrowsecurity:true,relforcerowsecurity:true,owner:'jobguard_migration',runtime:false,infrastructure:false});
 }
 expect((await c.admin.query("SELECT prosecdef,proconfig,pg_get_userbyid(proowner) owner,has_function_privilege('jobguard_runtime',oid,'EXECUTE') runtime,has_function_privilege('jobguard_infrastructure',oid,'EXECUTE') infrastructure,EXISTS(SELECT 1 FROM aclexplode(proacl) WHERE grantee=0) public FROM pg_proc WHERE oid='app.financial_reconciliation_queue(uuid,uuid,jsonb)'::regprocedure")).rows).toEqual([{prosecdef:true,proconfig:['search_path=pg_catalog'],owner:'jobguard_migration',runtime:true,infrastructure:false,public:false}]);
 await migrate(c.admin);await migrate(c.admin);
 expect(await proofDifferences(c.admin,proof)).toEqual({rows:[],types:[]});
});
