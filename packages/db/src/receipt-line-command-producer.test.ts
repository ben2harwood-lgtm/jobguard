import {readFile} from "node:fs/promises";
import {randomUUID} from "node:crypto";
import type {Pool} from "pg";
import {expect,it,vi} from "vitest";
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
it("0384 is discovered once and replaces only the latest writer and source validator, retaining its controls and privilege surface",async()=>{
 const name="0384_receipt_line_command_producer.sql";
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
