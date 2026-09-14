import { z } from "zod";
import { addMoney, money, moneyFromBigInt, type Money } from "./money.js";
import { calculateNetLine, parseQuantity } from "./quantity.js";
import { candidateM1TaxPolicy, CANDIDATE_M1_TAX_POLICY_VERSION, UnsupportedTaxTreatmentError } from "./tax.js";
import { divideRounded } from "./rational.js";

export const M1_QUOTE_POLICY = Object.freeze({ currency: "GBP" as const, taxTreatment: "standard_rate_20" as const, taxPolicyVersion: CANDIDATE_M1_TAX_POLICY_VERSION });
const decimal = /^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/;
export const quoteLineV1 = z.object({
  id:z.string().uuid(), scopeItemId:z.string().uuid(), scopeRevisionId:z.string().uuid(), description:z.string().min(1).max(500),
  origin:z.enum(["captured","human"]), included:z.boolean(), exclusionReason:z.string().min(1).max(200).nullable(),
  quantity:z.string().regex(decimal).nullable(), unit:z.string().min(1).max(40).nullable(), unitRatePence:z.number().int().min(0).nullable(),
  discountPercent:z.string().regex(/^(?:0|[1-9]\d?)(?:\.\d{1,4})?$|^100(?:\.0{1,4})?$/), taxTreatment:z.string(),
  rateProvenance:z.enum(["entered","suggestion_accepted"]).nullable(), category:z.string().max(100).nullable(), region:z.string().max(100).nullable(),
});
export type QuoteLine = z.infer<typeof quoteLineV1>;
export type QuoteBlocker={code:"missing_quantity"|"missing_rate"|"missing_unit"|"unsupported_tax"|"unresolved_question"|"missing_exclusion_reason";scopeItemId?:string;message:string};
export type CoverageDiff={unpricedCaptured:Array<{scopeItemId:string;description:string}>;excluded:Array<{scopeItemId:string;description:string;reason:string}>;unresolvedBlockingQuestions:string[];humanAddedExtras:Array<{scopeItemId:string;description:string}>};
export type QuoteTotals={subtotal:Money;discount:Money;net:Money;taxGroups:ReadonlyArray<{treatment:"standard_rate_20";net:Money;tax:Money}>;tax:Money;total:Money};

function decimalRatio(value:string){const [whole,fraction=""]=value.split(".");const scale=10n**BigInt(fraction.length);return{numerator:BigInt(whole!)*scale+BigInt(fraction||"0"),denominator:100n*scale};}
export function evaluateDraftQuote(input:{currency:string;taxPolicyVersion:string;lines:readonly QuoteLine[];blockingQuestions?:readonly string[]}):{issuable:boolean;blockers:QuoteBlocker[];totals:QuoteTotals;coverage:CoverageDiff}{
  const blockers:QuoteBlocker[]=[];let subtotal=money(0),discount=money(0),net=money(0);
  const coverage:CoverageDiff={unpricedCaptured:[],excluded:[],unresolvedBlockingQuestions:[...(input.blockingQuestions??[])],humanAddedExtras:[]};
  if(input.currency!=="GBP"||input.taxPolicyVersion!==M1_QUOTE_POLICY.taxPolicyVersion) blockers.push({code:"unsupported_tax",message:"Real quote issue supports GBP with standard-rated 20% VAT only; the selected treatment is not supported."});
  for(const question of coverage.unresolvedBlockingQuestions)blockers.push({code:"unresolved_question",message:`Resolve blocking question: ${question}`});
  for(const line of input.lines){
    if(line.origin==="human")coverage.humanAddedExtras.push({scopeItemId:line.scopeItemId,description:line.description});
    if(!line.included){if(!line.exclusionReason)blockers.push({code:"missing_exclusion_reason",scopeItemId:line.scopeItemId,message:`Record why ${line.description} is excluded.`});else coverage.excluded.push({scopeItemId:line.scopeItemId,description:line.description,reason:line.exclusionReason});continue;}
    if(line.taxTreatment!==M1_QUOTE_POLICY.taxTreatment)blockers.push({code:"unsupported_tax",scopeItemId:line.scopeItemId,message:`${line.description}: only standard-rated 20% VAT in GBP is supported for real issue.`});
    if(!line.quantity)blockers.push({code:"missing_quantity",scopeItemId:line.scopeItemId,message:`${line.description} needs a quantity before issue.`});
    if(!line.unit)blockers.push({code:"missing_unit",scopeItemId:line.scopeItemId,message:`${line.description} needs a unit before issue.`});
    if(line.unitRatePence===null){blockers.push({code:"missing_rate",scopeItemId:line.scopeItemId,message:`${line.description} needs a confirmed unit rate before issue.`});if(line.origin==="captured")coverage.unpricedCaptured.push({scopeItemId:line.scopeItemId,description:line.description});}
    if(!line.quantity||line.unitRatePence===null)continue;
    const gross=calculateNetLine(parseQuantity(line.quantity),money(line.unitRatePence));const ratio=decimalRatio(line.discountPercent);
    const lineDiscount=moneyFromBigInt(divideRounded(BigInt(gross.pence)*ratio.numerator,ratio.denominator,"half_even"));
    subtotal=addMoney(subtotal,gross);discount=addMoney(discount,lineDiscount);net=addMoney(net,money(gross.pence-lineDiscount.pence));
  }
  let tax=money(0);try{tax=candidateM1TaxPolicy.calculateGroup(net,M1_QUOTE_POLICY.taxTreatment);}catch(error){if(!(error instanceof UnsupportedTaxTreatmentError))throw error;}
  const totals={subtotal,discount,net,taxGroups:[{treatment:M1_QUOTE_POLICY.taxTreatment,net,tax}],tax,total:addMoney(net,tax)};
  return{issuable:blockers.length===0,blockers,totals,coverage};
}

export type DraftQuoteRevision={id:string;revision:number;previousRevisionId:string|null;lines:readonly QuoteLine[]};
export function createDraftQuoteRevision(current:DraftQuoteRevision|null,id:string,lines:readonly QuoteLine[]):DraftQuoteRevision{return Object.freeze({id,revision:(current?.revision??0)+1,previousRevisionId:current?.id??null,lines:Object.freeze([...lines])});}
export function rateObservationKey(line:QuoteLine):string|null{return line.included&&line.quantity&&line.unit&&line.unitRatePence!==null&&line.rateProvenance?`${line.scopeRevisionId}:${line.unit}:${line.unitRatePence}:${line.taxTreatment}`:null;}
