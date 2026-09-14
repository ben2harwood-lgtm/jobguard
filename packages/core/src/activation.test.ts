import { describe, expect, it } from "vitest";
import { activationEffects, assertSwitchLiveTerms, recoveryCap } from "./activation.js";
import { money } from "./money.js";

const base={version:"switch-live.v1",activationId:"10000000-0000-4000-8000-000000000001",capSnapshotId:"20000000-0000-4000-8000-000000000002",syntheticObligationId:null,jobId:"30000000-0000-4000-8000-000000000003",acceptedDocumentId:"40000000-0000-4000-8000-000000000004",acceptedDocumentVersion:2,acceptedDocumentHash:"a".repeat(64),expectedJobRevision:1,acceptedNetValuePence:100_100,recoveryCapPence:1_502,mode:"pilot_no_charge",activationTermsVersion:"pilot_no_charge.v1",feePolicyVersion:"reference_fee_policy_v1",activatedAt:new Date("2026-09-14T12:00:00Z")} as const;
describe("switch-live domain",()=>{
  it("uses exact-integer half-even money for the immutable cap",()=>{expect(recoveryCap(money(100_100))).toEqual(money(1_502));expect(recoveryCap(money(100_300))).toEqual(money(1_504));});
  it("keeps pilot and synthetic fee states separate",()=>{expect(()=>assertSwitchLiveTerms(base)).not.toThrow();expect(activationEffects("pilot_no_charge")).toEqual({activations:1,capSnapshots:1,syntheticObligations:0,platformJournals:0,collectionRequests:0});expect(activationEffects("synthetic_demo").syntheticObligations).toBe(1);expect(()=>assertSwitchLiveTerms({...base,syntheticObligationId:base.capSnapshotId})).toThrow("PILOT_OBLIGATION_FORBIDDEN");});
  it("rejects enlargement or mismatched activation terms",()=>{expect(()=>assertSwitchLiveTerms({...base,recoveryCapPence:1_503})).toThrow("CAP_MISMATCH");expect(()=>assertSwitchLiveTerms({...base,activationTermsVersion:"synthetic_demo_illustrative.v1"})).toThrow("ACTIVATION_TERMS_MISMATCH");});
});
