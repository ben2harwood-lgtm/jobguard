import { Body, Controller, HttpCode, HttpException, Inject, Post, Req, Res } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { CUSTOMER_VARIATION_APPLICATION, CustomerVariationApplication, type CustomerVariationAction } from "./customer-variation.js";
import { customerRefusal } from "./customer-signin.js";
import type { IdentityHttpRequest } from "./identity-http.js";
@ApiTags("customer portal") @ApiResponse({status:401,description:"CUSTOMER_REFUSED: no credential or scope diagnostics"})
@Controller("customer-portal")
export class CustomerVariationController {
  constructor(@Inject(CUSTOMER_VARIATION_APPLICATION) private readonly application: () => CustomerVariationApplication) {}
  private async run(action: CustomerVariationAction, body: unknown, request: IdentityHttpRequest, response: {setHeader(name: string, value: string): void}) {
    response.setHeader("Cache-Control", "no-store"); response.setHeader("Referrer-Policy", "no-referrer");
    try { return await this.application().run(action, body, request); }
    catch (error) { const failure = customerRefusal(error); throw new HttpException(failure.body, failure.status); }
  }
  @ApiOperation({summary:"Read current extra revisions for this authenticated customer's job"})
  @Post("variations/read") @HttpCode(200)
  read(@Body() b: unknown, @Req() q: IdentityHttpRequest, @Res({passthrough:true}) r: {setHeader(name:string,value:string):void}) { return this.run("variations/read",b,q,r); }
  @ApiOperation({summary:"Customer explicitly approves one exact signed variation revision"})
  @Post("variation-approvals") @HttpCode(200)
  approve(@Body() b: unknown, @Req() q: IdentityHttpRequest, @Res({passthrough:true}) r: {setHeader(name:string,value:string):void}) { return this.run("variation-approvals",b,q,r); }
}
