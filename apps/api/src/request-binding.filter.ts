import { ArgumentsHost, Catch, type ExceptionFilter } from "@nestjs/common";
import { RequestBindingRefusedError } from "@jobguard/db";

/** Only a refused binding reaches this filter; business SQL errors keep their own handlers. */
@Catch(RequestBindingRefusedError)
export class RequestBindingExceptionFilter implements ExceptionFilter {
 catch(error: RequestBindingRefusedError, host: ArgumentsHost) {
  const code = error.sessionKind === "practice" ? "UNAUTHENTICATED" : "FORBIDDEN";
  host.switchToHttp().getResponse().status(code === "UNAUTHENTICATED" ? 401 : 403).json({ code });
 }
}
