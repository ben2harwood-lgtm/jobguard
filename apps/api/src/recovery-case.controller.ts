import { Body, Controller, Get, HttpException, Param, Post, Req } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Pool } from "pg";
import { RecoveryCaseApplication, recoveryCommandFailure } from "./recovery-case.application.js";

@ApiTags("recovery-cases")
@Controller("jobs/:id/recovery-cases")
export class RecoveryCaseController {
 private app;
 constructor(pool: Pool) { this.app = new RecoveryCaseApplication(pool); }
 @Get()
 @ApiOperation({ summary: "Read the append-only recovery-case workbench" })
 get(@Param("id") id: string) { return this.app.list(id); }
 @Post()
 @ApiOperation({ summary: "Open, revise or transition a synthetic recovery case" })
 async post(@Param("id") id: string, @Body() body: unknown) {
  try { return await this.app.command(id, body); }
  catch(error) { const failure=recoveryCommandFailure(error); throw new HttpException(failure.body,failure.status); }
 }
 @Post("eligibility")
 @ApiOperation({ summary: "Review or approve synthetic reference D03 eligibility" })
 async eligibility(@Param("id") id: string, @Body() body: unknown, @Req() request: { headers: { cookie?: string } }) {
  const sessionId = request.headers.cookie?.split(";").map(x => x.trim()).find(x => x.startsWith("jg_session="))?.slice(11);
  try { return await this.app.eligibility(id, body, sessionId); }
  catch (e) {
   const failure=recoveryCommandFailure(e);
   throw new HttpException(failure.body,failure.status);
  }
 }
}
