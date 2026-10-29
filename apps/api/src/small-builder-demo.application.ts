import { SmallBuilderDemoError, type SmallBuilderDemoRepository } from "@jobguard/db";
import { resolveVerifiedTenantContext } from "./auth/principal-bridge.js";
import type { SubscriptionAuthorityPort } from "./subscription.application.js";

/** Reuse MON-2A's signed-in company authority; practice cookies cannot grant company access.
 * Backend groundwork only: journeys and chooser are deliberately not registered here. */
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
