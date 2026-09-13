import { money, moneyFromBigInt, type Money } from "./money.js";

export type AllocationWeight = Readonly<{ id: string; weight: bigint }>;

export function allocateMoney(total: Money, weights: readonly AllocationWeight[]): ReadonlyMap<string, Money> {
  if (weights.length === 0) {
    if (total.pence !== 0) throw new RangeError("A non-zero total needs allocation targets");
    return new Map();
  }
  if (new Set(weights.map(({ id }) => id)).size !== weights.length || weights.some(({ weight }) => weight < 0n)) {
    throw new RangeError("Allocation IDs must be unique and weights nonnegative");
  }
  const weightTotal = weights.reduce((sum, item) => sum + item.weight, 0n);
  if (weightTotal === 0n) throw new RangeError("Allocation weight total must be positive");
  const sign = total.pence < 0 ? -1n : 1n;
  const absolute = BigInt(Math.abs(total.pence));
  const rows = weights.map((item) => {
    const product = absolute * item.weight;
    return { ...item, allocated: product / weightTotal, remainder: product % weightTotal };
  });
  let penniesLeft = absolute - rows.reduce((sum, row) => sum + row.allocated, 0n);
  const ranked = [...rows].sort((a, b) => a.remainder === b.remainder ? a.id.localeCompare(b.id) : a.remainder > b.remainder ? -1 : 1);
  for (const row of ranked) {
    if (penniesLeft === 0n) break;
    row.allocated += 1n;
    penniesLeft -= 1n;
  }
  return new Map(rows.map((row) => [row.id, row.allocated === 0n ? money(0) : moneyFromBigInt(sign * row.allocated)]));
}
