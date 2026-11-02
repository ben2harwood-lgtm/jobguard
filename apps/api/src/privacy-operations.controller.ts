import { Body, Controller, Header, HttpException, Inject, Post, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { PrivacyOperationsError } from "@jobguard/core";
import { cookieToken, type IdentityHttpRequest } from "./auth/identity-http.js";
import type { PrivacyOperationsApplication } from "./privacy-operations.application.js";
export const PRIVACY_OPERATIONS_APPLICATION = "PRIVACY_OPERATIONS_APPLICATION";

@ApiTags("privacy-rehearsal") @Controller("privacy-rehearsal")
export class PrivacyOperationsController {
  constructor(@Inject(PRIVACY_OPERATIONS_APPLICATION) private readonly application: () => PrivacyOperationsApplication) {}
  private async run(request: IdentityHttpRequest, mode: "read" | "command", body: unknown) {
    try {
      return await this.application().invoke({ sessionToken: cookieToken(request), tenantHeader: request.headers["x-tenant-id"],
        origin: request.headers.origin, csrfToken: request.headers["x-csrf-token"] }, mode, body);
    } catch (error) {
      const code = error instanceof PrivacyOperationsError ? error.code : "PRIVACY_UNAVAILABLE";
      const status = code === "PRIVACY_DISABLED" || code === "PRIVACY_NOT_FOUND" ? 404 : code === "PRIVACY_INVALID" ? 400
        : code === "PRIVACY_FORBIDDEN" ? 403 : code === "PRIVACY_INSTRUCTION_REQUIRED" || code === "PRIVACY_CONFLICT" ? 409 : 503;
      throw new HttpException({ version: "privacy-error.v1", code }, status);
    }
  }
  @Post("commands") @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "Synthetic privacy request, controller instruction or rehearsal; disabled by default" })
  @ApiResponse({ status: 201, description: "privacy-result.v1; no external action or real erasure" })
  command(@Req() request: IdentityHttpRequest, @Body() body: unknown) { return this.run(request, "command", body); }
  @Post("read") @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "Read a tenant-owned synthetic privacy request and its rehearsed access/export" })
  @ApiResponse({ status: 201, description: "privacy-read.v1; private, no-store" })
  read(@Req() request: IdentityHttpRequest, @Body() body: unknown) { return this.run(request, "read", body); }
}
