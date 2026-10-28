import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { StoredReceiptCaseAllocationRepository, storedReceiptCaseCommandV1 } from "./stored-receipt-case-allocation-repository.js";
import type { VerifiedTenantContext } from "./tenant-context.js";
const command = { version: "stored-receipt-case-command.v1", action: "review", commandId: randomUUID(), factLineId: randomUUID(), caseId: randomUUID(), workId: randomUUID(), expectedCaseRevision: 1 };
describe("stored receipt case command boundary", () => {
  it.each(["grossPence", "netPence", "taxPence", "artifact", "sourceHash", "tenantId"])("refuses app-supplied %s before connecting", async key => {
    const pool = { connect: vi.fn() };
    await expect(new StoredReceiptCaseAllocationRepository(pool as unknown as Pool, "synthetic_demo")
      .command({} as VerifiedTenantContext, randomUUID(), "a".repeat(64), { ...command, [key]: 1 })).rejects.toMatchObject({ code: "INVALID_STORED_RECEIPT_COMMAND" });
    expect(pool.connect).not.toHaveBeenCalled();
  });
  it.each(["production", "pilot_no_charge", "unconfigured", "development"])("refuses %s before connecting", async env => {
    const pool = { connect: vi.fn() };
    await expect(new StoredReceiptCaseAllocationRepository(pool as unknown as Pool, env)
      .command({} as VerifiedTenantContext, randomUUID(), "a".repeat(64), command)).rejects.toMatchObject({ code: "STORED_RECEIPT_SYNTHETIC_ONLY" });
    expect(pool.connect).not.toHaveBeenCalled();
  });
  it("requires the saved review identity and exact approval hash", () => {
    expect(storedReceiptCaseCommandV1.safeParse(command).success).toBe(true);
    expect(storedReceiptCaseCommandV1.safeParse({ ...command, action: "approve" }).success).toBe(false);
    expect(storedReceiptCaseCommandV1.safeParse({ ...command, action: "approve", reviewId: randomUUID(), approvalHash: "b".repeat(64) }).success).toBe(true);
  });
});

import {RecoveryLineAllocationRepository,neutralReceiptFactCommandV1} from "./receipt-line-allocation-repository.js";
import {verifiedTenantContextForQueuedJob} from "./tenant-context.js";
describe("neutral no-amount producer boundary",()=>{
 const raw={version:"receipt-line-facts-command.v1",action:"review",commandId:randomUUID(),expectedSourceRevision:1,paymentId:randomUUID()};
 it.each(["grossPence","netPence","taxPence","lines","artifact","movementId"])("refuses injected %s before connecting",async key=>{
  const connect=vi.fn(),producer=new RecoveryLineAllocationRepository({connect} as unknown as Pool,"synthetic_demo");
  await expect(producer.command(verifiedTenantContextForQueuedJob(randomUUID()),{membershipId:randomUUID(),identityUserId:randomUUID()},"a".repeat(64),randomUUID(),{...raw,[key]:1})).rejects.toMatchObject({code:"INVALID_RECEIPT_LINE_COMMAND"});
  expect(connect).not.toHaveBeenCalled();
 });
 it("derives reversal size from the stored source; an app reversal amount is refused",()=>{
  const reverse={version:raw.version,action:"review_reverse",commandId:raw.commandId,expectedSourceRevision:1,allocationRevisionId:randomUUID(),reversalSource:{kind:"credit_note",sourceId:randomUUID()}};
  expect(neutralReceiptFactCommandV1.safeParse(reverse).success).toBe(true);
  expect(neutralReceiptFactCommandV1.safeParse({...reverse,grossPence:96000}).success).toBe(false);
 });
 it("starts SSI before any tenant/session query, supplies a NULL artifact and refuses fabricated database success",async()=>{
  const queries:Array<{sql:string;values?:unknown[]}>=[];
  const client={release:vi.fn(),query:vi.fn(async(sql:string,values?:unknown[])=>{queries.push({sql,...(values?{values}:{})});return sql.includes("SELECT m.id")?{rowCount:1,rows:[]}:{rowCount:1,rows:[{result:{forged:true}}]};})};
  const pool={connect:vi.fn(async()=>client)};
  const old=process.env.JOBGUARD_ENV;process.env.JOBGUARD_ENV="synthetic_demo";
  try{
   await expect(new RecoveryLineAllocationRepository(pool as unknown as Pool,"synthetic_demo").command(verifiedTenantContextForQueuedJob(randomUUID()),{membershipId:randomUUID(),identityUserId:randomUUID()},"a".repeat(64),randomUUID(),raw)).rejects.toMatchObject({code:"INVALID_RECEIPT_LINE_RESULT"});
   expect(queries[0]?.sql).toBe("BEGIN ISOLATION LEVEL SERIALIZABLE");
   expect(queries.find(q=>q.sql.includes("write_receipt_allocation_facts"))?.sql).toContain("NULL::jsonb");
   expect(queries.at(-1)?.sql).toBe("ROLLBACK");
  }finally{if(old===undefined)delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=old;}
 });
});
