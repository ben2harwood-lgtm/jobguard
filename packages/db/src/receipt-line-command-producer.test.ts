import {readFile} from "node:fs/promises";
import {randomUUID} from "node:crypto";
import type {Pool} from "pg";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {RecoveryLineAllocationRepository} from "./receipt-line-allocation-repository.js";
import {verifiedTenantContextForQueuedJob} from "./tenant-context.js";
import {MIGRATION_URLS} from "./migrate.js";
const version="receipt-line-allocation-command.v1";
const base={version,commandId:randomUUID(),expectedSourceRevision:1};
it.each([
 {...base,action:"review",paymentId:randomUUID(),grossPence:1},
 {...base,action:"review_reverse",allocationRevisionId:randomUUID(),reversalSource:{kind:"credit_note",sourceId:randomUUID()}},
 {...base,action:"review_reverse",allocationRevisionId:randomUUID(),reversalSource:{kind:"credit_note",sourceId:randomUUID()},grossPence:0},
 {...base,action:"review_reverse",allocationRevisionId:randomUUID(),reversalSource:{kind:"credit_note",sourceId:randomUUID()},grossPence:1,netPence:1},
])("strict v1 refuses injected or incomplete money before database access",async raw=>{
 const connect=vi.fn(),repository=new RecoveryLineAllocationRepository({connect} as unknown as Pool,"synthetic_demo");
 await expect(repository.command(verifiedTenantContextForQueuedJob(randomUUID()),{membershipId:randomUUID(),identityUserId:randomUUID()},"a".repeat(64),randomUUID(),raw)).rejects.toMatchObject({code:"INVALID_RECEIPT_LINE_COMMAND"});
 expect(connect).not.toHaveBeenCalled();
});
it("0398 is discovered once and replaces only the latest writer and source validator, retaining its controls and privilege surface",async()=>{
 const name="0398_receipt_line_command_producer.sql";
 expect(MIGRATION_URLS.filter(url=>url.pathname.endsWith(name))).toHaveLength(1);
 const sql=await readFile(new URL(`../migrations/${name}`,import.meta.url),"utf8");
 expect(sql).toMatch(/^BEGIN;/u);expect(sql).toMatch(/COMMIT;\s*$/u);
 expect(sql.match(/CREATE OR REPLACE FUNCTION/gu)).toHaveLength(2);
 expect(sql).not.toMatch(/\b(?:GRANT|REVOKE|ALTER TABLE|CREATE TABLE)\b/u);
 expect(sql).not.toContain("RECEIPT_LINE_SOURCE_HANDOFF_REQUIRED");
 expect(sql).not.toMatch(/IS DISTINCT FROM CASE WHEN/u);
 for(const control of ["current_database()<>'jobguard_synthetic_demo'","app.assert_receipt_fact_scope","RECEIPT_LINE_SERIALIZABLE_REQUIRED","RECEIPT_LINE_IDEMPOTENCY_CONFLICT","app.receipt_fact_proposal","RECEIPT_LINE_REVERSAL_AMOUNT_CHANGED","app.append_final_check_audit"])
  expect(sql).toContain(control);
});

describe("shared-tenant write conflicts",()=>{
 beforeEach(()=>{vi.stubEnv("JOBGUARD_ENV","synthetic_demo");});
 afterEach(()=>{vi.unstubAllEnvs();});
 const run=(failures:number,code="40001")=>{
  let left=failures,writes=0;const queries:string[]=[];
  const client={release:vi.fn(),query:vi.fn(async(sql:string)=>{queries.push(sql);
   if(sql.includes("write_receipt_allocation_facts")){writes++;if(left-->0)throw Object.assign(new Error("conflict"),{code});return {rowCount:1,rows:[]};}
   return sql.includes("SELECT m.id")?{rowCount:1,rows:[]}:{rowCount:1,rows:[]};})};
  const raw={version:"receipt-line-facts-command.v1",action:"review",commandId:randomUUID(),expectedSourceRevision:1,paymentId:randomUUID()};
  const result=new RecoveryLineAllocationRepository({connect:vi.fn(async()=>client)} as unknown as Pool,"synthetic_demo").command(verifiedTenantContextForQueuedJob(randomUUID()),{membershipId:randomUUID(),identityUserId:randomUUID()},"a".repeat(64),randomUUID(),raw);
  return {result,count:()=>writes,queries};
 };
 it("re-runs a rolled-back serialization conflict in a new serializable transaction with the same command",async()=>{
  const x=run(2);await expect(x.result).rejects.toMatchObject({code:"INVALID_RECEIPT_LINE_RESULT"}); // Past the conflicts to the fabricated-result refusal.
  expect(x.count()).toBe(3);expect(x.queries.filter(sql=>sql==="BEGIN ISOLATION LEVEL SERIALIZABLE")).toHaveLength(3);expect(x.queries.filter(sql=>sql==="ROLLBACK")).toHaveLength(3);
 });
 it("gives up after a bounded number of attempts and reports the conflict",async()=>{
  const x=run(99);await expect(x.result).rejects.toMatchObject({code:"40001"});expect(x.count()).toBe(5);
 });
 it("never retries any other database failure",async()=>{
  const x=run(1,"23514");await expect(x.result).rejects.toMatchObject({code:"23514"});expect(x.count()).toBe(1);
 });
});
