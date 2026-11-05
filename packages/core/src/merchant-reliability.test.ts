import { expect, it } from "vitest";
import { merchantDeliveryRecord } from "./merchant-reliability.js";
const tenant="10000000-0000-4000-8000-000000000001", job="10000000-0000-4000-8000-000000000002";
const row=(n=1,extra={})=>({version:"merchant-delivery-receipt.v1",tenantId:tenant,jobId:job,
 orderId:`10000000-0000-4000-8000-${String(n).padStart(12,"0")}`,revision:1,supplierContext:"Merchant A",status:"ready",
 ordered:"10",delivered:"8",accepted:"7",rejected:"1",missing:"3",firstDelivered:"8",firstMissing:"3",...extra});
it("reports sparse samples, counts latest revisions once and keeps exact suppliers apart",()=>{
 const source=[row(),row(2),row(1,{revision:2,delivered:"10",accepted:"10",missing:"0",rejected:"0"})];
 const before=JSON.stringify(source);
 expect(merchantDeliveryRecord(tenant,source).suppliers[0]).toMatchObject({ordersReceived:2,sample:"not enough to say",ordersAddedLater:1,ordersMissing:1,ordersRejected:1});
 expect(merchantDeliveryRecord(tenant,[...source,row(3),row(4,{supplierContext:"merchant a"})]).suppliers).toEqual([
  expect.objectContaining({supplierContext:"Merchant A",ordersReceived:3,sample:"counts"}),
  expect.objectContaining({supplierContext:"merchant a",ordersReceived:1,sample:"not enough to say"})]);
 expect(JSON.stringify(source)).toBe(before);
});
it.each(["held","quarantined"])("never falls back from a %s latest revision",status=>{
 expect(merchantDeliveryRecord(tenant,[row(),row(1,{revision:2,status})]).suppliers).toEqual([]);
});
it("refuses foreign tenants even for held rows, malformed quantities and conflicting replays",()=>{
 for(const rows of [[row(1,{tenantId:job,status:"held"})],[row(1,{missing:"NaN"})],[row(),row(1,{delivered:"9"})]])
  expect(()=>merchantDeliveryRecord(tenant,rows)).toThrow();
 expect(merchantDeliveryRecord(tenant,[row(),row()]).suppliers[0]?.ordersReceived).toBe(1);
});
