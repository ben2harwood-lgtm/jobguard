import { z } from "zod";
import { calculateCumulativeFee, compareExactPence, exactPence, exactPenceV1, parseExactPence, serializeExactPence, sumExactPence } from "./cumulative-fee.js";
import { money, moneyFromBigInt } from "./money.js";
import { currentAttributionQualificationV1, recoveryAttributionRevisionV1 } from "./recovery-attribution-persistence.js";
import { qualifiesAttribution } from "./shadow-domain/attribution.js";
import { freezeShadow, shadowId, shadowRef } from "./shadow-domain/types.js";

/** Synthetic reference composition only; never an approval of D01/D02/D03/D13 or production charging. */
export const recoveryFeeIllustrationPolicyBundleV1 = z.literal("recovery-fee-illustration.synthetic-policy.v1");
const scope = { tenantId: shadowId, jobId: shadowId, lockId: shadowId };
const capture = z.object({
  ...scope, captureId: shadowId, sourceRevision: shadowRef, sourceHash: z.string().regex(/^[a-f0-9]{64}$/u), exactNet: exactPenceV1,
}).strict().readonly();
export const recoveryFeeIllustrationInputV1 = z.object({
  version: z.literal("recovery-fee-illustration-input.v1"), environment: z.literal("synthetic_demo"), ...scope,
  policyBundleRef: recoveryFeeIllustrationPolicyBundleV1,
  sources: z.array(z.object({
    caseId: shadowId, workId: shadowId, lineId: shadowId,
    assessment: recoveryAttributionRevisionV1, qualification: currentAttributionQualificationV1,
  }).strict().readonly()).max(10_000).readonly(),
  captures: z.array(capture).max(10_000).readonly(),
}).strict().readonly().brand<"RecoveryFeeIllustrationInputV1">();
export type RecoveryFeeIllustrationInputV1 = z.infer<typeof recoveryFeeIllustrationInputV1>;
const displayMoney = z.object({ pence: z.number().int().safe(), currency: z.literal("GBP") }).strict().refine(v => {
  try { money(v.pence); return true; } catch { return false; }
}).readonly();
export const recoveryFeeIllustrationOutputV1 = z.object({
  version: z.literal("recovery-fee-illustration.v1"), environment: z.literal("synthetic_demo"), ...scope,
  productionEnabled: z.literal(false), realExternalActions: z.literal(0), policyBundleRef: recoveryFeeIllustrationPolicyBundleV1,
  label: z.literal("Illustration — proposed policy; principal only"),
  notice: z.literal("Practice sandbox — synthetic data; nothing is sent or charged"), taxStatus: z.literal("VAT not calculated"),
  exactQualifyingPrincipal: exactPenceV1, cumulativeFee: displayMoney,
  exactCapturedFeeFreeNet: exactPenceV1, capturedFee: z.object({ pence: z.literal(0), currency: z.literal("GBP") }).strict(),
  exactYoursBeforeVatAndTax: exactPenceV1,
  display: z.object({ qualifyingPrincipal: displayMoney.nullable(), capturedFeeFreeNet: displayMoney.nullable(), yoursBeforeVatAndTax: displayMoney.nullable() }).strict(),
  sourceReferences: z.array(z.object({
    assessmentId: shadowId, reviewId: shadowId, reviewAuthorizationId: shadowId, sourceRevision: shadowRef,
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/u), lineAllocationIds: z.array(shadowId).readonly(),
  }).strict()).readonly(),
}).strict().readonly();
export type RecoveryFeeIllustrationOutputV1 = z.infer<typeof recoveryFeeIllustrationOutputV1>;
export class RecoveryFeeIllustrationError extends Error {
  readonly code = "INVALID_RECOVERY_FEE_ILLUSTRATION";
  constructor() { super("Invalid recovery fee illustration source envelope"); this.name = "RecoveryFeeIllustrationError"; }
}
const fail = (): never => { throw new RecoveryFeeIllustrationError(); };
const integerDisplay = (value: ReturnType<typeof exactPence>) => value.numerator % value.denominator === 0n
  ? moneyFromBigInt(value.numerator / value.denominator) : null;

/**
 * Internal pure projection only. Parsing is not authentication, freshness, evidence verification or authorization.
 * The caller must reconstruct current saved qualification/assessment/capture facts under its accepted source locks.
 * Current remaining values already incorporate reversals: never redistribute receipts or add historical revisions.
 */
export function deriveRecoveryFeeIllustration(input: RecoveryFeeIllustrationInputV1): RecoveryFeeIllustrationOutputV1 {
  try {
    const parsed = recoveryFeeIllustrationInputV1.safeParse(input);
    if (!parsed.success) return fail();
    const f = parsed.data;
    const allocations = new Set<string>(), works = new Set<string>(), assessments = new Set<string>(), reviews = new Set<string>();
    const unique = (set: Set<string>, key: string) => { if (set.has(key)) fail(); set.add(key); };
    const principals = f.sources.map(entry => {
      const q = entry.qualification, a = entry.assessment;
      if (q.state !== "qualified") return fail();
      const s = q.source;
      for (const key of ["tenantId", "jobId", "lockId"] as const)
        if (s[key] !== f[key] || a[key] !== f[key]) return fail();
      for (const key of ["caseId", "workId", "lineId"] as const)
        if (s[key] !== entry[key] || a[key] !== entry[key]) return fail();
      if (s.policyBundleRef !== f.policyBundleRef || a.policyBundleRef !== f.policyBundleRef ||
          s.assessmentId !== a.assessmentId || s.assessmentRevision !== a.revision ||
          s.sourceRevision !== a.sourceRevision || s.sourceHash !== a.sourceHash ||
          a.assessmentOutcome !== "eligible_for_review" || !qualifiesAttribution(a.facts)) return fail();
      const remaining = parseExactPence(s.exactRemainingPrincipal);
      if (compareExactPence(remaining, parseExactPence(a.remainingPrincipal)) !== 0) return fail();
      // One coalesced work identity, one current assessment/review and one allocation consumption.
      unique(works, s.workId); unique(assessments, s.assessmentId); unique(reviews, s.reviewId);
      for (const allocationId of s.lineAllocationIds) {
        unique(allocations, allocationId);
        if (!a.sourceManifest.some(ref => ref.sourceId === allocationId && ref.kind === "line_allocation")) return fail();
      }
      return remaining;
    });
    const captureIds = new Set<string>();
    const captured = sumExactPence(f.captures.map(c => {
      for (const key of ["tenantId", "jobId", "lockId"] as const) if (c[key] !== f[key]) return fail();
      unique(captureIds, c.captureId);
      const value = parseExactPence(c.exactNet);
      if (value.numerator < 0n) return fail();
      return value;
    }));
    const principal = sumExactPence(principals);
    // Parse the aggregate too: individually bounded terms may sum beyond the application limit.
    parseExactPence(serializeExactPence(captured)); parseExactPence(serializeExactPence(principal));
    const fee = calculateCumulativeFee({
      version: "cumulative-fee.v1", rate: { version: "fee-rate.v1", policyVersion: "reference_fee_policy_v3", numerator: "10", denominator: "100" },
      cumulativeQualifyingPrincipal: serializeExactPence(principal), priorNetPostedPence: 0,
      priorPolicyVersion: "reference_fee_policy_v3", compensatesDerivationId: null,
    }).cumulativeFee;
    // Zero is only a kernel argument to obtain F. No ledger-derived J or postingDelta leaves this function.
    const yours = sumExactPence([principal, exactPence(-BigInt(fee.pence))]);
    return freezeShadow(recoveryFeeIllustrationOutputV1.parse({
      version: "recovery-fee-illustration.v1", environment: "synthetic_demo", tenantId: f.tenantId, jobId: f.jobId, lockId: f.lockId,
      productionEnabled: false, realExternalActions: 0, policyBundleRef: f.policyBundleRef,
      label: "Illustration — proposed policy; principal only", notice: "Practice sandbox — synthetic data; nothing is sent or charged", taxStatus: "VAT not calculated",
      exactQualifyingPrincipal: serializeExactPence(principal), cumulativeFee: fee,
      exactCapturedFeeFreeNet: serializeExactPence(captured), capturedFee: { pence: 0, currency: "GBP" },
      exactYoursBeforeVatAndTax: serializeExactPence(yours),
      display: { qualifyingPrincipal: integerDisplay(principal), capturedFeeFreeNet: integerDisplay(captured), yoursBeforeVatAndTax: integerDisplay(yours) },
      sourceReferences: f.sources.map(({ qualification }) => {
        if (qualification.state !== "qualified") return fail();
        const s = qualification.source;
        return { assessmentId: s.assessmentId, reviewId: s.reviewId, reviewAuthorizationId: s.reviewAuthorizationId, sourceRevision: s.sourceRevision, sourceHash: s.sourceHash, lineAllocationIds: s.lineAllocationIds };
      }),
    }));
  } catch { throw new RecoveryFeeIllustrationError(); }
}
