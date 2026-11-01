import { describe, expect, it } from "vitest";
import { demoMeterJob, previewDemoMeter } from "./small-builder-demo-meter.js";
import { countMeterDays } from "./meter-lifecycle.js";
import { smallBuilderDemoRunV1, smallBuilderDemoReportV1 } from "./small-builder-demo-lifecycle.js";
import { londonMidnight } from "./job-work-timing.js";
const binding = { tenantId: "d1500000-0000-4000-8000-000000000001", runId: "d1500000-0000-4000-8000-000000000002" };
describe("DEMO-J4 real MON-1/MON-2A reference producers", () => {
 it("reproduces all nine MON-2 examples from lifecycle events with explicit monthly periods", () => {
  const result = previewDemoMeter(binding);
  expect(result.profiles.map(p => p.principalPence)).toEqual([34800,82800,8900,7900,16900,4900,4900,6233,6965,16900]);
  expect(result.profiles[0]!.periods.map(p => p.countedPlaces[0])).toEqual([1,1,1,2,2,2,2,2,2,3,3,4]);
  expect(result.profiles[1]!.periods.map(p => p.countedPlaces[0])).toEqual([3,4,4,4,4,5,5,5,5,6,6,7]);
  expect(result.profiles[0]!.periods[1]!.countedPlaces).toHaveLength(28);
  expect(result.profiles[8]!.periods[0]!.countedPlaces).toEqual([8,...Array(30).fill(7)]);
  expect(result.profiles[3]!.periods[0]!.countedPlaces).toEqual([...Array(15).fill(7),...Array(15).fill(8)]);
 });
 it("detects crossing at 14 immediately, before period end, without changing track or exceeding maximum", () => {
  const result=previewDemoMeter(binding);
  expect(result.crossings.map(c => [c.committedPlaces,c.immediate,c.trackReviewDue])).toEqual([[13,false,false],[14,true,true],[15,true,true],[16,true,true],[17,true,true]]);
  expect(result.crossings[1]!.date).toBe("2026-04-02");
  expect(result.crossings.every(c => !c.trackChanged)).toBe(true);
  for(const profile of result.profiles) for(const period of profile.periods) expect(period.principalPence).toBeLessThanOrEqual(profile.id==="DM-01"||profile.id==="DM-06"||profile.id==="DM-07"?4900:16900);
 });
 it("replays deterministically without mutating inputs or financial effects; resets bind a fresh run", () => {
  const first=previewDemoMeter(binding);
  expect(previewDemoMeter({...binding})).toEqual(first);
  const next=previewDemoMeter({...binding,runId:"d1500000-0000-4000-8000-000000000003"});
  expect(next.profiles.map(p=>p.principalPence)).toEqual(first.profiles.map(p=>p.principalPence));
  expect(next.profiles[0]!.periods[0]!.sourceJobIds).not.toEqual(first.profiles[0]!.periods[0]!.sourceJobIds);
  expect(first.unavailable.map(item=>item.reason).every(reason=>reason.startsWith("Not ready yet"))).toBe(true);
  expect(JSON.stringify(first)).not.toMatch(/"settled"|"statementId"|"allocationId"|"feePence"/);
 });
 it.each(["amountPence","allocation","reversal","lockedBillId","hiddenSignals","countedPlaces","asOf","trial"])("rejects caller-supplied %s, without reading hidden or financial sources", key => {
  expect(()=>previewDemoMeter({...binding,[key]:1})).toThrow();
 });
 it("the producer refuses mixed tenants and conflicting replays; exact event replay counts once", () => {
  const job=demoMeterJob(binding,1,1,"2026-04-01","2026-05-01");
  const project=(jobs:unknown[])=>countMeterDays({version:"meter-lifecycle-days-input.v1",plan:"Builder",jobs});
  expect(project([{...job,events:[...job.events,job.events[0]]}])).toEqual(project([job]));
  expect(()=>project([job,{...job,tenantId:"d1500000-0000-4000-8000-000000000004"}])).toThrow();
  expect(()=>project([{...job,events:[...job.events,{...job.events[0],kind:"site_activity"}]}])).toThrow();
 });
 it("rejects a preview bound to another run or scenario and forbids unsaved preview facts in snapshots",()=>{
  const preview=previewDemoMeter(binding);
  const run={version:"small-builder-demo-run.v1",environment:"synthetic_demo",runId:binding.runId,scenario:"meter",revision:1,status:"blocked",reason:"Not ready yet",createdAt:"2026-10-29T00:00:00Z",archivedAt:null,predecessorId:null,successorId:null};
  expect(smallBuilderDemoRunV1.safeParse({...run,meterPreview:preview}).success).toBe(true);
  expect(smallBuilderDemoRunV1.safeParse({...run,runId:binding.tenantId,meterPreview:preview}).success).toBe(false);
  expect(smallBuilderDemoRunV1.safeParse({...run,scenario:"trial",meterPreview:preview}).success).toBe(false);
  expect(smallBuilderDemoReportV1.safeParse({version:"small-builder-demo-report.v1",snapshotId:binding.runId,facts:{...run,meterPreview:preview}}).success).toBe(false);
 });
 it("locked source intervals cannot count later activity into a bill", () => {
  const job=demoMeterJob(binding,1,1,"2026-04-01","2026-05-01",0,1);
  const later={...job.events[0]!,id:"d1500000-0000-4000-8000-000000000099",sequence:2,kind:"site_activity",commandId:null,factAt:londonMidnight("2026-04-03"),recordedAt:londonMidnight("2026-04-03")};
  const result=countMeterDays({version:"meter-lifecycle-days-input.v1",plan:"Builder",jobs:[{...job,events:[...job.events,later]}]});
  expect(result.days.map(day=>day.countedPlaces)).toEqual([1,...Array(29).fill(0)]);
 });
});
