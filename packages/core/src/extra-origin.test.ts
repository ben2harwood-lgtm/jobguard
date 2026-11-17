import { expect, it } from "vitest";
import { extraOriginV1, variationOriginV1 } from "./extra-origin.js";
it("accepts only track-qualified origin kinds and rejects client-added entitlement",()=>{
 for(const kind of ["builder_logged","final_review","jobguard_catch"]) {
  expect(variationOriginV1.safeParse({version:"variation-origin.v1",jobTrack:"small_builder",kind}).success).toBe(true);
  expect(variationOriginV1.safeParse({version:"variation-origin.v1",jobTrack:"contractor",kind}).success).toBe(false);
 }
 for(const kind of ["site_user","jobguard_surfaced_confirmed","office_entry","client_instruction"]) {
  expect(variationOriginV1.safeParse({version:"variation-origin.v1",jobTrack:"contractor",kind}).success).toBe(true);
  expect(variationOriginV1.safeParse({version:"variation-origin.v1",jobTrack:"small_builder",kind}).success).toBe(false);
 }
 expect(variationOriginV1.safeParse({version:"variation-origin.v1",jobTrack:"contractor",kind:"site_user",feeBearing:true}).success).toBe(false);
});
it("validates labelled device time independently of authoritative server time",()=>{
 const id="10000000-0000-4000-8000-000000000001";
 const value={version:"extra-origin.v1",tenantId:id,jobId:id,variationId:id,origin:{version:"variation-origin.v1",jobTrack:"contractor",kind:"site_user"},commandId:id,raisingMembershipId:id,raisingRole:"operative",serverRecordedAt:"2026-09-30T12:00:00Z",deviceId:"synthetic-device",deviceCapturedAt:"2026-09-01T12:00:00Z",evidenceHash:"a".repeat(64)};
 expect(extraOriginV1.safeParse(value).success).toBe(true);
 expect(extraOriginV1.safeParse({...value,deviceCapturedAt:"yesterday"}).success).toBe(false);
 expect(extraOriginV1.safeParse({...value,evidenceHash:"unverified"}).success).toBe(false);
});
const originId="10000000-0000-4000-8000-000000000001";
const originValue={version:"extra-origin.v1",tenantId:originId,jobId:originId,variationId:originId,origin:{version:"variation-origin.v1",jobTrack:"contractor",kind:"site_user"},commandId:originId,raisingMembershipId:originId,raisingRole:"operative",serverRecordedAt:"2026-10-04T12:00:00Z",deviceId:"synthetic-device",deviceCapturedAt:"2026-10-04T11:00:00Z",evidenceHash:"a".repeat(64)};
const originTimeFields=["serverRecordedAt","deviceCapturedAt"] as const;
const clock="2026-10-04T12:00:00";
it("rejects impossible timezone offsets on both origin timestamps",()=>{
 const impossible=["+99:99","-99:99","+24:00","-24:00","+23:60","-23:60","+00:60","+2400","-2400","+9999","+1260","-0060","+30:00","+12:99","+25:00","+0099"];
 for(const field of originTimeFields) for(const offset of impossible){
  const parsed=extraOriginV1.safeParse({...originValue,[field]:`${clock}${offset}`});
  expect(parsed.success,`${field} ${offset}`).toBe(false);
  if(!parsed.success) expect(parsed.error.issues.map(issue=>issue.path.join(".")),`${field} ${offset}`).toEqual([field]);
 }
});
it("accepts exactly the offsets from -23:59 to +23:59 and never an instant JavaScript cannot read",()=>{
 const pad=(n:number)=>String(n).padStart(2,"0");
 const accepted:string[]=[];
 // Keep every full-object parse and Date.parse check; construct assertions only after the exhaustive sweep.
 const mismatches:{field:typeof originTimeFields[number];offset:string;expected:boolean;actual:boolean;unreadableValue?:string}[]=[];
 for(const field of originTimeFields) for(const sign of ["+","-"]) for(let hours=0;hours<=99;hours++) for(let minutes=0;minutes<=99;minutes++){
  const offset=`${sign}${pad(hours)}:${pad(minutes)}`,value=`${clock}${offset}`;
  const parsed=extraOriginV1.safeParse({...originValue,[field]:value});
  const expected=hours<=23&&minutes<=59;
  const unreadable=parsed.success&&Number.isNaN(Date.parse(value));
  if(parsed.success!==expected||unreadable) mismatches.push({field,offset,expected,actual:parsed.success,...(unreadable?{unreadableValue:value}:{})});
  if(parsed.success) accepted.push(value);
 }
 expect(mismatches,`${mismatches.length} offset mismatches; first 10: ${JSON.stringify(mismatches.slice(0,10))}`).toEqual([]);
 expect(accepted).toHaveLength(2*2*24*60);
});
it("keeps valid offsets, fractional precision, Z and a null device time",()=>{
 for(const field of originTimeFields) for(const value of [
  "2026-10-04T12:00:00Z","2026-10-04T12:00Z","2026-10-04T12:00:00+00:00","2026-10-04T12:00:00-00:00","2026-10-04T12:00:00+01:00","2026-10-04T12:00:00+0100",
  "2026-10-04T12:00:00+05:45","2026-10-04T12:00:00+14:00","2026-10-04T12:00:00-12:00","2026-10-04T12:00:00+23:59","2026-10-04T12:00:00-23:59","2026-10-04T12:00:00-2359",
  "2026-10-04T12:00:00.1Z","2026-10-04T12:00:00.123456789012+10:30","2026-10-04T12:00:00.999-07:00","2028-02-29T12:00:00.5+13:00",
 ]){
  const parsed=extraOriginV1.safeParse({...originValue,[field]:value});
  expect(parsed.success,`${field} ${value}`).toBe(true);
  if(parsed.success) expect(parsed.data[field],`${field} ${value}`).toBe(value);
 }
 const nullDevice=extraOriginV1.safeParse({...originValue,deviceId:null,deviceCapturedAt:null});
 expect(nullDevice.success).toBe(true);
 if(nullDevice.success) expect(nullDevice.data.deviceCapturedAt).toBeNull();
 expect(extraOriginV1.safeParse({...originValue,serverRecordedAt:null}).success).toBe(false);
 expect(extraOriginV1.safeParse({...originValue,serverRecordedAt:undefined}).success).toBe(false);
});
it("still rejects malformed origin timestamps unrelated to the offset",()=>{
 for(const field of originTimeFields) for(const value of ["yesterday","2026-10-04","2026-10-04T12:00:00","2026-10-04T12:00:00+01","2026-10-04T12:00:00z","2026-02-30T12:00:00Z","2026-10-04T24:00:00Z","2026-10-04T12:60:00Z","2026-10-04 12:00:00Z",""])
  expect(extraOriginV1.safeParse({...originValue,[field]:value}).success,`${field} ${value}`).toBe(false);
});
