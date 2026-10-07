import { Body, Controller, Get, HttpException, Param, Post, Req } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Pool } from "pg";
import { RecoveryMessageApplication } from "./recovery-message.application.js";
import { recoveryMessageFailure } from "./recovery-message.errors.js";

type Request = { headers: { cookie?: string } };
@ApiTags("recovery-messages")
@Controller("recovery-cases/:id/messages")
export class RecoveryMessageController {
  private readonly app: RecoveryMessageApplication;
  constructor(pool: Pool) { this.app = new RecoveryMessageApplication(pool); }
  private session(request: Request) { return request.headers.cookie?.split(";").map(value => value.trim()).find(value => value.startsWith("jg_session="))?.slice(11); }
  private async invoke<T>(run: () => Promise<T>) {
    try { return await run(); }
    catch (error) { const { status, code } = recoveryMessageFailure(error); throw new HttpException({ code }, status); }
  }
  @Get()
  @ApiOperation({ summary: "Read the saved practice messages, delivery state and practice sink for a recovery case" })
  get(@Req() request: Request, @Param("id") id: string) { return this.invoke(() => this.app.read(this.session(request), id)); }
  @Post()
  @ApiOperation({ summary: "Preview the exact factual practice message bound to the attachment-approved evidence pack; exact replays return current case/message state" })
  preview(@Req() request: Request, @Param("id") id: string, @Body() body: unknown) { return this.invoke(() => this.app.preview(this.session(request), id, body)); }
  @Post(":messageId/commands")
  @ApiOperation({ summary: "Approve, revoke, advance or reconcile a practice message by an exact versioned command; exact replays return current case/message state" })
  command(@Req() request: Request, @Param("id") id: string, @Param("messageId") messageId: string, @Body() body: unknown) {
    return this.invoke(() => this.app.command(this.session(request), id, messageId, body));
  }
}
