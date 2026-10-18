import { z } from "zod";
import { SubscriptionPersistenceError, parseSubscriptionCommand, type SubscriptionRepositoryPort, type VerifiedTenantContext } from "@jobguard/db";
/** Resolve the request's authenticated session anew. SQL independently verifies the persisted session and active company role. */
export interface SubscriptionAuthorityPort {
 environment():string|undefined;
 resolve(sessionHandle:unknown):Promise<{context:VerifiedTenantContext;digest:string}>;
}
export class SubscriptionApplication {
 constructor(private readonly authority:SubscriptionAuthorityPort,private readonly repository:SubscriptionRepositoryPort){}
 async command(session:unknown,commandId:string,raw:unknown){
  return this.current(session,async ({context,digest})=>{
   if(!z.string().uuid().safeParse(commandId).success)throw new SubscriptionPersistenceError("INVALID_SUBSCRIPTION_INPUT");
   return this.repository.command(context,digest,commandId,parseSubscriptionCommand(raw));
  });
 }
 async read(session:unknown){return this.current(session,({context,digest})=>this.repository.read(context,digest));}
 private async current<T>(session:unknown,fn:(authority:{context:VerifiedTenantContext;digest:string})=>Promise<T>):Promise<T>{
  try{
   this.synthetic();const current=await this.authority.resolve(session);this.synthetic();return await fn(current);
  }catch(error){if(error instanceof SubscriptionPersistenceError)throw error;throw new SubscriptionPersistenceError("SUBSCRIPTION_UNAVAILABLE");}
 }
 private synthetic(){if(this.authority.environment()!=="synthetic_demo")throw new SubscriptionPersistenceError("SUBSCRIPTION_SYNTHETIC_ONLY");}
}
export function subscriptionFailure(error:unknown){return {version:"subscription-error.v1" as const,code:error instanceof SubscriptionPersistenceError?error.code:"SUBSCRIPTION_UNAVAILABLE"};}
