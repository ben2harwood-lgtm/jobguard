import { Body, Controller, Get, Header, Headers, HttpCode, HttpException, Param, Post, Query } from "@nestjs/common";
import { ApiBody, ApiConflictResponse, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags } from "@nestjs/swagger";
import { Pool } from "pg";
import { SorSiteExtraError } from "@jobguard/core";
import { SiteExtraApplication, sorSiteExtraHttpFailure } from "./site-extra.application.js";

const principal = (cookie?: string) => ({ version: "contractor-principal.v1", sessionId: cookie?.split(";").map(x => x.trim()).find(x => x.startsWith("jg_session="))?.slice(11) });
const fail = (error: unknown): never => { const failure = sorSiteExtraHttpFailure(error); throw new HttpException(failure.body, failure.status); };

/** ENT-3c: the priced log and the two site reads. Server only; the session is the only authority and the job comes from the path. */
@ApiTags("contractor-site-extras")
@Controller("contractor")
export class SiteExtraPricingController {
 private readonly application: SiteExtraApplication;
 constructor(pool: Pool) { this.application = new SiteExtraApplication(pool); }
 @Post("jobs/:id/site-extras/sor") @HttpCode(201) @Header("Cache-Control", "no-store")
 @ApiCreatedResponse({ description: "Schedule-item site extra logged and priced by the server, or the identical stored result replayed" })
 @ApiConflictResponse({ description: "JOB_NOT_LIVE: only live jobs accept site extras. IDEMPOTENCY_CONFLICT: command id reused with a different request.", schema: { type: "object", required: ["code"], properties: { code: { type: "string", enum: ["JOB_NOT_LIVE", "IDEMPOTENCY_CONFLICT"] } } } })
 @ApiOperation({ summary: "Log a schedule-of-rates site extra in synthetic_demo; the server compares it with the order and prices the extra quantity alone" })
 @ApiParam({ name: "id", type: String, format: "uuid" })
 @ApiBody({ schema: { type: "object", additionalProperties: false, required: ["version", "commandId", "sorCode", "quantity", "note"], properties: { version: { type: "string", enum: ["log-sor-site-extra.v1"] }, commandId: { type: "string", format: "uuid" }, sorCode: { type: "string", minLength: 1, maxLength: 80 }, quantity: { type: "string", pattern: "^(0|[1-9][0-9]{0,11})(\\.[0-9]{1,6})?$" }, orderLineScopeItemId: { type: "string", format: "uuid" }, note: { type: "string", minLength: 1, maxLength: 5000, pattern: "\\S" } } } })
 logSor(@Param("id") jobId: string, @Headers("cookie") cookie: string | undefined, @Headers("origin") origin: string | undefined, @Body() body: unknown) {
  const allowed = (process.env.JOBGUARD_ALLOWED_ORIGINS ?? "http://localhost:3000").split(",").map(value => value.trim());
  if (!origin || origin === "null" || !allowed.includes(origin)) return fail(new SorSiteExtraError("ORIGIN_FORBIDDEN"));
  return this.application.logSor(principal(cookie), jobId, body).catch(fail);
 }
 @Get("jobs/:id/sor-items") @Header("Cache-Control", "no-store")
 @ApiOkResponse({ description: "Items of this job's price list whose code or description contains the text (at most 50)" })
 @ApiOperation({ summary: "Search the price list of this job's work order" })
 @ApiParam({ name: "id", type: String, format: "uuid" })
 @ApiQuery({ name: "q", required: true, type: String, description: "1 to 80 characters after trimming" })
 sorItems(@Param("id") jobId: string, @Headers("cookie") cookie: string | undefined, @Query("q") q: unknown) {
  return this.application.sorItems(principal(cookie), jobId, { q }).catch(fail);
 }
 @Get("jobs/:id/order-check") @Header("Cache-Control", "no-store")
 @ApiOkResponse({ description: "already_on_order, more_than_ordered (with the extra quantity) or new" })
 @ApiOperation({ summary: "Compare a schedule item and a total quantity with the order, before logging" })
 @ApiParam({ name: "id", type: String, format: "uuid" })
 @ApiQuery({ name: "sorCode", required: true, type: String }) @ApiQuery({ name: "quantity", required: true, type: String }) @ApiQuery({ name: "orderLine", required: false, type: String, description: "scope item id of the order line, when the code is on more than one line" })
 orderCheck(@Param("id") jobId: string, @Headers("cookie") cookie: string | undefined, @Query("sorCode") sorCode: unknown, @Query("quantity") quantity: unknown, @Query("orderLine") orderLine: unknown) {
  return this.application.orderCheck(principal(cookie), jobId, { sorCode, quantity, ...(orderLine === undefined ? {} : { orderLine }) }).catch(fail);
 }
}
