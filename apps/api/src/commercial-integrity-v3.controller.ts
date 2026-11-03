import { ArgumentsHost, Catch, HttpException, UseFilters, HttpCode, Body, Controller, Get, Headers, Inject, Param, Post, Query, Res } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Pool } from "pg";
import { practiceCookie } from "./practice-access.js";
import { CommercialIntegrityV3Application } from "./commercial-integrity-v3.application.js";
import { integrityV3Failure } from "./commercial-integrity-v3.contracts.js";
type Response = { setHeader(name: string, value: string): unknown; status(code: number): Response; json(value: unknown): unknown };
@Catch()
class IntegrityTransportFilter {
 catch(error:unknown, host:ArgumentsHost) {
  const response=host.switchToHttp().getResponse<Response>();
  response.setHeader("Cache-Control","no-store");
  // Global authentication guard failures can precede the application boundary.
  if(error instanceof HttpException && error.getStatus()===401)return response.status(401).json({code:"UNAUTHENTICATED"});
  const failure=integrityV3Failure(error);
  return response.status(failure.status).json(failure.body);
 }
}
@UseFilters(IntegrityTransportFilter)
@ApiTags("commercial integrity v3")
@Controller("jobs/:id/commercial-integrity")
export class CommercialIntegrityV3Controller {
 constructor(@Inject(Pool) private readonly pool: Pool) {}
 private async respond(response: Response, run: () => Promise<unknown>) {
  response.setHeader("Cache-Control", "no-store");
  try { return response.status(200).json(await run()); }
  catch (error) { const failure = integrityV3Failure(error); return response.status(failure.status).json(failure.body); }
 }
 @Get("family") @ApiOperation({ summary: "Read the current owned synthetic job integrity family" })
 family(@Param("id") id: string, @Headers("cookie") cookie: string | undefined, @Res() response: Response) {
  return this.respond(response, () => new CommercialIntegrityV3Application(this.pool).family(practiceCookie(cookie), id));
 }
 @Get("v3") @ApiOperation({ summary: "Read persisted synthetic D11 v3 advisories without commercial effects" })
 view(@Param("id") id: string, @Headers("cookie") cookie: string | undefined, @Query() query: unknown, @Res() response: Response) {
  return this.respond(response, () => new CommercialIntegrityV3Application(this.pool).view(practiceCookie(cookie), id, query));
 }
 @Post("v3/reviews") @HttpCode(200) @ApiOperation({ summary: "Persist exact-snapshot advisory feedback only" })
 review(@Param("id") id: string, @Headers("cookie") cookie: string | undefined, @Body() body: unknown, @Res() response: Response) {
  return this.respond(response, () => new CommercialIntegrityV3Application(this.pool).review(practiceCookie(cookie), id, body));
 }
}
