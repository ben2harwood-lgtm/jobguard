import { Body,Controller,Header,HttpCode,HttpException,Inject,Post,Req } from "@nestjs/common";
import { Pool } from "pg";
import { SmallBuilderTrialDemoRepository,SmallBuilderDemoError } from "@jobguard/db";
import { trialDemoCommandV1 } from "@jobguard/core";
import { SmallBuilderTrialDemoApplication,smallBuilderDemoHttpFailure } from "./small-builder-demo.application.js";
import { subscriptionAuthority } from "./subscription.authority.js";
import { IDENTITY_APPLICATION,cookieToken,type IdentityHttpRequest } from "./auth/identity-http.js";
import type { IdentityApplication } from "./auth/identity.application.js";
@Controller("small-builder-demo")
export class SmallBuilderTrialDemoController {
 constructor(@Inject(Pool)private readonly pool:Pool,@Inject(IDENTITY_APPLICATION)private readonly identity:()=>IdentityApplication){}
 @Post("trial") @HttpCode(200) @Header("Cache-Control","no-store")
 async command(@Req() request:IdentityHttpRequest&{url?:string},@Body() raw:unknown){
  try{
   const input=trialDemoCommandV1.safeParse(raw);
   if(!input.success||request.url?.includes("?"))throw new SmallBuilderDemoError("INVALID_DEMO_INPUT");
   return await new SmallBuilderTrialDemoApplication(subscriptionAuthority(this.identity()),new SmallBuilderTrialDemoRepository(this.pool)).execute({sessionToken:cookieToken(request),tenantHeader:request.headers["x-tenant-id"],csrfToken:request.headers["x-csrf-token"],origin:request.headers.origin},input.data);
  }catch(error){const failure=smallBuilderDemoHttpFailure(error);throw new HttpException(failure.body,failure.status);}
 }
}
