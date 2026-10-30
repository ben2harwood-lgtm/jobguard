import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { expect, it, vi } from "vitest";
import { MeterTodayRepository } from "./meter-today-repository.js";
import { verifiedTenantContextFromMembership } from "./tenant-context.js";
const tenantId = randomUUID(), digest = "a".repeat(64);
const context = verifiedTenantContextFromMembership({ tenantId, identityUserId: randomUUID(), membershipId: randomUUID() } as Parameters<typeof verifiedTenantContextFromMembership>[0]);
const view = { version: "meter-today-read.v1", hypothetical: true, date: "2026-10-28", plan: "Builder", countedPlaces: 5, freeSmallPlaces: 0 };
function captured() {
 const at="2026-10-28T12:00:00.000000Z";
 const source={version:"meter-lifecycle-source.v1",tenantId,scopeId:randomUUID(),provenance:"actual_normal_company.v1",plan:"Builder",agreementId:randomUUID(),agreementRevision:1,asOf:at,startDate:"2026-10-01",endDateExclusive:"2026-11-01",links:[],tripObservations:[],jobs:Array.from({length:5},()=>({
  version:"meter-lifecycle-input.v1",tenantId,jobId:randomUUID(),sourceRevision:1,
  activation:{id:randomUUID(),at:"2026-10-01T12:00:00.000000Z",termsId:randomUUID(),termsRevision:1,track:"small_builder",partyBindingId:randomUUID(),customerId:randomUUID(),siteId:randomUUID(),small:false},
  events:[],lock:null,trip:null,trial:{status:"unavailable"},policy:{version:"meter-lifecycle-policy.v1",revision:"specified-foundation.v1",clockStatus:"held"},asOf:at,startDate:"2026-10-01",endDateExclusive:"2026-11-01"
 }))};
 // Day-31 starts on Oct 31; use actual first-site facts for today's five places.
 for (const job of source.jobs) Object.assign(job,{events:[{version:"job-work-state-event.v1",id:randomUUID(),jobId:job.jobId,sequence:1,kind:"first_site_evidence",factAt:at,recordedAt:at,sourceReceiptId:randomUUID(),commandId:null,predecessorId:null,closeReason:null,closeNote:null}]});
 return {date:view.date,stored:{version:"meter-lifecycle-stored.v1",sourceId:randomUUID(),computationId:randomUUID(),sourceHash:"a".repeat(64),sourceRevision:1,source,alerts:[]}};
}
function fixture(raw: unknown = captured(), error?: Error) {
  const query = vi.fn(async (sql: string, _values?: unknown[]) => {
    if (sql.includes("mon1_today_source")) { if (error) throw error; return { rows: [{ result: raw }] }; }
    return { rows: [] };
  });
  const release = vi.fn(), connect = vi.fn(async () => ({ query, release }));
  return { repository: new MeterTodayRepository({ connect } as unknown as Pool), query, release, connect };
}
it("reads only the authorized routine with tenant context and digest, committing and releasing", async () => {
  const f = fixture(); expect(await f.repository.read(context, digest)).toEqual(view);
  expect(f.query).toHaveBeenCalledWith("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
  expect(f.query).toHaveBeenCalledWith("SELECT app.mon1_today_source($1,$2) result", [tenantId, digest]);
  expect(f.query).toHaveBeenLastCalledWith("COMMIT"); expect(f.release).toHaveBeenCalledOnce();
});
it("rejects malformed persisted counts instead of displaying zero", async () => {
  const foreign=captured(); foreign.stored.source.tenantId=randomUUID();
  const stale=captured(); stale.stored.source.jobs[0]!.sourceRevision=2;
  for (const raw of [null, { ...captured(), date:"2027-01-01" }, foreign, stale]) {
    const f = fixture(raw); await expect(f.repository.read(context, digest)).rejects.toThrow("METER_PROJECTION_MISMATCH");
    expect(f.query).toHaveBeenLastCalledWith("ROLLBACK"); expect(f.release).toHaveBeenCalledOnce();
  }
});
it("refuses invalid digest before connecting and maps SQL denials without exposing details", async () => {
  const f = fixture(); await expect(f.repository.read(context, "bad")).rejects.toThrow("METER_FORBIDDEN"); expect(f.connect).not.toHaveBeenCalled();
  for (const [message, code] of [["METER_FORBIDDEN", "METER_FORBIDDEN"], ["METER_PROJECTION_MISMATCH", "METER_PROJECTION_MISMATCH"], ["private data", "METER_UNAVAILABLE"]]) {
    await expect(fixture(null, new Error(message)).repository.read(context, digest)).rejects.toThrow(code);
  }
});

it("preserves checked admin reads of an already-fresh stored projection", async () => {
 const f=fixture({view}); expect(await f.repository.read(context,digest)).toEqual(view);
 await expect(fixture({view:{...view,countedPlaces:-1}}).repository.read(context,digest)).rejects.toThrow("METER_PROJECTION_MISMATCH");
});

it("reads six Solo places after an unused job is closed, reopened and first photographed", async () => {
 const raw=captured(); raw.stored.source.plan="Solo";
 const sixth=structuredClone(raw.stored.source.jobs[0]!);
 sixth.jobId=randomUUID();
 sixth.activation={...sixth.activation,id:randomUUID(),termsId:randomUUID(),partyBindingId:randomUUID(),customerId:randomUUID(),siteId:randomUUID()};
 const closedId=randomUUID();
 Object.assign(sixth,{events:[
  {version:"job-work-state-event.v1",id:closedId,jobId:sixth.jobId,sequence:1,kind:"closed",factAt:"2026-10-28T10:00:00.000000Z",recordedAt:"2026-10-28T10:00:00.000001Z",sourceReceiptId:null,commandId:randomUUID(),predecessorId:null,closeReason:"other",closeNote:"Fictional pause before grace"},
  {version:"job-work-state-event.v1",id:randomUUID(),jobId:sixth.jobId,sequence:2,kind:"reopened",factAt:"2026-10-28T11:00:00.000000Z",recordedAt:"2026-10-28T11:00:00.000001Z",sourceReceiptId:null,commandId:randomUUID(),predecessorId:closedId,closeReason:null,closeNote:null},
  {version:"job-work-state-event.v1",id:randomUUID(),jobId:sixth.jobId,sequence:3,kind:"first_site_evidence",factAt:"2026-10-28T12:00:00.000000Z",recordedAt:"2026-10-28T12:00:00.000000Z",sourceReceiptId:randomUUID(),commandId:null,predecessorId:null,closeReason:null,closeNote:null},
 ]});
 raw.stored.source.jobs.push(sixth);
 expect(await fixture(raw).repository.read(context,digest)).toMatchObject({plan:"Solo",countedPlaces:6});
});

it("refuses a photo timestamp truncated to before its microsecond activation", async () => {
 const raw=captured(),job=raw.stored.source.jobs[0]!;
 job.activation.at="2026-10-28T12:00:00.000500Z";
 // A later JS Date in this same millisecond still serializes .000Z.
 // Evidence predating activation must remain invalid.
 await expect(fixture(raw).repository.read(context,digest)).rejects.toThrow("METER_PROJECTION_MISMATCH");
});
