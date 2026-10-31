import { Body, Controller, Get, HttpException, Param, Post, Req } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Pool } from "pg";
import { CommandError, JobImportV3Error } from "@jobguard/db";
import { ImportContractError } from "@jobguard/core";
import { JobImportV3Application } from "./job-import-v3.application.js";
import { practiceCookie } from "./practice-access.js";

@ApiTags("job-import-v3")
@Controller("jobs/:id/parties/import-v3")
export class JobImportV3Controller {
  constructor(private readonly pool: Pool) {}
  private application(request: { headers: { cookie?: string } }) {
    return new JobImportV3Application(this.pool, practiceCookie(request.headers.cookie));
  }
  private async execute<T>(work: () => Promise<T>) {
    try { return await work(); }
    catch (error) {
      if (!(error instanceof JobImportV3Error || error instanceof CommandError || error instanceof ImportContractError)) throw error;
      throw new HttpException({ code: error.code }, error.code === "FORBIDDEN" ? 403 : error.code === "NOT_FOUND" ? 404
        : error.code === "INVALID_IMPORT" || error.code === "INVALID_IMPORT_CONTRACT" ? 400 : 409);
    }
  }
  @Post("preview") @ApiOperation({ summary: "Preview the server-selected fictional v3 import and its availability" })
  preview(@Req() request: { headers: { cookie?: string } }, @Param("id") id: string, @Body() raw: unknown) {
    return this.execute(() => this.application(request).preview(id, raw));
  }
  @Post() @ApiOperation({ summary: "Import a fictional invoiced job under v3 terms; live capacity admission remains unavailable" })
  adopt(@Req() request: { headers: { cookie?: string } }, @Param("id") id: string, @Body() raw: unknown) {
    return this.execute(() => this.application(request).adopt(id, raw));
  }
  @Get() @ApiOperation({ summary: "Read an owned immutable v3 imported baseline and zero-count exclusion" })
  read(@Req() request: { headers: { cookie?: string } }, @Param("id") id: string) {
    return this.execute(() => this.application(request).read(id));
  }
}
