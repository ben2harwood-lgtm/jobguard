import {randomUUID} from "node:crypto";
import {readFile} from "node:fs/promises";
import {afterAll,beforeAll,expect,it} from "vitest";
import {migrate,MIGRATION_URLS} from "../src/migrate.js";
import {SimulationFeeStatementRepository} from "../src/simulation-fee-statement-repository.js";
import {createFinalCheckFixture,closeFinalCheckFixture,type FinalCheckFixture} from "./final-check-fixture.js";
import {installLegacySyntheticPartyFixtures} from "./pool-test-utils.js";
import {recoveryFeeFixture} from "./success-fee-recovery-fixture.js";
import {proofBefore,proofDifferences} from "./upgrade-proof-utils.js";
let f:FinalCheckFixture;
beforeAll(async()=>{f=await createFinalCheckFixture(false);},120000);
afterAll(async()=>{if(f)await closeFinalCheckFixture(f);});
it("0497 preserves genuine pre-upgrade withheld allocations and fee postings, and retains existing routine ACLs",async()=>{
 const own=MIGRATION_URLS.findIndex(u=>u.pathname.endsWith('/0497_withheld_payment_statement_source.sql'));expect(own).toBeGreaterThan(0);
 await f.admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
 // 0507 is an independent prerequisite for genuine withheld fee postings.
 // Install it before the adapter upgrade fixture despite its later reserved number.
 const compensation=MIGRATION_URLS.find(u=>u.pathname.endsWith('/0507_success_fee_recovery_compensation.sql'));expect(compensation).toBeDefined();
 for(const url of [...MIGRATION_URLS.slice(0,own),compensation!]){
  const name=url.pathname.split('/').at(-1)!,sql=await readFile(url,"utf8");
  await f.admin.query(name.startsWith('0095_')?sql.replace('BEGIN;',"BEGIN; SELECT set_config('app.deployment_mode','details_needed',true);"):sql);
  await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)",[name]);
 }
 for(const [pool,role] of [[f.runtime,"jobguard_runtime"],[f.shadow,"jobguard_shadow"]] as const){
  const login=(await pool.query("SELECT current_user name")).rows[0].name as string;
  await f.admin.query(`GRANT ${role} TO "${login.replaceAll('"','""')}"`);
 }
 await installLegacySyntheticPartyFixtures(f.admin);
 const x=await recoveryFeeFixture(f);await x.allocate(0);await x.approve(await x.review());
 const tables=["recovery_case_allocation","receipt_line_allocation","customer_payment","success_fee_derivation","success_fee_review","success_fee_journal","success_fee_source","platform_statement","subscription_period"].map(n=>`app.${n}`);
 const before=await proofBefore(f.admin,tables);
 const acl=()=>f.admin.query("SELECT proname,proacl::text,prosecdef,proconfig,pg_get_userbyid(proowner) owner FROM pg_proc WHERE oid IN ('app.platform_fee_statement_sources(uuid,uuid,uuid)'::regprocedure,'app.simulation_money_sources(uuid,uuid,uuid)'::regprocedure,'app.write_platform_fee_statement(uuid,text,jsonb)'::regprocedure,'app.write_platform_fee_collection(uuid,text,jsonb)'::regprocedure,'app.simulation_money_run(uuid,text,jsonb)'::regprocedure) ORDER BY proname");
 const prior=await acl();await migrate(f.admin);await migrate(f.admin);
 expect(await proofDifferences(f.admin,before)).toEqual({rows:[],types:[]});expect((await acl()).rows).toEqual(prior.rows);
 const helper=(await f.admin.query("SELECT pg_get_userbyid(proowner) owner,prosecdef,proconfig,proacl::text FROM pg_proc WHERE oid='app.success_fee_withheld_source(uuid,uuid,uuid)'::regprocedure")).rows;
 expect(helper).toEqual([{owner:"jobguard_migration",prosecdef:false,proconfig:["search_path=pg_catalog"],proacl:"{jobguard_migration=X/jobguard_migration}"}]);
 for(const pool of [f.runtime,f.shadow])await expect(pool.query("SELECT app.success_fee_withheld_source($1,$2,$3)",[x.context.tenantId,x.jobId,randomUUID()])).rejects.toMatchObject({code:"42501"});

 const statements=new SimulationFeeStatementRepository(f.runtime);
 const command={version:"simulation-fee-statement-command.v1",action:"issue",commandId:randomUUID()};
 const issued=await statements.command(x.context,x.jobId,x.auth.digest,command);
 expect((await statements.download(x.context,x.jobId,x.auth.digest,issued.statementId))!.document).toMatchObject({
  cumulativeFeePrincipal:{pence:3200},sourceSnapshot:{sources:[{recoveryAllocationId:expect.any(String),paymentId:x.payments[0]}]},
 });
 await migrate(f.admin);expect(await statements.command(x.context,x.jobId,x.auth.digest,command)).toEqual({...issued,replayed:true});
 expect(await proofDifferences(f.admin,before)).toEqual({rows:[],types:[]});
},120000);
