import { subscriptionConsentText } from "@jobguard/core";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { SubscriptionPersistenceError, subscriptionTermsContentHash, SubscriptionExecutor, SyntheticSubscriptionPaymentAdapter, type SubscriptionRepositoryPort } from "@jobguard/db";
import { resolveVerifiedTenantContext, type TenantRequestCredentials } from "./auth/principal-bridge.js";
import { AuthError, type AuthProvider } from "./auth/auth-provider.js";
/** Resolve the request's authenticated session anew. SQL independently verifies the persisted session and active company role. */
export interface SubscriptionAuthorityPort {
 environment():string|undefined;
 readonly provider: AuthProvider;
 readonly allowedOrigin: string;
 resolve(sessionHandle:unknown):Promise<{credentials:TenantRequestCredentials;digest:string}>;
}
const terms = {
 consentText: z.literal(subscriptionConsentText), version: z.literal("subscription-command.v1"), plan: z.enum(["Solo", "Builder"]),
 cadence: z.literal("monthly"), anchorDay: z.number().int().min(1).max(31),
 termsVersion: z.literal("subscription_terms_v1"), catalogueVersion: z.literal("subscription_pricing_policy_v4"),
 maximumPence: z.union([z.literal(4900), z.literal(16900)]), expectedRevision: z.number().int().safe().nonnegative(),
};
/** Public actions exclude internal issue/apply/executor/result commands. No client can assert settlement. */
export const subscriptionActionV1 = z.discriminatedUnion("kind", [
 z.object({ ...terms, kind: z.literal("accept") }).strict(),
 z.object({ ...terms, kind: z.literal("change") }).strict(),
 z.object({ version: z.literal("subscription-command.v1"), kind: z.literal("approve_simulation"),
  statementId: z.string().uuid(), expectedRevision: terms.expectedRevision,
  contentHash: z.string().regex(/^[a-f0-9]{64}$/u), amountPence: z.number().int().min(0).max(16900) }).strict(),
]);
export class SubscriptionApplication {
 constructor(private readonly authority:SubscriptionAuthorityPort,private readonly repository:SubscriptionRepositoryPort){}
 async command(session:unknown,commandId:string,raw:unknown){
  return this.current(session,async (credentials,digest)=>{
   const context=await resolveVerifiedTenantContext(this.authority.provider,credentials,this.authority.allowedOrigin);
   if(!z.guid({ error: "Invalid uuid" }).safeParse(commandId).success)throw new SubscriptionPersistenceError("INVALID_SUBSCRIPTION_INPUT");
   const parsed = subscriptionActionV1.safeParse(raw);
   if (!parsed.success) throw new SubscriptionPersistenceError("INVALID_SUBSCRIPTION_INPUT");
   const action = parsed.data;
   let command;
   if (action.kind === "accept" || action.kind === "change") {
    if (action.maximumPence !== (action.plan === "Solo" ? 4900 : 16900)) throw new SubscriptionPersistenceError("INVALID_SUBSCRIPTION_INPUT");
    const { version: _version, kind: _kind, consentText: _consentText, ...selection } = action;
    command = { version: action.version, kind: action.kind, ...selection, contentHash: subscriptionTermsContentHash(context.tenantId, { ...selection, consentText: action.consentText }) };
   } else command = action;
   const result = await this.repository.command(context,digest,commandId,command);
   if (action.kind === "approve_simulation") {
    try {
     const workId = z.string().uuid().parse(result.workId);
     const snapshot = await this.repository.read(context, digest);
     // A replay reads durable work. Never retry an attempted or unknown network outcome.
     if (!snapshot.attempts.some(row => row.work_id === workId)) {
      const execution = await new SubscriptionExecutor(this.repository, new SyntheticSubscriptionPaymentAdapter())
       .executeApprovedSimulation(context, digest, randomUUID(), workId, action.expectedRevision);
      if (execution.outcome !== "settled") return { ...result, paymentStatus: "pending" as const };
     } else if (!snapshot.results.some(row => row.work_id === workId && row.outcome === "settled")) {
      return { ...result, paymentStatus: "pending" as const };
     }
    } catch {
     // Approval committed above. Executor/read failures cannot undo it or justify a new approval.
     return { ...result, paymentStatus: "pending" as const };
    }
   }
   return result;
  });
 }
 async read(session:unknown){return this.current(session,async (credentials,digest)=>{
  const context=await resolveVerifiedTenantContext(this.authority.provider,credentials,this.authority.allowedOrigin);
  return this.repository.read(context,digest);
 });}
 private async current<T>(session:unknown,fn:(credentials:TenantRequestCredentials,digest:string)=>Promise<T>):Promise<T>{
  try{
   this.synthetic();const current=await this.authority.resolve(session);this.synthetic();return await fn(current.credentials,current.digest);
  }catch(error){if(error instanceof SubscriptionPersistenceError)throw error;if(error instanceof AuthError)throw new SubscriptionPersistenceError("SUBSCRIPTION_FORBIDDEN");throw new SubscriptionPersistenceError("SUBSCRIPTION_UNAVAILABLE");}
 }
 private synthetic(){if(this.authority.environment()!=="synthetic_demo")throw new SubscriptionPersistenceError("SUBSCRIPTION_SYNTHETIC_ONLY");}
}
export function subscriptionFailure(error:unknown){return {version:"subscription-error.v1" as const,code:error instanceof SubscriptionPersistenceError?error.code:"SUBSCRIPTION_UNAVAILABLE"};}
