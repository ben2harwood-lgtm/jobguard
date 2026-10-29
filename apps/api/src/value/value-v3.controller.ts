import { Pool } from "pg";
import { Controller, Get, Headers, HttpException, Inject, Optional, Param, Query, Res } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { practiceCookie } from "../practice-access.js";
import { ValueV3Application, valueV3Failure, type ValueV3JobReader } from "./value-v3.application.js";

export const VALUE_V3_READER_FACTORY = Symbol("VALUE_V3_READER_FACTORY");
export type ValueV3ReaderFactory = (pool: Pool, sessionId: string | undefined) => ValueV3JobReader;

interface PrivateResponse { setHeader(name: string, value: string): unknown }
@ApiTags("jobs")
@Controller("jobs/:id/value/v3")
export class ValueV3Controller {
 constructor(@Inject(Pool) private readonly pool: Pool,
  @Optional() @Inject(VALUE_V3_READER_FACTORY) private readonly readerFactory?: ValueV3ReaderFactory) {}
 @Get()
 @ApiOperation({ summary: "Read job value v3 availability; producer bindings held" })
 async get(@Param("id") id: string, @Query() query: unknown,
  @Headers("cookie") cookie: string | undefined, @Res({ passthrough: true }) response: PrivateResponse) {
  response.setHeader("Cache-Control", "private, no-store");
  response.setHeader("Vary", "Cookie");
  try {
   const session = practiceCookie(cookie);
   const factory = this.readerFactory;
   const reader = factory ? { readJob: (jobId: string) => factory(this.pool, session).readJob(jobId) } : undefined;
   return await new ValueV3Application(this.pool, session, reader).readJob(id, query);
  }
  catch (error) {
   const failure = valueV3Failure(error);
   throw new HttpException(failure.body, failure.status);
  }
 }
}
