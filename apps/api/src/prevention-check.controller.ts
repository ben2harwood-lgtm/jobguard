import { Body, Controller, Get, Headers, HttpException, Param, Post } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Pool } from "pg";
import { PreventionCheckError } from "@jobguard/core";
import { practiceCookie } from "./practice-access.js";
import { PreventionCheckApplication } from "./prevention-check.application.js";
import { preventionHttpStatus } from "./prevention-check.contracts.js";

@ApiTags("prevention-checks")
@Controller("jobs/:id/prevention-checks")
export class PreventionCheckController {
  constructor(private readonly pool: Pool) {}
  private async result<T>(work: Promise<T>): Promise<T> {
    try { return await work; } catch (error) { if (error instanceof PreventionCheckError) throw new HttpException({code:error.code},preventionHttpStatus(error.code));throw error; }
  }
  @Get()
  @ApiOperation({ summary: "Read persisted cited prevention checks and the saved paying party; synthetic only" })
  @ApiResponse({ status: 401, description: "Missing or invalid practice session" })
  @ApiResponse({ status: 404, description: "Job absent or owned by another practice session" })
  view(@Param("id") id: string, @Headers("cookie") cookie?: string) { return this.result(new PreventionCheckApplication(this.pool,practiceCookie(cookie)).view(id)); }
  @Post(":action")
  @ApiOperation({ summary: "Explicit synthetic property/company check or start, stop, evaluate a customer watch; no sends, Decisions or fees" })
  @ApiBody({ schema: { type:"object",additionalProperties:false,required:["version","commandId","action","expectedBindingId","scenarioNow","fixture"],properties:{
    version:{type:"string",enum:["prevention-command.v1"]},commandId:{type:"string",format:"uuid"},action:{type:"string",enum:["property","company","start_watch","stop_watch","evaluate_watch"]},expectedBindingId:{type:"string",format:"uuid"},scenarioNow:{type:"string",format:"date-time"},fixture:{type:"string",enum:["mixed","fresh","stale","missing"]},expectedWatchRevision:{type:"integer",minimum:0,description:"Required for watch commands"},
  } } })
  @ApiResponse({ status: 400, description: "Invalid strict command or not a registered company" })
  @ApiResponse({ status: 409, description: "Command, binding or watch revision conflict" })
  command(@Param("id") id: string,@Param("action") action: string,@Body() body: unknown,@Headers("cookie") cookie?: string) { return this.result(new PreventionCheckApplication(this.pool,practiceCookie(cookie)).command(id,body,action)); }
}
