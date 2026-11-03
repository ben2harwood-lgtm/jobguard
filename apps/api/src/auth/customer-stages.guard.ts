import { Inject, Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { CustomerAuthGuard } from "./customer-auth.guard.js";
import { CUSTOMER_APPLICATION, type CustomerSigninApplication } from "./customer-signin.js";
/** Adapt only the stage envelope to the existing read guard; the session boundary is unchanged. */
@Injectable()
export class CustomerStagesGuard implements CanActivate {
  constructor(@Inject(CUSTOMER_APPLICATION) private readonly application: () => CustomerSigninApplication) {}
  canActivate(context: ExecutionContext) {
    const http = context.switchToHttp();
    const request = http.getRequest<{body?: {jobId?: unknown}; headers: Record<string,string>}>();
    const guarded = {headers:request.headers, body:{version:"customer-read.v1",jobId:request.body?.jobId}};
    return new CustomerAuthGuard(this.application).canActivate({switchToHttp: () => ({getRequest: () => guarded,getResponse: () => http.getResponse()})} as ExecutionContext);
  }
}
