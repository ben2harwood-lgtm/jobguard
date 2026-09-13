import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";

@ApiTags("system")
@Controller()
export class HealthController {
  @Get("healthz")
  @ApiOperation({ summary: "Process liveness; deliberately does not access dependencies" })
  @ApiOkResponse({ schema: { type: "object", required: ["status"], properties: { status: { type: "string", enum: ["ok"] } } } })
  health(): { status: "ok" } { return { status: "ok" }; }
}
