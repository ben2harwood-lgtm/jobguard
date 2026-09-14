import { BadRequestException, Body, Controller, Post, Req, UnauthorizedException } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { VerifiedTenantContext } from "@jobguard/db";
import { CaptureService } from "./capture.service.js";
@ApiTags("jobs") @Controller("jobs")
export class CaptureController {
  constructor(private readonly service:CaptureService){}
  @Post("capture") @ApiOperation({summary:"Create an idempotent draft job and cited proposal from synthetic text"})
  @ApiBody({schema:{type:"object",required:["contractVersion","requested_tenant_id","captureId","source","fixtureId"]}})
  @ApiResponse({status:201,description:"Proposal only; no canonical revision or send is created"})
  async capture(@Req() request:{verifiedTenantContext?:VerifiedTenantContext},@Body() body:unknown){if(!request.verifiedTenantContext)throw new UnauthorizedException({code:"UNAUTHENTICATED"});try{return await this.service.capture(request.verifiedTenantContext,body);}catch(error){throw new BadRequestException({code:(error as {code?:string}).code??(error as Error).message,originalInputRetained:true});}}
}
