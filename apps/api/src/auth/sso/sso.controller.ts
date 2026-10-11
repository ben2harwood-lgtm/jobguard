import { Body, Controller, Get, Post, Param, Req, Res, HttpException, Inject } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import type { SsoApplication } from "./sso.application.js";
import { SsoError, ssoStatus, ssoStateCookieOptions, ssoSessionCookieOptions, ssoCookieState } from "./sso.contracts.js";
import { cookieToken, type IdentityHttpRequest } from "../identity-http.js";
export const SSO_APPLICATION="SSO_APPLICATION";
// The Next routes live under /api/auth/sso, but this Nest controller is served at /auth/sso (no /api prefix). A browser only
// returns a cookie to a path inside the cookie's Path, so the Nest state cookie must be set and cleared on /auth/sso.
const nestStateCookiePath="/auth/sso";
const nestStateCookieOptions={...ssoStateCookieOptions,path:nestStateCookiePath};
type ResponseCookies={cookie:(name:string,value:string,options:typeof ssoStateCookieOptions)=>void;clearCookie:(name:string,options:{path:string})=>void};
@ApiTags("sso") @Controller("auth/sso")
export class SsoController {
 constructor(@Inject(SSO_APPLICATION) private readonly application:()=>SsoApplication) {}
 private async run<T>(work:()=>Promise<T>):Promise<T> {try{return await work();}catch(error){const result=ssoStatus(error);throw new HttpException({code:result.code},result.status);}}
 @Get(":connectionId/start") @ApiOperation({summary:"Read persisted synthetic contractor SAML administration"})
 @ApiResponse({status:200,description:"sso-admin-view.v1; tenant scoped; current admin and CSRF required"})
 view(@Param("connectionId") _id:string,@Req() request:IdentityHttpRequest & {query:{requested_tenant_id?:string}}) {
  return this.run(()=>this.application().view(request.query.requested_tenant_id??"",{sessionToken:cookieToken(request),csrfToken:request.headers['x-csrf-token'],tenantHeader:request.headers['x-tenant-id'],origin:request.headers.origin??this.application().allowedOrigin}));
 }
 @Post(":connectionId/start") @ApiOperation({summary:"Administer a synthetic SAML connection or issue a database-backed sign-in request"})
 @ApiBody({schema:{type:"object",required:["version","action"],properties:{version:{type:"string",enum:["sso-admin.v1","sso-start.v1"]},action:{type:"string",enum:["connection.create","domain.verify","mapping.set","signin"]},requested_tenant_id:{type:"string",format:"uuid"},id:{type:"string",format:"uuid"},connectionId:{type:"string",format:"uuid"},idpCert:{type:"string"},domain:{type:"string"},proof:{type:"string"},group:{type:"string"},role:{type:"string",enum:["admin","operative","supervisor","surveyor","commercial_manager","finance","read_only"]},scope:{type:"object",properties:{kind:{type:"string",enum:["tenant","region","branch","team"]},id:{type:"string",format:"uuid"}},required:["kind","id"],additionalProperties:false},expectedRevision:{type:"integer",minimum:0},enabled:{type:"boolean"},linkExisting:{type:"boolean"}},additionalProperties:false}})
 @ApiResponse({status:201,description:"Persisted admin view or sso-started.v1 plus Secure HttpOnly browser-state cookie; no provider outbound"})
 start(@Param("connectionId") id:string,@Body() body:unknown,@Req() request:IdentityHttpRequest,@Res({passthrough:true}) response:ResponseCookies) {
  return this.run(async()=>{
   const credentials={sessionToken:cookieToken(request),csrfToken:request.headers['x-csrf-token'],tenantHeader:request.headers['x-tenant-id'],origin:request.headers.origin};
   if(z.object({version:z.literal('sso-admin.v1')}).passthrough().safeParse(body).success)return this.application().admin(body,credentials);
   const result=await this.application().start(id,body,credentials);response.cookie('jobguard_sso_state',result.relayState,nestStateCookieOptions);return result;
  });
 }
 @Post(":connectionId/callback") @ApiOperation({summary:"Validate solicited double-signed SAML, consume assertion once and issue bounded persisted session"})
 @ApiBody({schema:{type:"object",required:["version","SAMLResponse","relayState"],properties:{version:{type:"string",enum:["sso-callback.v1"]},SAMLResponse:{type:"string",maxLength:262144},relayState:{type:"string",pattern:"^[A-Za-z0-9_-]{43}$"}},additionalProperties:false}})
 @ApiResponse({status:201,description:"sso-signed-in.v1; opaque token only in Secure HttpOnly cookie; unsolicited Responses refused"})
 callback(@Param("connectionId") id:string,@Body() body:unknown,@Req() request:IdentityHttpRequest,@Res({passthrough:true}) response:ResponseCookies) {
  return this.run(async()=>{
   if(request.headers.origin!==this.application().allowedOrigin){await this.application().repository.refusal(id,'SSO_FORBIDDEN');throw new SsoError('SSO_FORBIDDEN');}
   const result=await this.application().callback(id,body,ssoCookieState(request.headers.cookie));
   response.cookie('jobguard_session',result.sessionToken,{...ssoSessionCookieOptions,maxAge:result.sessionLimitSeconds*1000});
   response.clearCookie('jobguard_sso_state',{path:nestStateCookiePath});
   return {version:'sso-signed-in.v1',environment:'synthetic_demo',csrfToken:result.csrfToken,tenantId:result.tenantId};
  });
 }
}
