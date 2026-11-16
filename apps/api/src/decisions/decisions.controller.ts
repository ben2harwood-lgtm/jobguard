import { Body, Controller, Get, Headers, HttpException, Inject, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Pool } from "pg";
import { practiceCookie } from "../practice-access.js";
import { DecisionsApplication, DecisionsError } from "./decisions.application.js";

function decisionFailure(error: unknown): never {
 if (error instanceof DecisionsError) {
  const status = { INVALID_COMMAND: 400, CONFLICT: 409, FORBIDDEN: 403, NOT_FOUND: 404 }[error.code];
  throw new HttpException({ code: error.code }, status);
 }
 // Practice/binding refusals retain their existing filters; unknown failures stay private 500s.
 throw error;
}

@ApiTags("decisions")
@Controller("decisions")
export class DecisionsController {
 constructor(@Inject(Pool) private readonly pool: Pool) {}
 @Get()
 list(@Headers("x-jobguard-verified-tenant") tenantId: string, @Query("jobId") jobId?: string, @Headers("cookie") cookie?: string) {
  return new DecisionsApplication(this.pool, practiceCookie(cookie))
   .list({ tenantId, ...(jobId ? { jobId } : {}) }).catch(decisionFailure);
 }
 @Post("evaluate")
 evaluate(@Body() body: unknown, @Headers("cookie") cookie?: string) {
  return new DecisionsApplication(this.pool, practiceCookie(cookie)).evaluate(body).catch(decisionFailure);
 }
 @Post("resolve")
 resolve(@Body() body: unknown, @Headers("cookie") cookie?: string) {
  return new DecisionsApplication(this.pool, practiceCookie(cookie)).dismiss(body).catch(decisionFailure);
 }
}
