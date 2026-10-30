import {randomUUID} from "node:crypto";
import {readFile} from "node:fs/promises";
import {afterAll,beforeAll,expect,it} from "vitest";
import {migrate,MIGRATION_URLS} from "../src/migrate.js";
import {createFinalCheckFixture,closeFinalCheckFixture,type FinalCheckFixture} from "./final-check-fixture.js";
import {installLegacySyntheticPartyFixtures} from "./pool-test-utils.js";
import {proofBefore,proofDifferences} from "./upgrade-proof-utils.js";
import {catchFeeFixture} from "./success-fee-catch-fixture.js";
let f:FinalCheckFixture;
beforeAll(async()=>{f=await createFinalCheckFixture(false);},120000);
afterAll(async()=>{if(f)await closeFinalCheckFixture(f);});
it("0473 preserves populated predecessor postings and replay; fresh structural guards install exactly once",async()=>{
 const own=MIGRATION_URLS.findIndex(u=>u.pathname.endsWith('/0473_success_fee_production_safety.sql'));expect(own).toBeGreaterThan(0);
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
 await installLegacySyntheticPartyFixtures(f.admin);
 const x=await catchFeeFixture(f),review=await x.execute();
 const command={version:"success-fee-command.v1",commandId:randomUUID(),action:"approve",reviewId:review.reviewId,statementHash:review.statementHash,expectedPostingRevision:0};
 const posted=await x.execute(command);
 const tables=["command","review","derivation","source","journal","journal_line"].map(n=>`app.success_fee_${n}`);
 const before=await proofBefore(f.admin,tables);
 await migrate(f.admin);await migrate(f.admin);
 expect(await proofDifferences(f.admin,before)).toEqual({rows:[],types:[]});
 expect(await x.execute(command)).toEqual({...posted,replayed:true});
 expect((await f.admin.query("SELECT count(*)::int n FROM pg_trigger WHERE tgname='success_fee_posting_integrity' AND NOT tgisinternal")).rows).toEqual([{n:1}]);
 expect((await f.admin.query("SELECT count(*)::int n FROM public.jobguard_schema_migration WHERE migration_name='0473_success_fee_production_safety.sql'")).rows).toEqual([{n:1}]);
},120000);
