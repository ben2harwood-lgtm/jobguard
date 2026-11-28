import { Body, Controller, Get, Headers, HttpException, Param, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { PaymentScheduleError, PracticeAccessError } from "@jobguard/db";
import { Pool } from "pg";
import { practiceCookie } from "./practice-access.js";
import { PaymentScheduleApplication } from "./workspace/payment-schedule.application.js";

@ApiTags("payment-schedule")
@Controller("jobs/:id/payment-schedule")
export class PaymentScheduleController {
  constructor(private readonly pool: Pool) {}
  private async invoke<T>(run: () => Promise<T>) {
    try { return await run(); }
    catch (error) {
      if (error instanceof PracticeAccessError) throw error;
      if (error instanceof PaymentScheduleError) {
        throw new HttpException({code:error.code}, error.code === "SCHEDULE_STALE" || error.code === "SCHEDULE_REPLAY_CONFLICT" ? 409 : 400);
      }
      throw error;
    }
  }
  @Get()
  @ApiOperation({summary:"Read the builder's V2 practice payment schedule; no invoices or sends"})
  read(@Param("id") jobId: string, @Headers("cookie") cookie?: string) {
    return this.invoke(() => new PaymentScheduleApplication(this.pool, practiceCookie(cookie)).read(jobId));
  }
  @Post()
  @ApiOperation({summary:"Set one immutable V2 practice payment schedule on an accepted quote"})
  set(@Param("id") jobId: string, @Body() raw: unknown, @Headers("cookie") cookie?: string) {
    return this.invoke(() => new PaymentScheduleApplication(this.pool, practiceCookie(cookie)).set(jobId, raw));
  }
}
