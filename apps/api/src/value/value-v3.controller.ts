import { Pool } from "pg";
import { Controller, Get, Headers, HttpException, Inject, Optional, Param, Query, Res } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { PracticeAccessError } from "@jobguard/db";
import { practiceCookie } from "../practice-access.js";
import { ValueV3Application, ValueV3ReadError, type ValueV3JobReader } from "./value-v3.application.js";

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
   const code = error instanceof ValueV3ReadError || error instanceof PracticeAccessError ? error.code :
    // A structural error code from the shared boundary is safe only if allowlisted.
    error instanceof Error && "code" in error && ["NOT_FOUND", "UNAUTHENTICATED", "SYNTHETIC_MODE_REQUIRED"].includes(String(error.code)) ? String(error.code) : "VALUE_V3_UNAVAILABLE";
   const status = code === "UNAUTHENTICATED" ? 401 : code === "NOT_FOUND" ? 404 : code === "VALUE_V3_QUERY_UNBOUND" ? 400 : 503;
   throw new HttpException({ version: "job-value-error.v3", status: "incomplete", code }, status);
  }
 }
}
