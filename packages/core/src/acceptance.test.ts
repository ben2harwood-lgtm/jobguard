import { describe, expect, it } from "vitest";
import { acceptanceHasZeroPlatformEffects, acceptanceLabel, acceptanceMatchesDocument, acceptedTerms, assertAcceptanceAllowed, builderAttestedAcceptanceV1 } from "./acceptance.js";
import { money } from "./money.js";

const base={version:"quote-acceptance.v1" as const,acceptanceId:"10000000-0000-4000-8000-000000000001",jobId:"20000000-0000-4000-8000-000000000002",documentId:"30000000-0000-4000-8000-000000000003",documentVersion:2,documentHash:"a".repeat(64),expectedJobRevision:4,acceptedTotalPence:12345,acceptedAt:new Date("2026-09-14T10:00:00Z"),statedCustomerName:"Synthetic Customer",statedMethod:"email" as const,evidenceId:null};
describe("exact quote acceptance",()=>{
  it("binds version, hash and total so version 2 cannot authorize version 3",()=>{const input=builderAttestedAcceptanceV1.parse(base);expect(acceptanceMatchesDocument(input,{id:base.documentId,documentVersion:2,contentHash:base.documentHash,total:money(12345)})).toBe(true);expect(acceptanceMatchesDocument(input,{id:base.documentId,documentVersion:3,contentHash:"b".repeat(64),total:money(13000)})).toBe(false);});
  it("returns a frozen accepted-terms snapshot",()=>{const terms=acceptedTerms(builderAttestedAcceptanceV1.parse(base));expect(Object.isFrozen(terms)).toBe(true);expect(terms).toMatchObject({documentVersion:2,documentHash:"a".repeat(64),total:{pence:12345,currency:"GBP"}});});
  it("labels builder evidence honestly and has no paid side effects",()=>{expect(acceptanceLabel).toContain("Builder attestation");expect(acceptanceLabel).toContain("not an e-signature");expect(acceptanceLabel).toContain("independently authenticated");expect(acceptanceHasZeroPlatformEffects()).toEqual({feeObligations:0,platformJournals:0,chargeAttempts:0,planActivations:0});});
  it("rejects malformed boundaries",()=>{expect(()=>builderAttestedAcceptanceV1.parse({...base,documentVersion:0})).toThrow();});
  it("fails stale and unauthorized attempts",()=>{const input=builderAttestedAcceptanceV1.parse(base),document={id:base.documentId,documentVersion:2,contentHash:base.documentHash,total:money(12345)};expect(()=>assertAcceptanceAllowed(input,document,{authorized:false,currentJobRevision:4})).toThrow("ACCEPTANCE_FORBIDDEN");expect(()=>assertAcceptanceAllowed(input,document,{authorized:true,currentJobRevision:5})).toThrow("STALE_ACCEPTANCE");});
});
