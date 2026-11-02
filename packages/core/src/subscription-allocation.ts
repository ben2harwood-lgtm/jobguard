import { z } from "zod";
import { computeSmallPlaceAllowance, fixedMeterPlacesV1, groupSuppliedMeterPlaces, syntheticMeterPolicyV1 } from "./jobs-on-the-go.js";
import { MAX_MONEY_PENCE } from "./money.js";
import { divideRounded } from "./rational.js";
import { parseSubscription, subscriptionPlanV1, SubscriptionError } from "./subscription.js";

export const subscriptionAttributionRuleV1 = "canonical-place-and-job.v1" as const;
export const subscriptionAllocationDayV1 = z.object(fixedMeterPlacesV1.unwrap().shape).omit({version:true}).extend({
  version: z.literal("subscription-allocation-day.v1"), plan: subscriptionPlanV1,
  sourceRevision: z.number().int().safe().positive(),
}).strict().refine(v => new Set(v.jobs.map(job => job.tenantId)).size <= 1);
export type SubscriptionPlaceAttribution = "small_allowance" | "included" | "paid_extra" | "grace";

/** Stable key depends only on source tenant/customer/site identities, not representative job.
 * Canonical ordering selects small allowances first, then included places, paid extras and grace.
 * Source corrections affect subsequent bindings only; callers persist issued bindings unchanged. */
export function allocateSubscriptionDay(raw: unknown) {
  const input = parseSubscription(subscriptionAllocationDayV1, raw);
  const grouped = groupSuppliedMeterPlaces({version:"meter-fixed-places.v1",date:input.date,jobs:input.jobs});
  const terms = syntheticMeterPolicyV1[input.plan];
  const allowance = computeSmallPlaceAllowance({
    version:"meter-small-allowance.v1",plan:input.plan,rawPlaces:grouped.places.length,
    smallPlaces:grouped.places.filter(p => p.small).length,
  });
  let smallRemaining = allowance.freeSmallPlaces, counted = 0;
  const places = grouped.places.map(place => {
    let attribution: SubscriptionPlaceAttribution;
    if (place.small && smallRemaining > 0) { smallRemaining--; attribution = "small_allowance"; }
    else { counted++; attribution = counted <= terms.included ? "included" : counted <= terms.included + terms.extrasCap ? "paid_extra" : "grace"; }
    return {...place,placeKey:`${place.tenantId}:${place.customerId}:${place.siteId}`,
      representativeJobId:place.jobIds[0]!,sourceRevision:input.sourceRevision,attribution,ruleVersion:subscriptionAttributionRuleV1};
  });
  return {version:"subscription-allocation-result.v1" as const,date:input.date,plan:input.plan,countedPlaces:allowance.countedPlaces,places};
}

const pence = z.number().int().safe().min(0).max(MAX_MONEY_PENCE);
const key = z.string().min(1).max(300);
export const subscriptionPennyAllocationV1 = z.object({
  lines: z.array(z.object({lineKey:key,numeratorPence:z.string().max(20).regex(/^(?:0|[1-9]\d*)$/u)}).strict()).min(1),
  denominatorDays:z.number().int().min(1).max(31),targetPence:pence,
}).strict().refine(v => new Set(v.lines.map(l => l.lineKey)).size === v.lines.length);
const compareKeys = (a: string,b: string) => a < b ? -1 : a > b ? 1 : 0;

/** A common denominator preserves exact period rational contributions; the target must be the
 * half-even rounded sum. No arbitrary target, floating-point amount or locale-dependent ordering. */
export function allocateSubscriptionPennies(raw: unknown) {
  const input = parseSubscription(subscriptionPennyAllocationV1, raw);
  const denominator = BigInt(input.denominatorDays);
  const sum = input.lines.reduce((n,l) => n + BigInt(l.numeratorPence),0n);
  if (sum > BigInt(MAX_MONEY_PENCE) * denominator || divideRounded(sum,denominator,"half_even") !== BigInt(input.targetPence))
    throw new SubscriptionError("INVALID_SUBSCRIPTION_INPUT");
  const rows = input.lines.map(l => ({lineKey:l.lineKey,pence:Number(BigInt(l.numeratorPence)/denominator),remainder:BigInt(l.numeratorPence)%denominator}));
  const remainderOrder = [...rows].sort((a,b) => a.remainder > b.remainder ? -1 : a.remainder < b.remainder ? 1 : compareKeys(a.lineKey,b.lineKey));
  const remaining = input.targetPence - rows.reduce((n,l) => n+l.pence,0);
  for (let i = 0; i < remaining; i++) remainderOrder[i]!.pence++;
  return rows.sort((a,b) => compareKeys(a.lineKey,b.lineKey)).map(({lineKey,pence:amount}) => ({lineKey,pence:amount}));
}

export const subscriptionCorrectionDispositionV1 = z.object({
  principalPence:pence,maximumPence:pence,
  corrections:z.array(z.object({correctionId:z.guid({ error: "Invalid uuid" }).transform(v => v.toLowerCase()),pence:z.number().int().safe().min(-MAX_MONEY_PENCE).max(MAX_MONEY_PENCE)}).strict()),
}).strict().refine(v => v.principalPence <= v.maximumPence && new Set(v.corrections.map(c=>c.correctionId)).size === v.corrections.length);

/** Positive corrections share remaining cap, in canonical source identity order.
 * Negative facts are retained pending policy, never refunded or silently credited forward. */
export function disposeSubscriptionCorrections(raw: unknown) {
  const input = parseSubscription(subscriptionCorrectionDispositionV1, raw);
  let issuedPence = input.principalPence;
  const dispositions = [...input.corrections].sort((a,b)=>compareKeys(a.correctionId,b.correctionId)).map(c => {
    const appliedPence = Math.min(Math.max(0,c.pence),input.maximumPence-issuedPence);
    const uncollectedPence = Math.max(0,c.pence)-appliedPence;
    issuedPence += appliedPence;
    return {correctionId:c.correctionId,fullPence:c.pence,appliedPence,uncollectedPence,requiresAlert:uncollectedPence>0,negativeHeld:c.pence<0};
  });
  return {issuedPence,dispositions};
}
