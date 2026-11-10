import "server-only";
import { AuthError } from "@jobguard/api/identity";
import { MerchantReliabilityRepository } from "@jobguard/db";
import { identityApplication } from "./identity-server";
import { syntheticPool } from "./synthetic-server";
export async function readMerchantDeliveryRecord(token: string | undefined, origin: string | null, jobId: string) {
 if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new AuthError("TENANT_FORBIDDEN");
 const identity = identityApplication();
 if (origin && origin !== identity.allowedOrigin) throw new AuthError("ORIGIN_FORBIDDEN");
 const session = await identity.session(token);
 // No client-selected tenant. Ambiguous sessions fail closed.
 if (session.memberships.length !== 1) throw new AuthError("TENANT_FORBIDDEN");
 const membership = session.memberships[0]!;
 if (!["owner","admin"].includes(membership.role)) throw new AuthError("TENANT_FORBIDDEN");
 const context = await identity.context({ sessionToken: token, requestedTenantId: membership.tenantId,
  csrfToken: session.csrfToken, origin: identity.allowedOrigin });
 return new MerchantReliabilityRepository(syntheticPool()).read(context,identity.provider.digest(`session:${token}`),jobId);
}
