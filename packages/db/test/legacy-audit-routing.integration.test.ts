// Protocol routing checks only; no PostgreSQL execution is claimed here.
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { appendAuditBatch, verifyAuditChain, type AuditEventInput } from "../src/audit.js";
import type { TenantTransaction } from "../src/tenant-context.js";
const input = (): AuditEventInput => ({id:randomUUID(),version:"audit.v1",actorRef:"system:fixture",
  eventType:"fixture.seeded",subjectType:"job",subjectRef:randomUUID(),payload:{references:{jobId:randomUUID()}}});
function fixture(installed:boolean,sealed_schema:boolean) {
  const tenant=randomUUID(), output={id:randomUUID(),version:"audit.v2"};
  const query=vi.fn(async (sql:string) => {
    if(sql.includes("to_regprocedure"))return {rows:[{installed,sealed_schema}]};
    if(sql.includes("FROM app.append_audit")) {
      if(!installed)throw Object.assign(new Error("missing sealed writer"),{code:"42883"});
      return {rows:[output]};
    }
    if(sql.includes("current_setting"))return {rows:[{tenant_id:tenant}]};
    if(sql.includes("FROM app.lock_audit_head"))return {rows:[{sequence:"0",event_hash:null}]};
    if(sql.includes("clock_timestamp"))return {rows:[{occurred_at:new Date("2026-10-30T22:13:00.000Z")}]};
    return {rows:[]};
  });
  return {tx:{$client:{query}} as unknown as TenantTransaction,query,output};
}
describe("shared integration audit routing (protocol checks, no PostgreSQL proof)",()=>{
  it("routes old fixture databases to the actual v1 protocol through shared setup",async()=>{
    const f=fixture(false,false),events=await appendAuditBatch(f.tx,[input()]);
    expect(events[0]!.version).toBe("audit.v1");
    expect(()=>verifyAuditChain(events)).not.toThrow();
    expect(f.query.mock.calls.some(([sql])=>sql.startsWith("INSERT INTO app.audit_event"))).toBe(true);
    expect(f.query.mock.calls.some(([sql])=>sql.includes("app.advance_audit_head"))).toBe(true);
    expect(f.query.mock.calls.some(([sql])=>sql.includes("FROM app.append_audit"))).toBe(false);
  });
  it("keeps fully migrated fixture databases on the production writer",async()=>{
    const f=fixture(true,true);
    expect(await appendAuditBatch(f.tx,[input()])).toEqual([f.output]);
    expect(f.query.mock.calls).toHaveLength(2);
    expect(f.query.mock.calls[1]![0]).toContain("FROM app.append_audit");
  });
  it("does not hide a missing writer in an LP-4 schema",async()=>{
    const f=fixture(false,true);
    await expect(appendAuditBatch(f.tx,[input()])).rejects.toMatchObject({code:"42883"});
    expect(f.query.mock.calls).toHaveLength(2);
    expect(f.query.mock.calls[1]![0]).toContain("FROM app.append_audit");
  });
  it("does not turn catalogue errors into historical writes",async()=>{
    const f=fixture(false,false);f.query.mockRejectedValueOnce(new Error("catalogue denied"));
    await expect(appendAuditBatch(f.tx,[input()])).rejects.toThrow("catalogue denied");
    expect(f.query).toHaveBeenCalledTimes(1);
  });
  it("validates input and returns empty batches before any database query",async()=>{
    const f=fixture(false,false);
    expect(await appendAuditBatch(f.tx,[])).toEqual([]);
    await expect(appendAuditBatch(f.tx,[{...input(),sequence:9} as AuditEventInput])).rejects.toThrow();
    expect(f.query).not.toHaveBeenCalled();
  });
  it("chooses per connection without caching the first fixture's schema",async()=>{
    for(const installed of [true,false,true]) {
      const f=fixture(installed,installed),events=await appendAuditBatch(f.tx,[input()]);
      expect(events[0]!.version).toBe(installed?"audit.v2":"audit.v1");
    }
  });
  it("leaves the unwrapped production module fail-closed",async()=>{
    const production=await vi.importActual<typeof import("../src/audit.js")>("../src/audit.js");
    const f=fixture(false,false);
    await expect(production.appendAuditBatch(f.tx,[input()])).rejects.toMatchObject({code:"42883"});
    expect(f.query).toHaveBeenCalledTimes(1);
    expect(f.query.mock.calls[0]![0]).toContain("FROM app.append_audit");
  });
});
