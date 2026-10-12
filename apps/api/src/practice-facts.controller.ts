import { Body, Controller, Get, HttpCode, HttpException, Param, Post, Query, Req } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Pool } from "pg";
import { PracticeFactsApplication } from "./practice-facts.application.js";
import { practiceFactsHttpError, practiceFactsSession } from "./practice-facts.http.js";

type FeedRequest = { headers: { cookie?: string; "x-tenant-id"?: string } };
const movementKeys = ["receipt-12000","receipt-14640","supplier-payment-600","supplier-payment-840","receipt-interest-120","receipt-compensation-70"];
const receiptKeys = ["receipt-12000","receipt-14640","receipt-interest-120","receipt-compensation-70"];
const steps = ["pending", "settled", "replay", "page_overlap", "alternate_representation", "unknown_duplicate"];
const common = {
  version: { type: "string" as const, enum: ["practice-facts-command.v1"] },
  commandId: { type: "string" as const, format: "uuid" },
  expectedRevision: { type: "integer" as const, minimum: 0 },
};
const variant = (action: string, extra: Record<string, unknown>) => ({
  type: "object" as const, additionalProperties: false,
  required: ["version", "commandId", "expectedRevision", "action", ...Object.keys(extra)],
  properties: { ...common, action: { type: "string" as const, enum: [action] }, ...extra },
});

@ApiTags("practice-facts")
@ApiParam({ name: "id", required: true, schema: { type: "string", format: "uuid" } })
@Controller("jobs/:id/practice-facts")
export class PracticeFactsController {
  private readonly application: PracticeFactsApplication;
  constructor(pool: Pool) { this.application = new PracticeFactsApplication(pool); }

  private async invoke<T>(request: FeedRequest, operation: (session: string | undefined) => Promise<T>) {
    try {
      if (request.headers["x-tenant-id"] !== undefined) throw Object.assign(new Error("TENANT_FORBIDDEN"), { code: "TENANT_FORBIDDEN" });
      return await operation(practiceFactsSession(request.headers.cookie));
    } catch (error) {
      const result = practiceFactsHttpError(error);
      throw new HttpException(result.body, result.status);
    }
  }

  @Get()
  @ApiOperation({ summary: "Read session-owned synthetic settled movement facts without connecting any provider" })
  @ApiQuery({ name: "limit", required: false, schema: { type: "integer", minimum: 1, maximum: 50, default: 20 } })
  @ApiQuery({ name: "cursor", required: false, type: String })
  @ApiResponse({ status: 200, description: "Persisted practice-facts-view.v1; synthetic movement facts only, never an allocation" })
  @ApiResponse({ status: 401, description: "No practice session" })
  @ApiResponse({ status: 403, description: "Synthetic environment or client-selected tenant forbidden" })
  @ApiResponse({ status: 404, description: "Job missing, unbound or owned by another practice session" })
  get(@Req() request: FeedRequest, @Param("id") jobId: string, @Query() query: Record<string, unknown>) {
    return this.invoke(request, (session) => this.application.view(session, jobId, { version: "practice-facts-query.v1", ...query }));
  }

  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: "Advance an extra synthetic movement, reconcile its duplicate or match an exact customer receipt" })
  @ApiBody({ schema: { oneOf: [
    variant("advance", { movement: { type: "string", enum: movementKeys }, step: { type: "string", enum: steps } }),
    variant("reconcile_duplicate", { movement: { type: "string", enum: movementKeys } }),
    variant("match_receipt", { movement: { type: "string", enum: receiptKeys }, paymentId: { type: "string", format: "uuid" } }),
  ] } })
  @ApiResponse({ status: 200, description: "Persisted practice-facts-view.v1; settlement never allocates money" })
  @ApiResponse({ status: 401, description: "No authenticated practice session" })
  @ApiResponse({ status: 404, description: "Job missing, unbound or owned by another practice session" })
  @ApiResponse({ status: 400, description: "Invalid or forged command" })
  @ApiResponse({ status: 409, description: "Stale revision, conflicting replay, unsettled or mismatched receipt, or disconnected feed" })
  post(@Req() request: FeedRequest, @Param("id") jobId: string, @Body() body: unknown) {
    return this.invoke(request, (session) => this.application.command(session, jobId, body));
  }
}
