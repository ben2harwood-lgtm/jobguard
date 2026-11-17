import { Body, Controller, Header, Headers, HttpCode, HttpException, Param, Post } from "@nestjs/common";
import { ApiBody, ApiConflictResponse, ApiCreatedResponse, ApiResponse, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { Pool } from "pg";
import { SiteExtraError } from "@jobguard/core";
import { SiteExtraApplication, siteExtraHttpFailure } from "./site-extra.application.js";
const principal = (cookie?: string) => ({ version: "contractor-principal.v1", sessionId: cookie?.split(";").map(x => x.trim()).find(x => x.startsWith("jg_session="))?.slice(11) });
@ApiTags("contractor-site-extras")
@Controller("contractor")
export class SiteExtraController {
 private readonly application: SiteExtraApplication;
 constructor(pool: Pool) { this.application = new SiteExtraApplication(pool); }
 @Post("jobs/:id/site-extras") @HttpCode(201) @Header("Cache-Control", "no-store")
 @ApiCreatedResponse({ description: "Site extra logged, or the identical stored result replayed" })
 @ApiResponse({ status: 200, description: "" })
 @ApiResponse({ status: 422, description: "PHOTO_NOT_ACCEPTED: the photo is not a verified site photo of this job. CONFIRMATION_MISMATCH: the hash shown is not the server's content hash.", schema: { type: "object", required: ["version", "code"], properties: { version: { type: "string", enum: ["site-extra-error.v1"] }, code: { type: "string", enum: ["PHOTO_NOT_ACCEPTED", "CONFIRMATION_MISMATCH"] } } } })
 @ApiConflictResponse({ description: "JOB_NOT_LIVE: only live jobs accept site extras. IDEMPOTENCY_CONFLICT: command id reused with a different request.", schema: { type: "object", required: ["code"], properties: { code: { type: "string", enum: ["JOB_NOT_LIVE", "IDEMPOTENCY_CONFLICT"] } } } })
 @ApiOperation({ summary: "Log a site extra in synthetic_demo (v1 note only, v2 with an open visit, or v3 with a verified photo and a resident confirmation); persisted session and database authority only" })
 @ApiParam({ name: "id", type: String, format: "uuid" })
 @ApiBody({ schema: { oneOf: [
  { type: "object", additionalProperties: false, required: ["version", "commandId", "note", "description"], properties: { version: { type: "string", enum: ["log-site-extra.v1"] }, commandId: { type: "string", format: "uuid" }, note: { type: "string", minLength: 1, maxLength: 5000, pattern: "\\S" }, description: { type: "string", minLength: 1, maxLength: 500, pattern: "\\S" } } },
  { type: "object", additionalProperties: false, required: ["version", "commandId", "note", "description", "siteVisitId"], properties: { version: { type: "string", enum: ["log-site-extra.v2"] }, commandId: { type: "string", format: "uuid" }, note: { type: "string", minLength: 1, maxLength: 5000, pattern: "\\S" }, description: { type: "string", minLength: 1, maxLength: 500, pattern: "\\S" }, siteVisitId: { type: "string", format: "uuid", description: "The caller's own open visit on this job" } } },
  { type: "object", additionalProperties: false, required: ["version", "commandId", "note", "description"], properties: { version: { type: "string", enum: ["log-site-extra.v3"] }, commandId: { type: "string", format: "uuid" }, note: { type: "string", minLength: 1, maxLength: 5000, pattern: "\\S" }, description: { type: "string", minLength: 1, maxLength: 500, pattern: "\\S" }, photoEvidenceId: { type: "string", format: "uuid" }, residentConfirmation: { type: "object", additionalProperties: false, required: ["shownContentSha256"], properties: { shownContentSha256: { type: "string", pattern: "^[0-9a-f]{64}$" } } } } },
 ] } })
 log(@Param("id") jobId: string, @Headers("cookie") cookie: string | undefined, @Headers("origin") origin: string | undefined, @Body() body: unknown) {
  const allowed = (process.env.JOBGUARD_ALLOWED_ORIGINS ?? "http://localhost:3000").split(",").map(value => value.trim());
  if (!origin || origin === "null" || !allowed.includes(origin)) { const failure = siteExtraHttpFailure(new SiteExtraError("ORIGIN_FORBIDDEN")); throw new HttpException(failure.body, failure.status); }
  return this.application.log(principal(cookie), jobId, body).catch(error => { const failure = siteExtraHttpFailure(error); throw new HttpException(failure.body, failure.status); });
 }
}
