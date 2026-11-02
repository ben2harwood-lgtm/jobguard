import { z } from "zod";
import { utcDatetimeV1 } from "./datetime.js";
import { MAX_MONEY_PENCE, moneyFromBigInt, type Money } from "./money.js";
import { preventionFactStale } from "./prevention-checks.js";

/** Dark synthetic preview only. No route, persistence, commercial command or live adapter. */
export const EXPOSURE_CURVE_ENABLED = false as const;
export const EXPOSURE_SOURCE = {
  id: "synthetic-stage-schedule.v1", name: "Generated stage schedule (synthetic)",
} as const;
const referencePolicy = {
  version: "prevention-staleness-reference.v1" as const, referenceOnly: true as const,
  maximumAgeMinutes: { [EXPOSURE_SOURCE.id]: 1440 },
};
const amount = z.object({ pence: z.number().int().min(0).max(MAX_MONEY_PENCE), currency: z.literal("GBP") }).strict();
const citation = z.object({
  id: z.literal(EXPOSURE_SOURCE.id), name: z.literal(EXPOSURE_SOURCE.name),
  retrievedAt: utcDatetimeV1, observedAt: utcDatetimeV1.nullable(),
}).strict();
export const exposureScheduleV1 = z.object({
  version: z.literal("exposure-schedule.v1"), environment: z.literal("synthetic_demo"),
  evaluatedAt: utcDatetimeV1,
  stages: z.array(z.object({
    id: z.string().trim().min(1).max(100), label: z.string().trim().min(1).max(100), date: z.iso.date(),
    source: citation.nullable(), cumulativeWorkValue: amount.nullable(), cumulativeReceipts: amount.nullable(),
  }).strict()).min(1).max(1000),
}).strict().superRefine(({ stages }, ctx) => {
  if (new Set(stages.map(stage => stage.id)).size !== stages.length
    || stages.some((stage, i) => i > 0 && stage.date <= stages[i - 1]!.date)) {
    ctx.addIssue({ code: "custom", message: "Stages need unique identities and increasing dates" });
  }
});
export type ExposureScheduleV1 = z.infer<typeof exposureScheduleV1>;
export class ExposureCurveError extends Error {
  readonly code = "INVALID_EXPOSURE_SCHEDULE";
  constructor() { super("Invalid versioned synthetic exposure schedule"); this.name = "ExposureCurveError"; }
}
export type ExposurePoint = Readonly<{
  id: string; label: string; date: string; source: Readonly<z.infer<typeof citation>> | null;
} & (
  { status: "unknown"; reason: "missing" | "stale" | "future"; atRisk: null; cumulativeWorkValue: null; cumulativeReceipts: null }
  | { status: "advisory"; reason: "current"; atRisk: Money; cumulativeWorkValue: Money; cumulativeReceipts: Money }
)>;

/** Reference exposure = max(0, cumulative work value - cumulative received net cash).
 * Stage snapshots are independent, not additive: no inference of settlement, recovery or savings.
 */
export function evaluateExposureCurve(raw: unknown) {
  const parsed = exposureScheduleV1.safeParse(raw);
  if (!parsed.success) throw new ExposureCurveError();
  const { stages, evaluatedAt } = parsed.data;
  const points = stages.map((stage): ExposurePoint => {
    const source = stage.source === null ? null : Object.freeze(stage.source);
    const base = { id: stage.id, label: stage.label, date: stage.date, source };
    let reason: "missing" | "stale" | "future" | null = null;
    if (!source || !source.observedAt || stage.cumulativeWorkValue === null || stage.cumulativeReceipts === null) reason = "missing";
    else if (Date.parse(source.retrievedAt) > Date.parse(evaluatedAt)
      || Date.parse(source.observedAt) > Date.parse(source.retrievedAt)) reason = "future";
    else if (preventionFactStale(source.id, source.observedAt, evaluatedAt, referencePolicy)) reason = "stale";
    if (reason) return Object.freeze({ ...base, status: "unknown", reason, atRisk: null, cumulativeWorkValue: null, cumulativeReceipts: null });
    const work = BigInt(stage.cumulativeWorkValue!.pence), receipts = BigInt(stage.cumulativeReceipts!.pence);
    return Object.freeze({ ...base, status: "advisory", reason: "current", atRisk: moneyFromBigInt(work > receipts ? work - receipts : 0n),
      cumulativeWorkValue: moneyFromBigInt(work), cumulativeReceipts: moneyFromBigInt(receipts) });
  });
  return Object.freeze({ version: "exposure-curve.v1" as const, environment: "synthetic_demo" as const,
    referenceOnly: true as const, policyVersion: referencePolicy.version, maximumAgeMinutes: 1440,
    evaluatedAt, points: Object.freeze(points) });
}

/** Made-up net stage values, never read from a customer's job or the financial books. */
export function exposureScheduleFixture(): ExposureScheduleV1 {
  return exposureScheduleV1.parse({
    version: "exposure-schedule.v1", environment: "synthetic_demo", evaluatedAt: "2026-10-31T13:00:00.000Z",
    stages: [
      { id: "setup", label: "Site setup", date: "2026-11-02", work: 100000, receipts: 0 },
      { id: "structure", label: "Structure", date: "2026-11-09", work: 500000, receipts: 200000 },
      { id: "finish", label: "Completion", date: "2026-11-16", work: 800000, receipts: 800000 },
    ].map(({ work, receipts, ...stage }) => ({ ...stage,
      source: { ...EXPOSURE_SOURCE, retrievedAt: "2026-10-31T12:00:00.000Z", observedAt: "2026-10-31T12:00:00.000Z" },
      cumulativeWorkValue: { pence: work, currency: "GBP" }, cumulativeReceipts: { pence: receipts, currency: "GBP" },
    })),
  });
}
