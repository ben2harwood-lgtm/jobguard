import { Controller, Get, Param, Query, Req, ServiceUnavailableException, UnauthorizedException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from "@nestjs/swagger";
import { SYNTHETIC_SESSION } from "./workspace-session.js";
import { WorkspaceService, WorkspaceServiceError } from "./workspace.service.js";

@ApiTags("jobs") @Controller("jobs")
export class WorkspaceController {
  constructor(private readonly service: WorkspaceService) {}
  @Get(":id") @ApiOperation({ summary: "Read a tenant-authorized persistent job workspace" })
  @ApiParam({ name: "id", format: "uuid" })
  @ApiResponse({ status: 200, description: "Versioned synthetic job workspace projection" })
  @ApiResponse({ status: 403, description: "Membership does not authorize this workspace" })
  @ApiResponse({ status: 404, description: "Job is absent or hidden by tenant isolation" })
  @ApiResponse({ status: 503, description: "Typed recoverable database failure" })
  async get(@Req() request: { headers: { cookie?: string } }, @Param("id") id: string, @Query("requested_tenant_id") requestedTenantId?: string) {
    const cookie = request.headers.cookie?.split(";").map((part) => part.trim()).find((part) => part.startsWith("jg_session="))?.slice(11);
    const principal = cookie === SYNTHETIC_SESSION ? { sessionId: cookie, ...(requestedTenantId ? { requestedTenantId } : {}) } : null;
    try { return await this.service.getJob(principal, id); }
    catch (error) { if (!(error instanceof WorkspaceServiceError)) throw error; if (error.code === "UNAUTHENTICATED") throw new UnauthorizedException({ code: error.code }); if (error.code === "TENANT_FORBIDDEN") throw new ForbiddenException({ code: error.code }); if (error.code === "NOT_FOUND") throw new NotFoundException({ code: error.code }); throw new ServiceUnavailableException({ code: error.code, recoverable: true }); }
  }
}
