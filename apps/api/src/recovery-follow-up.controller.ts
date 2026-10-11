import { Body, Controller, Get, HttpException, Param, Post, Req } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { PracticeAccessError, WatchdogError } from "@jobguard/db";
import { practiceCookie } from "./practice-access.js";
import { Pool } from "pg";
import { RecoveryFollowUpApplication, recoveryFollowUpFailure } from "./recovery-follow-up.application.js";

type Request = { headers: { cookie?: string } };
@ApiTags("recovery-follow-ups")
@Controller("recovery-cases/:id/follow-ups")
export class RecoveryFollowUpController {
  private readonly app: RecoveryFollowUpApplication;
  constructor(pool: Pool) { this.app = new RecoveryFollowUpApplication(pool); }
  private session(request: Request) { return practiceCookie(request.headers.cookie); }
  private async invoke<T>(run: () => Promise<T>) {
    try { return await run(); }
    catch (error) { if (error instanceof PracticeAccessError || error instanceof WatchdogError) throw error; const { status, code } = recoveryFollowUpFailure(error); throw new HttpException({ code }, status); }
  }
  @Get()
  @ApiOperation({ summary: "Read the saved practice follow-ups, their displayed state and the run's fake clock for a recovery case" })
  get(@Req() request: Request, @Param("id") id: string) { return this.invoke(() => this.app.read(this.session(request), id)); }
  @Post()
  @ApiOperation({ summary: "Schedule a practice follow-up for the delivered message and case revision the builder reviewed; exact replays return the current state" })
  schedule(@Req() request: Request, @Param("id") id: string, @Body() body: unknown) { return this.invoke(() => this.app.schedule(this.session(request), id, body)); }
  @Post(":followUpId/commands")
  @ApiOperation({ summary: "Advance practice time, open the reminder review, approve the exact reminder or cancel a follow-up by an exact versioned command; exact replays return the current state" })
  command(@Req() request: Request, @Param("id") id: string, @Param("followUpId") followUpId: string, @Body() body: unknown) {
    return this.invoke(() => this.app.command(this.session(request), id, followUpId, body));
  }
}
