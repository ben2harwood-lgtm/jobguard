import { z } from "zod";
import { sha256 } from "./evidence-pack.js";
import { instantV1 } from "./receipt-allocation.js";
import { freezeShadow, shadowId } from "./shadow-domain/types.js";
import { measureShadowPilot, ShadowPilotMeasurementError, shadowPilotMeasurementV1 } from "./shadow-pilot-measurement.js";

const ref = z.string().regex(/^synthetic:[a-z0-9_.-]+$/u).max(150);
const binding = { tenantId: shadowId, jobId: shadowId, lockId: shadowId };
// This new fixture contract uses millisecond precision so Date.parse compares exactly.
const reportInstant = instantV1.refine(value => Number.isFinite(Date.parse(value)) && !/\.\d{4}/u.test(value),
  "Report timestamps require a parseable instant with at most millisecond precision");
const fairnessResponse = z.object({
  ...binding, id: ref, revealId: ref, answeredAt: reportInstant, rating: z.number().int().min(1).max(5),
}).strict();
const harmObservation = z.object({ ...binding, id: ref, harmObserved: z.boolean() }).strict();
export const shadowPilotReportInputV1 = z.object({
  version: z.literal("shadow-pilot-report-input.v1"), environment: z.literal("synthetic_demo"),
  immutableObservationSetRef: ref, measurement: shadowPilotMeasurementV1,
  reveal: z.object({ ...binding, id: ref, revealedAt: reportInstant }).strict().nullable(),
  fairness: z.array(fairnessResponse).max(10_000).nullable(),
  harm: z.array(harmObservation).max(10_000).nullable(),
  // Complete immutable fixture assertion: gross action counts, never net of reversals.
  financialEffects: z.object({ accruals: z.literal(0), invoices: z.literal(0), collections: z.literal(0) }).strict(),
}).strict();

export class ShadowPilotReportError extends Error {
  readonly code = "INVALID_PILOT_REPORT";
  constructor() { super("INVALID_PILOT_REPORT"); this.name = "ShadowPilotReportError"; }
}
function invalid(): never { throw new ShadowPilotReportError(); }
function observations<T extends { id: string; tenantId: string; jobId: string; lockId: string }>(
  rows: T[] | null, expected: z.infer<typeof shadowPilotMeasurementV1>,
): T[] | null {
  if (rows === null) return null;
  const unique = new Map<string, T>();
  for (const row of rows) {
    if (row.tenantId !== expected.tenantId || row.jobId !== expected.jobId || row.lockId !== expected.lockId) invalid();
    const prior = unique.get(row.id);
    if (prior && JSON.stringify(prior) !== JSON.stringify(row)) invalid();
    unique.set(row.id, row);
  }
  return [...unique.values()].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** Pure synthetic fixture seam, not an authenticated reader or real pilot activation.
 * Callers supply complete immutable snapshots; references/digests bind reproduction,
 * not authenticity. No human observation, randomised trial or approval is fabricated.
 */
export function generateShadowPilotReport(raw: unknown, access: Parameters<typeof measureShadowPilot>[1]) {
  if (access.environment !== "synthetic_demo" || access.audience !== "synthetic_researcher" || access.lockId === null)
    throw new ShadowPilotMeasurementError("MEASUREMENT_UNAVAILABLE");
  const parsed = shadowPilotReportInputV1.safeParse(raw);
  if (!parsed.success) invalid();
  const input = parsed.data, usage = measureShadowPilot(input.measurement, access);
  const fairness = observations(input.fairness, input.measurement), harm = observations(input.harm, input.measurement);
  const reveal = input.reveal;
  if (reveal && (reveal.tenantId !== usage.tenantId || reveal.jobId !== usage.jobId || reveal.lockId !== usage.lockId)) invalid();
  for (const row of fairness ?? []) {
    if (!reveal || row.revealId !== reveal.id || Date.parse(row.answeredAt) <= Date.parse(reveal.revealedAt)) invalid();
  }
  const records = { ...input, measurement: usage.records, fairness, harm };
  const missing = [...usage.missing];
  const metric = <T>(name: string, value: T | null, method: string) => {
    if (value === null) missing.push(name);
    return { status: value === null ? "missing" as const : "observed" as const, value, method };
  };
  return freezeShadow({
    version: "shadow-pilot-generated-report.v1", environment: "synthetic_demo", label: "Synthetic illustration — no charge",
    tenantId: usage.tenantId, jobId: usage.jobId, lockId: usage.lockId,
    inputDigest: sha256(JSON.stringify(records)), records, usage: usage.metrics,
    fairness: metric("fairness", fairness?.length ? fairness.map(row => ({ responseId: row.id, rating: row.rating })) : null,
      "List distinct explicit synthetic ratings on a 1–5 fairness scale, only after the referenced reveal; report separately from usage, with no inferred rating or causal claim."),
    harmFromWithholding: metric("harmFromWithholding", harm?.length ? harm.map(row => ({ observationId: row.id, harmObserved: row.harmObserved })) : null,
      "List distinct explicit synthetic withholding-harm observations, including explicit negative observations; absent observations never mean no harm."),
    missing, notCollected: ["randomised hidden-versus-shown trial (requires approved D13 scope and human observations)"],
    effects: input.financialEffects, releaseApproval: false,
    reviewRequirement: "Report review required before G4-S; this report is evidence for decisions, not an approval.",
  });
}
