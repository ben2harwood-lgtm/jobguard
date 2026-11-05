import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { payNowFakeResult, payNowOptions, PAY_NOW_ENABLED, MAX_MONEY_PENCE } from "@jobguard/core";
import { PayNowAttemptRepository } from "../src/pay-now-attempt-repository.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const invoice = { version: "pay-now.synthetic-invoice.v1", environment: "synthetic_demo", tenantId:id(1),
 jobId:id(2), invoiceId:id(3), revision:1, builderAccount:`fake-builder-${id(1)}`,
 balancePence:10000, currency:"GBP", includesCatch:false, kind:"final" };
const input = {version:"pay-now-attempt.v1",commandId:id(4),invoiceId:id(3),rail:"card"};
const actor = {jobId:id(2),sessionDigest:"a".repeat(64)};
function fixture(source = invoice) {
 const row = (v: typeof input) => ({synthetic:true,commandId:v.commandId,actorId:id(5),rail:v.rail,
  invoice:source,snapshotHash:"b".repeat(64),result:payNowFakeResult(source,v.rail as "card"),options:payNowOptions(source)});
 const query = vi.fn(async (sql: string, args?: unknown[]) => {
  if (!sql.includes("pay_now_fake_attempt")) return {rows:[]};
  if (sql.includes("'read'")) return {rows:[{result:[row(input)]}]};
  return {rows:[{result:args?.[3]==="prepare" ? {invoice:source,snapshotHash:"b".repeat(64)} : row(JSON.parse(args?.[4] as string))}]};
 });
 const connect=vi.fn(async()=>({query,release:vi.fn()}));
 return {repo:new PayNowAttemptRepository({connect} as unknown as Pool),query,connect,context:testTenantContext(id(1))};
}
describe("MON-6 dark stored attempt boundary",()=>{
 it.each([1,24,25,26,499,500,501,1499,1500,1501,199833,199834,199999,200000,200001,MAX_MONEY_PENCE])("uses core money rules at %i pence", async balancePence=>{
  for(const rail of ["bank_transfer","card","pay_by_bank"] as const){
   const f=fixture({...invoice,balancePence});
   const row=await f.repo.command(f.context,actor,{...input,rail});
   expect(row.result.customerDebit.pence).toBe(balancePence);
   expect(row.result.builderCredit.pence).toBe(balancePence);
   expect(row.result.destinationAccount).toBe(invoice.builderAccount);
   expect(row.result.platformCustomerFunds.pence).toBe(0);
   expect(row.result.builderFeeDebit.pence).toBeLessThanOrEqual(Math.min(600,balancePence));
   expect(row.options[0]).toMatchObject({rail:"bank_transfer",builderFee:{pence:0}});
   expect(row.synthetic).toBe(true);
  }
 });
 it("has identical options and fee with and without a catch",async()=>{
  const a=fixture(),b=fixture({...invoice,includesCatch:true});
  const x=await a.repo.command(a.context,actor,input),y=await b.repo.command(b.context,actor,input);
  expect(x.options).toEqual(y.options);expect(x.result).toEqual(y.result);
  expect(PAY_NOW_ENABLED).toBe(false);
 });
 it.each(["amount","fee","destinationAccount","settlementState","tenantId","actor","enabled"])("rejects caller %s before connecting",async key=>{
  const f=fixture();await expect(f.repo.command(f.context,actor,{...input,[key]:true})).rejects.toThrow("INVALID_INPUT");expect(f.connect).not.toHaveBeenCalled();
 });
 it.each(["direct_debit_stub","deposit","stage"])("refuses closed rail %s",async rail=>{
  const f=fixture();await expect(f.repo.command(f.context,actor,{...input,rail})).rejects.toThrow("INVALID_INPUT");
 });
 it.each(["deposit","stage"])("refuses stored %s kind",async kind=>{
  const f=fixture({...invoice,kind});await expect(f.repo.command(f.context,actor,input)).rejects.toThrow("UNAVAILABLE");
 });
 it("labels reads synthetic and revalidates stored projections",async()=>{
  const f=fixture();expect(await f.repo.read(f.context,id(2),id(3))).toMatchObject({synthetic:true,attempts:[{synthetic:true}]});
  f.query.mockImplementation(async()=>({rows:[{result:[{synthetic:false}]}]}));
  await expect(f.repo.read(f.context,id(2),id(3))).rejects.toThrow("UNAVAILABLE");
 });
 it("rolls back and redacts unexpected database failures",async()=>{
  const f=fixture();f.query.mockImplementation(async sql=>{if(sql.includes("pay_now_fake_attempt"))throw new Error("private row");return {rows:[]};});
  await expect(f.repo.command(f.context,actor,input)).rejects.toThrow("UNAVAILABLE");expect(f.query).toHaveBeenLastCalledWith("ROLLBACK");
 });
});
