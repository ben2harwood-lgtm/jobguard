import type { CanActivate, ExecutionContext } from "@nestjs/common";
import type { VerifiedTenantContext } from "@jobguard/db";
import type { AuthProvider } from "./auth-provider.js";
import { resolveVerifiedTenantContext } from "./principal-bridge.js";

interface GuardRequest {
  cookies?: Record<string, string | undefined>;
  headers: Record<string, string | undefined>;
  body?: { requested_tenant_id?: string };
  verifiedTenantContext?: VerifiedTenantContext;
}

/** Provider-neutral Nest guard; web routing is never the API authorization boundary. */
export class TenantAuthGuard implements CanActivate {
  constructor(private readonly provider: AuthProvider, private readonly allowedOrigin: string) {}

  async canActivate(executionContext: ExecutionContext): Promise<boolean> {
    const request = executionContext.switchToHttp().getRequest<GuardRequest>();
    request.verifiedTenantContext = await resolveVerifiedTenantContext(this.provider, {
      sessionToken: request.cookies?.jobguard_session,
      requestedTenantId: request.body?.requested_tenant_id,
      tenantHeader: request.headers["x-tenant-id"],
      csrfToken: request.headers["x-csrf-token"],
      origin: request.headers.origin,
    }, this.allowedOrigin);
    return true;
  }
}
