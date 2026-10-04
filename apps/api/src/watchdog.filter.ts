import { Catch, type ArgumentsHost, type ExceptionFilter } from "@nestjs/common";
import { WatchdogError } from "@jobguard/db";

@Catch(WatchdogError)
export class WatchdogExceptionFilter implements ExceptionFilter {
  catch(error: WatchdogError, host: ArgumentsHost) {
    host.switchToHttp().getResponse<{ status(code: number): { json(body: unknown): void } }>()
      .status(error.code === "JOB_NOT_LIVE" ? 409 : 404).json({ code: error.code });
  }
}
