// CI ONLY: populated predecessor preservation and idempotent forward migrations.
import {randomUUID} from "node:crypto";
import {readFile} from "node:fs/promises";
import {afterAll,beforeAll,expect,it} from "vitest";
import {migrate,MIGRATION_URLS} from "../src/migrate.js";
import {createFinalCheckFixture,closeFinalCheckFixture,type FinalCheckFixture} from "./final-check-fixture.js";
import {installLegacySyntheticPartyFixtures} from "./pool-test-utils.js";
import {proofBefore,proofDifferences} from "./upgrade-proof-utils.js";
import {realReceiptFixture} from "./stored-receipt-case-fixture.js";
import {catchFeeFixture} from "./success-fee-catch-fixture.js";
let f:FinalCheckFixture;
beforeAll(async()=>{f=await createFinalCheckFixture(false);},120000);
afterAll(async()=>{if(f)await closeFinalCheckFixture(f);});
it("0392/0393 preserve populated v1 receipt chains and enable a writer-driven catch posting",async()=>{
 const own=MIGRATION_URLS.findIndex(u=>u.pathname.endsWith('/0392_success_fee_catch_facts.sql'));expect(own).toBeGreaterThan(0);
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
 await installLegacySyntheticPartyFixtures(f.admin);const old=await realReceiptFixture(f,"F7","receipt-line-allocation-command.v1");
 const before=await proofBefore(f.admin,["receipt_allocation_fact_command","receipt_allocation_fact_source","receipt_allocation_fact_line","customer_payment","final_account_lock"].map(n=>`app.${n}`));
 await migrate(f.admin);await migrate(f.admin);expect(await proofDifferences(f.admin,before)).toEqual({rows:[],types:[]});
 expect(await old.producer.command(old.context,old.actor,old.auth.digest,old.jobId,{version:"receipt-line-allocation-command.v1",action:"approve",commandId:old.produced.commandId,reviewId:old.produced.reviewId,approvalHash:old.produced.approvalHash,expectedSourceRevision:old.produced.sourceRevision})).toEqual({...old.produced,replayed:true});
 const x=await catchFeeFixture(f),review=await x.execute();
 const p={version:"success-fee-command.v1",commandId:randomUUID(),action:"approve",reviewId:review.reviewId,statementHash:review.statementHash,expectedPostingRevision:0};
 const posted=await x.execute(p);await migrate(f.admin);expect(await x.execute(p)).toEqual({...posted,replayed:true});
 expect(posted.statement.deltaPence).toBe(8000);
},120000);
