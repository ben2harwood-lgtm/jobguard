import { allocateMoney } from "./allocation.js";
import { moneyFromBigInt, type Money } from "./money.js";
import { multiplyRatio } from "./rational.js";

export const CANDIDATE_M1_TAX_POLICY_VERSION = "candidate_m1_standard_v1" as const;
export type TaxTreatment = "standard_rate_20";
export class UnsupportedTaxTreatmentError extends Error { readonly code = "unsupported_tax_treatment"; }
export interface TaxPolicy { readonly version: string; calculateGroup(net: Money, treatment: string): Money; }

export const candidateM1TaxPolicy: TaxPolicy = Object.freeze({
  version: CANDIDATE_M1_TAX_POLICY_VERSION,
  calculateGroup(net: Money, treatment: string) {
    if (treatment !== "standard_rate_20") throw new UnsupportedTaxTreatmentError(`Unsupported tax treatment: ${treatment}`);
    return moneyFromBigInt(multiplyRatio(BigInt(net.pence), 1n, 5n, "half_up"));
  },
});

export function allocateGroupTax(groupTax: Money, lineNets: readonly Readonly<{ id: string; net: Money }>[]): ReadonlyMap<string, Money> {
  return allocateMoney(groupTax, lineNets.map(({ id, net }) => ({ id, weight: BigInt(Math.abs(net.pence)) })));
}

/** Invoice-only signed split matching the practice SQL writer. Credit shares
 * round down; leftover pennies go to positive lines by net descending, then ID.
 * Other tax allocation callers keep their existing absolute-weight contract.
 */
export function allocateSignedInvoiceTax(groupTax: Money, lineNets: readonly Readonly<{ id: string; net: Money }>[]): ReadonlyMap<string, Money> {
  if (new Set(lineNets.map(line => line.id)).size !== lineNets.length) throw new RangeError("Allocation IDs must be unique");
  const net = lineNets.reduce((sum, line) => sum + BigInt(line.net.pence), 0n);
  if (net < 0n || groupTax.pence < 0) throw new RangeError("Unsupported invoice amount");
  if (lineNets.every(line => line.net.pence === 0)) {
    if (groupTax.pence !== 0) throw new RangeError("A non-zero tax needs non-zero invoice lines");
    return new Map(lineNets.map(line => [line.id, moneyFromBigInt(0n)]));
  }
  if (net === 0n || lineNets.every(line => line.net.pence >= 0)) return allocateGroupTax(groupTax, lineNets);
  const rows = lineNets.map(({ id, net: lineNet }) => {
    const product = BigInt(groupTax.pence) * BigInt(lineNet.pence);
    // BigInt division truncates towards zero; SQL floor rounds credits down.
    const allocated = product / net - (product % net < 0n ? 1n : 0n);
    return { id, net: lineNet.pence, allocated };
  });
  const left = BigInt(groupTax.pence) - rows.reduce((sum, row) => sum + row.allocated, 0n);
  const positives = rows.filter(row => row.net > 0).sort((a, b) => a.net === b.net ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : a.net > b.net ? -1 : 1);
  const count = BigInt(positives.length);
  for (const [index, row] of positives.entries()) row.allocated += left / count + (BigInt(index) < left % count ? 1n : 0n);
  return new Map(rows.map(row => [row.id, moneyFromBigInt(row.allocated)]));
}
