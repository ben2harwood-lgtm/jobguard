import { Inject, Injectable, UnauthorizedException, ForbiddenException, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { IDENTITY_APPLICATION, cookieToken, identityStatus, type IdentityHttpRequest } from "./identity-http.js";
import type { IdentityApplication } from "./identity.application.js";
import { syntheticSessionAllowed } from "./synthetic-session.js";
/** Fail closed before any Nest controller, including when Next is bypassed. */
@Injectable()
export class ApplicationAuthGuard implements CanActivate {
  constructor(@Inject(IDENTITY_APPLICATION) private readonly application:()=>IdentityApplication) {}
  async canActivate(context:ExecutionContext):Promise<boolean> {
    const request=context.switchToHttp().getRequest<IdentityHttpRequest & {path:string}>();
    if(request.path==="/healthz" || request.path.startsWith("/auth/"))return true;
    const syntheticCookie=request.headers.cookie?.split(";").map(part=>part.trim()).find(part=>part.startsWith("jg_session="))?.slice(11);
    if(syntheticSessionAllowed(syntheticCookie,process.env.JOBGUARD_ENV))return true;
    try {
      await this.application().context({sessionToken:cookieToken(request),requestedTenantId:request.body?.requested_tenant_id,tenantHeader:request.headers["x-tenant-id"],csrfToken:request.headers["x-csrf-token"],origin:request.headers.origin});
    }catch(error){const {code}=identityStatus(error);if(code==="TENANT_FORBIDDEN"||code==="ORIGIN_FORBIDDEN")throw new ForbiddenException({code});throw new UnauthorizedException({code:"UNAUTHENTICATED"});}
    // Existing commercial modules are synthetic projections: never run them as a real principal.
    throw new ForbiddenException({code:"SYNTHETIC_WORKFLOW_ONLY"});
  }
}
