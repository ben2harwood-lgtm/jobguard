import { money, type Money } from "./money.js";

export const D11_POLICY_VERSION = "commercial_integrity_policy_v1" as const;
export const COMMERCIAL_INTEGRITY_DEMO_VERSION = "commercial_integrity_demo_v1" as const;
export const DEMO_DAY_MS = 86_400_000;

/** D11 is proposed. This conspicuously named profile is executable only in synthetic_demo. */
export interface D11CandidatePolicy {
  readonly version: typeof D11_POLICY_VERSION | typeof COMMERCIAL_INTEGRITY_DEMO_VERSION;
  readonly minimumWonJobsForRatio?: number;
  readonly maximumUnswitchedBasisPoints?: number;
  readonly materialVarianceBasisPoints: number;
  readonly liveActivityWindowMilliseconds: number;
  readonly recoveryLandingWindowMilliseconds?: number;
}
export const COMMERCIAL_INTEGRITY_DEMO_PROFILE: D11CandidatePolicy = Object.freeze({
  version: COMMERCIAL_INTEGRITY_DEMO_VERSION,
  materialVarianceBasisPoints: 1_000,
  liveActivityWindowMilliseconds: 7 * DEMO_DAY_MS,
});

export interface CommercialIntegrityFact {
  readonly jobId: string;
  readonly acceptedAt?: number;
  /** Legacy name retained for the immutable acceptance source populated by M1-16. */
  readonly wonAt?: number;
  readonly startedAt?: number;
  readonly switchedLiveAt?: number;
  readonly quotedNetValue?: Money;
  readonly acceptedNetValue?: Money;
  readonly finalNetValue?: Money;
  readonly lastLiveActivityAt?: number;
  readonly recoveryDiscussedAt?: number;
  readonly outsideAppSettlementReportedAt?: number;
  readonly inAppLandingAt?: number;
  readonly sources?: Readonly<Record<string, string>>;
}
export type CommercialIntegrityFindingKind = "won_never_switched_live"|"accepted_value_variance"|"live_job_activity_gap"|"recovery_settled_outside_app";
export interface CommercialIntegrityFinding {
  readonly kind: CommercialIntegrityFindingKind; readonly jobId: string;
  readonly policyVersion: D11CandidatePolicy["version"]; readonly advisory: true; readonly syntheticOnly: true;
  readonly citedNumbers: Readonly<Record<string, number>>; readonly sourceReferences: readonly string[];
  readonly timeWindow?: string; readonly reason: string;
}
export interface CommercialIntegrityAggregate {readonly wonJobs:number;readonly switchedLiveJobs:number;readonly unswitchedJobs:number;readonly unswitchedBasisPoints:number;readonly findingsByKind:Readonly<Record<CommercialIntegrityFindingKind,number>>}
const elapsedStrictlyMoreThan=(then:number,window:number,now:number)=>now-then>window;
const lowerByStrictlyMoreThan=(accepted:Money,reference:Money,bps:number)=>reference.pence>0&&accepted.pence<reference.pence&&BigInt(reference.pence-accepted.pence)*10_000n>BigInt(reference.pence)*BigInt(bps);

/** PURE: consumes immutable projections and returns advisory values; it has no IO or action capability. */
export function evaluateCommercialIntegrity(facts:readonly CommercialIntegrityFact[],policy:D11CandidatePolicy,evaluatedAt:number):{readonly findings:readonly CommercialIntegrityFinding[];readonly aggregate:CommercialIntegrityAggregate}{
 const output:CommercialIntegrityFinding[]=[];const add=(kind:CommercialIntegrityFindingKind,f:CommercialIntegrityFact,citedNumbers:Record<string,number>,reason:string,timeWindow?:string)=>output.push(Object.freeze({kind,jobId:f.jobId,policyVersion:policy.version,advisory:true,syntheticOnly:true,citedNumbers:Object.freeze(citedNumbers),sourceReferences:Object.freeze(Object.values(f.sources??{})),reason,...(timeWindow?{timeWindow}:{})}));
 const accepted=facts.filter(f=>(f.acceptedAt??f.wonAt)!==undefined),started=accepted.filter(f=>(f.startedAt??f.switchedLiveAt)!==undefined);
 for(const f of facts){const acceptedAt=f.acceptedAt??f.wonAt,startedAt=f.startedAt??f.switchedLiveAt;
  if(acceptedAt!==undefined&&startedAt===undefined&&elapsedStrictlyMoreThan(acceptedAt,policy.liveActivityWindowMilliseconds,evaluatedAt))add("won_never_switched_live",f,{acceptedAt,evaluatedAt,thresholdMilliseconds:policy.liveActivityWindowMilliseconds},"You recorded acceptance, but have not started this practice job","strictly more than 7 days after acceptance");
  if(f.acceptedNetValue){const refs=[f.quotedNetValue,f.finalNetValue].filter((x):x is Money=>x!==undefined);const triggering=refs.filter(r=>lowerByStrictlyMoreThan(f.acceptedNetValue!,r,policy.materialVarianceBasisPoints));if(triggering.length){const reference=triggering[0]!;add("accepted_value_variance",f,{quotedNetPence:f.quotedNetValue?.pence??0,acceptedNetPence:f.acceptedNetValue.pence,finalNetPence:f.finalNetValue?.pence??0,differencePence:reference.pence-f.acceptedNetValue.pence,thresholdBasisPoints:policy.materialVarianceBasisPoints},"Check the recorded accepted value","strictly more than 10% below quoted or final");}}
  if(startedAt!==undefined&&elapsedStrictlyMoreThan(f.lastLiveActivityAt??startedAt,policy.liveActivityWindowMilliseconds,evaluatedAt))add("live_job_activity_gap",f,{lastActivityAt:f.lastLiveActivityAt??startedAt,evaluatedAt,thresholdMilliseconds:policy.liveActivityWindowMilliseconds},"No activity recorded here","strictly more than 7 days since recorded activity");
  if(f.outsideAppSettlementReportedAt!==undefined&&f.inAppLandingAt===undefined)add("recovery_settled_outside_app",f,{outsideAppSettlementReportedAt:f.outsideAppSettlementReportedAt},"A payment was reported outside this record — check the evidence","explicit synthetic attestation; no mapped in-app landing");
 }
 const kinds:CommercialIntegrityFindingKind[]=["won_never_switched_live","accepted_value_variance","live_job_activity_gap","recovery_settled_outside_app"],won=accepted.length,switched=started.length,unswitched=won-switched,bps=won?Number(BigInt(unswitched)*10_000n/BigInt(won)):0;
 return Object.freeze({findings:Object.freeze(output),aggregate:Object.freeze({wonJobs:won,switchedLiveJobs:switched,unswitchedJobs:unswitched,unswitchedBasisPoints:bps,findingsByKind:Object.freeze(Object.fromEntries(kinds.map(k=>[k,output.filter(f=>f.kind===k).length])) as Record<CommercialIntegrityFindingKind,number>)})});
}
export function commercialIntegrityDemoFixture(jobId:string,evaluatedAt:number){const day=DEMO_DAY_MS;return [{jobId,acceptedAt:evaluatedAt-8*day,quotedNetValue:money(100_000),acceptedNetValue:money(80_000),finalNetValue:money(110_000),sources:{quoted:"quote:practice-v1",accepted:"acceptance:practice-v1",final:"final-account:practice-v1"}},{jobId:`${jobId}:activity`,startedAt:evaluatedAt-9*day,lastLiveActivityAt:evaluatedAt-8*day,sources:{activity:"activity-log:practice-v1"}},{jobId:`${jobId}:outside`,outsideAppSettlementReportedAt:evaluatedAt-1*day,sources:{outsideSettlement:"attestation:outside-receipt-v1",landing:"landing-map:none"}}] as const}
export function assertCommercialIntegrityEnvironment(environment:string){if(environment!=="synthetic_demo")throw new Error("D11_PRODUCTION_PATH_REFUSED_PROPOSED");}
