import { Body, Controller, Get, Header, HttpException, Param, Post, Query, Req } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Pool } from "pg";
import { EvidencePackApplication } from "./evidence-pack.application.js";
import { evidencePackFailure } from "./evidence-pack.errors.js";

type Request = { headers: { cookie?: string } };
@ApiTags("evidence-packs")
@Controller("recovery-cases/:id/evidence-packs")
export class EvidencePackController {
  private readonly app: EvidencePackApplication;
  constructor(pool: Pool) { this.app = new EvidencePackApplication(pool); }
  private session(request: Request) { return request.headers.cookie?.split(";").map(value => value.trim()).find(value => value.startsWith("jg_session="))?.slice(11); }
  private async invoke<T>(run: () => Promise<T>) {
    try { return await run(); }
    catch (error) { const { status, code } = evidencePackFailure(error); throw new HttpException({ code }, status); }
  }
  @Get()
  @ApiOperation({ summary: "List immutable mapped, inspectable evidence packs" })
  get(@Req() request: Request, @Param("id") id: string) { return this.invoke(() => this.app.list(this.session(request), id)); }
  @Post()
  @ApiOperation({ summary: "Generate an immutable text evidence-pack revision" })
  post(@Req() request: Request, @Param("id") id: string, @Body() body: unknown) { return this.invoke(() => this.app.generate(this.session(request), id, body)); }
  @Post(":packId/attachment-approval")
  @ApiOperation({ summary: "Record approval bound to the current evidence pack hashes" })
  approve(@Req() request: Request, @Param("id") id: string, @Param("packId") packId: string, @Body() body: unknown) { return this.invoke(() => this.app.approveAttachment(this.session(request), id, packId, body)); }
  @Get(":packId/inspect")
  @ApiOperation({ summary: "Inspect persisted pack or an explicitly synthetic malformed scenario on the server" })
  inspect(@Req() request: Request, @Param("id") id: string, @Param("packId") packId: string, @Query() query: unknown) { return this.invoke(() => this.app.inspect(this.session(request), id, packId, query)); }
  @Get(":packId/download")
  @Header("content-type", "text/plain; charset=utf-8")
  @Header("content-disposition", 'attachment; filename="jobguard-evidence-pack.txt"')
  download(@Req() request: Request, @Param("id") id: string, @Param("packId") packId: string) { return this.invoke(() => this.app.download(this.session(request), id, packId)); }
}
