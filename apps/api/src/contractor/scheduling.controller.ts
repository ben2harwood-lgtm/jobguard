import { Controller, Get, Header, Headers, HttpException, Param } from "@nestjs/common";
import { ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { Pool } from "pg";
import { SchedulingApplication } from "./scheduling.application.js";
import { workOrderHttpFailure } from "./work-order.application.js";
const principal = (cookie?: string) => ({ version: "contractor-principal.v1", sessionId: cookie?.split(";").map(x => x.trim()).find(x => x.startsWith("jg_session="))?.slice(11) });
/** Read-only (GET) scheduling projections: assignments come from the work-order import and visits from ENT-3. */
@ApiTags("contractor-scheduling")
@Controller("contractor")
export class SchedulingController {
  private readonly application: SchedulingApplication;
  constructor(pool: Pool) { this.application = new SchedulingApplication(pool); }
  private async call(work: () => Promise<unknown>) {
    try { return await work(); } catch (error) { const failure = workOrderHttpFailure(error); throw new HttpException(failure.body, failure.status); }
  }
  @Get("jobs/:id/assignments") @Header("Cache-Control", "no-store") @ApiOperation({ summary: "The team and operatives assigned to a work-order job; job.read through the job's own scope, else the same 404 as an unknown job" })
  @ApiParam({ name: "id", type: String, format: "uuid" })
  assignments(@Param("id") jobId: string, @Headers("cookie") cookie?: string) { return this.call(() => this.application.assignments(principal(cookie), jobId)); }
  @Get("jobs/:id/site-visits") @Header("Cache-Control", "no-store") @ApiOperation({ summary: "Recorded site visits (server times) of a work-order job; empty until ENT-3 records visits" })
  @ApiParam({ name: "id", type: String, format: "uuid" })
  siteVisits(@Param("id") jobId: string, @Headers("cookie") cookie?: string) { return this.call(() => this.application.siteVisits(principal(cookie), jobId)); }
}
