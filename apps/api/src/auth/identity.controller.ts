import { Body, Controller, Get, Post, Req, Res, HttpException, Inject } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { IdentityApplication } from "./identity.application.js";

import { IDENTITY_APPLICATION, identityStatus, cookieToken, identityCookieOptions, type IdentityHttpRequest } from "./identity-http.js";
@ApiTags("identity") @Controller("auth")
export class IdentityController {
  constructor(@Inject(IDENTITY_APPLICATION) private readonly application:()=>IdentityApplication) {}
  private async run<T>(work:()=>Promise<T>):Promise<T> {
    try{return await work();}catch(error){const {code,status}=identityStatus(error);throw new HttpException({code},status);}
  }
  @Post("request") @ApiOperation({summary:"Request an entered identity code; fixture transport only until D04"})
  @ApiBody({schema:{type:"object",required:["version","email","purpose"],properties:{version:{type:"string",enum:["identity-request.v1"]},email:{type:"string",format:"email"},purpose:{type:"string",enum:["signup","signin","invitation"]},invitationId:{type:"string",format:"uuid"}},additionalProperties:false}})
  @ApiResponse({status:201,description:"Non-enumerating acknowledgement; synthetic code shown only for .invalid fixtures"})
  request(@Body() body:unknown,@Req() request:IdentityHttpRequest) {return this.run(()=>this.application().request(body,request.socket?.remoteAddress??request.ip??"unknown",request.headers.origin));}
  @Post("verify") @ApiOperation({summary:"Consume an entered code atomically and set a secure session cookie"})
  @ApiBody({schema:{type:"object",required:["version","email","purpose","code"],properties:{version:{type:"string",enum:["identity-verify.v1"]},email:{type:"string",format:"email"},purpose:{type:"string",enum:["signup","signin","invitation"]},code:{type:"string",pattern:"^[0-9]{8}$"},invitationId:{type:"string",format:"uuid"}},additionalProperties:false}})
  @ApiResponse({status:201,description:"Opaque HttpOnly Secure SameSite=strict cookie; no token in JSON"})
  verify(@Body() body:unknown,@Req() request:IdentityHttpRequest,@Res({passthrough:true}) response:{cookie:(name:string,value:string,options:typeof identityCookieOptions)=>void}) {
    return this.run(async()=>{const session=await this.application().verify(body,request.headers.origin);response.cookie("jobguard_session",session.sessionToken,identityCookieOptions);return {version:"identity-verified.v1",environment:"synthetic_demo",csrfToken:session.csrfToken};});
  }
  @Get("session") @ApiOperation({summary:"Read persisted session and current memberships"})
  @ApiResponse({status:200,description:"identity-session.v1; never honours a synthetic cookie"})
  session(@Req() request:IdentityHttpRequest) {return this.run(()=>this.application().session(cookieToken(request)));}
  @Post("invitations") @ApiOperation({summary:"Owner-authorized invitation binds email, tenant and role"})
  @ApiBody({schema:{type:"object",required:["version","requested_tenant_id","email","role"],properties:{version:{type:"string",enum:["identity-invitation.v1"]},requested_tenant_id:{type:"string",format:"uuid"},email:{type:"string",format:"email"},role:{type:"string",enum:["admin","estimator","foreman","operative","finance","read_only"]}},additionalProperties:false}})
  @ApiResponse({status:201,description:"Immutable invitation; no real email dispatch"})
  invite(@Body() body:unknown,@Req() request:IdentityHttpRequest) {return this.run(()=>this.application().invite(body,{sessionToken:cookieToken(request),tenantHeader:request.headers["x-tenant-id"],csrfToken:request.headers["x-csrf-token"],origin:request.headers.origin}));}
}
