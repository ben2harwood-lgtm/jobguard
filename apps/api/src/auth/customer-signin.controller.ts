import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { CustomerAuthGuard, type CustomerRequest } from "./customer-auth.guard.js";
import { Body, Controller, HttpCode, HttpException, Inject, Post, Req, Res, UseGuards } from "@nestjs/common";
import { CUSTOMER_APPLICATION, CustomerSigninApplication, customerCookieName, customerCookieOptions, customerRefusal, type CustomerAction } from "./customer-signin.js";
import type { IdentityHttpRequest } from "./identity-http.js";
interface Reply { cookie(name: string, value: string, options: typeof customerCookieOptions & { maxAge?: number }): void; setHeader(name: string, value: string): void }
@ApiTags("customer portal") @ApiResponse({status:401,description:"CUSTOMER_REFUSED: no credential or scope diagnostics"})
@Controller("customer-portal")
export class CustomerSigninController {
  constructor(@Inject(CUSTOMER_APPLICATION) private readonly application: () => CustomerSigninApplication) {}
  private async run(action: CustomerAction, body: unknown, request: IdentityHttpRequest, response: Reply) {
    response.setHeader("Cache-Control", "no-store"); response.setHeader("Referrer-Policy", "no-referrer");
    try {
      const result = await this.application().run(action, body, request);
      if (result.cookie) response.cookie(customerCookieName, result.cookie, customerCookieOptions);
      if (result.clearCookie) response.cookie(customerCookieName, "", { ...customerCookieOptions, maxAge: 0 });
      return result.body;
    } catch (error) { const failure = customerRefusal(error); throw new HttpException(failure.body, failure.status); }
  }
  @ApiOperation({summary:"Owner or finance requests a fictional customer sign-in email"})
  @Post("issue") @HttpCode(200)
  issue(@Body() b: unknown, @Req() q: IdentityHttpRequest, @Res({ passthrough: true }) r: Reply) { return this.run("issue", b, q, r); }
  @ApiOperation({summary:"Revoke a customer grant and its sessions"})
  @Post("revoke") @HttpCode(200)
  revoke(@Body() b: unknown, @Req() q: IdentityHttpRequest, @Res({ passthrough: true }) r: Reply) { return this.run("revoke", b, q, r); }
  @ApiOperation({summary:"Atomically consume a ten-minute link and set a browser-session cookie"})
  @Post("signin") @HttpCode(200)
  signin(@Body() b: unknown, @Req() q: IdentityHttpRequest, @Res({ passthrough: true }) r: Reply) { return this.run("signin", b, q, r); }
  @ApiOperation({summary:"Revoke the current customer session"})
  @Post("signout") @HttpCode(200)
  signout(@Body() b: unknown, @Req() q: IdentityHttpRequest, @Res({ passthrough: true }) r: Reply) { return this.run("signout", b, q, r); }
  @ApiOperation({summary:"Read only the authenticated customer job scope"})
  @Post("read") @HttpCode(200) @UseGuards(CustomerAuthGuard)
  read(@Body() _b: unknown, @Req() q: CustomerRequest, @Res({ passthrough: true }) r: Reply) {
    r.setHeader("Cache-Control", "no-store"); r.setHeader("Referrer-Policy", "no-referrer");
    if (!q.customerScope) throw new HttpException({code:"CUSTOMER_REFUSED"},401);
    return q.customerScope;
  }
}
