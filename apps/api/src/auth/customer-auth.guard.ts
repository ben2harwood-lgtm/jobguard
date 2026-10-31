import { HttpException, Inject, Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { CUSTOMER_APPLICATION, CustomerSigninApplication, customerRefusal } from "./customer-signin.js";
import type { IdentityHttpRequest } from "./identity-http.js";
export interface CustomerRequest extends IdentityHttpRequest { readonly customerScope?: unknown }
/** A separate customer boundary: never constructs a builder membership or tenant context. */
@Injectable()
export class CustomerAuthGuard implements CanActivate {
  constructor(@Inject(CUSTOMER_APPLICATION) private readonly application: () => CustomerSigninApplication) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<CustomerRequest>();
    const response = context.switchToHttp().getResponse<{setHeader(name: string, value: string): void}>();
    response.setHeader("Cache-Control", "no-store"); response.setHeader("Referrer-Policy", "no-referrer");
    try {
      const result = await this.application().run("read", request.body, request);
      Object.defineProperty(request, "customerScope", { value: Object.freeze(result.body as object), writable: false, configurable: false });
      return true;
    } catch (error) { const failure = customerRefusal(error); throw new HttpException(failure.body, failure.status); }
  }
}
