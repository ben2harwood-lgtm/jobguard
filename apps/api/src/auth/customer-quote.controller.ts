import { Body, Controller, HttpCode, HttpException, Inject, Injectable, type ExecutionContext, type CanActivate, Post, Req, Res, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { CustomerAuthGuard, type CustomerRequest } from "./customer-auth.guard.js";
import { CUSTOMER_QUOTE_APPLICATION, CustomerQuoteApplication, type CustomerQuoteAction } from "./customer-quote.js";
import { CUSTOMER_APPLICATION, CustomerSigninApplication, customerRefusal } from "./customer-signin.js";
/** Reuse the unchanged sign-in guard with its strict read envelope, then restore the command body. */
@Injectable()
export class CustomerQuoteAuthGuard implements CanActivate {
  private readonly guard: CustomerAuthGuard;
  constructor(@Inject(CUSTOMER_APPLICATION) application: () => CustomerSigninApplication) { this.guard=new CustomerAuthGuard(application); }
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request=context.switchToHttp().getRequest<{body?:unknown}>();
    const body=request.body;
    const jobId=body!==null&&typeof body==="object"&&"jobId" in body?body.jobId:undefined;
    request.body={version:"customer-read.v1",jobId};
    try { return await this.guard.canActivate(context); }
    finally { request.body=body; }
  }
}
@ApiTags("customer portal") @ApiResponse({status:401,description:"CUSTOMER_REFUSED: no credential or scope diagnostics"})
@Controller("customer-portal") @UseGuards(CustomerQuoteAuthGuard)
export class CustomerQuoteController {
  constructor(@Inject(CUSTOMER_QUOTE_APPLICATION) private readonly application: () => CustomerQuoteApplication) {}
  private async run(action: CustomerQuoteAction, body: unknown, request: CustomerRequest, response: {setHeader(name: string, value: string): void}) {
    response.setHeader("Cache-Control", "no-store"); response.setHeader("Referrer-Policy", "no-referrer");
    try { if (!request.customerScope) throw new HttpException({code:"CUSTOMER_REFUSED"},401); return await this.application().run(action, body, request); }
    catch (error) { if(error instanceof HttpException) throw error; const failure=customerRefusal(error); throw new HttpException(failure.body,failure.status); }
  }
  @Post("quote") @HttpCode(200) @ApiOperation({summary:"Read the current exact issued quote for this customer session"})
  quote(@Body() b: unknown, @Req() q: CustomerRequest, @Res({passthrough:true}) r: {setHeader(name:string,value:string):void}) { return this.run("quote",b,q,r); }
  @Post("quote-accept") @HttpCode(200) @ApiOperation({summary:"Accept the exact quote revision and hash through the customer session"})
  accept(@Body() b: unknown, @Req() q: CustomerRequest, @Res({passthrough:true}) r: {setHeader(name:string,value:string):void}) { return this.run("quote-accept",b,q,r); }
}
