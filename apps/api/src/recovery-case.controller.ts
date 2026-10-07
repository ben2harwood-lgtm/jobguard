import { practiceCookie } from "./practice-access.js";
import{Headers, Body, Controller, Get, HttpException, Param, Post, Req } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Pool } from "pg";
import { RecoveryCaseApplication } from "./recovery-case.application.js";

@ApiTags("recovery-cases")
@Controller("jobs/:id/recovery-cases")
export class RecoveryCaseController {
 
 constructor(private readonly pool:Pool){}
 @Get()
 @ApiOperation({ summary: "Read the append-only recovery-case workbench" })
 get(@Param("id") id: string, @Headers("cookie") cookie?:string) { return new RecoveryCaseApplication(this.pool,practiceCookie(cookie)).list(id); }
 @Post()
 @ApiOperation({ summary: "Open, revise or transition a synthetic recovery case" })
 post(@Param("id") id: string, @Body() body: unknown, @Headers("cookie") cookie?:string) { return new RecoveryCaseApplication(this.pool,practiceCookie(cookie)).command(id, body); }
 @Post("eligibility")
 @ApiOperation({ summary: "Review or approve synthetic reference D03 eligibility" })
 async eligibility(@Param("id") id: string, @Body() body: unknown, @Req() request: { headers: { cookie?: string } }, @Headers("cookie") cookie?:string) {
  const sessionId = request.headers.cookie?.split(";").map(x => x.trim()).find(x => x.startsWith("jg_session="))?.slice(11);
  try { return await new RecoveryCaseApplication(this.pool,sessionId).eligibility(id, body, sessionId); }
  catch (e) {
   const code = e instanceof Error ? e.message : "INVALID_COMMAND";
   const requiresReview = code === "ELIGIBILITY_STALE_REVISION" || code === "ELIGIBILITY_REVIEW_REQUIRED";
   throw new HttpException({ code, message: requiresReview ? "Review the changed evidence before approving" : code },
    code === "UNAUTHENTICATED" ? 401 : code === "NOT_FOUND" ? 404 : code === "SYNTHETIC_MODE_REQUIRED" ? 403 : code === "ELIGIBILITY_REVIEWER_FORBIDDEN" ? 403 : requiresReview || code.includes("IDEMPOTENCY") ? 409 : 400);
  }
 }
}
