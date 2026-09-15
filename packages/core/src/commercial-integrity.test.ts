import { describe, expect, it } from "vitest";
import { money } from "./money.js";
import { D11_POLICY_VERSION, evaluateCommercialIntegrity, type D11CandidatePolicy } from "./commercial-integrity.js";

const policy: D11CandidatePolicy = { version: D11_POLICY_VERSION, minimumWonJobsForRatio: 1, maximumUnswitchedBasisPoints: 1000, materialVarianceBasisPoints: 1000, liveActivityWindowMilliseconds: 100, recoveryLandingWindowMilliseconds: 100 };
const now=1_000;
describe("D11 advisory pure checks",()=>{
  it("finds won jobs never switched live and cites the tenant aggregate",()=>{const result=evaluateCommercialIntegrity([{jobId:"j",wonAt:1}],policy,now);expect(result.findings[0]).toMatchObject({kind:"won_never_switched_live",advisory:true,syntheticOnly:true,citedNumbers:{wonJobs:1,switchedLiveJobs:0}});});
  it("finds accepted value materially below quoted or final using exact Money",()=>{const result=evaluateCommercialIntegrity([{jobId:"j",quotedNetValue:money(20_000),acceptedNetValue:money(10_000),finalNetValue:money(30_000)}],policy,now);expect(result.findings[0]).toMatchObject({kind:"accepted_value_variance",citedNumbers:{acceptedNetPence:10_000,finalNetPence:30_000}});});
  it("finds inactive live jobs",()=>expect(evaluateCommercialIntegrity([{jobId:"j",switchedLiveAt:1,lastLiveActivityAt:2}],policy,now).findings).toEqual([expect.objectContaining({kind:"live_job_activity_gap"})]));
  it("finds recovery discussed and reportedly settled without an in-app landing",()=>expect(evaluateCommercialIntegrity([{jobId:"j",recoveryDiscussedAt:1,outsideAppSettlementReportedAt:2}],policy,now).findings).toEqual([expect.objectContaining({kind:"recovery_settled_outside_app"})]));
  it("takes thresholds from policy rather than embedding them",()=>{const fact={jobId:"j",quotedNetValue:money(100),acceptedNetValue:money(89)};expect(evaluateCommercialIntegrity([fact],{...policy,materialVarianceBasisPoints:1200},now).findings).toHaveLength(0);expect(evaluateCommercialIntegrity([fact],{...policy,materialVarianceBasisPoints:1000},now).findings[0]?.kind).toBe("accepted_value_variance");});
});
