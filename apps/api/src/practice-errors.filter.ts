import { ArgumentsHost, Catch, type ExceptionFilter } from "@nestjs/common";
import { PracticeAccessError, RequestBindingRefusedError } from "@jobguard/db";
@Catch(PracticeAccessError, RequestBindingRefusedError)
export class PracticeErrorsFilter implements ExceptionFilter {
 catch(error:PracticeAccessError|RequestBindingRefusedError,host:ArgumentsHost){
  const code=error instanceof RequestBindingRefusedError?(error.sessionKind==="practice"?"UNAUTHENTICATED":"FORBIDDEN"):error.code;
  host.switchToHttp().getResponse().status(code==="UNAUTHENTICATED"?401:code==="NOT_FOUND"?404:403).json({code});
 }
}
