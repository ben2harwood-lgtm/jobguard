import { z } from "zod";

export const supplierFactCorrectionV1 = z.object({
  version: z.literal("supplier-fact-correction.v1"), documentId: z.string().uuid(), commandId: z.string().uuid(),
  documentType: z.enum(["invoice", "credit"]), quantity: z.string().regex(/^\d+(?:\.\d+)?$/),
  unitPricePence: z.number().int().safe().nonnegative().max(1_000_000_000_000), netPence: z.number().int().safe().nonnegative().max(1_000_000_000_000),
  disposition: z.enum(["source_verified", "manual_transcription", "pack_resolved"]).optional(), expectedRevision: z.number().int().nonnegative(),
}).strict();
export type SupplierFactCorrection = z.infer<typeof supplierFactCorrectionV1>;
export type SupplierFactProposal = { documentType:"invoice"|"credit"; quantity:string|null; unitPricePence:number|null; netPence:number|null; source:{page:number;start:number;end:number;region:string}; issues:string[]; parserVersion:"supplier-text.v1" };

/** Pure, deterministic text-first extraction. It has no fixture-label or external-action dependency. */
export function parseSupplierText(text:string, page=1):SupplierFactProposal {
  const type=/\bcredit\b/i.test(text)?"credit":"invoice";
  const line=/(\d+(?:\.\d+)?)\s*(?:each|ea|units?)\s*@\s*(?:GBP|£)\s*(\d+\.\d{2})/i.exec(text);
  const total=/\b(?:NET|TOTAL)\s*(?:GBP|£)\s*(\d+\.\d{2})/i.exec(text);
  const quantity=line?.[1]??null, unitPricePence=line?decimalPounds(line[2]!):null, netPence=total?decimalPounds(total[1]!):null;
  const issues:string[]=[];
  if(page<1)issues.push("missing_page"); if(!line||!total)issues.push("missing_fact");
  if(/\b(?:pack|box|case)\b/i.test(text)&&!/\b(?:pack|box|case)\s*=\s*\d+\s*each\b/i.test(text))issues.push("pack_ambiguity");
  if(quantity&&unitPricePence!==null&&netPence!==null&&decimalQuantityTimesPence(quantity,unitPricePence)!==netPence)issues.push("arithmetic_mismatch");
  const start=line?.index??total?.index??0, end=Math.max(line?line.index+line[0].length:0,total?total.index+total[0].length:0);
  return {documentType:type,quantity,unitPricePence,netPence,source:{page,start,end,region:`page-${page}:text-${start}-${end}`},issues,parserVersion:"supplier-text.v1"};
}
function decimalPounds(value:string){const [whole,fraction]=value.split(".");return Number(whole)*100+Number(fraction)}
function decimalQuantityTimesPence(quantity:string,pence:number){const [w,f=""]=quantity.split(".");const scale=10n**BigInt(f.length);const numerator=BigInt(w!)*scale+BigInt(f||0);const result=numerator*BigInt(pence);return result%scale===0n?Number(result/scale):NaN}
