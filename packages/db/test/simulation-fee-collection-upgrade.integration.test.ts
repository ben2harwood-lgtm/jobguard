import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll,beforeAll,expect,it } from "vitest";
import { migrate,MIGRATION_URLS } from "../src/migrate.js";
import { SimulationFeeCollectionRepository } from "../src/simulation-fee-collection-repository.js";
import { SimulationFeeStatementRepository } from "../src/simulation-fee-statement-repository.js";
import { createFinalCheckFixture,closeFinalCheckFixture,type FinalCheckFixture } from "./final-check-fixture.js";
import { installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
import { proofBefore,proofDifferences } from "./upgrade-proof-utils.js";
import { catchFeeFixture } from "./success-fee-catch-fixture.js";
let f:FinalCheckFixture;
beforeAll(async()=>{f=await createFinalCheckFixture(false);},120000);
afterAll(async()=>{if(f)await closeFinalCheckFixture(f);});
it("0491 preserves posted predecessor rows/types, repeats safely and issues from the genuine pre-upgrade approval",async()=>{
 const own=MIGRATION_URLS.findIndex(u=>u.pathname.endsWith('/0519_simulation_fee_collection.sql'));expect(own).toBeGreaterThan(0);
 await f.admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
 for(const url of MIGRATION_URLS.slice(0,own)){
  const name=url.pathname.split('/').at(-1)!,sql=await readFile(url,"utf8");
  await f.admin.query(name.startsWith('0095_')?sql.replace('BEGIN;',"BEGIN; SELECT set_config('app.deployment_mode','details_needed',true);"):sql);
  await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)",[name]);
 }
 for(const [pool,role] of [[f.runtime,"jobguard_runtime"],[f.shadow,"jobguard_shadow"]] as const){
  const login=(await pool.query("SELECT current_user name")).rows[0].name as string;
  await f.admin.query(`GRANT ${role} TO "${login.replaceAll('"','""')}"`);
 }
 await installLegacySyntheticPartyFixtures(f.admin);const x=await catchFeeFixture(f),review=await x.execute();
 await x.execute({version:"success-fee-command.v1",action:"approve",commandId:randomUUID(),expectedPostingRevision:0,reviewId:review.reviewId,statementHash:review.statementHash});
 const before=await proofBefore(f.admin,["success_fee_command","success_fee_review","success_fee_derivation","success_fee_journal","success_fee_journal_line","success_fee_source","platform_statement","platform_statement_line","subscription_period","customer_payment","final_account_lock"].map(n=>`app.${n}`));
 await migrate(f.admin);await migrate(f.admin);expect(await proofDifferences(f.admin,before)).toEqual({rows:[],types:[]});
 const repo=new SimulationFeeStatementRepository(f.runtime),command={version:"simulation-fee-statement-command.v1",action:"issue",commandId:randomUUID()};
 const saved=await repo.command(x.context,x.jobId,x.auth.digest,command);
 const collection=new SimulationFeeCollectionRepository(f.runtime),collect={version:"simulation-fee-collection-command.v1",action:"collect",commandId:randomUUID(),statementId:saved.statementId,statementHash:saved.documentHash,amountPence:8000};
 const attempt=await collection.command(x.context,x.jobId,x.auth.digest,collect);await migrate(f.admin);
 expect(await collection.command(x.context,x.jobId,x.auth.digest,collect)).toEqual({...attempt,replayed:true});
 expect(await collection.view(x.context,x.jobId,x.auth.digest)).toMatchObject({collectionReserved:8000,settledPrincipal:0});
 expect(await proofDifferences(f.admin,before)).toEqual({rows:[],types:[]});
 for(const name of ["platform_fee_attempt","platform_fee_attempt_event","platform_fee_collection_command"]){
  expect((await f.admin.query("SELECT r.rolname owner,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner WHERE c.oid=$1::regclass",[`app.${name}`])).rows).toEqual([{owner:"jobguard_migration",relrowsecurity:true,relforcerowsecurity:true}]);
  for(const role of ["jobguard_runtime","jobguard_shadow","jobguard_infrastructure"])
   expect((await f.admin.query("SELECT has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') allowed",[role,`app.${name}`])).rows[0].allowed).toBe(false);
 }
},120000);
