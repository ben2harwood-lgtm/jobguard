import { ZodError } from "zod";
import { Body, Controller, Get, HttpException, Inject, Param, Post, Req } from "@nestjs/common";
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Pool } from "pg";
import { WorkPlanError } from "@jobguard/db";
import { AuthError, cookieToken, IDENTITY_APPLICATION, resolveVerifiedTenantContext, type IdentityApplication, type IdentityHttpRequest } from "../auth/index.js";
import { practiceCookie } from "../practice-access.js";
import { RamsApplication, RamsError } from "./rams.application.js";

@ApiTags("v2-rams")
@Controller("jobs/:id/rams")
export class RamsController {
  constructor(@Inject(Pool) private readonly pool: Pool,
    @Inject(IDENTITY_APPLICATION) private readonly identity: () => IdentityApplication) {}
  private async execute(request: { headers: { cookie?: string } }, jobId: string, write: boolean, body?: unknown) {
    if (process.env.JOBGUARD_LOCAL_V2 !== "1" || process.env.JOBGUARD_ENV !== "synthetic_demo") {
      throw new HttpException({ code: "NOT_FOUND" }, 404);
    }
    const application = new RamsApplication(this.pool, practiceCookie(request.headers.cookie));
    try { return await (write ? application.command(jobId, body) : application.read(jobId)); }
    catch (error) {
      if (error instanceof RamsError || error instanceof WorkPlanError) {
        throw new HttpException({ code: error.code }, error.code === "RAMS_INVALID_COMMAND" ? 400 : 409);
      }
      throw error;
    }
  }
  @Get() @ApiOperation({ summary: "Read rams-screen.v1: V2-only synthetic safety drafts and immutable signed versions" })
  @ApiParam({ name: "id", format: "uuid" })
  @ApiResponse({ status: 200, description: "Persisted RAMS drafts; no prices or certification" })
  read(@Req() request: { headers: { cookie?: string } }, @Param("id") id: string) {
    return this.execute(request, id, false);
  }
  @Post() @ApiOperation({ summary: "Execute rams-command.v1: generate, edit a section or sign a checked synthetic draft" })
  @ApiParam({ name: "id", format: "uuid" })
  @ApiResponse({ status: 409, description: "Typed stale-plan, revision, replay or incomplete-section conflict" })
  async command(@Req() request: IdentityHttpRequest, @Param("id") id: string, @Body() body: unknown) {
    if (process.env.JOBGUARD_LOCAL_V2 !== "1" || process.env.JOBGUARD_ENV !== "synthetic_demo") {
      throw new HttpException({ code: "NOT_FOUND" }, 404);
    }
    if (request.headers.origin !== process.env.AUTH_ALLOWED_ORIGIN || !request.headers.origin) {
      throw new HttpException({ code: "FORBIDDEN" }, 403);
    }
    try {
      const identity = this.identity();
      const token = cookieToken(request);
      const session = await identity.session(token);
      if (session.memberships.length !== 1) throw new AuthError("TENANT_FORBIDDEN");
      await resolveVerifiedTenantContext(identity.provider, {
        sessionToken: token, requestedTenantId: session.memberships[0]!.tenantId,
        csrfToken: request.headers["x-csrf-token"], origin: request.headers.origin,
      }, identity.allowedOrigin);
      return await this.execute(request, id, true, body);
    } catch (error) {
      if (error instanceof ZodError) throw new HttpException({ code: "FORBIDDEN" }, 403);
      if (error instanceof AuthError) throw new HttpException({ code: error.code === "UNAUTHENTICATED" ? "UNAUTHENTICATED" : "FORBIDDEN" }, error.code === "UNAUTHENTICATED" ? 401 : 403);
      throw error;
    }
  }
}
