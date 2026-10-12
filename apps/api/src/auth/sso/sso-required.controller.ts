import { Body, Controller, Get, Post, Query, Req, HttpException, Inject, Header } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiResponse, ApiTags, ApiQuery } from "@nestjs/swagger";
import { cookieToken, type IdentityHttpRequest } from "../identity-http.js";
import type { SsoRequiredApplication } from "./sso-required.application.js";
import { ssoRequiredStatus } from "./sso-required.contracts.js";
export const SSO_REQUIRED_APPLICATION="SSO_REQUIRED_APPLICATION";
const reason={type:"string",minLength:20,maxLength:500} as const,tenant={type:"string",format:"uuid"} as const;
@ApiTags("sso-required") @Controller("auth/sso-required")
export class SsoRequiredController {
  constructor(@Inject(SSO_REQUIRED_APPLICATION) private readonly application:()=>SsoRequiredApplication) {}
  private async run<T>(work:()=>Promise<T>):Promise<T> {try{return await work();}catch(error){const {code,status}=ssoRequiredStatus(error);throw new HttpException({code},status);}}
  private credentials(request:IdentityHttpRequest,read=false) {
    return {sessionToken:cookieToken(request),tenantHeader:request.headers["x-tenant-id"],csrfToken:request.headers["x-csrf-token"],origin:request.headers.origin??(read?this.application().allowedOrigin:undefined)};
  }
  @Get() @Header("Cache-Control","no-store")
  @ApiQuery({name:"version",enum:["sso-required-view.v1"],required:true})
  @ApiQuery({name:"requested_tenant_id",type:String,format:"uuid",required:true})
  @ApiOperation({summary:"Read persisted synthetic single sign-on requirement"})
  @ApiResponse({status:200,description:"sso-required-state.v1; administrator, origin and CSRF required"})
  view(@Query() query:unknown,@Req() request:IdentityHttpRequest) {return this.run(()=>this.application().view(query,this.credentials(request,true)));}
  @Post() @Header("Cache-Control","no-store") @ApiOperation({summary:"Append an SSO requirement revision from a bound administrator session"})
  @ApiBody({schema:{type:"object",required:["version","requested_tenant_id","required","expectedRevision","reason"],additionalProperties:false,properties:{version:{type:"string",enum:["sso-required-command.v1"]},requested_tenant_id:tenant,required:{type:"boolean"},expectedRevision:{type:"integer",minimum:0,maximum:2147483646},reason}}})
  @ApiResponse({status:201,description:"Persisted switch and audit in one transaction; synthetic only"})
  command(@Body() raw:unknown,@Req() request:IdentityHttpRequest) {return this.run(()=>this.application().command(raw,this.credentials(request)));}
  @Post("emergency") @Header("Cache-Control","no-store") @ApiOperation({summary:"Mailbox-proven emergency access; approver rule held, every request refused"})
  @ApiBody({schema:{type:"object",required:["version","requested_tenant_id","email","code","reason"],additionalProperties:false,properties:{version:{type:"string",enum:["sso-emergency.v1"]},requested_tenant_id:tenant,email:{type:"string",format:"email",maxLength:320},code:{type:"string",pattern:"^\\d{8}$"},reason}}})
  @ApiResponse({status:403,description:"SSO_EMERGENCY_REFUSED; identical for every cause; no session"})
  emergency(@Body() raw:unknown,@Req() request:IdentityHttpRequest) {return this.run(()=>this.application().emergency(raw,request.headers.origin));}
}
