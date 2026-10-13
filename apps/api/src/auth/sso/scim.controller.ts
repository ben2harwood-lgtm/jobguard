import { Body, Controller, Header, HttpCode, HttpException, Inject, Param, Post, Req } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { IdentityHttpRequest } from "../identity-http.js";
import type { ScimApplication } from "./scim.application.js";
import { scimStatus } from "./scim.contracts.js";
export const SCIM_APPLICATION="SCIM_APPLICATION";
@ApiTags("scim") @Controller("auth/scim")
export class ScimController {
 constructor(@Inject(SCIM_APPLICATION) private readonly application:()=>ScimApplication) {}
 @Post(":connectionId/deactivations") @HttpCode(200) @Header("Cache-Control","no-store")
 @ApiOperation({summary:"Record a proved synthetic provider deactivation and immediately revoke company access"})
 @ApiBody({schema:{type:"object",required:["version","eventId","subject","active"],additionalProperties:false,properties:{version:{type:"string",enum:["scim-deactivation.v1"]},eventId:{type:"string",format:"uuid"},subject:{type:"string",minLength:1,maxLength:200},active:{type:"boolean",enum:[false]}}}})
 @ApiResponse({status:200,description:"scim-deactivation-result.v1; deactivated, ignored or owner protected; synthetic only"})
 @ApiResponse({status:400,description:"INVALID_SCIM_INPUT"})
 @ApiResponse({status:403,description:"SCIM_REFUSED; identical for every unproved caller"})
 @ApiResponse({status:409,description:"SCIM_EVENT_CONFLICT"})
 @ApiResponse({status:503,description:"SCIM_UNAVAILABLE; no deactivation committed"})
 async deactivate(@Param("connectionId") connectionId:string,@Body() raw:unknown,@Req() request:IdentityHttpRequest) {
  try {return await this.application().deactivate(connectionId,request.headers.authorization,raw);}
  catch(error){const {code,status}=scimStatus(error);throw new HttpException({code},status);}
 }
}
