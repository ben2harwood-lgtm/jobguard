import { Pool } from "pg";
import { Controller, Get, Headers, HttpException, Inject, Optional, Param, Query, Req, Res } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { ValueBusinessReader } from "@jobguard/db";
import { CompanyValueApplication } from "./value-business.application.js";
import { subscriptionAuthority } from "../subscription.authority.js";
import { cookieToken, IDENTITY_APPLICATION, type IdentityHttpRequest } from "../auth/identity-http.js";
import type { IdentityApplication } from "../auth/identity.application.js";
import { practiceCookie } from "../practice-access.js";
import { ValueV3Application, valueV3Failure, type ValueV3JobReader } from "./value-v3.application.js";

export const VALUE_V3_READER_FACTORY = Symbol("VALUE_V3_READER_FACTORY");
export type ValueV3ReaderFactory = (pool: Pool, sessionId: string | undefined) => ValueV3JobReader;

interface PrivateResponse { setHeader(name: string, value: string): unknown }
@ApiTags("jobs")
@Controller("jobs/:id/value/v3")
export class ValueV3Controller {
 constructor(@Inject(Pool) private readonly pool: Pool,
  @Optional() @Inject(VALUE_V3_READER_FACTORY) private readonly readerFactory?: ValueV3ReaderFactory,
  @Optional() @Inject(IDENTITY_APPLICATION) private readonly identity?:()=>IdentityApplication) {}
 @Get()
 @ApiOperation({ summary: "Read mapped, inspectable job value from locked bill and attribution sources" })
 async get(@Param("id") id: string, @Query() query: unknown,
  @Headers("cookie") cookie: string | undefined, @Res({ passthrough: true }) response: PrivateResponse, @Req() request?:IdentityHttpRequest) {
  response.setHeader("Cache-Control", "private, no-store");
  response.setHeader("Vary", "Cookie");
  try {
   if(request&&this.identity&&cookie?.split(";").some(v=>v.trim().startsWith("jobguard_session="))){
    const identity=this.identity();
    return await new CompanyValueApplication(subscriptionAuthority(identity),new ValueBusinessReader(this.pool)).readJob({sessionToken:cookieToken(request),tenantHeader:request.headers["x-tenant-id"],origin:request.headers.origin??identity.allowedOrigin},id,query);
   }
   const session = practiceCookie(cookie);
   const factory = this.readerFactory;
   const reader = factory ? { readJob: (jobId: string,window?:import("@jobguard/core").ValueWindowV1|null) => factory(this.pool, session).readJob(jobId,window) } : undefined;
   return await new ValueV3Application(this.pool, session, reader).readJob(id, query);
  }
  catch (error) {
   const failure = valueV3Failure(error);
   throw new HttpException(failure.body, failure.status);
  }
 }
}
