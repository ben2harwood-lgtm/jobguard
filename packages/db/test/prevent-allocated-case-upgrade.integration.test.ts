// CI ONLY: upgrade a populated stored-cash catch without rewriting its history.
import {randomUUID} from "node:crypto";
import {readFile} from "node:fs/promises";
import {afterAll,beforeAll,expect,it} from "vitest";
import {MIGRATION_URLS,migrate} from "../src/migrate.js";
import {RecoveryCaseRepository} from "../src/recovery-case-repository.js";
import {StoredReceiptCaseAllocationRepository} from "../src/stored-receipt-case-allocation-repository.js";
import {createFinalCheckFixture,closeFinalCheckFixture,type FinalCheckFixture} from "./final-check-fixture.js";
import {installLegacySyntheticPartyFixtures} from "./pool-test-utils.js";
import {realReceiptFixture} from "./stored-receipt-case-fixture.js";
let f:FinalCheckFixture;
beforeAll(async()=>{f=await createFinalCheckFixture(false);},120000);
afterAll(async()=>{await closeFinalCheckFixture(f);});
it("0564 preserves a populated predecessor and blocks prevention of its cash catch",async()=>{
 const own=MIGRATION_URLS.findIndex(url=>url.pathname.endsWith("0529_prevent_allocated_case.sql"));
 expect(own).toBeGreaterThan(0);
 await f.admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
 for(const url of MIGRATION_URLS.slice(0,own)){
  const name=url.pathname.split("/").at(-1)!,sql=await readFile(url,"utf8");
  await f.admin.query(name.startsWith("0095_")?sql.replace("BEGIN;","BEGIN; SELECT set_config('app.deployment_mode','details_needed',true);"):sql);
  await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)",[name]);
 }
 await installLegacySyntheticPartyFixtures(f.admin);
 for(const [pool,role] of [[f.runtime,"jobguard_runtime"],[f.shadow,"jobguard_shadow"]] as const){
  const {rows}=await pool.query("SELECT current_user name");
  // Fixture login names are generated locally; quote as SQL identifiers.
  await f.admin.query(`GRANT ${role} TO "${String(rows[0].name).replaceAll('"','""')}"`);
 }
 const x=await realReceiptFixture(f,"F7"),receipts=new StoredReceiptCaseAllocationRepository(f.runtime,"synthetic_demo"),cases=new RecoveryCaseRepository(x.scoped);
 const before=(await cases.listForMember(x.context,x.jobId,x.actor)).find(c=>c.id===x.caseId)!;
 const p={version:"stored-receipt-case-command.v1",action:"review",commandId:randomUUID(),caseId:x.caseId,workId:x.workId,factLineId:x.fact.lineAllocationId,expectedCaseRevision:before.revision};
 const review=await receipts.command(x.context,x.jobId,x.auth.digest,p);
 await receipts.command(x.context,x.jobId,x.auth.digest,{...p,action:"approve",commandId:randomUUID(),reviewId:review.reviewId,approvalHash:review.approvalHash});
 const history=async()=> (await f.admin.query("SELECT row_to_json(a)::text bytes FROM app.stored_receipt_case_allocation a WHERE tenant_id=$1 AND case_id=$2 ORDER BY id",[x.context.tenantId,x.caseId])).rows;
 const original=await history();expect(original).toHaveLength(1);
 await migrate(f.admin);await migrate(f.admin);
 expect(await history()).toEqual(original);
 expect((await cases.listForMember(x.context,x.jobId,x.actor)).find(c=>c.id===x.caseId)).toEqual(before);
 await expect(cases.command(x.context,x.jobId,{version:"recovery-case-command.v1",action:"transition",eventType:"prevent",commandId:randomUUID(),caseId:x.caseId,expectedRevision:before.revision},x.actor)).rejects.toMatchObject({code:"RECOVERY_TRANSITION_FORBIDDEN"});
 const guard=(await f.admin.query("SELECT prosecdef,has_function_privilege('jobguard_runtime',oid,'EXECUTE') executable FROM pg_proc WHERE oid='app.guard_prevention_after_stored_receipt()'::regprocedure")).rows;
 expect(guard).toEqual([{prosecdef:true,executable:false}]);
});
