import { Body, Controller, Get, HttpException, Param, Post, Query, Req } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Pool } from "pg";
import { PracticeAllocationApplication } from "./practice-allocation.application.js";
import { practiceAllocationHttpError, practiceAllocationSession } from "./practice-allocation.http.js";

type AllocationRequest = { headers: { cookie?: string; "x-tenant-id"?: string } };
@ApiTags("practice-allocation")
@ApiParam({ name: "id", required: true, schema: { type: "string", format: "uuid" } })
@Controller("jobs/:id/practice-allocation")
export class PracticeAllocationController {
  private readonly application: PracticeAllocationApplication;
  constructor(pool: Pool) { this.application = new PracticeAllocationApplication(pool); }

  private async invoke<T>(request: AllocationRequest, operation: (session: string | undefined) => Promise<T>) {
    try {
      if (request.headers["x-tenant-id"] !== undefined) throw Object.assign(new Error("TENANT_FORBIDDEN"), { code: "TENANT_FORBIDDEN" });
      return await operation(practiceAllocationSession(request.headers.cookie));
    } catch (error) {
      const result = practiceAllocationHttpError(error);
      throw new HttpException(result.body, result.status);
    }
  }

  @Get()
  @ApiOperation({ summary: "Read synthetic settled-money allocations and distinct compensation facts" })
  @ApiQuery({ name: "version", required: false, enum: ["practice-allocation-query.v1"] })
  @ApiResponse({ status: 200, description: "Persisted practice-allocation-view.v1; landing remains Simulated" })
  @ApiResponse({ status: 403, description: "Session, membership or synthetic environment forbidden" })
  get(@Req() request: AllocationRequest, @Param("id") jobId: string, @Query() query: Record<string, unknown>) {
    return this.invoke(request, (session) => this.application.view(session, jobId, { version: "practice-allocation-query.v1", ...query }));
  }

  @Post()
  @ApiOperation({ summary: "Approve exact synthetic recovery allocations or record cash reversal, evidence invalidation or dispute" })
  @ApiBody({ schema: { oneOf: [
    ...["prepare", "approve", "reverse", "invalidate_evidence", "dispute"].map((action) => {
      const identifier = { type: "string" as const, format: "uuid" };
      const amount = { type: "integer" as const, minimum: 1, maximum: 1_000_000_000_000 };
      const common = {
        version: { type: "string" as const, enum: ["practice-allocation-command.v1"] },
        commandId: identifier, expectedRevision: { type: "integer" as const, minimum: 0 },
        action: { type: "string" as const, enum: [action] },
      };
      const properties = action === "prepare" ? { ...common, invoiceId: identifier,
        caseIds: { type: "array" as const, minItems: 2, maxItems: 2, items: identifier },
        evidenceIds: { type: "array" as const, minItems: 2, maxItems: 2, items: identifier },
      } : action === "approve" ? { ...common, movementId: identifier,
        representationId: { type: "string" as const, minLength: 1, maxLength: 200 },
        caseId: identifier, evidenceId: identifier, netPence: amount,
      } : action === "reverse" ? { ...common, allocationId: identifier, netPence: amount }
        : { ...common, allocationId: identifier };
      return { type: "object" as const, additionalProperties: false, required: Object.keys(properties), properties };
    }),
  ] } })
  @ApiResponse({ status: 201, description: "Persisted practice-allocation-view.v1; no real collection or fee posting" })
  @ApiResponse({ status: 409, description: "Stale revision, conflicting replay, reused cash or invalid allocation" })
  post(@Req() request: AllocationRequest, @Param("id") jobId: string, @Body() body: unknown) {
    return this.invoke(request, (session) => this.application.command(session, jobId, body));
  }
}
