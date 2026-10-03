import { Body, Controller, Get, Param, Post, Query, Req, HttpException } from "@nestjs/common";
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Pool } from "pg";
import { JobPartiesApplication, JobPartiesError } from "./job-parties.application.js";
import { SYNTHETIC_SESSION } from "./workspace/workspace-session.js";
@ApiTags("job-parties")
@Controller("jobs/:id/parties")
export class JobPartiesController {
  private readonly application: JobPartiesApplication;
  constructor(pool: Pool) { this.application = new JobPartiesApplication(pool); }
  private principal(request: { headers: { cookie?: string } }, requestedTenantId?: string) {
    const session = request.headers.cookie?.split(";").map(x => x.trim()).find(x => x.startsWith("jg_session="))?.slice(11);
    return session && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(session) ? { sessionId: SYNTHETIC_SESSION, ...(requestedTenantId ? { requestedTenantId } : {}) } : null;
  }
  private async execute<T>(work: () => Promise<T>): Promise<T> {
    try { return await work(); } catch (error) {
      if (!(error instanceof JobPartiesError)) throw error;
      throw new HttpException({ code: error.code }, error.code === "FORBIDDEN" ? 403 : error.code === "NOT_FOUND" ? 404 : error.code === "INVALID_PARTIES" ? 400 : 409);
    }
  }
  @Get() @ApiOperation({ summary: "Read job-parties-workspace.v1 with tenant-scoped identity suggestions" })
  @ApiParam({ name: "id", format: "uuid" }) @ApiResponse({ status: 200, description: "Persisted customer, paying party, site and recognition projection" })
  view(@Req() request: { headers: { cookie?: string } }, @Param("id") id: string, @Query("requested_tenant_id") tenant?: string) {
    return this.execute(() => this.application.view(this.principal(request, tenant), id));
  }
  @Post() @ApiOperation({ summary: "Execute job-parties-command.v1 (operational; no commercial approval)" })
  @ApiParam({ name: "id", format: "uuid" }) @ApiResponse({ status: 409, description: "Typed revision, identity or idempotency conflict" })
  command(@Req() request: { headers: { cookie?: string } }, @Param("id") id: string, @Body() body: unknown, @Query("requested_tenant_id") tenant?: string) {
    return this.execute(() => this.application.command(this.principal(request, tenant), id, body));
  }
  @Post("import") @ApiOperation({ summary: "Adopt the supplied fictional job using the exact saved party binding" })
  @ApiParam({ name: "id", format: "uuid" }) @ApiResponse({ status: 409, description: "JOB_PARTIES_REQUIRED or stale source binding" })
  adopt(@Req() request: { headers: { cookie?: string } }, @Param("id") id: string, @Body() body: unknown) {
    return this.execute(() => this.application.adopt(this.principal(request), id, body));
  }

}

@ApiTags("job-parties")
@Controller("job-parties")
export class JobPartiesListController {
  private readonly application: JobPartiesApplication;
  constructor(pool: Pool) { this.application = new JobPartiesApplication(pool); }
  @Get("jobs") @ApiOperation({summary:"Read job-parties-list.v1 including captured jobs and saved customer/site labels"})
  async list(@Req() request: { headers: { cookie?: string } }) {
    const session=request.headers.cookie?.split(";").map(x=>x.trim()).find(x=>x.startsWith("jg_session="))?.slice(11);
    if(!session||!/^([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/u.test(session))throw new HttpException({code:"UNAUTHENTICATED"},401);
    try{return await this.application.list({sessionId:SYNTHETIC_SESSION});}catch(error){if(error instanceof JobPartiesError)throw new HttpException({code:error.code},403);throw error;}
  }
}
