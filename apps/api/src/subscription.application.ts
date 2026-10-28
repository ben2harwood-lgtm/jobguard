import { z } from "zod";
import { SubscriptionPersistenceError, parseSubscriptionCommand, type SubscriptionRepositoryPort } from "@jobguard/db";
import { resolveVerifiedTenantContext, type TenantRequestCredentials } from "./auth/principal-bridge.js";
import type { AuthProvider } from "./auth/auth-provider.js";
/** Resolve the request's authenticated session anew. SQL independently verifies the persisted session and active company role. */
export interface SubscriptionAuthorityPort {
 environment():string|undefined;
 readonly provider: AuthProvider;
 readonly allowedOrigin: string;
 resolve(sessionHandle:unknown):Promise<{credentials:TenantRequestCredentials;digest:string}>;
}
export class SubscriptionApplication {
 constructor(private readonly authority:SubscriptionAuthorityPort,private readonly repository:SubscriptionRepositoryPort){}
 async command(session:unknown,commandId:string,raw:unknown){
  return this.current(session,async (credentials,digest)=>{
   const context=await resolveVerifiedTenantContext(this.authority.provider,credentials,this.authority.allowedOrigin);
   if(!z.guid({ error: "Invalid uuid" }).safeParse(commandId).success)throw new SubscriptionPersistenceError("INVALID_SUBSCRIPTION_INPUT");
   return this.repository.command(context,digest,commandId,parseSubscriptionCommand(raw));
  });
 }
 async read(session:unknown){return this.current(session,async (credentials,digest)=>{
  const context=await resolveVerifiedTenantContext(this.authority.provider,credentials,this.authority.allowedOrigin);
  return this.repository.read(context,digest);
 });}
 private async current<T>(session:unknown,fn:(credentials:TenantRequestCredentials,digest:string)=>Promise<T>):Promise<T>{
  try{
   this.synthetic();const current=await this.authority.resolve(session);this.synthetic();return await fn(current.credentials,current.digest);
  }catch(error){if(error instanceof SubscriptionPersistenceError)throw error;throw new SubscriptionPersistenceError("SUBSCRIPTION_UNAVAILABLE");}
 }
 private synthetic(){if(this.authority.environment()!=="synthetic_demo")throw new SubscriptionPersistenceError("SUBSCRIPTION_SYNTHETIC_ONLY");}
}
export function subscriptionFailure(error:unknown){return {version:"subscription-error.v1" as const,code:error instanceof SubscriptionPersistenceError?error.code:"SUBSCRIPTION_UNAVAILABLE"};}
