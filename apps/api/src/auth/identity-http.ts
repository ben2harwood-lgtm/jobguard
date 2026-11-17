import { ZodError } from "zod";
import { AuthError } from "./auth-provider.js";
import { IdentityRouteBlocked } from "./identity-email.js";
export const IDENTITY_APPLICATION = "IDENTITY_APPLICATION";
export interface IdentityHttpRequest { headers:Record<string,string|undefined>; ip?:string; socket?:{remoteAddress?:string}; body?:{requested_tenant_id?:string} }
export function cookieToken(request:IdentityHttpRequest):string|undefined {
  return request.headers.cookie?.split(";").map(x=>x.trim()).find(x=>x.startsWith("jobguard_session="))?.slice("jobguard_session=".length);
}
export function identityStatus(error:unknown):{code:string;status:number} {
  if(error instanceof ZodError || error instanceof SyntaxError)return {code:"INVALID_AUTH_INPUT",status:400};
  if(error instanceof IdentityRouteBlocked)return {code:error.code,status:403};
  if(error instanceof AuthError)return {code:error.code,status:error.code==="RATE_LIMITED"?429:error.code==="DELIVERY_UNAVAILABLE"?503:error.code==="INVALID_CODE"?400:error.code==="UNAUTHENTICATED"?401:403};
  if((error as {code?:string})?.code==="42501")return {code:"TENANT_FORBIDDEN",status:403};
  return {code:"IDENTITY_UNAVAILABLE",status:503};
}
export const identityCookieOptions = {httpOnly:true,secure:true,sameSite:"strict" as const,path:"/",maxAge:86_400_000};
