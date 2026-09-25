import { Body, Controller, Get, HttpException, Param, Post, Query, Req } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Pool } from "pg";
import { PracticeFeedApplication } from "./practice-feed.application.js";
import { practiceFeedHttpError, practiceFeedSession } from "./practice-feed.http.js";

type FeedRequest = { headers: { cookie?: string; "x-tenant-id"?: string } };
@ApiTags("practice-feed")
@ApiParam({ name: "id", required: true, schema: { type: "string", format: "uuid" } })
@Controller("jobs/:id/practice-feed")
export class PracticeFeedController {
  private readonly application: PracticeFeedApplication;
  constructor(pool: Pool) { this.application = new PracticeFeedApplication(pool); }

  private async invoke<T>(request: FeedRequest, operation: (session: string | undefined) => Promise<T>) {
    try {
      if (request.headers["x-tenant-id"] !== undefined) throw Object.assign(new Error("TENANT_FORBIDDEN"), { code: "TENANT_FORBIDDEN" });
      return await operation(practiceFeedSession(request.headers.cookie));
    } catch (error) {
      const result = practiceFeedHttpError(error);
      throw new HttpException(result.body, result.status);
    }
  }

  @Get()
  @ApiOperation({ summary: "Read session-owned synthetic movement facts without connecting a provider" })
  @ApiQuery({ name: "version", required: false, enum: ["practice-feed-query.v1"] })
  @ApiQuery({ name: "limit", required: false, schema: { type: "integer", minimum: 1, maximum: 50, default: 20 } })
  @ApiQuery({ name: "cursor", required: false, type: String })
  @ApiResponse({ status: 200, description: "Persisted practice-feed-view.v1; synthetic movement facts only" })
  @ApiResponse({ status: 403, description: "Session, membership or synthetic environment forbidden" })
  get(@Req() request: FeedRequest, @Param("id") jobId: string, @Query() query: Record<string, unknown>) {
    return this.invoke(request, (session) => this.application.view(session, jobId, { version: "practice-feed-query.v1", ...query }));
  }

  @Post()
  @ApiOperation({ summary: "Execute a versioned practice feed lifecycle or deterministic adapter scenario" })
  @ApiBody({ schema: { oneOf: [
    ...["connect", "disconnect", "reconcile_duplicate"].map((action) => ({
      type: "object" as const, additionalProperties: false,
      required: ["version", "commandId", "expectedRevision", "action"],
      properties: {
        version: { type: "string" as const, enum: ["practice-feed-command.v1"] },
        commandId: { type: "string" as const, format: "uuid" },
        expectedRevision: { type: "integer" as const, minimum: 0 },
        action: { type: "string" as const, enum: [action] },
      },
    })),
    {
      type: "object", additionalProperties: false,
      required: ["version", "commandId", "expectedRevision", "action", "scenario"],
      properties: {
        version: { type: "string", enum: ["practice-feed-command.v1"] },
        commandId: { type: "string", format: "uuid" },
        expectedRevision: { type: "integer", minimum: 0 },
        action: { type: "string", enum: ["advance"] },
        scenario: { type: "string", enum: ["pending_384", "settled_384", "replay_event", "page_overlap", "alternate_representation", "unknown_duplicate"] },
      },
    },
  ] } })
  @ApiResponse({ status: 201, description: "Persisted practice-feed-view.v1; settlement never allocates money" })
  @ApiResponse({ status: 409, description: "Stale revision, conflicting command replay, or disconnected feed" })
  post(@Req() request: FeedRequest, @Param("id") jobId: string, @Body() body: unknown) {
    return this.invoke(request, (session) => this.application.command(session, jobId, body));
  }
}
