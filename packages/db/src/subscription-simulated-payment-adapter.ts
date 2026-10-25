import { createHash } from "node:crypto";
import { z } from "zod";
export const subscriptionSimulatedWorkV1=z.object({version:z.literal("subscription-simulated-work.v1"),environment:z.literal("synthetic_demo"),workId:z.guid({ error: "Invalid uuid" }),statementId:z.guid({ error: "Invalid uuid" }),amountPence:z.number().int().min(0).max(16900),contentHash:z.string().regex(/^[a-f0-9]{64}$/u),currency:z.literal("GBP")}).strict();
export type SubscriptionSimulatedWork=z.infer<typeof subscriptionSimulatedWorkV1>;
export const subscriptionSimulatedResultV1=z.object({version:z.literal("subscription-simulated-result.v1"),synthetic:z.literal(true),workId:z.guid({ error: "Invalid uuid" }),resultId:z.guid({ error: "Invalid uuid" }),outcome:z.enum(["redirect","settled","outcome_unknown","failed"])}).strict();
export type SubscriptionSimulatedResult=z.infer<typeof subscriptionSimulatedResultV1>;
export interface SubscriptionPaymentAdapter {
 execute(work:SubscriptionSimulatedWork):Promise<SubscriptionSimulatedResult>;
 reconcile(work:SubscriptionSimulatedWork):Promise<SubscriptionSimulatedResult>;
}
/** No network, credentials, redirect callback or real provider. SQL owns settlement effects. */
export class SyntheticSubscriptionPaymentAdapter implements SubscriptionPaymentAdapter {
 constructor(private readonly outcome:SubscriptionSimulatedResult["outcome"]="settled"){}
 async execute(raw:unknown){return this.result(raw);}
 async reconcile(raw:unknown){return this.result(raw);}
 private result(raw:unknown):SubscriptionSimulatedResult {
  const work=subscriptionSimulatedWorkV1.parse(raw);
  const hex=createHash("sha256").update(JSON.stringify([work,this.outcome])).digest("hex");
  const resultId=`${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20,32)}`;
  return subscriptionSimulatedResultV1.parse({version:"subscription-simulated-result.v1",synthetic:true,workId:work.workId,resultId,outcome:this.outcome});
 }
}
