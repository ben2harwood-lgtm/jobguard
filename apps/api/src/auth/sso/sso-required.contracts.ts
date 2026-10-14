import { z } from "zod";
import type { SsoRequiredDetail } from "@jobguard/db";
export const ssoRequiredCodes=["INVALID_SSO_REQUIRED_INPUT","SSO_REQUIRED_FORBIDDEN","SSO_REQUIRED_NEEDS_SSO_SESSION","SSO_REQUIRED_NO_CONNECTION","SSO_REQUIRED_UNLINKED_MEMBERS","STALE_SSO_REQUIRED","SSO_ROUTE_BLOCKED","SSO_EMERGENCY_REFUSED","SSO_REQUIRED_UNAVAILABLE"] as const;
export class SsoRequiredError extends Error {
  constructor(readonly code:typeof ssoRequiredCodes[number],options?:ErrorOptions,readonly unlinked?:SsoRequiredDetail["unlinked"]) {super(code,options);this.name="SsoRequiredError";}
}
const tenant=z.string().uuid(),reason=z.string().min(20).max(500);
export const ssoRequiredCommandV1=z.object({version:z.literal("sso-required-command.v1"),requested_tenant_id:tenant,required:z.boolean(),expectedRevision:z.number().int().min(0).max(2147483646),reason}).strict();
export const ssoRequiredViewV1=z.object({version:z.literal("sso-required-view.v1"),requested_tenant_id:tenant}).strict();
export const ssoEmergencyV1=z.object({version:z.literal("sso-emergency.v1"),requested_tenant_id:tenant,email:z.string().email().max(320),code:z.string().regex(/^\d{8}$/u),reason}).strict();
export const ssoEmergencyV2=z.object({version:z.literal("sso-emergency.v2"),requested_tenant_id:tenant,commandId:z.string().uuid(),email:z.string().email().max(320),code:z.string().regex(/^\d{8}$/u),reason}).strict();
export const ssoRequiredDetailViewV1=z.object({version:z.literal("sso-required-detail-view.v1"),requested_tenant_id:tenant}).strict();
/** Default 60 minutes; allowed 15 to 240. A present invalid value is never defaulted or clamped. */
export function ssoEmergencyWindowMinutes(raw:unknown):number|"invalid" {
 if(raw===undefined||raw==="")return 60;
 if(typeof raw!=="string"||!/^\d{1,3}$/u.test(raw))return "invalid";
 const value=Number(raw);return value>=15&&value<=240?value:"invalid";
}
const statuses:Record<typeof ssoRequiredCodes[number],number>={INVALID_SSO_REQUIRED_INPUT:400,SSO_REQUIRED_FORBIDDEN:403,SSO_REQUIRED_NEEDS_SSO_SESSION:409,SSO_REQUIRED_NO_CONNECTION:409,SSO_REQUIRED_UNLINKED_MEMBERS:409,STALE_SSO_REQUIRED:409,SSO_ROUTE_BLOCKED:403,SSO_EMERGENCY_REFUSED:403,SSO_REQUIRED_UNAVAILABLE:503};
export function ssoRequiredStatus(error:unknown):{code:typeof ssoRequiredCodes[number];status:number} {
  const code=error instanceof SsoRequiredError?error.code:"SSO_REQUIRED_UNAVAILABLE";
  return {code,status:statuses[code]};
}
