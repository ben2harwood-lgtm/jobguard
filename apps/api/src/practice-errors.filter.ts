import { ArgumentsHost, Catch, type ExceptionFilter } from "@nestjs/common";
import { PracticeAccessError } from "@jobguard/db";
@Catch(PracticeAccessError)
export class PracticeErrorsFilter implements ExceptionFilter {
 catch(error:PracticeAccessError,host:ArgumentsHost){host.switchToHttp().getResponse().status(error.code==="UNAUTHENTICATED"?401:error.code==="NOT_FOUND"?404:403).json({code:error.code});}
}
