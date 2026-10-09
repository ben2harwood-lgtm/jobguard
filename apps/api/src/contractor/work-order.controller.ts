import { Body, Controller, Get, Header, Headers, HttpException, Param, Post } from "@nestjs/common";
import { ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { Pool } from "pg";
import { WorkOrderApplication, workOrderHttpFailure } from "./work-order.application.js";
const principal = (cookie?: string) => ({ version: "contractor-principal.v1", sessionId: cookie?.split(";").map(x => x.trim()).find(x => x.startsWith("jg_session="))?.slice(11) });
@ApiTags("contractor-work-orders")
@Controller("contractor")
export class WorkOrderController {
  private readonly application: WorkOrderApplication;
  constructor(pool: Pool) { this.application = new WorkOrderApplication(pool); }
  private async call(work: () => Promise<unknown>) {
    try { return await work(); } catch (error) { const failure = workOrderHttpFailure(error); throw new HttpException(failure.body, failure.status); }
  }
  private origin(origin?: string) { if (origin !== "http://localhost:3000") throw new HttpException({ version: "work-order-error.v1", code: "NOT_FOUND", recoverable: false }, 404); }
  @Get("work-order-imports") @Header("Cache-Control", "no-store") @ApiOperation({ summary: "Office register of work-order import batches and orders, with the selectable generated files; organisation.manage or data.import required" })
  overview(@Headers("cookie") cookie?: string) { return this.call(() => this.application.overview(principal(cookie))); }
  @Post("work-order-imports") @ApiOperation({ summary: "Import a generated synthetic work-order file (work-order-import.v1); organisation.manage or data.import required, no arbitrary upload" })
  import(@Headers("cookie") cookie: string | undefined, @Headers("origin") origin: string | undefined, @Body() body: unknown) { this.origin(origin); return this.call(() => this.application.importGenerated(principal(cookie), body)); }
  @Get("work-order-imports/:batchId") @Header("Cache-Control", "no-store") @ApiOperation({ summary: "One import batch with its per-row receipts and typed errors" })
  @ApiParam({ name: "batchId", type: String, format: "uuid" })
  batch(@Param("batchId") batchId: string, @Headers("cookie") cookie?: string) { return this.call(() => this.application.batch(principal(cookie), batchId)); }
  @Get("work-orders/:workOrderId/revisions") @Header("Cache-Control", "no-store") @ApiOperation({ summary: "Immutable revisions of one work order with diffs and stable line identities; resident contact is never included" })
  @ApiParam({ name: "workOrderId", type: String, format: "uuid" })
  revisions(@Param("workOrderId") workOrderId: string, @Headers("cookie") cookie?: string) { return this.call(() => this.application.revisions(principal(cookie), workOrderId)); }
  @Get("sor-versions") @Header("Cache-Control", "no-store") @ApiOperation({ summary: "Immutable schedule-of-rates versions; contract.read required" })
  sorVersions(@Headers("cookie") cookie?: string) { return this.call(() => this.application.sorVersions(principal(cookie))); }
  @Post("sor-versions") @ApiOperation({ summary: "Import an immutable schedule-of-rates version (sor-version-import.v1); contract.manage required" })
  importSor(@Headers("cookie") cookie: string | undefined, @Headers("origin") origin: string | undefined, @Body() body: unknown) { this.origin(origin); return this.call(() => this.application.importSorVersion(principal(cookie), body)); }
}
