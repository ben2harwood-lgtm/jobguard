import { z } from "zod";
import { money, moneyFromBigInt } from "./money.js";
import { exactPence, sumExactPence } from "./cumulative-fee.js";
import {
  assessAttestedReceipt, generatedPracticeFeedEvents, practiceFeedAdapterEventV1, practiceFeedQueryV1, practiceFeedStepV1,
  practiceMovementDefinition, projectPracticeFeedMovements,
  type AttestedReceiptInput, type HashedPracticeFeedEvent, type PracticeFeedMovement, type PracticeFeedView,
  type PracticeMovementKey, type ReceiptAssessment,
} from "./practice-feed.js";

/** Separate issued catalogue: no change to practiceMovementCatalogueV1 or its command version. */
export const practiceFactKeyV1 = z.enum(["receipt-12000","receipt-14640","supplier-payment-600","supplier-payment-840","receipt-interest-120","receipt-compensation-70"]);
export const practiceFactReceiptKeyV1 = z.enum(["receipt-12000","receipt-14640","receipt-interest-120","receipt-compensation-70"]);
export type PracticeFactKey = z.infer<typeof practiceFactKeyV1>;
export type PracticeFactDefinition = Readonly<{
  movement: PracticeFactKey; grossPence: number; kind: "customer_receipt" | "supplier_invoice_payment";
  fixture: "test-m" | "later-supplier-invoice" | "F18-outside-vat"; label: string;
}>;
export const practiceFactsCatalogueV1: readonly PracticeFactDefinition[] = Object.freeze([
  {movement:"receipt-12000",grossPence:1200000,kind:"customer_receipt",fixture:"test-m",label:"£12,000.00 customer deposit (Test M, synthetic)"},
  {movement:"receipt-14640",grossPence:1464000,kind:"customer_receipt",fixture:"test-m",label:"£14,640.00 customer receipt (Test M, synthetic)"},
  {movement:"supplier-payment-600",grossPence:60000,kind:"supplier_invoice_payment",fixture:"later-supplier-invoice",label:"£600.00 supplier invoice payment (interim synthetic fixture)"},
  {movement:"supplier-payment-840",grossPence:84000,kind:"supplier_invoice_payment",fixture:"later-supplier-invoice",label:"£840.00 supplier invoice payment (interim synthetic fixture)"},
  {movement:"receipt-interest-120",grossPence:12000,kind:"customer_receipt",fixture:"F18-outside-vat",label:"£120.00 statutory interest receipt (F18, outside-VAT synthetic fixture)"},
  {movement:"receipt-compensation-70",grossPence:7000,kind:"customer_receipt",fixture:"F18-outside-vat",label:"£70.00 fixed compensation receipt (F18, outside-VAT synthetic fixture)"},
].map(e => Object.freeze({ ...e, movement: practiceFactKeyV1.parse(e.movement), grossPence: money(e.grossPence).pence } as PracticeFactDefinition)));
export function practiceFactDefinition(key: PracticeFactKey): PracticeFactDefinition {
  const definition = practiceFactsCatalogueV1.find(e=>e.movement===key);
  if(!definition)throw new Error(`Unknown practice fact ${String(key)}`);
  return definition;
}
const commandBase = {version:z.literal("practice-facts-command.v1"),commandId:z.string().uuid(),expectedRevision:z.number().int().nonnegative().max(1000000)};
export const practiceFactsCommandV1 = z.discriminatedUnion("action",[
  z.object({...commandBase,action:z.literal("advance"),movement:practiceFactKeyV1,step:practiceFeedStepV1}).strict(),
  z.object({...commandBase,action:z.literal("reconcile_duplicate"),movement:practiceFactKeyV1}).strict(),
  z.object({...commandBase,action:z.literal("match_receipt"),movement:practiceFactReceiptKeyV1,paymentId:z.string().uuid()}).strict(),
]);
export type PracticeFactsCommand = z.infer<typeof practiceFactsCommandV1>;
export const practiceFactsQueryV1 = practiceFeedQueryV1.extend({version:z.literal("practice-facts-query.v1")});

/** Internal one-to-one semantic bridge, never persisted. Reuse the merged algorithms rather than copy their rules. */
export type PracticeFactsQuery = z.infer<typeof practiceFactsQueryV1>;
const representatives: Record<PracticeFactKey,PracticeMovementKey> = {
  "receipt-12000":"receipt-384","receipt-14640":"receipt-3000","supplier-payment-600":"receipt-41280",
  "supplier-payment-840":"receipt-24000","receipt-interest-120":"receipt-17280","receipt-compensation-70":"receipt-960",
};
function original(key:PracticeMovementKey):PracticeFactKey {
  const entry=practiceFactsCatalogueV1.find(e=>representatives[e.movement]===key);
  if(!entry)throw new Error("Unknown internal practice fact representative");
  return entry.movement;
}
const rename = (value:string,from:string,to:string) => value.endsWith(from)?`${value.slice(0,-from.length)}${to}`:value;
export type PracticeFactsAdapterEvent = Omit<HashedPracticeFeedEvent,"sourceHash"|"movementKey"> & {movementKey:PracticeFactKey};
function representativeEvent(event:PracticeFactsAdapterEvent) {
  const key=representatives[event.movementKey];
  return {...event,movementKey:key,eventId:`${event.eventKind}-${key}`,grossPence:practiceMovementDefinition(key).grossPence};
}
export const practiceFactsAdapterEventV1 = z.object({
  ...practiceFeedAdapterEventV1.innerType().shape,movementKey:practiceFactKeyV1,
}).strict().superRefine((event,ctx)=>{
  if(event.grossPence!==practiceFactDefinition(event.movementKey).grossPence)ctx.addIssue({code:"custom",path:["grossPence"],message:"amount is not the fixed catalogue amount"});
  if(event.eventId!==`${event.eventKind}-${event.movementKey}`)ctx.addIssue({code:"custom",path:["eventId"],message:"event id is not the fixed generated identity"});
  const parsed=practiceFeedAdapterEventV1.safeParse(representativeEvent(event));
  if(!parsed.success)for(const issue of parsed.error.issues)ctx.addIssue({...issue});
});
export function generatedPracticeFactsEvents(key:PracticeFactKey,step:z.infer<typeof practiceFeedStepV1>):PracticeFactsAdapterEvent[] {
  return generatedPracticeFeedEvents(representatives[key],step).map(e=>practiceFactsAdapterEventV1.parse({...e,movementKey:key,eventId:`${e.eventKind}-${key}`,grossPence:practiceFactDefinition(key).grossPence}));
}
export type PracticeFactMovement = Omit<PracticeFeedMovement,"movementKey"|"kind"|"fixture"> & {movementKey:PracticeFactKey;kind:PracticeFactDefinition["kind"];fixture:PracticeFactDefinition["fixture"]};
export type HashedPracticeFactEvent = PracticeFactsAdapterEvent & {sourceHash:string};
export function projectPracticeFactsMovements(accountId:string,events:readonly HashedPracticeFactEvent[],reconciled:readonly PracticeFactKey[]):PracticeFactMovement[] {
  const merged=projectPracticeFeedMovements(accountId,events.map(e=>({...representativeEvent(practiceFactsAdapterEventV1.parse(eWithoutHash(e))),sourceHash:e.sourceHash})),reconciled.map(k=>representatives[k]));
  return merged.map(m=>{
    const key=original(m.movementKey),definition=practiceFactDefinition(key);
    return {...m,movementKey:key,kind:definition.kind,fixture:definition.fixture,label:definition.label,grossPence:definition.grossPence,
      id:rename(m.id,m.movementKey,key),underlyingMovementId:rename(m.underlyingMovementId,m.movementKey,key),eventIds:m.eventIds.map(id=>rename(id,m.movementKey,key))};
  });
}
function eWithoutHash(e:HashedPracticeFactEvent):PracticeFactsAdapterEvent {const {sourceHash:_,...event}=e;return event;}
export type PracticeFactsReceiptAssessment = Omit<ReceiptAssessment,"candidateMovementKey"|"matchedMovementKey"> & {candidateMovementKey:PracticeFactKey|null;matchedMovementKey:PracticeFactKey|null};
export type PracticeFactsMatch = {paymentId:string;movementKey:PracticeFactKey;paymentReversed:boolean};
export function assessPracticeFactsReceipt(receipt:AttestedReceiptInput,movements:readonly PracticeFactMovement[],matches:readonly PracticeFactsMatch[]):PracticeFactsReceiptAssessment {
  const definition=practiceFactsCatalogueV1.find(e=>e.kind==="customer_receipt"&&e.grossPence===receipt.amountPence);
  const representative=definition?representatives[definition.movement]:null;
  const merged=assessAttestedReceipt({...receipt,amountPence:representative?practiceMovementDefinition(representative).grossPence:0},movements.map(m=>{
    const key=representatives[m.movementKey],d=practiceMovementDefinition(key);
    return {...m,movementKey:key,kind:d.kind,fixture:d.fixture,label:d.label,grossPence:d.grossPence,id:rename(m.id,m.movementKey,key),underlyingMovementId:rename(m.underlyingMovementId,m.movementKey,key)};
  }),matches.map(m=>({...m,movementKey:representatives[m.movementKey]})));
  return {...merged,candidateMovementKey:merged.candidateMovementKey?original(merged.candidateMovementKey):null,matchedMovementKey:merged.matchedMovementKey?original(merged.matchedMovementKey):null};
}
export function practiceFactsLaterInvoice(movements:readonly PracticeFactMovement[]) {
  const settled=movements.filter(m=>m.kind==="supplier_invoice_payment"&&m.underlyingMovementId===m.movementKey&&m.eligibleForAllocation);
  const total=sumExactPence(settled.map(m=>exactPence(BigInt(m.grossPence))));
  const settledPence=moneyFromBigInt(total.numerator).pence;
  return {fixture:"later-supplier-invoice" as const,cashDuePence:144000 as const,settledPence,state:settledPence===144000?"paid_in_full" as const:settledPence>0?"part_paid" as const:"unpaid" as const};
}
export type PracticeFactsView = Omit<PracticeFeedView,"version"|"catalogue"|"movements"|"receipts"> & {
  version:"practice-facts-view.v1";catalogue:readonly PracticeFactDefinition[];movements:PracticeFactMovement[];
  receipts:Array<Omit<PracticeFeedView["receipts"][number],"assessment"> & {assessment:PracticeFactsReceiptAssessment}>;
  laterInvoice:ReturnType<typeof practiceFactsLaterInvoice>;
};
