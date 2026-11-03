import { CustomerStagesGuard } from "./customer-stages.guard.js";
import { Body, Controller, HttpCode, HttpException, Inject, Post, Req, Res, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { IDENTITY_APPLICATION, type IdentityHttpRequest } from "./identity-http.js";
import type { IdentityApplication } from "./identity.application.js";
import { customerRefusal } from "./customer-signin.js";
import { CustomerStagesApplication, type CustomerStageAction } from "./customer-stages.js";
@ApiTags("customer portal")
@Controller("customer-portal")
@UseGuards(CustomerStagesGuard)
export class CustomerStagesController {
  constructor(@Inject(IDENTITY_APPLICATION) private readonly identity: () => IdentityApplication) {}
  private async run(action: CustomerStageAction, body: unknown, request: IdentityHttpRequest, response: {setHeader(n: string,v: string): void}) {
    response.setHeader("Cache-Control", "no-store"); response.setHeader("Referrer-Policy", "no-referrer");
    try { return await new CustomerStagesApplication(this.identity(), process.env.JOBGUARD_ENV).run(action,body,request); }
    catch(error) { const failure = customerRefusal(error); throw new HttpException(failure.body,failure.status); }
  }
  @ApiOperation({summary:"Read the signed-in customer's recorded stage snapshots and review status"})
  @Post("stages") @HttpCode(200)
  stages(@Body() b: unknown,@Req() q: IdentityHttpRequest,@Res({passthrough:true}) r: {setHeader(n:string,v:string):void}) { return this.run("stages",b,q,r); }
  @ApiOperation({summary:"Acknowledge one exact verified stage snapshot; no payment, certification or waiver"})
  @Post("stage-acknowledge") @HttpCode(200)
  acknowledge(@Body() b: unknown,@Req() q: IdentityHttpRequest,@Res({passthrough:true}) r: {setHeader(n:string,v:string):void}) { return this.run("stage-acknowledge",b,q,r); }
}
