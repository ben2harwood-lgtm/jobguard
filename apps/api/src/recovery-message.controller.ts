import { Body, Controller, Get, HttpException, Param, Post, Req } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Pool } from "pg";
import { RecoveryMessageApplication, recoveryMessageError } from "./recovery-message.application.js";

type Request = { headers: { cookie?: string } };
export function recoverySession(request: Request) {
  return request.headers.cookie?.split(";").map(x => x.trim()).find(x => x.startsWith("jg_session="))?.slice(11);
}
@ApiTags("recovery-messages")
@Controller("recovery-cases/:id/messages")
export class RecoveryMessageController {
  private readonly application: RecoveryMessageApplication;
  constructor(pool: Pool) { this.application = new RecoveryMessageApplication(pool); }
  private async invoke<T>(work: () => Promise<T>) {
    try { return await work(); } catch (error) {
      const { code, status } = recoveryMessageError(error);
      throw new HttpException({ code }, status);
    }
  }
  @Get()
  @ApiOperation({ summary: "Read source-bound practice messages and durable fake delivery receipts" })
  get(@Req() request: Request, @Param("id") id: string) {
    return this.invoke(() => this.application.read(recoverySession(request), id));
  }
  @Post()
  @ApiOperation({ summary: "Preview, approve, cancel or advance one exact factual practice message" })
  @ApiBody({ schema: { type: "object", required: ["version", "commandId"], properties: {
    version: { type: "string", enum: ["recovery-message-preview.v1", "recovery-message-command.v1"] },
    commandId: { type: "string", format: "uuid" },
    action: { type: "string", enum: ["approve", "cancel", "retry", "reconcile", "advance"] },
    messageId: { type: "string", format: "uuid" }, expectedRevision: { type: "integer", minimum: 1 },
    expectedCaseRevision: { type: "integer", minimum: 1 }, packId: { type: "string", format: "uuid" },
    recipient: { type: "string", format: "email", pattern: "\\.invalid$" }, body: { type: "string", maxLength: 2000 },
    amountPence: { type: "integer", minimum: 1, maximum: 1_000_000_000_000 },
    contentHash: { type: "string", pattern: "^[a-f0-9]{64}$" },
    outcome: { type: "string", enum: ["success", "retryable", "outcome_unknown"] },
  } } })
  post(@Req() request: Request, @Param("id") id: string, @Body() body: unknown) {
    return this.invoke(() => this.application.command(recoverySession(request), id, body));
  }
}
