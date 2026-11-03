import { Controller, Post, HttpCode, Body, Req, Inject, HttpException, UseGuards } from "@nestjs/common";
import { ApiConflictResponse, ApiCreatedResponse, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { CustomerAuthGuard, type CustomerRequest } from "./customer-auth.guard.js";
import { CustomerMessageApplication, customerMessageFailure } from "./customer-message.js";
export const CUSTOMER_MESSAGE_APPLICATION = "CUSTOMER_MESSAGE_APPLICATION";
@ApiResponse({status: 401, description: "CUSTOMER_REFUSED: no credential or scope diagnostics"})
@ApiTags("customer portal")
@Controller("customer-portal")
export class CustomerMessageController {
  constructor(@Inject(CUSTOMER_MESSAGE_APPLICATION) private readonly application: () => CustomerMessageApplication) {}
  @Post("messages") @HttpCode(201) @UseGuards(CustomerAuthGuard)
  @ApiConflictResponse({description: "JOB_NOT_LIVE or a conflicting command replay", schema: {type: "object", required: ["code"], properties: {code: {type: "string", enum: ["JOB_NOT_LIVE", "IDEMPOTENCY_CONFLICT"]}}}})
  @ApiCreatedResponse({description: "job-source-intake-receipt.v1: saved message and exact checked evidence"})
  @ApiOperation({summary: "Save a fictional customer message and its checked original through SV-7A"})
  @ApiResponse({status: 422, description: "POST_LOCK_WORK_REQUIRES_LINKED_JOB"})
  async post(@Body() body: unknown, @Req() request: CustomerRequest) {
    try { return await this.application().post(body, request); }
    catch (error) { const failure = customerMessageFailure(error); throw new HttpException(failure.body, failure.status); }
  }
}
