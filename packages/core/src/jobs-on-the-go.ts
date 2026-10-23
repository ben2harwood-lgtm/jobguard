import { z } from "zod";
import { isSmallJobV3 } from "./small-job-v3.js";
import { workFactTimeV1 as sourceTimeV1 } from "./job-work-state.js";
import { MAX_MONEY_PENCE, money, moneyFromBigInt } from "./money.js";
import { divideRounded } from "./rational.js";

/** Independent synthetic inputs only. No event intervals, command admission or job attribution. */
export class MeterFoundationError extends Error {
  constructor(readonly code: "INVALID_METER_FOUNDATION_INPUT" | "METER_MAXIMUM_EXCEEDED") {
    super(code);
    this.name = "MeterFoundationError";
  }
}

function parse<T>(schema: z.ZodType<T, unknown>, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success) throw new MeterFoundationError("INVALID_METER_FOUNDATION_INPUT");
  return result.data;
}

const count = z.number().int().nonnegative().safe();
const uuid = z.guid({ error: "Invalid uuid" }).transform(value => value.toLowerCase());
// Meter dates use years 0001–9999; Intl formats year zero as a year in another era.
const workFactTimeV1 = sourceTimeV1.refine(value => !value.startsWith("0000-"));
export const meterMoneyV1 = z.object({
  pence: z.number().int().safe().min(-MAX_MONEY_PENCE).max(MAX_MONEY_PENCE), currency: z.literal("GBP"),
}).strict().readonly();
const principalMoney = meterMoneyV1.refine(value => value.pence >= 0);

export const londonMeterDateV1 = z.string().regex(/^(?!0000)\d{4}-\d{2}-\d{2}$/u).refine(value => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
});
const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", timeZoneName: "longOffset",
});

/** Date construction always has an explicit validated input; never consults the current time. */
export function londonMeterDate(raw: unknown): string {
  const at = parse(workFactTimeV1, raw);
  const parts = dateFormatter.formatToParts(new Date(at));
  const part = (name: string) => parts.find(value => value.type === name)!.value;
  return parse(londonMeterDateV1, `${part("year").padStart(4, "0")}-${part("month")}-${part("day")}`);
}

function addCalendarDays(date: string, days: number): string {
  const supplied = new Date(`${date}T00:00:00.000Z`);
  supplied.setUTCDate(supplied.getUTCDate() + days);
  return parse(londonMeterDateV1, supplied.toISOString().slice(0, 10));
}

export const meterDay31CandidateV1 = z.object({
  version: z.literal("meter-day31-candidate.v1"), activatedAt: workFactTimeV1, date: londonMeterDateV1, at: workFactTimeV1,
}).strict().readonly();

export function meterDay31Candidate(raw: unknown) {
  const activatedAt = parse(workFactTimeV1, raw);
  const date = addCalendarDays(londonMeterDate(activatedAt), 30);
  const utcMidnight = new Date(`${date}T00:00:00.000Z`);
  // Retain the full offset, including historical minutes/seconds, rather than a clock hour.
  const offsetName = dateFormatter.formatToParts(utcMidnight).find(part => part.type === "timeZoneName")!.value;
  const offset = /^GMT(?:([+-])(\d{2}):(\d{2})(?::(\d{2}))?)?$/u.exec(offsetName);
  if (!offset) throw new MeterFoundationError("INVALID_METER_FOUNDATION_INPUT");
  const seconds = (Number(offset[2] ?? 0) * 3600 + Number(offset[3] ?? 0) * 60 + Number(offset[4] ?? 0)) * (offset[1] === "-" ? -1 : 1);
  utcMidnight.setUTCSeconds(utcMidnight.getUTCSeconds() - seconds);
  return parse(meterDay31CandidateV1, {
    version: "meter-day31-candidate.v1", activatedAt, date, at: utcMidnight.toISOString().replace(".000Z", ".000000Z"),
  });
}

const suppliedJob = z.object({ tenantId: uuid, jobId: uuid, customerId: uuid, siteId: uuid, small: z.boolean() }).strict().readonly();
export const fixedMeterPlacesV1 = z.object({
  version: z.literal("meter-fixed-places.v1"), date: londonMeterDateV1, jobs: z.array(suppliedJob).readonly(),
}).strict().refine(value => new Set(value.jobs.map(job => `${job.tenantId}:${job.jobId}`)).size === value.jobs.length,
  "Each supplied job has one fixed binding").readonly();

const suppliedPlace = z.object({
  tenantId: uuid, customerId: uuid, siteId: uuid, jobIds: z.array(uuid).min(1).readonly(), small: z.boolean(),
}).strict().readonly();
export const fixedMeterPlacesResultV1 = z.object({
  version: z.literal("meter-fixed-places-result.v1"), date: londonMeterDateV1, places: z.array(suppliedPlace).readonly(),
}).strict().readonly();

/** Fixed supplied identities are grouped once. No allowance or paid-extra beneficiary is selected. */
export function groupSuppliedMeterPlaces(raw: unknown) {
  const input = parse(fixedMeterPlacesV1, raw);
  const places = new Map<string, { tenantId: string; customerId: string; siteId: string; jobIds: string[]; small: boolean }>();
  for (const job of input.jobs) {
    const key = `${job.tenantId}:${job.customerId}:${job.siteId}`;
    const prior = places.get(key);
    if (prior) { prior.jobIds.push(job.jobId); prior.small = prior.small && job.small; }
    else places.set(key, { tenantId: job.tenantId, customerId: job.customerId, siteId: job.siteId, jobIds: [job.jobId], small: job.small });
  }
  return parse(fixedMeterPlacesResultV1, {
    version: "meter-fixed-places-result.v1", date: input.date,
    places: [...places.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([, place]) => ({ ...place, jobIds: place.jobIds.sort() })),
  });
}

export const syntheticMeterPolicyV1 = Object.freeze({
  version: "subscription_pricing_policy_v4" as const, status: "proposed" as const,
  extraPlacePence: 2000 as const,
  Solo: Object.freeze({ included: 4 as const, extrasCap: 1 as const, monthlyPence: 2900 as const, maximumPence: 4900 as const }),
  Builder: Object.freeze({ included: 7 as const, extrasCap: 5 as const, monthlyPence: 6900 as const, maximumPence: 16900 as const }),
});
export const syntheticMeterPolicySchemaV1 = z.object({
  version: z.literal("subscription_pricing_policy_v4"), status: z.literal("proposed"), extraPlacePence: z.literal(2000),
  Solo: z.object({ included: z.literal(4), extrasCap: z.literal(1), monthlyPence: z.literal(2900), maximumPence: z.literal(4900) }).strict().readonly(),
  Builder: z.object({ included: z.literal(7), extrasCap: z.literal(5), monthlyPence: z.literal(6900), maximumPence: z.literal(16900) }).strict().readonly(),
}).strict().readonly();
const plan = z.enum(["Solo", "Builder"]);
export const smallPlaceAllowanceV1 = z.object({
  version: z.literal("meter-small-allowance.v1"), plan, rawPlaces: count, smallPlaces: count,
}).strict().refine(value => value.smallPlaces <= value.rawPlaces).readonly();
export const smallPlaceAllowanceResultV1 = z.object({
  version: z.literal("meter-small-allowance-result.v1"), rawPlaces: count, freeSmallPlaces: count, countedPlaces: count,
}).strict().readonly();
export function computeSmallPlaceAllowance(raw: unknown) {
  const input = parse(smallPlaceAllowanceV1, raw);
  const freeSmallPlaces = Math.min(input.smallPlaces, syntheticMeterPolicyV1[input.plan].included);
  return parse(smallPlaceAllowanceResultV1, {
    version: "meter-small-allowance-result.v1", rawPlaces: input.rawPlaces, freeSmallPlaces, countedPlaces: input.rawPlaces - freeSmallPlaces,
  });
}

const activationClassification = z.object({
  version: z.literal("meter-activation-classification.v1"), acceptedNet: principalMoney, highestSentNet: principalMoney,
}).strict();
export function classifyMeterActivation(raw: unknown): boolean {
  const input = parse(activationClassification, raw);
  return isSmallJobV3(input.acceptedNet.pence, input.highestSentNet.pence);
}
/** Comparison only, without a latch, authority, source transition or visibility effect. */
export function exceedsSmallJobTripThreshold(raw: unknown): boolean {
  return parse(meterMoneyV1, raw).pence > 400_000;
}

export const suppliedMeterApprovalV1 = z.discriminatedUnion("status", [
  z.object({ version: z.literal("meter-supplied-approval.v1"), sourceId: uuid, status: z.literal("qualifying_approved"), approvedAt: workFactTimeV1, processedAt: workFactTimeV1, net: meterMoneyV1 }).strict(),
  z.object({ version: z.literal("meter-supplied-approval.v1"), sourceId: uuid, status: z.literal("proposed"), processedAt: workFactTimeV1, net: meterMoneyV1 }).strict(),
]).refine(value => value.status === "proposed" || value.approvedAt <= value.processedAt,
  "Approval time must be on or before processing time");
export const suppliedMeterApprovalDateV1 = z.object({
  sourceId: uuid, originalApprovedAt: workFactTimeV1, date: londonMeterDateV1, net: meterMoneyV1,
}).strict().readonly();
/** The caller supplies a qualifying approval fact; this function cannot establish qualification. */
export function qualifyingApprovalMeterDate(raw: unknown) {
  const fact = parse(suppliedMeterApprovalV1, raw);
  if (fact.status === "proposed") return null;
  return parse(suppliedMeterApprovalDateV1, { sourceId: fact.sourceId, originalApprovedAt: fact.approvedAt, date: londonMeterDate(fact.approvedAt), net: fact.net });
}

const historicalSnapshot = z.object({
  snapshotId: uuid, date: londonMeterDateV1, stoppedAt: workFactTimeV1.nullable(), principal: principalMoney,
  places: z.array(suppliedPlace).readonly(),
}).strict().readonly();
const history = z.array(historicalSnapshot).refine(rows => new Set(rows.map(row => row.snapshotId)).size === rows.length).readonly();
export const meterHistoryPreservationV1 = z.object({
  version: z.literal("meter-history-preservation.v1"), history,
  laterCancellation: z.object({ markerId: uuid, factAt: workFactTimeV1 }).strict().readonly(),
}).strict().refine(value => workFactTimeV1.safeParse(value.laterCancellation.factAt).success && value.history.every(row => row.date < londonMeterDate(value.laterCancellation.factAt) && (row.stoppedAt === null || row.stoppedAt < value.laterCancellation.factAt))).readonly();
export function preserveMeterHistory(raw: unknown) {
  // Supplied snapshots are copied and frozen by validation; no interval is reconstructed.
  return parse(meterHistoryPreservationV1, raw);
}
export const prospectiveMeterIdentityV1 = z.object({
  version: z.literal("meter-prospective-identity.v1"), history, future: fixedMeterPlacesV1,
}).strict().refine(value => value.history.every(row => row.date < value.future.date)).readonly();
export const prospectiveMeterIdentityResultV1 = z.object({
  version: z.literal("meter-prospective-identity-result.v1"), history, future: fixedMeterPlacesResultV1,
  retrospectiveCorrection: meterMoneyV1.refine(value => value.pence === 0),
}).strict().readonly();
export function applyProspectiveMeterIdentityCorrection(raw: unknown) {
  const input = parse(prospectiveMeterIdentityV1, raw);
  return parse(prospectiveMeterIdentityResultV1, {
    version: "meter-prospective-identity-result.v1", history: input.history,
    future: groupSuppliedMeterPlaces(input.future), retrospectiveCorrection: money(0),
  });
}

const suppliedDayFields = z.object({
  date: londonMeterDateV1, plan, annualPrepaid: z.boolean(), trial: z.boolean(), countedPlaces: count,
}).strict();
const suppliedDay = suppliedDayFields.readonly();
export const suppliedMeterPeriodV1 = z.object({
  version: z.literal("meter-supplied-period.v1"), environment: z.enum(["synthetic_demo", "pilot_no_charge"]),
  policy: syntheticMeterPolicySchemaV1, startDate: londonMeterDateV1, endDateExclusive: londonMeterDateV1,
  days: z.array(suppliedDay).min(28).max(31).readonly(),
}).strict().refine(value => {
  if (!londonMeterDateV1.safeParse(value.startDate).success) return false;
  const dates = [...value.days].map(day => day.date).sort();
  try {
    return dates.every((date, i) => date === addCalendarDays(value.startDate, i)) && value.endDateExclusive === addCalendarDays(value.startDate, dates.length);
  } catch { return false; }
}, "A complete supplied monthly calendar-day schedule is required").readonly();

const exactNumerator = z.string().regex(/^(?:0|[1-9]\d*)$/u);
const dailyResult = suppliedDayFields.extend({ basePence: count, paidExtraPlaces: count, extraPence: count, numeratorPence: exactNumerator }).strict().readonly();
export const suppliedMeterPeriodResultV1 = z.object({
  version: z.literal("meter-supplied-period-result.v1"), environment: z.enum(["synthetic_demo", "pilot_no_charge"]),
  hypothetical: z.literal(true), realExternalActions: z.literal(0), policy: syntheticMeterPolicySchemaV1,
  startDate: londonMeterDateV1, endDateExclusive: londonMeterDateV1,
  principal: principalMoney, maximum: principalMoney, numeratorPence: exactNumerator, denominatorDays: count.min(28).max(31),
  days: z.array(dailyResult).min(28).max(31).readonly(),
}).strict().readonly();

/** Scalar formula over supplied totals only. The result is never an obligation or a job-line allocation. */
export function computeSuppliedMeterPeriod(raw: unknown) {
  const input = parse(suppliedMeterPeriodV1, raw);
  const days = [...input.days].sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0).map(day => {
    const terms = input.policy[day.plan];
    const base = BigInt(day.trial || day.annualPrepaid ? 0 : terms.monthlyPence);
    const paidExtraPlaces = day.trial ? 0 : Math.min(Math.max(0, day.countedPlaces - terms.included), terms.extrasCap);
    const extra = BigInt(paidExtraPlaces) * BigInt(input.policy.extraPlacePence);
    return { ...day, basePence: Number(base), paidExtraPlaces, extraPence: Number(extra), numeratorPence: (base + extra).toString() };
  });
  const numerator = days.reduce((sum, day) => sum + BigInt(day.numeratorPence), 0n);
  const principal = moneyFromBigInt(divideRounded(numerator, BigInt(days.length), "half_even"));
  const maximum = money(Math.max(...days.map(day => input.policy[day.plan].maximumPence)));
  if (principal.pence > maximum.pence) throw new MeterFoundationError("METER_MAXIMUM_EXCEEDED");
  return parse(suppliedMeterPeriodResultV1, {
    version: "meter-supplied-period-result.v1", environment: input.environment, hypothetical: true, realExternalActions: 0,
    policy: input.policy, startDate: input.startDate, endDateExclusive: input.endDateExclusive,
    principal, maximum, numeratorPence: numerator.toString(), denominatorDays: days.length, days,
  });
}

export const suppliedMeterCorrectionV1 = z.object({
  version: z.literal("meter-supplied-correction.v1"), original: principalMoney, recomputed: principalMoney,
}).strict().readonly();
export function suppliedMeterCorrection(raw: unknown) {
  const input = parse(suppliedMeterCorrectionV1, raw);
  return moneyFromBigInt(BigInt(input.recomputed.pence) - BigInt(input.original.pence));
}
