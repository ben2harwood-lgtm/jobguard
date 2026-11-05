import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { INTERIM_APPLICATIONS_ENABLED, assertInterimDocumentIssueAllowed } from "@jobguard/core";
import { InterimDraftRepository } from "../src/interim-draft-repository.js";
import { canonicalJson } from "../src/work-order-repository.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const digest = "a".repeat(64), tenantId = id(1), jobId = id(2);
const schedule = { id:id(3), version:"interim.schedule.v1", revision:1, previousScheduleId:null,
  baselineSnapshotId:id(4), approvalDecisionId:id(5), valuationDates:["2026-11-01"],
  jurisdiction:"synthetic_england_wales", arrangement:"synthetic_staged", d06TemplateVersion:null, d02TaxPolicyVersion:null,
  lines:[{id:id(6),scopeItemId:id(7),commercialRevisionId:id(8),sourceDocumentId:id(4),kind:"baseline",approvalDecisionId:null,netPence:10000}] };
const input = { version:"interim.persist-command.v1",commandId:id(9),jobId,record:schedule };
function fixture() {
  let rows: unknown[] = [];
  const query = vi.fn(async (sql:string, args?:unknown[]) => {
    if (sql.includes("interim_draft_records")) {
      if (sql.includes("'append'")) {
        const v = JSON.parse(args?.[3] as string);
        if (!rows.length) rows = [{commandId:v.commandId,actorId:id(10),revision:1,recordHash:v.recordHash,record:v.record,
          watermark:"SYNTHETIC DRAFT - NOT FOR ISSUE",lineage:"fixture_lineage_not_authority"}];
      }
      return {rows:[{result:rows}]};
    }
    return {rows:[]};
  });
  const release=vi.fn(),connect=vi.fn(async()=>({query,release}));
  return { repo:new InterimDraftRepository({connect} as unknown as Pool),query,connect,release,
    context:testTenantContext(tenantId), setRows:(v:unknown[])=>{rows=v;} };
}
describe("M4-18 dark durable draft boundary",()=>{
  it("binds tenant/job, stores canonical hashes and reads/reconciles only stored records",async()=>{
    const f=fixture();
    const first=await f.repo.command(f.context,digest,input);
    expect(first.book.records).toEqual([{...schedule,tenantId,jobId}]);
    expect(first.rows[0]?.recordHash).toBe(createHash("sha256").update(canonicalJson(first.book.records[0])).digest("hex"));
    expect(first.reconciliation.lines[0]?.scheduled.pence).toBe(10000);
    expect(first.watermark).toBe("SYNTHETIC DRAFT - NOT FOR ISSUE");
    expect(first.rows[0]?.lineage).toBe("fixture_lineage_not_authority");
    expect(await f.repo.command(f.context,digest,input)).toEqual(first);
    expect(await f.repo.read(f.context,jobId)).toEqual(first);
    await expect(f.repo.command(f.context,digest,{...input,record:{...schedule,jurisdiction:"changed"}})).rejects.toMatchObject({code:"CONFLICT"});
    await expect(f.repo.command(f.context,digest,{...input,commandId:id(11)})).rejects.toMatchObject({code:"CONFLICT"});
    expect(INTERIM_APPLICATIONS_ENABLED).toBe(false);
    expect(()=>assertInterimDocumentIssueAllowed()).toThrow();
  });
  it.each(["tenantId","actor","cash","enabled","environment"])("rejects caller %s before connecting",async key=>{
    const f=fixture();await expect(f.repo.command(f.context,digest,{...input,[key]:true})).rejects.toMatchObject({code:"INVALID_INPUT"});
    expect(f.connect).not.toHaveBeenCalled();
  });
  it.each(["tenantId","jobId","actor","cash","enabled"])("rejects embedded %s before connecting",async key=>{
    const f=fixture();await expect(f.repo.command(f.context,digest,{...input,record:{...schedule,[key]:id(99)}})).rejects.toMatchObject({code:"INVALID_INPUT"});
    expect(f.connect).not.toHaveBeenCalled();
  });
  it("rejects altered stored records, malformed actors and forged contexts",async()=>{
    const f=fixture(),first=await f.repo.command(f.context,digest,input);
    f.setRows([{...first.rows[0],record:{...first.book.records[0],jurisdiction:"altered"}}]);
    await expect(f.repo.read(f.context,jobId)).rejects.toMatchObject({code:"UNAVAILABLE"});
    await expect(f.repo.command(f.context,"bad",input)).rejects.toMatchObject({code:"INVALID_INPUT"});
    await expect(f.repo.read({...f.context},jobId)).rejects.toMatchObject({code:"UNAVAILABLE"});
  });
  it("redacts database errors, rolls back and releases the client",async()=>{
    const f=fixture();f.query.mockImplementation(async sql=>{if(sql.includes("interim_draft_records"))throw new Error("private row");return {rows:[]};});
    await expect(f.repo.read(f.context,jobId)).rejects.toThrow("INTERIM_DRAFT_UNAVAILABLE");
    expect(f.query).toHaveBeenLastCalledWith("ROLLBACK");expect(f.release).toHaveBeenCalledOnce();
  });
});
