import { customerActions } from "../customer-signin.js";
import { BaseExceptionFilter, HttpAdapterHost } from "@nestjs/core";
import { Body, Controller, Post, Param, Req, Res, HttpException, Inject, Catch, BadRequestException, type ExceptionFilter, type ArgumentsHost } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { OidcApplication } from "./oidc.application.js";
import { oidcBrowserCookie, oidcCookieOptions } from "./oidc-persistence.contracts.js";
import { cookieToken, type IdentityHttpRequest } from "../identity-http.js";
export const OIDC_APPLICATION="OIDC_APPLICATION";
type ResponseCookies={cookie:(name:string,value:string,options:typeof oidcCookieOptions)=>void;setHeader:(name:string,value:string)=>void};
@ApiTags("oidc") @Controller("auth/oidc")
export class OidcController {
 constructor(@Inject(OIDC_APPLICATION) private readonly application:()=>OidcApplication) {}
 private async run<T>(response:ResponseCookies,work:()=>Promise<T>):Promise<T> {
  response.setHeader("Cache-Control","no-store");try{return await work();}catch{throw new HttpException({version:"oidc-error.v1",code:"OIDC_REFUSED"},403);}
 }
 @Post(":connectionId/start") @ApiOperation({summary:"Persist a synthetic OIDC request or administer its immutable connection"})
 @ApiBody({schema:{type:"object",required:["version","action"],properties:{version:{type:"string",enum:["oidc-start.v1","oidc-admin.v1"]},action:{type:"string",enum:["signin","connection.create"]},linkExisting:{type:"boolean"},requested_tenant_id:{type:"string",format:"uuid"},connection:{type:"object"}},additionalProperties:false}})
 @ApiResponse({status:201,description:"Local fictional callback plus Secure HttpOnly browser binding; no verifier or tokens"})
 start(@Param("connectionId") id:string,@Body() body:unknown,@Req() request:IdentityHttpRequest,@Res({passthrough:true}) response:ResponseCookies) {
  return this.run(response,async()=>{
   const credentials={sessionToken:cookieToken(request),csrfToken:request.headers['x-csrf-token'],tenantHeader:request.headers['x-tenant-id'],origin:request.headers.origin};
   if(typeof body==='object' && body!==null && 'version' in body && body.version==='oidc-admin.v1')return this.application().admin(body,credentials);
   const {browser,...result}=await this.application().start(id,body,credentials);
   response.cookie('jobguard_oidc_state',browser,{...oidcCookieOptions,path:'/auth/oidc',maxAge:300_000});return result;
  });
 }
 @Post(":connectionId/callback") @ApiOperation({summary:"Consume a persisted OIDC request once and issue a bounded persisted session"})
 @ApiBody({schema:{type:"object",required:["version","callback"],properties:{version:{type:"string",enum:["oidc-callback.v1"]},callback:{type:"string",maxLength:4096}},additionalProperties:false}})
 @ApiResponse({status:201,description:"oidc-signed-in.v1; persisted session token only in Secure HttpOnly cookie"})
 callback(@Param("connectionId") id:string,@Body() body:unknown,@Req() request:IdentityHttpRequest,@Res({passthrough:true}) response:ResponseCookies) {
  return this.run(response,async()=>{
   const result=await this.application().callback(id,body,oidcBrowserCookie(request.headers.cookie),request.headers.origin);
   response.cookie('jobguard_session',result.sessionToken,{...oidcCookieOptions,path:'/',maxAge:result.sessionLimitSeconds*1000});
   response.cookie('jobguard_oidc_state','',{...oidcCookieOptions,path:'/auth/oidc',maxAge:0});
   return {version:'oidc-signed-in.v1',environment:'synthetic_demo',csrfToken:result.csrfToken,tenantId:result.tenantId};
  });
 }
}

/** JSON parser failures happen before controller methods. Preserve other routes' default handling. */
@Catch(BadRequestException)
export class OidcParseExceptionFilter implements ExceptionFilter {
 constructor(@Inject(OIDC_APPLICATION) private readonly application:()=>OidcApplication,@Inject(HttpAdapterHost) private readonly adapter:HttpAdapterHost) {}
 async catch(error:BadRequestException,host:ArgumentsHost):Promise<void> {
  const http=host.switchToHttp(),request=http.getRequest<{path:string}>();
  if(request.path==="/customer-portal/messages" || customerActions.some(action=>request.path===`/customer-portal/${action}`)) {
   const response=http.getResponse<{setHeader:(name:string,value:string)=>void;status:(status:number)=>{json:(body:unknown)=>void}}>();
   response.setHeader("Cache-Control","no-store");response.setHeader("Referrer-Policy","no-referrer");
   response.status(401).json({code:"CUSTOMER_REFUSED"});return;
  }
  const route=/^\/auth\/oidc\/([^/]+)\/(?:start|callback)$/u.exec(request.path);
  if(!route){new BaseExceptionFilter(this.adapter.httpAdapter).catch(error,host);return;}
  try {await this.application().refuseInput(route[1]!);}catch { /* Always return the redacted boundary, including audit outages. */ }
  const response=http.getResponse<{setHeader:(name:string,value:string)=>void;status:(status:number)=>{json:(body:unknown)=>void}}>();
  response.setHeader('Cache-Control','no-store');response.status(403).json({version:'oidc-error.v1',code:'OIDC_REFUSED'});
 }
}
