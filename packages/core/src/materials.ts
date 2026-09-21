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
