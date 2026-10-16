import { Body, Controller, Get, Header, Headers, HttpCode, HttpException, Inject, Param, Post, Res } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Pool } from "pg";
import { PracticeWorkerSwitchError } from "@jobguard/core";
import { PracticeWorkerSwitchApplication, practiceWorkerSwitchHttpFailure } from "./practice-worker-switch.application.js";
const principal = (cookie?: string) => ({ version: "contractor-principal.v1", sessionId: cookie?.split(";").map(s => s.trim()).find(s => s.startsWith("jg_session="))?.slice(11) });
const commandSchema = (version: string) => ({ type: "object" as const, additionalProperties: false, required: ["version", "commandId"], properties: { version: { type: "string" as const, enum: [version] }, commandId: { type: "string" as const, format: "uuid" } } });
@ApiTags("practice-worker-switch")
@Controller("contractor")
export class PracticeWorkerSwitchController {
 private readonly application: PracticeWorkerSwitchApplication;
 constructor(@Inject(Pool) pool: Pool) { this.application = new PracticeWorkerSwitchApplication(pool); }
 private origin(origin?: string) {
  const allowed = (process.env.JOBGUARD_ALLOWED_ORIGINS ?? "http://localhost:3000").split(",").map(value => value.trim());
  if (!origin || origin === "null" || !allowed.includes(origin)) {
   const failure = practiceWorkerSwitchHttpFailure(new PracticeWorkerSwitchError("ORIGIN_FORBIDDEN")); throw new HttpException(failure.body, failure.status);
  }
 }
 private async call(work: () => Promise<unknown>) {
  try { return await work(); } catch (error) { const failure = practiceWorkerSwitchHttpFailure(error); throw new HttpException(failure.body, failure.status); }
 }
 @Get("practice/acting-as") @Header("Cache-Control", "no-store") @ApiOperation({ summary: "Read the current practice acting-as state" })
 read(@Headers("cookie") cookie: string | undefined, @Res({ passthrough: true }) response: { setHeader(name: string, value: string): void }) { response.setHeader("Cache-Control", "no-store"); return this.call(() => this.application.read(principal(cookie))); }
 @Post("practice/workers/:workerId/acting-as") @HttpCode(200) @Header("Cache-Control", "no-store") @ApiBody({ schema: commandSchema("practice-worker-switch-on.v1") }) @ApiOperation({ summary: "Act as an existing made-up member of this practice company for thirty minutes" })
 start(@Param("workerId") workerId: string, @Headers("cookie") cookie: string | undefined, @Headers("origin") origin: string | undefined, @Body() raw: unknown, @Res({ passthrough: true }) response: { setHeader(name: string, value: string): void }) {
  response.setHeader("Cache-Control", "no-store");
  this.origin(origin); return this.call(() => this.application.start(principal(cookie), workerId, raw));
 }
 @Post("practice/acting-as/end") @HttpCode(200) @Header("Cache-Control", "no-store") @ApiBody({ schema: commandSchema("practice-worker-switch-off.v1") }) @ApiOperation({ summary: "End this practice session's acting-as switch" })
 end(@Headers("cookie") cookie: string | undefined, @Headers("origin") origin: string | undefined, @Body() raw: unknown, @Res({ passthrough: true }) response: { setHeader(name: string, value: string): void }) {
  response.setHeader("Cache-Control", "no-store");
  this.origin(origin); return this.call(() => this.application.end(principal(cookie), raw));
 }
}
