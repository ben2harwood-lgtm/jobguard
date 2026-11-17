import { Body, Controller, Get, Header, Headers, HttpCode, HttpException, Param, Post } from "@nestjs/common";
import { ApiBody, ApiConflictResponse, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { Pool } from "pg";
import { SiteVisitError } from "@jobguard/core";
import { SiteExtraApplication, siteVisitHttpFailure } from "./site-extra.application.js";
const principal = (cookie?: string) => ({ version: "contractor-principal.v1", sessionId: cookie?.split(";").map(x => x.trim()).find(x => x.startsWith("jg_session="))?.slice(11) });
const fail = (error: unknown): never => { const failure = siteVisitHttpFailure(error); throw new HttpException(failure.body, failure.status); };
function trustedOrigin(origin: string | undefined): void {
 const allowed = (process.env.JOBGUARD_ALLOWED_ORIGINS ?? "http://localhost:3000").split(",").map(value => value.trim());
 if (!origin || origin === "null" || !allowed.includes(origin)) fail(new SiteVisitError("ORIGIN_FORBIDDEN"));
}
const conflict = { description: "JOB_NOT_LIVE: only live jobs accept visit commands. IDEMPOTENCY_CONFLICT: command id reused with a different request.", schema: { type: "object", required: ["code"], properties: { code: { type: "string", enum: ["JOB_NOT_LIVE", "IDEMPOTENCY_CONFLICT"] } } } } as const;
/** ENT-3b: the site worker's server surface. Authority is the persisted session and the database; no screen exists yet (UI is parked). */
@ApiTags("contractor-site-visits")
@Controller("contractor")
export class SiteVisitController {
 private readonly application: SiteExtraApplication;
 constructor(pool: Pool) { this.application = new SiteExtraApplication(pool); }
 @Post("jobs/:id/site-visits/start") @HttpCode(201) @Header("Cache-Control", "no-store")
 @ApiCreatedResponse({ description: "Visit started, or the identical stored result replayed" })
 @ApiConflictResponse(conflict)
 @ApiOperation({ summary: "Start a site visit in synthetic_demo; persisted session and database authority only" })
 @ApiParam({ name: "id", type: String, format: "uuid" })
 @ApiBody({ schema: { type: "object", additionalProperties: false, required: ["version", "commandId"], properties: { version: { type: "string", enum: ["start-site-visit.v1"] }, commandId: { type: "string", format: "uuid" } } } })
 start(@Param("id") jobId: string, @Headers("cookie") cookie: string | undefined, @Headers("origin") origin: string | undefined, @Body() body: unknown) {
  trustedOrigin(origin);
  return this.application.startVisit(principal(cookie), jobId, body).catch(fail);
 }
 @Post("jobs/:id/site-visits/:visitId/complete") @HttpCode(201) @Header("Cache-Control", "no-store")
 @ApiCreatedResponse({ description: "Visit completed with its close-out answer, or the identical stored result replayed" })
 @ApiConflictResponse(conflict)
 @ApiOperation({ summary: "Complete a site visit with the close-out answer in synthetic_demo; a visit cannot be completed without one" })
 @ApiParam({ name: "id", type: String, format: "uuid" })
 @ApiParam({ name: "visitId", type: String, format: "uuid" })
 @ApiBody({ schema: { type: "object", additionalProperties: false, required: ["version", "commandId", "closeoutAnswer"], properties: { version: { type: "string", enum: ["complete-site-visit.v1"] }, commandId: { type: "string", format: "uuid" }, closeoutAnswer: { type: "string", enum: ["yes", "no"], description: "Did the resident ask for anything extra?" } } } })
 complete(@Param("id") jobId: string, @Param("visitId") visitId: string, @Headers("cookie") cookie: string | undefined, @Headers("origin") origin: string | undefined, @Body() body: unknown) {
  trustedOrigin(origin);
  return this.application.completeVisit(principal(cookie), jobId, visitId, body).catch(fail);
 }
 @Get("site/jobs") @Header("Cache-Control", "no-store")
 @ApiOkResponse({ description: "The caller's assigned jobs, with their own open visit" })
 @ApiOperation({ summary: "List the jobs the caller is named on (site worker); no money, resident or address" })
 assignedJobs(@Headers("cookie") cookie: string | undefined) {
  return this.application.assignedJobs(principal(cookie)).catch(fail);
 }
 @Get("jobs/:id/order-lines") @Header("Cache-Control", "no-store")
 @ApiOkResponse({ description: "The lines of the order's current revision, without prices" })
 @ApiOperation({ summary: "List the order lines of one assigned job (site worker); no money" })
 @ApiParam({ name: "id", type: String, format: "uuid" })
 orderLines(@Param("id") jobId: string, @Headers("cookie") cookie: string | undefined) {
  return this.application.orderLines(principal(cookie), jobId).catch(fail);
 }
}
