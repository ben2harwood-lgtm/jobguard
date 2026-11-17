import { Body, Controller, Header, Headers, HttpCode, HttpException, Inject, Post, Res } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Pool } from "pg";
import { ContractorPracticeSessionError } from "@jobguard/core";
import { ContractorPracticeSessionApplication, contractorPracticeSessionHttpFailure } from "./contractor-practice-session.application.js";
const session = (cookie?: string) => cookie?.split(";").map(x => x.trim()).find(x => x.startsWith("jg_session="))?.slice(11);
@ApiTags("contractor-practice-session")
@Controller("contractor")
export class ContractorPracticeSessionController {
 private readonly application: ContractorPracticeSessionApplication;
 constructor(@Inject(Pool) pool: Pool) { this.application = new ContractorPracticeSessionApplication(pool); }
 @Post("practice/session/revoke") @HttpCode(200) @Header("Cache-Control", "no-store")
 @ApiOperation({ summary: "End only the caller's contractor practice session; home practice is unchanged" })
 @ApiBody({ schema: { type: "object", additionalProperties: false, required: ["version"], properties: { version: { type: "string", enum: ["contractor-practice-session-revoke.v1"] } } } })
 async revoke(@Headers("cookie") cookie: string | undefined, @Headers("origin") origin: string | undefined, @Body() body: unknown, @Res({ passthrough: true }) response: { setHeader(name: string, value: string): void }) {
  response.setHeader("Cache-Control", "no-store");
  try {
   const allowed = (process.env.JOBGUARD_ALLOWED_ORIGINS ?? "http://localhost:3000").split(",").map(value => value.trim());
   if (!origin || !allowed.includes(origin)) throw new ContractorPracticeSessionError("ORIGIN_FORBIDDEN");
   return await this.application.revoke({ version: "contractor-principal.v1", sessionId: session(cookie) }, body);
  } catch (error) { const failure = contractorPracticeSessionHttpFailure(error); throw new HttpException(failure.body, failure.status); }
 }
}
