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
