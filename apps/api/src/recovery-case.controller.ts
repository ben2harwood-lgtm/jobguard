import { practiceCookie } from "./practice-access.js";
import { Body, Controller, Get, Headers, HttpException, Param, Post, Req } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Pool } from "pg";
import { RecoveryCaseApplication, recoveryCommandFailure, recoveryReadFailure } from "./recovery-case.application.js";

@ApiTags("recovery-cases")
@Controller("jobs/:id/recovery-cases")
export class RecoveryCaseController {
 constructor(private readonly pool: Pool) {}
 @Get()
 @ApiOperation({ summary: "Read the append-only recovery-case workbench" })
 async get(@Param("id") id: string, @Headers("cookie") cookie?: string) {
  try { return await new RecoveryCaseApplication(this.pool, practiceCookie(cookie)).list(id); }
  catch(error) { const failure = recoveryReadFailure(error); throw new HttpException(failure.body, failure.status); }
 }
 @Post()
 @ApiOperation({ summary: "Open, revise or transition a synthetic recovery case" })
 async post(@Param("id") id: string, @Body() body: unknown, @Headers("cookie") cookie?: string) {
  try { return await new RecoveryCaseApplication(this.pool, practiceCookie(cookie)).command(id, body); }
  catch(error) { const failure = recoveryCommandFailure(error); throw new HttpException(failure.body, failure.status); }
 }
 @Post("eligibility")
 @ApiOperation({ summary: "Review or approve synthetic reference D03 eligibility" })
 async eligibility(@Param("id") id: string, @Body() body: unknown, @Req() request: { headers: { cookie?: string } }, @Headers("cookie") _cookie?: string) {
  const sessionId = practiceCookie(request.headers.cookie);
  try { return await new RecoveryCaseApplication(this.pool, sessionId).eligibility(id, body, sessionId); }
  catch(error) { const failure = recoveryCommandFailure(error); throw new HttpException(failure.body, failure.status); }
 }
}
