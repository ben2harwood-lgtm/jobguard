import { SmallBuilderDemoError, type SmallBuilderDemoRepository } from "@jobguard/db";
import { resolveVerifiedTenantContext } from "./auth/principal-bridge.js";
import type { SubscriptionAuthorityPort } from "./subscription.application.js";

/** Reuse MON-2A's signed-in company authority; practice cookies cannot grant company access.
 * Lifecycle only: no domain journey executor or fabricated completion. */
export class SmallBuilderDemoApplication {
 constructor(private readonly authority:SubscriptionAuthorityPort,private readonly repository:Pick<SmallBuilderDemoRepository,"execute">) {}
 async execute(session:unknown,operation:Parameters<SmallBuilderDemoRepository["execute"]>[2],runId:string|null,raw:unknown={}) {
  try {
   if(this.authority.environment()!=="synthetic_demo") throw new SmallBuilderDemoError("DEMO_SYNTHETIC_ONLY");
   const {credentials,digest}=await this.authority.resolve(session);
   const context=await resolveVerifiedTenantContext(this.authority.provider,credentials,this.authority.allowedOrigin);
   return await this.repository.execute(context,digest,operation,runId,raw);
  } catch(error) {
   if(error instanceof SmallBuilderDemoError) throw error;
   throw new SmallBuilderDemoError("DEMO_FORBIDDEN");
  }
 }
}

/** Trial guide retains company authentication on every read, replay and report. */
export class SmallBuilderTrialDemoApplication {
 constructor(private readonly authority:SubscriptionAuthorityPort,private readonly repository:Pick<import("@jobguard/db").SmallBuilderTrialDemoRepository,"execute">){}
 async execute(session:unknown,raw:unknown){
  try{
   if(this.authority.environment()!=="synthetic_demo")throw new SmallBuilderDemoError("DEMO_SYNTHETIC_ONLY");
   const {credentials,digest}=await this.authority.resolve(session);
   const context=await resolveVerifiedTenantContext(this.authority.provider,credentials,this.authority.allowedOrigin);
   return await this.repository.execute(context,digest,raw);
  }catch(error){if(error instanceof SmallBuilderDemoError)throw error;throw new SmallBuilderDemoError("DEMO_FORBIDDEN");}
 }
}
export function smallBuilderDemoHttpFailure(error:unknown){
 const code=error instanceof SmallBuilderDemoError?error.code:"DEMO_UNAVAILABLE";
 const status=code==="INVALID_DEMO_INPUT"?400:code==="DEMO_FORBIDDEN"||code==="DEMO_SYNTHETIC_ONLY"?403:code==="DEMO_NOT_FOUND"?404:["DEMO_STALE_REVISION","DEMO_ARCHIVED","DEMO_COMMAND_CONFLICT"].includes(code)?409:503;
 return {status,body:{version:"small-builder-demo-error.v1",code}};
}
