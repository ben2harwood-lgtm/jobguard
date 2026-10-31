// CI ONLY: populated predecessor upgrade and repeat migration pass.
import {randomUUID} from "node:crypto";
import {readFile} from "node:fs/promises";
import {expect,it} from "vitest";
import {migrate,MIGRATION_URLS} from "../src/migrate.js";
import {createFinalCheckFixture,closeFinalCheckFixture} from "./final-check-fixture.js";
import {installLegacySyntheticPartyFixtures} from "./pool-test-utils.js";
import {proofBefore,proofDifferences} from "./upgrade-proof-utils.js";
import {catchFeeFixture} from "./success-fee-catch-fixture.js";
it("0489 preserves posted catch and allocation history, RLS and closed ACLs",async()=>{
 const f=await createFinalCheckFixture(false);
 try{
  const own=MIGRATION_URLS.findIndex(u=>u.pathname.endsWith('/0522_success_fee_recovery_compensation.sql'));expect(own).toBeGreaterThan(0);
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
  const x=await catchFeeFixture(f),r=await x.execute(),command={version:"success-fee-command.v1",action:"approve",commandId:randomUUID(),expectedPostingRevision:0,reviewId:r.reviewId,statementHash:r.statementHash};
  const posted=await x.execute(command);
  const tables=["success_fee_command","success_fee_review","success_fee_derivation","success_fee_journal","success_fee_journal_line","receipt_allocation_fact_line","stored_receipt_case_allocation"];
  const before=await proofBefore(f.admin,tables.map(t=>`app.${t}`));
  const source=(await f.admin.query("SELECT tenant_id,job_id,derivation_id,assessment_id,allocation_id,review_authorization_id,case_id,work_id,line_id,lock_id FROM app.success_fee_source ORDER BY tenant_id,derivation_id,allocation_id")).rows;
  await migrate(f.admin);await migrate(f.admin);
  expect(await proofDifferences(f.admin,before)).toEqual({rows:[],types:[]});
  expect((await f.admin.query("SELECT tenant_id,job_id,derivation_id,assessment_id,allocation_id,review_authorization_id,case_id,work_id,line_id,lock_id FROM app.success_fee_source ORDER BY tenant_id,derivation_id,allocation_id")).rows).toEqual(source);
  expect(await x.execute(command)).toEqual({...posted,replayed:true});
  const rows=(await f.admin.query("SELECT relrowsecurity,relforcerowsecurity,pg_get_userbyid(relowner) owner FROM pg_class WHERE oid IN('app.success_fee_source'::regclass,'app.success_fee_derivation'::regclass,'app.success_fee_journal'::regclass)")).rows;
  expect(rows).toHaveLength(3);expect(rows.every(r=>r.relrowsecurity&&r.relforcerowsecurity&&r.owner==='jobguard_migration')).toBe(true);
  for(const table of ["source","derivation","journal","journal_line"])
   await expect(f.runtime.query(`INSERT INTO app.success_fee_${table} DEFAULT VALUES`)).rejects.toMatchObject({code:"42501"});
 }finally{await closeFinalCheckFixture(f);}
},120000);
