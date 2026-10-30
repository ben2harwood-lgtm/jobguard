import { Inject, Injectable, UnauthorizedException, ForbiddenException, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { IDENTITY_APPLICATION, cookieToken, identityStatus, type IdentityHttpRequest } from "./identity-http.js";
import type { IdentityApplication } from "./identity.application.js";
import { syntheticSessionAllowed } from "./synthetic-session.js";
const SUBSCRIPTION_PATHS=new Set(["GET /subscriptions/current","POST /subscriptions/commands"]);
/** Fail closed before any Nest controller, including when Next is bypassed. */
@Injectable()
export class ApplicationAuthGuard implements CanActivate {
  constructor(@Inject(IDENTITY_APPLICATION) private readonly application:()=>IdentityApplication) {}
  async canActivate(context:ExecutionContext):Promise<boolean> {
    const request=context.switchToHttp().getRequest<IdentityHttpRequest & {path:string;method?:string}>();
    if(request.path==="/healthz" || request.path.startsWith("/auth/"))return true;
    // MON-2A subscription paths and CH-9 exact GET value paths use the company bridge
    // before the practice shortcut. All other money paths retain their existing refusal.
    if(SUBSCRIPTION_PATHS.has(`${request.method??""} ${request.path}`) || (request.method==="GET" && (request.path==="/value" || /^\/jobs\/[a-f0-9-]{36}\/value\/v3$/iu.test(request.path)) && cookieToken(request))){
      try {
        await this.application().context({sessionToken:cookieToken(request),requestedTenantId:request.body?.requested_tenant_id,tenantHeader:request.headers["x-tenant-id"],csrfToken:request.headers["x-csrf-token"],origin:request.headers.origin??(request.method==="GET"?this.application().allowedOrigin:undefined)});
      }catch(error){const {code}=identityStatus(error);if(code==="TENANT_FORBIDDEN"||code==="ORIGIN_FORBIDDEN")throw new ForbiddenException({code});throw new UnauthorizedException({code:"UNAUTHENTICATED"});}
      return true;
    }
    const syntheticCookie=request.headers.cookie?.split(";").map(part=>part.trim()).find(part=>part.startsWith("jg_session="))?.slice(11);
    if(syntheticSessionAllowed(syntheticCookie,process.env.JOBGUARD_ENV))return true;
    try {
      await this.application().context({sessionToken:cookieToken(request),requestedTenantId:request.body?.requested_tenant_id,tenantHeader:request.headers["x-tenant-id"],csrfToken:request.headers["x-csrf-token"],origin:request.headers.origin});
    }catch(error){const {code}=identityStatus(error);if(code==="TENANT_FORBIDDEN"||code==="ORIGIN_FORBIDDEN")throw new ForbiddenException({code});throw new UnauthorizedException({code:"UNAUTHENTICATED"});}
    // MON-3 independently rechecks the current synthetic company owner/session in SQL.
    if(/^\/jobs\/[^/]+\/(?:trial|quotes\/activation)$/u.test(request.path)&&process.env.JOBGUARD_ENV==="synthetic_demo")return true;
    // Existing commercial modules are synthetic projections: never run them as a real principal.
    throw new ForbiddenException({code:"SYNTHETIC_WORKFLOW_ONLY"});
  }
}
