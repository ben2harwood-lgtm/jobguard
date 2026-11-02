import { z } from "zod";
import { sha256 } from "./evidence-pack.js";
import { money, moneyFromBigInt } from "./money.js";
import { divideRounded } from "./rational.js";
import { freezeShadow, shadowAmount, shadowId } from "./shadow-domain/types.js";

// Deliberately no production adapter, route, persistence or provider imports.
const ref = z.string().regex(/^synthetic:[a-z0-9_.-]+$/u).max(150);
const binding = { tenantId: shadowId, jobId: shadowId, lockId: shadowId };
const signal = z.object({
  ...binding, id: ref, workId: ref, source: z.enum(["diary", "voice", "photo", "supplier", "purchase_order", "message"]),
  remainingAtLock: z.boolean(), falsePositive: z.boolean().nullable(),
  confirmedNetPence: shadowAmount.nullable(), attributionDisputed: z.boolean().nullable(),
  useful: z.boolean().nullable(), disclosedBeforeLock: z.boolean(), builderCaptured: z.boolean(),
  qualifyingAttributionRef: ref.nullable(), lockedLineId: ref.nullable(),
}).strict();
const allocation = z.object({
  ...binding, id: ref, signalId: ref, receiptId: ref, netPence: shadowAmount,
  reversesId: ref.nullable(), verifiedEvidenceRef: ref,
}).strict();
export const shadowPilotMeasurementV1 = z.object({
  version: z.literal("shadow-pilot-measurement.v1"), environment: z.literal("synthetic_demo"),
  ...binding, snapshotRef: ref, immutableRecordSetRef: ref,
  captures: z.array(z.object({ ...binding, id: ref }).strict()).max(10_000).nullable(),
  lockedLineIds: z.array(ref).max(10_000),
  signals: z.array(signal).max(10_000).nullable(),
  receipts: z.array(z.object({ ...binding, id: ref, settledNetPence: shadowAmount }).strict()).max(10_000).nullable(),
  allocations: z.array(allocation).max(10_000).nullable(),
  mustSurface: z.array(z.object({ ...binding, id: ref, surfacedByDeadline: z.boolean().nullable() }).strict()).max(10_000).nullable(),
  // A supplied scenario for this job only, never an allocation of a real tenant subscription.
  subscriptionScenario: z.object({ id: ref, periodRef: ref, pence: shadowAmount }).strict().nullable(),
}).strict();
type Input = z.infer<typeof shadowPilotMeasurementV1>;

export class ShadowPilotMeasurementError extends Error {
  constructor(public readonly code: "MEASUREMENT_UNAVAILABLE" | "INVALID_MEASUREMENT") {
    super(code); this.name = "ShadowPilotMeasurementError";
  }
}
function invalid(): never { throw new ShadowPilotMeasurementError("INVALID_MEASUREMENT"); }
function unique<T extends { id: string }>(rows: readonly T[]): T[] {
  const result = new Map<string, T>();
  for (const row of rows) {
    const prior = result.get(row.id);
    if (prior && JSON.stringify(prior) !== JSON.stringify(row)) invalid();
    result.set(row.id, row);
  }
  return [...result.values()].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
function normalize(input: Input) {
  for (const key of ["captures", "signals", "receipts", "allocations", "mustSurface"] as const) {
    const rows = input[key];
    if (rows?.some(row => row.tenantId !== input.tenantId || row.jobId !== input.jobId || row.lockId !== input.lockId)) invalid();
  }
  const signals = input.signals === null ? null : unique(input.signals);
  if (signals && new Set(signals.map(row => row.workId)).size !== signals.length) invalid();
  if (new Set(input.lockedLineIds).size !== input.lockedLineIds.length) invalid();
  for (const row of signals ?? []) {
    if (row.lockedLineId !== null && !input.lockedLineIds.includes(row.lockedLineId)) invalid();
    if (row.falsePositive === true && (row.confirmedNetPence ?? 0) > 0) invalid();
  }
  return { ...input, lockedLineIds: [...input.lockedLineIds].sort(), signals,
    captures: input.captures === null ? null : unique(input.captures),
    receipts: input.receipts === null ? null : unique(input.receipts),
    allocations: input.allocations === null ? null : unique(input.allocations),
    mustSurface: input.mustSurface === null ? null : unique(input.mustSurface) };
}
function recoveries(input: ReturnType<typeof normalize>) {
  if (input.allocations === null || input.receipts === null || input.signals === null) return null;
  const receipts = new Map(input.receipts.map(row => [row.id, row]));
  const signals = new Map(input.signals.map(row => [row.id, row]));
  const entries = new Map(input.allocations.map(row => [row.id, row]));
  const reversed = new Map<string, bigint>(), byReceipt = new Map<string, bigint>(), bySignal = new Map<string, bigint>();
  for (const row of input.allocations) {
    if (!receipts.has(row.receiptId) || !signals.has(row.signalId)) invalid();
    if (row.reversesId !== null) {
      const original = entries.get(row.reversesId);
      if (!original || original.reversesId !== null || original.receiptId !== row.receiptId || original.signalId !== row.signalId) invalid();
      const total = (reversed.get(original.id) ?? 0n) + BigInt(row.netPence);
      if (total > BigInt(original.netPence)) invalid();
      reversed.set(original.id, total);
    }
    const amount = BigInt(row.netPence) * (row.reversesId === null ? 1n : -1n);
    byReceipt.set(row.receiptId, (byReceipt.get(row.receiptId) ?? 0n) + amount);
    bySignal.set(row.signalId, (bySignal.get(row.signalId) ?? 0n) + amount);
  }
  for (const [id, amount] of byReceipt) if (amount < 0n || amount > BigInt(receipts.get(id)!.settledNetPence)) invalid();
  for (const [id, amount] of bySignal) {
    const confirmed = signals.get(id)!.confirmedNetPence;
    if (confirmed === null || amount < 0n || amount > BigInt(confirmed)) invalid();
  }
  let total = 0n, qualifying = 0n;
  for (const row of input.signals) {
    const amount = bySignal.get(row.id) ?? 0n;
    total += amount;
    if (row.qualifyingAttributionRef !== null && row.attributionDisputed === false && row.falsePositive === false &&
      !row.disclosedBeforeLock && !row.builderCaptured && row.lockedLineId === null && row.remainingAtLock) qualifying += amount;
  }
  return { total: moneyFromBigInt(total), qualifying: moneyFromBigInt(qualifying) };
}

/**
 * Trusted synthetic fixture seam only. This is not authentication or a database reader.
 * The caller supplies an immutable, complete record-set snapshot at its named lock;
 * null inventories mean not observed, empty inventories mean observed empty.
 * References and the deterministic digest preserve reproducibility, not authenticity.
 * There is no claim to load or verify database records, and no live adapter is wired.
 */
export function measureShadowPilot(raw: unknown, access: {
  environment: string; audience: string; tenantId: string; jobId: string; lockId: string | null;
}) {
  // Refuse before parsing hidden content: same error for every unavailable caller.
  if (access.environment !== "synthetic_demo" || access.audience !== "synthetic_researcher" || access.lockId === null)
    throw new ShadowPilotMeasurementError("MEASUREMENT_UNAVAILABLE");
  const parsed = shadowPilotMeasurementV1.safeParse(raw);
  if (!parsed.success) invalid();
  if (parsed.data.tenantId !== access.tenantId || parsed.data.jobId !== access.jobId || parsed.data.lockId !== access.lockId)
    throw new ShadowPilotMeasurementError("MEASUREMENT_UNAVAILABLE");
  const input = normalize(parsed.data), recovered = recoveries(input);
  const missing: string[] = [];
  const metric = <T>(name: string, value: T | null, method: string, incomplete = false) => {
    if (value === null) missing.push(name);
    return { status: value === null ? "missing" as const : incomplete ? "incomplete" as const : "observed" as const, value, method };
  };
  const count = (field: "falsePositive" | "attributionDisputed") => {
    if (input.signals === null || input.signals.some(row => row[field] === null)) return null;
    return input.signals.filter(row => row[field] === true).length;
  };
  const confirmed = input.signals === null || input.signals.some(row => row.confirmedNetPence === null) ? null
    : moneyFromBigInt(input.signals.reduce((sum, row) => sum + BigInt(row.confirmedNetPence!), 0n));
  // Missing eligibility assessments must not silently become a hypothetical zero fee.
  const fee = recovered === null || input.signals?.some(row => row.falsePositive === null || row.attributionDisputed === null)
    ? null : moneyFromBigInt(divideRounded(BigInt(recovered.qualifying.pence), 10n, "half_even"));
  const methods = {
    capturesPerJob: metric("capturesPerJob", input.captures?.length ?? null, "Count distinct immutable capture IDs for this job; all capture states count, including withdrawn."),
    signalsRemainingAtLock: metric("signalsRemainingAtLock", input.signals?.filter(row => row.remainingAtLock).length ?? null, "Count distinct work identities explicitly recorded as remaining in the lock-bound snapshot; duplicate work is refused."),
    falsePositives: metric("falsePositives", count("falsePositive"), "Count explicit false-positive assessments, never equate an unconfirmed signal to a false positive; any missing assessment leaves the metric missing."),
    confirmedAmount: metric("confirmedAmount", confirmed, "Sum explicitly confirmed net GBP pence once per work; unknown amounts remain missing."),
    recoveredAmount: metric("recoveredAmount", recovered?.total ?? null, "Sum verified synthetic settled allocations less linked partial/full reversals; bound each receipt by settled net and each signal by confirmed net."),
    disputedAttributions: metric("disputedAttributions", count("attributionDisputed"), "Count explicit disputed-attribution observations, requiring an assessment for every signal."),
    missedMustSurfaceEvents: metric("missedMustSurfaceEvents", input.mustSurface === null || input.mustSurface.some(row => row.surfacedByDeadline === null) ? null
      : input.mustSurface.filter(row => !row.surfacedByDeadline).length, "Count audited must-surface events explicitly observed as not surfaced by their deadline; an absent event inventory or observation is missing."),
    sourceUsefulness: metric("sourceUsefulness", input.signals === null ? null : input.signals.map(row => {
      if (row.useful === null) missing.push(`sourceUsefulness:${row.id}`);
      return { signalId: row.id, source: row.source, useful: row.useful };
    }), "List explicit usefulness assessments per distinct signal and source category; null is missing, never inferred from confirmation or recovery.", input.signals?.some(row => row.useful === null)),
    hypotheticalSubscription: metric("hypotheticalSubscription", input.subscriptionScenario === null ? null : money(input.subscriptionScenario.pence), "Supplied synthetic single-job subscription scenario for the named period; no tariff inference, tenant charge, allocation or subscription offset."),
    hypotheticalSuccessFee: metric("hypotheticalSuccessFee", fee, "Reference fee policy v3 illustration only: 10% of cumulative qualifying recovered net, half-even once; exclude disputed, early-disclosed, builder-captured and already-locked bill lines; require an explicit qualifying attribution reference. Not fee entitlement."),
    demonstratedValue: metric("demonstratedValue", recovered?.total ?? null, "Observed net recovered amount, shown beside hypothetical costs; no causal claim, tax saving or inferred benefit."),
    valueLessHypotheticalCosts: metric("valueLessHypotheticalCosts", recovered === null || fee === null || input.subscriptionScenario === null ? null
      : moneyFromBigInt(BigInt(recovered.total.pence) - BigInt(fee.pence) - BigInt(input.subscriptionScenario.pence)), "Demonstrated recovered net minus supplied subscription scenario and hypothetical success fee; signed GBP comparison only, never a balance due."),
  };
  return freezeShadow({ version: "shadow-pilot-report.v1", environment: "synthetic_demo", label: "Synthetic illustration — no charge",
    tenantId: input.tenantId, jobId: input.jobId, lockId: input.lockId, snapshotRef: input.snapshotRef,
    inputDigest: sha256(JSON.stringify(input)), records: input, metrics: methods, missing,
    notCollected: ["fairness survey (out of scope)", "harm from withholding (no human observations)"],
    effects: { accruals: 0, invoices: 0, collections: 0 }, releaseApproval: false });
}
