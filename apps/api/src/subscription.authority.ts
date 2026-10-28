import { z } from "zod";
import { SubscriptionPersistenceError } from "@jobguard/db";
import type { IdentityApplication } from "./auth/identity.application.js";
import type { SubscriptionAuthorityPort } from "./subscription.application.js";

/** MON-2A (Ben, 28 Oct): a real email-code session for a made-up company, never a practice session.
 * The request credentials are passed through unchanged; SQL re-authenticates the persisted session by its digest. */
const credentialsV1 = z.object({ sessionToken: z.string().min(1).max(512), origin: z.string().max(512).optional(), csrfToken: z.string().max(512).optional(),
  tenantHeader: z.string().max(64).optional(), requestedTenantId: z.string().max(64).optional() }).passthrough();
export function subscriptionAuthority(identity: IdentityApplication): SubscriptionAuthorityPort {
  return {
    environment: () => process.env.JOBGUARD_ENV, provider: identity.provider, allowedOrigin: identity.allowedOrigin,
    async resolve(handle: unknown) {
      const credentials = credentialsV1.safeParse(handle);
      if (!credentials.success) throw new SubscriptionPersistenceError("SUBSCRIPTION_FORBIDDEN");
      return { credentials: credentials.data, digest: identity.provider.digest(`session:${credentials.data.sessionToken}`) };
    },
  };
}
/** Stable codes only; a forbidden or foreign request never learns whether a company exists. */
export function subscriptionHttpStatus(code: string): number {
  return code === "INVALID_SUBSCRIPTION_INPUT" ? 400 : code === "SUBSCRIPTION_FORBIDDEN" || code === "SUBSCRIPTION_SYNTHETIC_ONLY" ? 403 : code === "SUBSCRIPTION_PROJECTION_MISMATCH" ? 409 : 503;
}
export const subscriptionHttpCommandV1 = z.object({ version: z.literal("subscription-http-command.v1"), commandId: z.string().uuid(), command: z.unknown() }).strict();
