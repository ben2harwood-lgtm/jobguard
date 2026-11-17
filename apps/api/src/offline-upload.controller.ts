import { Body, Controller, Header, Headers, HttpCode, HttpException, Post, Res } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { Pool } from "pg";
import { practiceCookie } from "./practice-access.js";
import { OfflineUploadError } from "./offline-upload.contracts.js";
import { OfflineUploadApplication } from "./offline-upload.application.js";

@Controller("offline")
export class OfflineUploadController {
 constructor(private readonly pool: Pool) {}
 @Post("uploads") @HttpCode(200) @Header("Cache-Control", "no-store")
 @ApiOperation({ summary: "DARK M3-4 synthetic queued intent upload; outbound actions require online re-review" })
 @ApiBody({ schema: { type: "object", additionalProperties: false, required: ["version", "commandId", "jobId", "payloadHash", "expectedRevision", "body"], properties: {
  version: { type: "string", enum: ["offline-upload.v1"] }, commandId: { type: "string", format: "uuid" }, jobId: { type: "string", format: "uuid" }, payloadHash: { type: "string", pattern: "^[a-f0-9]{64}$" }, expectedRevision: { type: "integer", nullable: true, minimum: 0 }, body: { type: "object", description: "Strict log-site-extra.v1, job-work-state-command.v1 or offline-commercial-intent.v1; commandId and expectedRevision must match envelope" },
 } } })
 @ApiResponse({ status: 200, description: "Acknowledged committed fact; never sent or paid" })
 @ApiResponse({ status: 400, description: "Malformed or rejected intent" })
 @ApiResponse({ status: 403, description: "Live mode, Origin or current membership refused" })
 @ApiResponse({ status: 409, description: "Explicit conflict requiring reconciliation or online re-review" })
 @ApiResponse({ status: 503, description: "Unknown outcome; retry the same command identity" })
 async upload(@Body() raw: unknown, @Headers("cookie") cookie: string | undefined, @Headers("origin") origin: string | undefined,
  @Res({ passthrough: true }) response: { status(value: number): unknown }) {
  const allowed = (process.env.JOBGUARD_ALLOWED_ORIGINS ?? "http://localhost:3000").split(",").map(value => value.trim());
  if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new HttpException({ code: "SYNTHETIC_MODE_REQUIRED" }, 403);
  if (!origin || origin === "null" || !allowed.includes(origin)) throw new HttpException({ code: "ORIGIN_FORBIDDEN" }, 403);
  try {
   const result = await new OfflineUploadApplication(this.pool, practiceCookie(cookie)).upload(raw);
   response.status(result.state === "acknowledged" ? 200 : result.state === "conflict" ? 409 : result.state === "retryable" ? 503 : result.code === "PERMISSION_REVOKED" ? 403 : 400);
   return result;
  } catch (error) {
   if (error instanceof OfflineUploadError && error.code === "INVALID_OFFLINE_UPLOAD") throw new HttpException({ code: "INVALID_OFFLINE_UPLOAD" }, 400);
   throw error;
  }
 }
}
