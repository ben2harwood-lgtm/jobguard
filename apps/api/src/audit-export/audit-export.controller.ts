import { Body, Controller, Get, Header, Headers, HttpCode, HttpException, Post } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Pool } from "pg";
import { AuditExportApplication, auditExportHttpFailure } from "./audit-export.application.js";
const session = (cookie?: string) => cookie?.split(";").map(x => x.trim()).find(x => x.startsWith("jg_session="))?.slice(11);
@ApiTags("audit-exports")
@Controller("contractor/audit-exports")
export class AuditExportController {
  private readonly application: AuditExportApplication;
  constructor(pool: Pool) { this.application = new AuditExportApplication(pool); }
  private async call(work: () => Promise<unknown>) {
    try { return await work(); } catch (error) { const failure = auditExportHttpFailure(error); throw new HttpException(failure.body, failure.status); }
  }
  @Get() @Header("Cache-Control", "no-store") @ApiOperation({ summary: "List persisted single-tenant signed audit exports; current tenant-wide owner/admin only" })
  list(@Headers("cookie") cookie?: string) { return this.call(() => this.application.list(session(cookie))); }
  @ApiBody({ schema: { type: "object", additionalProperties: false, required: ["version", "commandId"], properties: { version: { type: "string", enum: ["audit-export-request.v1"] }, commandId: { type: "string", format: "uuid" } } } })
  @Post() @HttpCode(200) @Header("Cache-Control", "no-store") @ApiOperation({ summary: "Create audit-export-request.v1 in synthetic_demo with restricted checkpoint handoff. The signature proves export integrity only" })
  create(@Headers("cookie") cookie: string | undefined, @Headers("origin") origin: string | undefined, @Body() body: unknown) {
    const allowed = (process.env.JOBGUARD_ALLOWED_ORIGINS ?? "http://localhost:3000").split(",").map(value => value.trim());
    if (!origin || !allowed.includes(origin)) throw new HttpException({ version: "audit-export-error.v1", code: "AUDIT_EXPORT_FORBIDDEN" }, 403);
    return this.call(() => this.application.create(session(cookie), body));
  }
}
