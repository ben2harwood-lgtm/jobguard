// CI ONLY: populated upgrade preserves existing no-amount commands and enables v1.
import {readFile} from "node:fs/promises";
import {afterAll,beforeAll,expect,it} from "vitest";
import {migrate,MIGRATION_URLS} from "../src/migrate.js";
import {createFinalCheckFixture,closeFinalCheckFixture,type FinalCheckFixture} from "./final-check-fixture.js";
import {installLegacySyntheticPartyFixtures} from "./pool-test-utils.js";
import {proofBefore,proofDifferences} from "./upgrade-proof-utils.js";
import {realReceiptFixture} from "./stored-receipt-case-fixture.js";

let f:FinalCheckFixture;
const environment=process.env.JOBGUARD_ENV;
const target="0384_receipt_line_command_producer.sql";
beforeAll(async()=>{f=await createFinalCheckFixture(false);},120000);
afterAll(async()=>{
 await closeFinalCheckFixture(f);
 if(environment===undefined)delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=environment;
});
it("populated F5/F7 survive 0377, old commands replay, and v1 writes after upgrade",async()=>{
 const own=MIGRATION_URLS.findIndex(url=>url.pathname.endsWith(`/${target}`));
 expect(own).toBeGreaterThan(0);
 await f.admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
 for(const url of MIGRATION_URLS.slice(0,own)){
  const name=url.pathname.split("/").at(-1)!,sql=await readFile(url,"utf8");
  await f.admin.query(name.startsWith("0095_")?sql.replace("BEGIN;","BEGIN; SELECT set_config('app.deployment_mode','details_needed',true);"):sql);
  await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)",[name]);
 }
 // The generated test logins are created before roles exist in this upgrade fixture.
 for(const [pool,role] of [[f.runtime,"jobguard_runtime"],[f.shadow,"jobguard_shadow"]] as const){
  const login=(await pool.query("SELECT current_user AS name")).rows[0].name as string;
  await f.admin.query(`GRANT ${role} TO "${login.replaceAll('"','""')}"`);
 }
 await installLegacySyntheticPartyFixtures(f.admin);
 const a=await realReceiptFixture(f,"F5"),b=await realReceiptFixture(f,"F7");
 const tables=["receipt_allocation_fact_source","receipt_allocation_fact_line","customer_payment","customer_invoice","final_account_lock"].map(n=>`app.${n}`);
 const before=await proofBefore(f.admin,tables);
 await migrate(f.admin);await migrate(f.admin);
 expect(await proofDifferences(f.admin,before)).toEqual({rows:[],types:[]});
 for(const x of [a,b]){
  const p={version:"receipt-line-facts-command.v1",action:"approve",commandId:x.produced.commandId,reviewId:x.produced.reviewId,approvalHash:x.produced.approvalHash,expectedSourceRevision:x.produced.sourceRevision};
  expect(await x.producer.command(x.context,x.actor,x.auth.digest,x.jobId,p)).toEqual({...x.produced,replayed:true});
 }
 const enabled=await realReceiptFixture(f,"F7","receipt-line-allocation-command.v1");
 expect(enabled.fact.gross).toEqual({numerator:"96000",denominator:"1"});
 expect((await f.admin.query("SELECT count(*)::int n FROM public.jobguard_schema_migration WHERE migration_name=$1",[target])).rows).toEqual([{n:1}]);
},120000);
