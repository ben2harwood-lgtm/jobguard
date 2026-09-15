import { money, type Money } from "./money.js";

export const D11_POLICY_VERSION = "commercial_integrity_policy_v1" as const;

/** Proposed D11 values are supplied by the synthetic evaluator; D11 is not approved. */
export interface D11CandidatePolicy {
  readonly version: typeof D11_POLICY_VERSION;
  readonly minimumWonJobsForRatio: number;
  readonly maximumUnswitchedBasisPoints: number;
  readonly materialVarianceBasisPoints: number;
  readonly liveActivityWindowMilliseconds: number;
  readonly recoveryLandingWindowMilliseconds: number;
}

export interface CommercialIntegrityFact {
  readonly jobId: string;
  readonly wonAt?: number;
  readonly switchedLiveAt?: number;
  readonly quotedNetValue?: Money;
  readonly acceptedNetValue?: Money;
  readonly finalNetValue?: Money;
  readonly lastLiveActivityAt?: number;
  readonly recoveryDiscussedAt?: number;
  readonly outsideAppSettlementReportedAt?: number;
  readonly inAppLandingAt?: number;
}

export type CommercialIntegrityFindingKind =
  | "won_never_switched_live"
  | "accepted_value_variance"
  | "live_job_activity_gap"
  | "recovery_settled_outside_app";

export interface CommercialIntegrityFinding {
  readonly kind: CommercialIntegrityFindingKind;
  readonly jobId: string;
  readonly policyVersion: typeof D11_POLICY_VERSION;
  readonly advisory: true;
  readonly syntheticOnly: true;
  readonly citedNumbers: Readonly<Record<string, number>>;
}

export interface CommercialIntegrityAggregate {
  readonly wonJobs: number;
  readonly switchedLiveJobs: number;
  readonly unswitchedJobs: number;
  readonly unswitchedBasisPoints: number;
  readonly findingsByKind: Readonly<Record<CommercialIntegrityFindingKind, number>>;
}

function basisPoints(difference: Money, reference: Money): number {
  if (reference.pence <= 0) return 0;
  return Number((BigInt(difference.pence) * 10_000n) / BigInt(reference.pence));
}

export function evaluateCommercialIntegrity(
  facts: readonly CommercialIntegrityFact[],
  policy: D11CandidatePolicy,
  evaluatedAt: number,
): { readonly findings: readonly CommercialIntegrityFinding[]; readonly aggregate: CommercialIntegrityAggregate } {
  const won = facts.filter((fact) => fact.wonAt !== undefined);
  const switched = won.filter((fact) => fact.switchedLiveAt !== undefined);
  const unswitched = won.length - switched.length;
  const unswitchedBps = won.length === 0 ? 0 : Number((BigInt(unswitched) * 10_000n) / BigInt(won.length));
  const output: CommercialIntegrityFinding[] = [];
  const add = (kind: CommercialIntegrityFindingKind, fact: CommercialIntegrityFact, citedNumbers: Record<string, number>) =>
    output.push(Object.freeze({ kind, jobId: fact.jobId, policyVersion: policy.version, advisory: true, syntheticOnly: true, citedNumbers: Object.freeze(citedNumbers) }));

  if (won.length >= policy.minimumWonJobsForRatio && unswitchedBps > policy.maximumUnswitchedBasisPoints) {
    for (const fact of won.filter((item) => item.switchedLiveAt === undefined)) add("won_never_switched_live", fact, { wonJobs: won.length, switchedLiveJobs: switched.length, unswitchedBasisPoints: unswitchedBps, thresholdBasisPoints: policy.maximumUnswitchedBasisPoints });
  }
  for (const fact of facts) {
    if (fact.acceptedNetValue && (fact.quotedNetValue || fact.finalNetValue)) {
      const references = [fact.quotedNetValue, fact.finalNetValue].filter((value): value is Money => value !== undefined);
      const reference = references.reduce((highest, value) => value.pence > highest.pence ? value : highest);
      const difference = money(Math.max(0, reference.pence - fact.acceptedNetValue.pence));
      const variance = basisPoints(difference, reference);
      if (variance > policy.materialVarianceBasisPoints) add("accepted_value_variance", fact, { quotedNetPence: fact.quotedNetValue?.pence ?? 0, acceptedNetPence: fact.acceptedNetValue.pence, finalNetPence: fact.finalNetValue?.pence ?? 0, varianceBasisPoints: variance, thresholdBasisPoints: policy.materialVarianceBasisPoints });
    }
    if (fact.switchedLiveAt !== undefined && (fact.lastLiveActivityAt ?? fact.switchedLiveAt) + policy.liveActivityWindowMilliseconds < evaluatedAt) add("live_job_activity_gap", fact, { lastActivityAt: fact.lastLiveActivityAt ?? fact.switchedLiveAt, evaluatedAt, thresholdMilliseconds: policy.liveActivityWindowMilliseconds });
    if (fact.recoveryDiscussedAt !== undefined && fact.outsideAppSettlementReportedAt !== undefined && fact.inAppLandingAt === undefined && fact.outsideAppSettlementReportedAt + policy.recoveryLandingWindowMilliseconds < evaluatedAt) add("recovery_settled_outside_app", fact, { recoveryDiscussedAt: fact.recoveryDiscussedAt, outsideAppSettlementReportedAt: fact.outsideAppSettlementReportedAt, evaluatedAt, thresholdMilliseconds: policy.recoveryLandingWindowMilliseconds });
  }
  const kinds: CommercialIntegrityFindingKind[] = ["won_never_switched_live", "accepted_value_variance", "live_job_activity_gap", "recovery_settled_outside_app"];
  return Object.freeze({ findings: Object.freeze(output), aggregate: Object.freeze({ wonJobs: won.length, switchedLiveJobs: switched.length, unswitchedJobs: unswitched, unswitchedBasisPoints: unswitchedBps, findingsByKind: Object.freeze(Object.fromEntries(kinds.map((kind) => [kind, output.filter((finding) => finding.kind === kind).length])) as Record<CommercialIntegrityFindingKind, number>) }) });
}
