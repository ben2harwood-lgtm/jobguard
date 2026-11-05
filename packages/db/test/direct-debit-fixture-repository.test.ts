import { describe, it, expect, vi } from "vitest";
import type { Pool } from "pg";
import { DirectDebitFixtureRepository } from "../src/direct-debit-fixture-repository.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const context = testTenantContext(id(1));
const labels = { environment: "synthetic_demo", account: "fake_jobguard_dd" };
const binding = { version: "direct-debit-binding.v1", ...labels, mandateId: id(2) };
const event = { version: "fake-dd-mandate-event.v1", ...labels, tenantId: id(1), mandateId: id(2), eventId: id(3), state: "created" };
function fixture(rows: unknown = [{binding,event,hash:"a".repeat(64),sequence:1}]) {
 const query = vi.fn(async (sql: string) => ({rows:sql.includes("direct_debit_fixture")?[{result:rows}]:[]}));
 const connect = vi.fn(async () => ({query,release:vi.fn()}));
 return {query,connect,repo:new DirectDebitFixtureRepository({connect} as unknown as Pool)};
}
describe("Direct Debit fact boundary", () => {
 it.each(["actor", "actorMembershipId", "productionEnabled", "enabled"])("refuses supplied %s before opening a transaction", async key => {
  const f=fixture();
  await expect(f.repo.recordMandate(context,{...binding,[key]:true},event,null)).rejects.toThrow("DD_INVALID_INPUT");
  await expect(f.repo.recordMandate(context,binding,{...event,[key]:true},null)).rejects.toThrow("DD_INVALID_INPUT");
  expect(f.connect).not.toHaveBeenCalled();
 });
 it("requires synthetic account routing and exact verified tenant/object bindings",async()=>{
  const f=fixture();
  await expect(f.repo.recordMandate(context,binding,{...event,tenantId:id(9)},null)).rejects.toThrow("DD_NOT_FOUND");
  await expect(f.repo.recordMandate(context,{...binding,mandateId:id(9)},event,null)).rejects.toThrow("DD_NOT_FOUND");
  for(const change of [{environment:"production"},{account:"other"}]) await expect(f.repo.read(context,{...binding,...change})).rejects.toThrow("DD_INVALID_INPUT");
  const b={...binding,commandId:id(4),objectId:`fake_dd_${"b".repeat(64)}`,amountPence:100};
  const e={version:"fake-dd-event.v1",...labels,tenantId:id(1),eventId:id(5),commandId:b.commandId,objectId:b.objectId,amountPence:100,kind:"collection",state:"submitted"};
  for(const change of [{objectId:`fake_dd_${"c".repeat(64)}`},{commandId:id(8)},{amountPence:101}]) await expect(f.repo.recordPaymentEvent(context,b,{...e,...change},id(3))).rejects.toThrow("DD_NOT_FOUND");
  expect(f.connect).not.toHaveBeenCalled();
 });
 it("uses one parameterized transaction per fact and derives blocking from persisted rows",async()=>{
  const f=fixture();await f.repo.recordMandate(context,binding,event,null);
  expect(f.query).toHaveBeenCalledWith("SELECT app.direct_debit_fixture($1,$2,$3::jsonb,$4::jsonb,$5::uuid) result",[id(1),"mandate",JSON.stringify(binding),JSON.stringify(event),null]);
  expect(await f.repo.read(context,binding)).toMatchObject({...labels,mandateState:"created",blocksNewSubmission:true,head:id(3)});
 });
 it("rolls back and redacts unexpected storage failures",async()=>{
  const f=fixture();f.query.mockImplementation(async sql=>{if(sql.includes("direct_debit_fixture"))throw Error("private row");return {rows:[]};});
  await expect(f.repo.read(context,binding)).rejects.toThrow("DD_UNAVAILABLE");expect(f.query).toHaveBeenLastCalledWith("ROLLBACK");
 });
 it("does not accept malformed stored facts",async()=>{
  await expect(fixture([{binding,event,hash:"bad",sequence:1}]).repo.read(context,binding)).rejects.toThrow("DD_UNAVAILABLE");
 });
});
