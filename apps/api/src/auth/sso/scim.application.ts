import type { DeploymentMode } from "@jobguard/config";
import { ScimRepositoryError, type ScimRepository } from "@jobguard/db";
import { requireSyntheticSso, ssoConnectionIdV1 } from "./sso.contracts.js";
import { ScimError, scimBearerProved, scimDeactivationResultV1, scimDeactivationV1 } from "./scim.contracts.js";
/** No signed-in principal: only a bearer proved for the path connection reaches the routine. */
export class ScimApplication {
 constructor(readonly repository:Pick<ScimRepository,"deactivate"|"refusal">,readonly mode:DeploymentMode,readonly seed:string|"unset") {}
 private async refuse(target:string,cause:string,failure:ScimError):Promise<never> {
  try {await this.repository.refusal(target,cause);}
  catch(error){throw new ScimError(failure.code,{cause:error});}
  throw failure;
 }
 async deactivate(connectionId:string,authorizationHeader:string|undefined,raw:unknown) {
  try {requireSyntheticSso(this.mode,"in-process-test-idp");}
  catch {return this.refuse("scim","SCIM_ROUTE_BLOCKED",new ScimError("SCIM_REFUSED"));}
  if(this.seed==="unset")return this.refuse("scim","SCIM_NOT_CONFIGURED",new ScimError("SCIM_REFUSED"));
  if(!scimBearerProved(this.seed,connectionId,authorizationHeader))return this.refuse("scim","SCIM_BEARER_REFUSED",new ScimError("SCIM_REFUSED"));
  if(!ssoConnectionIdV1.safeParse(connectionId).success)return this.refuse("scim","SCIM_CONNECTION_UNKNOWN",new ScimError("SCIM_REFUSED"));
  const parsed=scimDeactivationV1.safeParse(raw),target=connectionId.toLowerCase();
  if(!parsed.success)return this.refuse(target,"INVALID_SCIM_INPUT",new ScimError("INVALID_SCIM_INPUT"));
  try {
   const result=await this.repository.deactivate(target,parsed.data);
   return scimDeactivationResultV1.parse({version:"scim-deactivation-result.v1",environment:"synthetic_demo",eventId:parsed.data.eventId.toLowerCase(),outcome:result.outcome,cause:result.cause});
  }catch(error) {
   if(error instanceof ScimRepositoryError) {
    if(error.code==="SSO_NOT_FOUND")return this.refuse("scim","SCIM_CONNECTION_UNKNOWN",new ScimError("SCIM_REFUSED"));
    if(error.code==="SSO_ROUTE_BLOCKED"||error.code==="SCIM_ROUTE_BLOCKED")return this.refuse("scim","SCIM_ROUTE_BLOCKED",new ScimError("SCIM_REFUSED"));
    if(error.code==="SCIM_EVENT_CONFLICT"||error.code==="INVALID_SCIM_INPUT")return this.refuse(target,error.code,new ScimError(error.code));
   }
   throw new ScimError("SCIM_UNAVAILABLE",{cause:error});
  }
 }
}
