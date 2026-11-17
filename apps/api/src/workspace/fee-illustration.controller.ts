import { BadRequestException, ConflictException, Headers, Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Pool } from "pg";
import type { ZodType } from "zod";
import { PracticeAccess, practiceCookie } from "../practice-access.js";
import { FeeIllustrationApplication } from "./fee-illustration.application.js";
import { feeIllustrationCreateV1, feeWhatIfRequestV1 } from "./fee-illustration.contracts.js";

@ApiTags("fee-illustration")
@Controller("jobs/:id/fee-illustration")
export class FeeIllustrationController {
  constructor(private readonly pool: Pool) {}

  @Get()
  @ApiOperation({ summary: "Read persisted-source proposed fee illustration" })
  get(@Param("id") id: string, @Headers("cookie") cookie?: string) {
    return new FeeIllustrationApplication(this.pool, practiceCookie(cookie)).read(id);
  }

  @Post()
  @ApiOperation({ summary: "Prepare fixed synthetic illustration sources" })
  async create(@Param("id") id: string, @Body() body: unknown, @Headers("cookie") cookie?: string) {
    await new PracticeAccess(this.pool, practiceCookie(cookie)).job(id);
    const input = this.input(feeIllustrationCreateV1, body);
    try {
      return await new FeeIllustrationApplication(this.pool, practiceCookie(cookie)).create(id, input);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "23505" && error.message === "FEE_ILLUSTRATION_CONFLICT")
        throw new ConflictException({ code: "IDEMPOTENCY_CONFLICT" });
      throw error;
    }
  }

  @Post("what-if")
  @ApiOperation({ summary: "Calculate an unpersisted proposed-policy what-if" })
  async whatIf(@Param("id") id: string, @Body() body: unknown, @Headers("cookie") cookie?: string) {
    await new PracticeAccess(this.pool, practiceCookie(cookie)).job(id);
    const input = this.input(feeWhatIfRequestV1, body);
    return new FeeIllustrationApplication(this.pool, practiceCookie(cookie)).whatIf(input);
  }

  private input<T>(schema: ZodType<T>, body: unknown): T {
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ code: "VALIDATION_ERROR" });
    return parsed.data;
  }
}
