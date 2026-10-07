import { Body, Controller, Get, Header, Headers, HttpException, Param, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Pool } from "pg";
import { ContractorPartiesApplication, contractorPartiesHttpFailure } from "./contractor-parties.application.js";
const principal = (cookie?: string) => ({ version: "contractor-principal.v1", sessionId: cookie?.split(";").map(x => x.trim()).find(x => x.startsWith("jg_session="))?.slice(11) });
@ApiTags("contractor-parties")
@Controller("contractor")
export class ContractorPartiesController {
  private readonly application: ContractorPartiesApplication;
  constructor(pool: Pool) { this.application = new ContractorPartiesApplication(pool); }
  private async call(work: () => Promise<unknown>) {
    try { return await work(); } catch (error) { const failure = contractorPartiesHttpFailure(error); throw new HttpException(failure.body, failure.status); }
  }
  @Post("clients/:clientId/customer-link") @ApiOperation({ summary: "Append an audited synthetic client to customer link; organisation.manage required" })
  link(@Param("clientId") clientId: string, @Headers("cookie") cookie: string | undefined, @Headers("origin") origin: string | undefined, @Body() body: unknown) {
    if (origin !== "http://localhost:3000") throw new HttpException({ version: "contractor-parties-error.v1", code: "NOT_FOUND", recoverable: false }, 404);
    return this.call(() => this.application.linkCustomer(principal(cookie), clientId, body));
  }
  @Get("jobs/:id/resident-contact") @Header("Cache-Control", "no-store") @ApiOperation({ summary: "Read resident contact only through persisted contractor job scope; unknown scope returns 404" })
  read(@Param("id") jobId: string, @Headers("cookie") cookie?: string) { return this.call(() => this.application.readResident(principal(cookie), jobId)); }
}
