import { z } from "zod";

const DECIMAL=/^(0|[1-9]\d*)(\.\d{1,6})?$/;
export const materialQuantityV1=z.string().regex(DECIMAL).refine(v=>BigInt(v.replace(".",""))>0n,"quantity must be positive");
export const materialUnitV1=z.enum(["each","box","bag","metre","litre"]);
export const materialTaxBasisV1=z.enum(["net","gross","unknown"]);
export const MATERIAL_MONEY_LIMIT=1_000_000_000_000n;
function fraction(value:string){const [whole,part=""]=value.split(".");return {n:BigInt(whole!+part),d:10n**BigInt(part.length)}}
/** Exact half-even quantity × unit-price calculation; no binary floats. */
export function materialNetPence(quantity:string,eachPence:number){const q=materialQuantityV1.parse(quantity),p=BigInt(eachPence);if(!Number.isSafeInteger(eachPence)||p<0n||p>MATERIAL_MONEY_LIMIT)throw new Error("MATERIAL_MONEY_OUT_OF_RANGE");const {n,d}=fraction(q),raw=n*p,base=raw/d,remainder=raw%d;const rounded=remainder*2n<d?base:remainder*2n>d?base+1n:base%2n===0n?base:base+1n;if(rounded>MATERIAL_MONEY_LIMIT)throw new Error("MATERIAL_MONEY_OUT_OF_RANGE");return Number(rounded)}
export function normalizePackRate(packPence:number,eachPerPack:string|undefined){if(!eachPerPack)return {status:"pack_size_needed" as const};const {n,d}=fraction(materialQuantityV1.parse(eachPerPack));const numerator=BigInt(packPence)*d;if(numerator%n!==0n)return {status:"review" as const};const each=numerator/n;if(each>MATERIAL_MONEY_LIMIT)return {status:"review" as const};return {status:"comparable" as const,eachPence:Number(each)}}

type PackQuantity = { quantity: string; unit: string };

type MaterialPackCountInput = {
  measurement?: (PackQuantity & { confirmed: boolean }) | null;
  wastageMultiplier?: string | null;
  product?: { packSize?: PackQuantity | null } | null;
  // The caller supplies only confirmed whole packs of this product and a compatible batch set aside for this job.
  confirmedUsablePacksSetAside: bigint;
};

type MaterialPackCount =
  | { status: "calculated"; neededPacks: bigint; grossPacks: bigint; setAsidePacksUsed: bigint }
  | {
      status: "needs_input";
      reason: "measurement" | "product" | "pack_size" | "unit_mismatch" | "wastage_multiplier" | "set_aside_packs";
    };

function packQuantityFraction(value: string | null | undefined) {
  // Guard the existing validator's BigInt positivity check against malformed strings.
  if (typeof value !== "string" || !DECIMAL.test(value)) return undefined;
  const parsed = materialQuantityV1.safeParse(value);
  return parsed.success ? fraction(parsed.data) : undefined;
}

export function calculateMaterialPackCount(input: MaterialPackCountInput): MaterialPackCount {
  const { measurement, wastageMultiplier, product, confirmedUsablePacksSetAside } = input;
  if (measurement?.confirmed !== true || typeof measurement.unit !== "string" || !measurement.unit.trim()) {
    return { status: "needs_input", reason: "measurement" };
  }
  const need = packQuantityFraction(measurement.quantity);
  if (!need) return { status: "needs_input", reason: "measurement" };
  if (!product) return { status: "needs_input", reason: "product" };
  const { packSize } = product;
  const coverage = packQuantityFraction(packSize?.quantity);
  if (!coverage || typeof packSize?.unit !== "string" || !packSize.unit.trim()) {
    return { status: "needs_input", reason: "pack_size" };
  }
  if (measurement.unit !== packSize.unit) return { status: "needs_input", reason: "unit_mismatch" };
  const allowance = packQuantityFraction(wastageMultiplier);
  if (!allowance) return { status: "needs_input", reason: "wastage_multiplier" };
  if (typeof confirmedUsablePacksSetAside !== "bigint" || confirmedUsablePacksSetAside < 0n) {
    return { status: "needs_input", reason: "set_aside_packs" };
  }

  const numerator = need.n * allowance.n * coverage.d;
  const denominator = need.d * allowance.d * coverage.n;
  const grossPacks = (numerator + denominator - 1n) / denominator;
  const setAsidePacksUsed = confirmedUsablePacksSetAside < grossPacks ? confirmedUsablePacksSetAside : grossPacks;
  return { status: "calculated", grossPacks, setAsidePacksUsed, neededPacks: grossPacks - setAsidePacksUsed };
}
