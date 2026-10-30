import { vi, describe, it, expect } from "vitest";
import type { Pool } from "pg";
import { DunningRepository } from "../src/dunning-repository.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
const uuid = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const digest = "a".repeat(64), snapshotHash = "b".repeat(64);
const invoice = { version: "dunning-invoice.v1", environment: "synthetic_demo", tenantId: uuid(1), jobId: uuid(2), invoiceId: uuid(3),
 revision: 1, sourceRevision: 1, sourceHash: "c".repeat(64), sourceState: "issued_invoice", finalAccountLockId: null,
 currency: "GBP", originalPence: 10000, outstandingPence: 10000, dueTick: 1, category: "customer", recipient: "builder@example.invalid",
 pilotNoCharge: false, disputed: false, refundPending: false, reversed: false, cancelled: false, attemptState: "none" };
const result = { decisionId: uuid(4), snapshotHash, expiresAt: "2026-10-30T19:00:00.000Z", status: "approved", executable: false };
const input = { version: "dunning-persist-command.v1", commandId: uuid(5), invoiceId: uuid(3), snapshotHash, nowTick: 3 };
function fixture(projections: unknown[] = [invoice], commandResult: unknown = result, clock: () => number = () => 3) {
 const query = vi.fn(async (sql: string) => ({ rows: sql.includes("dunning_workbench")
  ? [{result: sql.includes("'read'") ? projections.map(projection => ({ invoiceId: uuid(3), projection, snapshotHash })) : commandResult}] : [] }));
 const release = vi.fn(), connect = vi.fn(async () => ({query, release}));
 return { repo: new DunningRepository({connect} as unknown as Pool, clock), query, connect, release, context: testTenantContext(uuid(1)) };
}
describe("durable dunning repository boundary", () => {
 it("ignores a client future tick for both overdue display and reminder mutations", async () => {
  const f = fixture([{...invoice, dueTick: 10}]);
  const rows = await f.repo.read(f.context,digest,{jobId:uuid(2),nowTick:100});
  expect(rows.invoices[0]).toMatchObject({suppression:"not_due",reminder:null});
  for (const operation of ["request","approve"] as const) {
   await expect(f.repo.command(f.context,digest,uuid(2),operation,
    {...input,nowTick:100,...(operation === "approve" ? {decisionId:uuid(4)} : {})})).rejects.toThrow("DUNNING_UNAVAILABLE");
  }
  expect(f.query.mock.calls.some(([sql]) => sql.includes("$4,$5"))).toBe(false);
 });
 it("uses server overdue time even when the client clock is behind", async () => {
  const f = fixture([{...invoice,dueTick:2}]);
  expect((await f.repo.read(f.context,digest,{jobId:uuid(2),nowTick:0})).invoices[0]?.reminder).not.toBeNull();
  expect(await f.repo.command(f.context,digest,uuid(2),"request",{...input,nowTick:0})).toEqual(result);
 });
 it("defaults to the server wall clock without a fixture injection", async () => {
  const f = fixture([{...invoice,dueTick:Date.now()-1000}]);
  f.repo = new DunningRepository({connect:f.connect} as unknown as Pool);
  expect((await f.repo.read(f.context,digest,{jobId:uuid(2),nowTick:0})).invoices[0]?.reminder).not.toBeNull();
 });
 it("uses stored rows and typed core content, binding a parameterized command to the source snapshot", async () => {
  const f = fixture();
  const rows = await f.repo.read(f.context,digest,{jobId:uuid(2),nowTick:3});
  expect(rows.invoices[0]?.reminder?.body).toContain("£100.00");
  expect(await f.repo.command(f.context,digest,uuid(2),"approve",{...input,decisionId:uuid(4)})).toEqual(result);
  expect(f.query).toHaveBeenCalledWith("SELECT app.dunning_workbench($1,$2,$3,$4,$5::jsonb) result",
   [uuid(1),digest,uuid(2),"approve",JSON.stringify({...input,decisionId:uuid(4)})]);
  expect(f.release).toHaveBeenCalledTimes(3);
 });
 it.each([{disputed:true},{reversed:true},{pilotNoCharge:true},{outstandingPence:0},{refundPending:true},{attemptState:"outcome_unknown"}])("suppresses %j before any mutation", async changed => {
  const f = fixture([{...invoice,...changed}]);
  await expect(f.repo.command(f.context,digest,uuid(2),"request",input)).rejects.toThrow("DUNNING_UNAVAILABLE");
  expect(f.query.mock.calls.some(([sql]) => sql.includes("$4,$5"))).toBe(false);
 });
 it("skips and counts malformed and incorrectly bound persisted projections without leaking their contents",async()=>{
  const f=fixture([invoice,{...invoice,outstandingPence:"private value"},{...invoice,tenantId:uuid(9)},null]);
  const read=await f.repo.read(f.context,digest,{jobId:uuid(2),nowTick:3});
  expect(read.invoices).toHaveLength(1);expect(read.skippedCount).toBe(3);
  expect(JSON.stringify(read)).not.toContain("private value");
 });
 it("refuses a changed balance snapshot",async()=>{
  const f=fixture();await expect(f.repo.command(f.context,digest,uuid(2),"request",{...input,snapshotHash:"d".repeat(64)})).rejects.toThrow("DUNNING_UNAVAILABLE");
 });
 it.each(["tenantId","outstandingPence","hidden","recipient"])("rejects submitted %s facts before connecting",async key=>{
  const f=fixture();await expect(f.repo.command(f.context,digest,uuid(2),"request",{...input,[key]:true})).rejects.toThrow("INVALID_DUNNING_INPUT");expect(f.connect).not.toHaveBeenCalled();
 });
 it("requires a Decision only for approval and rejects malformed digests",async()=>{
  const f=fixture();
  await expect(f.repo.command(f.context,digest,uuid(2),"approve",input)).rejects.toThrow("INVALID_DUNNING_INPUT");
  await expect(f.repo.command(f.context,digest,uuid(2),"request",{...input,decisionId:uuid(4)})).rejects.toThrow("INVALID_DUNNING_INPUT");
  await expect(f.repo.read(f.context,"bad",{jobId:uuid(2),nowTick:3})).rejects.toThrow("INVALID_DUNNING_INPUT");expect(f.connect).not.toHaveBeenCalled();
 });
 it("redacts unexpected database errors and rolls back",async()=>{
  const f=fixture();f.query.mockImplementation(async sql=>{if(sql.includes("dunning_workbench"))throw new Error("secret database row");return {rows:[]};});
  await expect(f.repo.read(f.context,digest,{jobId:uuid(2),nowTick:3})).rejects.toThrow("DUNNING_UNAVAILABLE");
  expect(f.query).toHaveBeenLastCalledWith("ROLLBACK");expect(f.release).toHaveBeenCalledOnce();
 });
 it("rejects an executable database result",async()=>{
  const f=fixture([invoice],{...result,executable:true});
  await expect(f.repo.command(f.context,digest,uuid(2),"request",input)).rejects.toThrow("DUNNING_UNAVAILABLE");
 });
});
