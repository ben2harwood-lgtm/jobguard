import { Catch, HttpStatus, type ArgumentsHost, type ExceptionFilter } from "@nestjs/common";
import { WatchdogError } from "@jobguard/db";

// Replay and live-guard refusals share this typed boundary; expose stable codes only.
const STATUS_BY_CODE: Record<WatchdogError["code"], number> = {
  JOB_NOT_FOUND: HttpStatus.NOT_FOUND,
  JOB_NOT_LIVE: HttpStatus.CONFLICT,
  IDEMPOTENCY_CONFLICT: HttpStatus.CONFLICT,
};

@Catch(WatchdogError)
export class WatchdogExceptionFilter implements ExceptionFilter {
  catch(error: WatchdogError, host: ArgumentsHost) {
    host.switchToHttp().getResponse<{ status(code: number): { json(body: unknown): void } }>()
      .status(STATUS_BY_CODE[error.code]).json({ code: error.code });
  }
}
