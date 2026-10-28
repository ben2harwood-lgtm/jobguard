import { Controller, Get, Header, Headers, Inject, Query, Res } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Pool } from "pg";
import { practiceCookie } from "../practice-access.js";
import { BusinessValueApplication, businessValueFailure, businessValueStatus } from "./value-business.application.js";
export { BusinessValueApplication, businessValueFailure, businessValueStatus, businessValueResultV1 } from "./value-business.application.js";

@ApiTags("value")
@Controller("value")
export class BusinessValueController {
 constructor(@Inject(Pool) private readonly pool: Pool) {}
 @Get()
 @Header("Cache-Control", "private, no-store")
 @Header("Vary", "Cookie")
 @ApiOperation({ summary: "Read business value availability; producer and billing-period bindings held" })
 async get(@Query() query: unknown, @Headers("cookie") cookie?: string, @Res({ passthrough: true }) response?: { status(code: number): unknown }) {
  let result;
  try { result = await new BusinessValueApplication(this.pool, practiceCookie(cookie)).readBusiness(query); }
  catch (error) { result = businessValueFailure(error); }
  response?.status(businessValueStatus(result));
  return result;
 }
}
