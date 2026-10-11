import { Body, Controller, Headers, Post } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Pool } from "pg";
import { CaptureApplication } from "./capture.application.js";
import { practiceCookie } from "../practice-access.js";
@ApiTags("jobs") @Controller("jobs")
export class CaptureController {
 constructor(private readonly pool:Pool){}
 @Post("capture") @ApiOperation({summary:"Create an idempotent draft job and cited proposal from synthetic text"})
 @ApiBody({schema:{type:"object",required:["contractVersion","requested_tenant_id","captureId","source","fixtureId"]}})
 @ApiResponse({status:201,description:"Proposal only; no canonical revision or send is created"})
 capture(@Headers("cookie") cookie:string|undefined,@Body() body:unknown){return new CaptureApplication(this.pool,practiceCookie(cookie)).capture(body);}
}
