// CI only: real upgrade from the immediate predecessor, no history rewritten.
import { readFile } from "node:fs/promises";
import { afterAll, expect, it } from "vitest";
import { startBeforeMigration, applyMigration } from "./contractor-practice-session-fixtures.js";
import { fixture, newCase, start, command, type Cluster } from "./managed-recovery-fixtures.js";
import { migrate, MIGRATION_URLS } from "../src/migrate.js";
import { ManagedRecoveryRepository } from "../src/managed-recovery-repository.js";
const own='0483_managed_recovery_election.sql';
let c: Cluster;
afterAll(async()=>{await c?.close();});
it('backfills a permanent start, preserves exact history and replays migration safely',async()=>{
 c=await startBeforeMigration(own);const f=await fixture(c),id=await newCase(c,f);await start(c,f,id);
 const history=()=>c.admin.query('SELECT to_jsonb(e) row FROM app.recovery_case_event e WHERE tenant_id=$1 AND case_id=$2',[f.tenant,id]);
 const before=(await history()).rows;
 await applyMigration(c,own);expect((await history()).rows).toEqual(before);
 const marker=(await c.admin.query('SELECT * FROM app.managed_recovery_pursuit WHERE tenant_id=$1 AND case_id=$2',[f.tenant,id])).rows;
 expect(marker).toHaveLength(1);
 await expect(new ManagedRecoveryRepository(c.runtime).elect(f.context,f.job,command(id),f.actor)).rejects.toMatchObject({code:'PURSUIT_ALREADY_STARTED'});
 await migrate(c.admin);expect((await history()).rows).toEqual(before);
 expect((await c.admin.query('SELECT * FROM app.managed_recovery_pursuit WHERE tenant_id=$1 AND case_id=$2',[f.tenant,id])).rows).toEqual(marker);
 // No replaced predecessor routine; executable only via the one checked route.
 const privileges=(await c.admin.query(`SELECT p.proname,p.prosecdef,has_function_privilege('jobguard_runtime',p.oid,'EXECUTE') runtime,
  EXISTS(SELECT 1 FROM aclexplode(p.proacl) WHERE grantee=0 AND privilege_type='EXECUTE') public
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='app' AND p.proname IN('mon9_elect','mon9_pursuit_guard') ORDER BY 1`)).rows;
 expect(privileges).toEqual([{proname:'mon9_elect',prosecdef:true,runtime:true,public:false},{proname:'mon9_pursuit_guard',prosecdef:true,runtime:false,public:false}]);
 const sql=await readFile(MIGRATION_URLS.find(u=>u.pathname.endsWith(own))!,'utf8');
 expect(sql).not.toMatch(/CREATE OR REPLACE|DROP /u);
},120000);
