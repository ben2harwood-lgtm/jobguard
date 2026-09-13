import { verifiedTenantContextFromMembership, type VerifiedTenantContext } from "@jobguard/db";
import { AuthError, asAuthenticatedMembership, type AuthProvider } from "./auth-provider.js";
import { tenantRequestCredentialsV1 } from "./auth-schemas.js";

export interface TenantRequestCredentials {
  readonly sessionToken?: string | undefined;
  readonly requestedTenantId?: string | undefined;
  readonly tenantHeader?: string | undefined;
  readonly csrfToken?: string | undefined;
  readonly origin?: string | undefined;
}

/** The sole API bridge permitted to construct a VerifiedTenantContext. */
export async function resolveVerifiedTenantContext(
  provider: AuthProvider,
  request: TenantRequestCredentials,
  allowedOrigin: string,
): Promise<VerifiedTenantContext> {
  request = tenantRequestCredentialsV1.parse(request);
  if (!request.sessionToken) throw new AuthError("UNAUTHENTICATED");
  if (request.origin !== allowedOrigin) throw new AuthError("ORIGIN_FORBIDDEN");
  const principal = await provider.authenticate(request.sessionToken);
  if (!principal) throw new AuthError("UNAUTHENTICATED");
  if (!request.csrfToken || request.csrfToken !== principal.csrfToken) throw new AuthError("ORIGIN_FORBIDDEN");
  const selected = request.requestedTenantId ?? request.tenantHeader;
  if (!selected || (request.requestedTenantId && request.tenantHeader && request.requestedTenantId !== request.tenantHeader)) {
    throw new AuthError("TENANT_FORBIDDEN");
  }
  const membership = await provider.findMembership(principal, selected);
  if (!membership) throw new AuthError("TENANT_FORBIDDEN");
  return verifiedTenantContextFromMembership(asAuthenticatedMembership(membership));
}
