import { Body, Controller, Get, HttpCode, HttpException, Param, Post, Query, Req } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Pool } from "pg";
import { RecoveryAllocationApplication } from "./recovery-allocation.application.js";
import { recoveryAllocationHttpError } from "./recovery-allocation.contracts.js";
import { practiceFeedSession } from "./practice-feed.http.js";
type Request = { headers: { cookie?: string; "x-tenant-id"?: string } };
const fields = { version: { type: "string" as const, enum: ["recovery-allocation-command.v1"] }, commandId: { type: "string" as const, format: "uuid" }, expectedCaseRevision: { type: "integer" as const, minimum: 1 }, grossPence: { type: "integer" as const, minimum: 1, maximum: 1_000_000_000_000 } };
const variant = (action: string, reversal: boolean, approved: boolean) => { const target = reversal ? { allocationId: { type: "string" as const, format: "uuid" } } : { caseId: { type: "string" as const, format: "uuid" }, paymentId: { type: "string" as const, format: "uuid" }, evidenceId: { type: "string" as const, format: "uuid" } }; const extra = approved ? { approvalHash: { type: "string" as const, pattern: "^[a-f0-9]{64}$" } } : {}; return { type: "object" as const, additionalProperties: false, required: [...Object.keys(fields), "action", ...Object.keys(target), ...Object.keys(extra)], properties: { remittanceEvidenceId: { type: "string" as const, format: "uuid" }, ...(reversal ? { creditNoteId: { type: "string" as const, format: "uuid" } } : {}), ...fields, action: { type: "string" as const, enum: [action] }, ...target, ...extra } }; };
const commands = [variant("review", false, false), variant("allocate", false, true), variant("review_reverse", true, false), variant("reverse", true, true)];
@ApiTags("recovery-allocations")
@ApiParam({ name: "id", required: true, schema: { type: "string", format: "uuid" } })
@Controller("jobs/:id/recovery-allocations")
export class RecoveryAllocationController {
  private readonly application: RecoveryAllocationApplication;
  constructor(pool: Pool) { this.application = new RecoveryAllocationApplication(pool); }
  private async invoke<T>(request: Request, operation: (session: string | undefined) => Promise<T>) {
    try { if (request.headers["x-tenant-id"] !== undefined) throw Object.assign(new Error("TENANT_FORBIDDEN"), { code: "TENANT_FORBIDDEN" }); return await operation(practiceFeedSession(request.headers.cookie)); }
    catch (error) { const failure = recoveryAllocationHttpError(error); throw new HttpException(failure.body, failure.status); }
  }
  @Get()
  @ApiOperation({ summary: "Read persisted synthetic receipt allocation and reversal facts" })
  @ApiResponse({ status: 200, description: "recovery-allocation-view.v1; exact rational line amounts, no fees" })
  get(@Req() request: Request, @Param("id") id: string, @Query() query: Record<string, unknown>) { return this.invoke(request, session => this.application.view(session, id, query)); }
  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: "Review or approve an exact receipt-to-case allocation" })
  @ApiBody({ schema: { oneOf: commands } })
  @ApiResponse({ status: 200, description: "recovery-allocation-view.v1; reviewed or approved artifact" })
  @ApiResponse({ status: 409, description: "Changed approval, stale case, unavailable cash or missing proof" })
  post(@Req() request: Request, @Param("id") id: string, @Body() body: unknown) { return this.invoke(request, session => this.application.command(session, id, body)); }
  @Post("reversals")
  @HttpCode(200)
  @ApiOperation({ summary: "Review or approve allocation reversal against a recorded refund, credit or receipt reversal" })
  @ApiBody({ schema: { oneOf: commands.slice(2) } })
  @ApiResponse({ status: 200, description: "Append-only reversal facts; original allocations retained" })
  reverse(@Req() request: Request, @Param("id") id: string, @Body() body: unknown) { return this.invoke(request, session => this.application.command(session, id, body, true)); }
}
