import { Controller, Get, Header, Headers, Inject, Optional, Query, Req, Res } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { ValueBusinessReader } from "@jobguard/db";
import { cookieToken, IDENTITY_APPLICATION, type IdentityHttpRequest } from "../auth/identity-http.js";
import type { IdentityApplication } from "../auth/identity.application.js";
import { subscriptionAuthority } from "../subscription.authority.js";
import { CompanyValueApplication } from "./value-business.application.js";
import { Pool } from "pg";
import { practiceCookie } from "../practice-access.js";
import { BusinessValueApplication, businessValueFailure, businessValueStatus } from "./value-business.application.js";
export { BusinessValueApplication, businessValueFailure, businessValueStatus, businessValueResultV1 } from "./value-business.application.js";

@ApiTags("value")
@Controller("value")
export class BusinessValueController {
 constructor(@Inject(Pool) private readonly pool: Pool, @Optional() @Inject(IDENTITY_APPLICATION) private readonly identity?:()=>IdentityApplication) {}
 @Get()
 @Header("Cache-Control", "private, no-store")
 @Header("Vary", "Cookie")
 @ApiOperation({ summary: "Read mapped, inspectable company value and subscription periods" })
 async get(@Query() query: unknown, @Headers("cookie") cookie?: string, @Res({ passthrough: true }) response?: { status(code: number): unknown }, @Req() request?:IdentityHttpRequest) {
  let result;
  try {
   if(request && this.identity && cookie?.split(";").some(v=>v.trim().startsWith("jobguard_session="))){
    const identity=this.identity();
    result=await new CompanyValueApplication(subscriptionAuthority(identity),new ValueBusinessReader(this.pool)).readBusiness({sessionToken:cookieToken(request),tenantHeader:request.headers["x-tenant-id"],origin:request.headers.origin??identity.allowedOrigin},query);
   }else result = await new BusinessValueApplication(this.pool, practiceCookie(cookie)).readBusiness(query); }
  catch (error) { result = businessValueFailure(error); }
  response?.status(businessValueStatus(result));
  return result;
 }
}
