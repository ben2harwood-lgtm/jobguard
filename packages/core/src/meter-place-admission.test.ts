import { describe, expect, it } from "vitest";
import { evaluateMeterPlaceAddition, MeterPlaceAdmissionError } from "./meter-place-admission.js";
const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12,"0")}`;
const job = (n: number, small = false) => ({tenantId:id(1),jobId:id(n+10),customerId:id(n+1000),siteId:id(n+2000),small});
const input = (n: number, plan: "Solo" | "Builder" = "Solo") => ({
 version:"meter-place-addition.v1",environment:"synthetic_demo",plan,planRevision:3,date:"2026-10-23",
 source:{kind:"switch_live",id:id(8000),expectedRevision:0},committedJobs:Array.from({length:n},(_,i)=>job(i)),prospective:job(n),
});
describe("MON1-A supplied synthetic capacity rules (never runtime authority)",()=>{
 it.each([[3,"admit"],[4,"admit"],[5,"admit_upgrade_due"],[6,"refuse_upgrade_required"]] as const)("M1A-01 Solo %i before",(n,decision)=>{
  expect(evaluateMeterPlaceAddition(input(n))).toMatchObject({decision,before:n,after:n+1,planRevision:3});
 });
 it.each([[6,"admit"],[11,"admit"],[12,"admit_upgrade_due"],[13,"admit_track_review_due"],[99,"admit_track_review_due"]] as const)("M1A-02 Builder %i before",(n,decision)=>{
  expect(evaluateMeterPlaceAddition(input(n,"Builder"))).toMatchObject({decision,before:n,after:n+1,maximumPence:16900});
 });
 it("M1A-03 committed jobs are counted without a today-counting input",()=>{
  expect(evaluateMeterPlaceAddition(input(6))).toMatchObject({decision:"refuse_upgrade_required",before:6,after:7});
  expect(()=>evaluateMeterPlaceAddition({...input(6),countedToday:0})).toThrow(MeterPlaceAdmissionError);
 });
 it.each(["Solo","Builder"] as const)("M1A-04 %s exposes raw/grouped/small/free/chargeable separately",plan=>{
  const v=input(0,plan), n=plan==="Solo"?4:7;
  const committedJobs=Array.from({length:n},(_,i)=>job(i,true));
  const r=evaluateMeterPlaceAddition({...v,committedJobs,prospective:job(30,true)});
  expect(r.afterFacts).toEqual({rawJobs:n+1,groupedPlaces:n+1,smallPlaces:n+1,freeSmallPlaces:n,chargeableCommittedPlaces:1});
 });
 it("M1A-04 mixed groups are non-small; same site with different customers stays separate",()=>{
  const a=job(0,true), b={...job(1),customerId:a.customerId,siteId:a.siteId};
  const r=evaluateMeterPlaceAddition({...input(0),committedJobs:[a],prospective:b});
  expect(r.before).toBe(0);expect(r.after).toBe(1);expect(r.afterFacts).toMatchObject({rawJobs:2,groupedPlaces:1,smallPlaces:0});
  expect(evaluateMeterPlaceAddition({...input(0),committedJobs:[a],prospective:{...b,customerId:id(9000)}}).afterFacts.groupedPlaces).toBe(2);
 });
 it("M1A-04 a zero-place addition cannot evade independent trial/card gates (no such authority in result)",()=>{
  const v=input(6), first=v.committedJobs[0]!;
  const r=evaluateMeterPlaceAddition({...v,prospective:{...v.prospective,customerId:first.customerId,siteId:first.siteId}});
  expect(r.decision).toBe("admit");expect(r.before).toBe(r.after);expect(r).not.toHaveProperty("trial");expect(r).not.toHaveProperty("card");
 });
 it.each(["resume","reopen","live_import"] as const)("M1A-05 %s uses the same Solo boundary",kind=>{
  const v=input(6);expect(evaluateMeterPlaceAddition({...v,source:{...v.source,kind}}).decision).toBe("refuse_upgrade_required");
 });
 it("M1A-06 day31 continues an unchanged committed job without adding capacity",()=>{
  const v=input(99), prospective=v.committedJobs[0]!;
  expect(evaluateMeterPlaceAddition({...v,source:{...v.source,kind:"day31"},prospective}))
   .toMatchObject({decision:"admit",before:99,after:99,maximumPence:4900});
 });
 it("M1A-06 a new job labelled day31 cannot bypass Solo six",()=>{
  const v=input(6);
  expect(()=>evaluateMeterPlaceAddition({...v,source:{...v.source,kind:"day31"}})).toThrow("INVALID_METER_PLACE_ADMISSION");
 });
 it.each(["customerId","siteId","small"] as const)("M1A-06 day31 cannot change committed %s",field=>{
  const v=input(6), original=v.committedJobs[0]!;
  const prospective={...original,[field]:field==="small"?true:id(9000)};
  expect(()=>evaluateMeterPlaceAddition({...v,source:{...v.source,kind:"day31"},prospective})).toThrow("INVALID_METER_PLACE_ADMISSION");
 });
 it("M1A-06 trip replaces the original small classification, never duplicates a job or denies",()=>{
  const v=input(99), original=job(99,true);
  const r=evaluateMeterPlaceAddition({...v,committedJobs:[...v.committedJobs,original],source:{...v.source,kind:"small_trip"},prospective:{...original,small:false}});
  expect(r).toMatchObject({before:99,after:100,decision:"admit_upgrade_due",maximumPence:4900});
  expect(r.afterFacts.rawJobs).toBe(100);
 });
 it.each(["customerId","siteId"] as const)("M1A-06 small trip cannot change committed %s",field=>{
  const v=input(6), original=job(6,true);
  expect(()=>evaluateMeterPlaceAddition({...v,committedJobs:[...v.committedJobs,original],
   source:{...v.source,kind:"small_trip"},prospective:{...original,small:false,[field]:id(9000)}}))
   .toThrow("INVALID_METER_PLACE_ADMISSION");
 });
 it("M1A-04 same customer and site counts once at Solo six",()=>{
  const v=input(6), original=v.committedJobs[0]!;
  const prospective={...v.prospective,customerId:original.customerId,siteId:original.siteId};
  expect(evaluateMeterPlaceAddition({...v,prospective})).toMatchObject({decision:"admit",before:6,after:6,
   afterFacts:{rawJobs:7,groupedPlaces:6}});
 });
 it("M1A-04 same customer at a different site adds a place and is refused at Solo six",()=>{
  const v=input(6), original=v.committedJobs[0]!;
  const prospective={...v.prospective,customerId:original.customerId};
  expect(evaluateMeterPlaceAddition({...v,prospective})).toMatchObject({decision:"refuse_upgrade_required",before:6,after:7,
   afterFacts:{rawJobs:7,groupedPlaces:7}});
 });
 it("M1A-06 first-evidence overlap remains held, no automatic bypass selector",()=>{
  const v=input(6);
  expect(()=>evaluateMeterPlaceAddition({...v,source:{...v.source,kind:"first_site_evidence"}})).toThrow("METER_FIRST_EVIDENCE_OVERLAP_HELD");
  expect(()=>evaluateMeterPlaceAddition({...v,automatic:true})).toThrow("INVALID_METER_PLACE_ADMISSION");
 });
 it("M1A-07 canonical hash binds plan revision and source identity/payload, not array order",()=>{
  const v=input(4), r=evaluateMeterPlaceAddition(v);
  expect(r.sourceHash).toMatch(/^[a-f0-9]{64}$/u);
  expect(evaluateMeterPlaceAddition({...v,committedJobs:[...v.committedJobs].reverse()}).sourceHash).toBe(r.sourceHash);
  for(const changed of [{...v,planRevision:4},{...v,source:{...v.source,id:id(8001)}},{...v,prospective:{...v.prospective,small:true}}])
   expect(evaluateMeterPlaceAddition(changed).sourceHash).not.toBe(r.sourceHash);
 });
 it("M1A-08 pure refusal does not mutate supplied state",()=>{
  const v=input(6), before=JSON.stringify(v);expect(evaluateMeterPlaceAddition(v).decision).toBe("refuse_upgrade_required");expect(JSON.stringify(v)).toBe(before);
 });
 it("M1A-09 rejects foreign tenants, duplicate identities, client counts/plans/amount overrides",()=>{
  const v=input(2);
  for(const raw of [{...v,prospective:{...v.prospective,tenantId:id(2)}},{...v,committedJobs:[v.committedJobs[0],v.committedJobs[0]]},{...v,maximumPence:999999},{...v,planRevision:0},{...v,source:{...v.source,bypass:true}}])
   expect(()=>evaluateMeterPlaceAddition(raw)).toThrow("INVALID_METER_PLACE_ADMISSION");
 });
});
