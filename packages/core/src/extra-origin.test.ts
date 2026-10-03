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
