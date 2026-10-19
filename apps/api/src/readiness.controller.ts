import { Headers, Body, Controller, Get, HttpException, Param, Post } from "@nestjs/common";
import { ApiConflictResponse, ApiCreatedResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { PracticeAccessError, WatchdogError } from "@jobguard/db";
import { Pool } from "pg";
import { ZodError } from "zod";
import { practiceCookie } from "./practice-access.js";
import { ReadinessApplication } from "./readiness.application.js";

@ApiTags("readiness")
@Controller("jobs/:id/readiness")
export class ReadinessController {
 constructor(private readonly pool: Pool) {}

 private async invoke<T>(run: () => Promise<T>): Promise<T> {
  try { return await run(); }
  catch (error) {
   if (error instanceof PracticeAccessError || error instanceof WatchdogError) throw error;
   if (error instanceof ZodError) throw new HttpException({ code: "INVALID_COMMAND" }, 400);
   throw new HttpException({ code: "INTERNAL_ERROR" }, 500);
  }
 }

 @Get()

 @ApiOperation({summary:"Read next-workday readiness from recorded synthetic facts"})
 view(@Param("id")id:string, @Headers("cookie") cookie?:string){return this.invoke(()=>new ReadinessApplication(this.pool,practiceCookie(cookie)).view(id))}
 @Post("plan")
 @ApiCreatedResponse({description:""})
 @ApiConflictResponse({description:"JOB_NOT_LIVE: only live jobs accept watchdog inputs. IDEMPOTENCY_CONFLICT: command identity was reused with a different request, including saved-response and legacy replays.",schema:{type:"object",required:["code"],properties:{code:{type:"string",enum:["JOB_NOT_LIVE","IDEMPOTENCY_CONFLICT"]}}}})
 @ApiOperation({summary:"Confirm an immutable synthetic work-plan revision"})
 plan(@Param("id")id:string,@Body()body:unknown, @Headers("cookie") cookie?:string){return this.invoke(()=>new ReadinessApplication(this.pool,practiceCookie(cookie)).record(id,body))}
 @Post("advance")
 @ApiCreatedResponse({description:""})
 @ApiConflictResponse({description:"JOB_NOT_LIVE: only live jobs accept watchdog inputs. IDEMPOTENCY_CONFLICT: command identity was reused with a different request, including saved-response and legacy replays.",schema:{type:"object",required:["code"],properties:{code:{type:"string",enum:["JOB_NOT_LIVE","IDEMPOTENCY_CONFLICT"]}}}})
 @ApiOperation({summary:"Advance the per-run scenario clock and deduplicate the due review"})
 advance(@Param("id")id:string,@Body()body:unknown, @Headers("cookie") cookie?:string){return this.invoke(()=>new ReadinessApplication(this.pool,practiceCookie(cookie)).advance(id,body))}
}
