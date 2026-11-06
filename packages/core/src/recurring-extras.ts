import { z } from "zod";
import { MAX_MONEY_PENCE, money, moneyFromBigInt } from "./money.js";
import { divideRounded } from "./rational.js";
import { RATE_BASELINE_POLICY } from "./rate-baseline.js";

const uuid = z.guid();
const observationV1 = z.object({
  version: z.literal("recurring-extra-observation.v1"), tenantId: uuid, jobId: uuid,
  variationId: uuid, revisionId: uuid, observationId: uuid,
  description: z.string().trim().min(1).max(500), unit: z.string().trim().min(1).max(40),
  ratePence: z.number().int().min(0).max(MAX_MONEY_PENCE),
  approvedAt: z.iso.datetime({ offset: true }), state: z.enum(["draft", "priced", "approved", "rejected"]), withdrawn: z.boolean(),
}).strict();
export type RecurringExtraObservation = z.infer<typeof observationV1>;
const queryV1 = z.object({ version: z.literal("recurring-extras-query.v1"), tenantId: uuid, asOf: z.iso.datetime({ offset: true }) }).strict();
const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/gu, " ");

/** Descriptive read only. Callers must trace each current revision to its approval and observation. */
export function recurringExtras(rawQuery: unknown, rawRows: readonly unknown[]) {
  const query = queryV1.parse(rawQuery), rows = rawRows.map(row => observationV1.parse(row));
  if (rows.some(row => row.tenantId !== query.tenantId)) throw new Error("MIXED_TENANT");
  const seen = new Map<string, string>(), groups = new Map<string, RecurringExtraObservation[]>();
  for (const row of rows) {
    const fingerprint = JSON.stringify(row), previous = seen.get(row.variationId);
    if (previous !== undefined) {
      if (previous !== fingerprint) throw new Error("CONFLICTING_DUPLICATE");
      continue;
    }
    seen.set(row.variationId, fingerprint);
    const age = Date.parse(query.asOf) - Date.parse(row.approvedAt);
    if (row.state !== "approved" || row.withdrawn || age < 0 || age > RATE_BASELINE_POLICY.windowDays * 86_400_000) continue;
    const key = JSON.stringify([normalize(row.description), normalize(row.unit)]);
    const group = groups.get(key) ?? [];
    group.push(row); groups.set(key, group);
  }
  const suggestions = [...groups.values()].filter(group => new Set(group.map(row => row.jobId)).size >= RATE_BASELINE_POLICY.minimumSamples)
    .map(group => {
      group.sort((a, b) => a.variationId.localeCompare(b.variationId));
      const rates = group.map(row => row.ratePence).sort((a, b) => a - b), middle = Math.floor(rates.length / 2);
      const median = rates.length % 2 ? money(rates[middle]!) : moneyFromBigInt(divideRounded(BigInt(rates[middle - 1]!) + BigInt(rates[middle]!), 2n, "half_even"));
      return { description: normalize(group[0]!.description), unit: normalize(group[0]!.unit),
        jobCount: new Set(group.map(row => row.jobId)).size, lowest: money(rates[0]!), highest: money(rates[rates.length - 1]!), median,
        sources: group.map(row => ({ variationId: row.variationId, jobId: row.jobId, revisionId: row.revisionId, observationId: row.observationId })) };
    }).sort((a, b) => a.description.localeCompare(b.description) || a.unit.localeCompare(b.unit));
  return { version: "recurring-extras.v1" as const, asOf: query.asOf, policyVersion: RATE_BASELINE_POLICY.version,
    status: suggestions.length ? "suggestions" as const : "not_enough_to_say" as const, suggestions };
}
export type RecurringExtras = ReturnType<typeof recurringExtras>;
