import { z } from "zod";
export const identityChallengeMessage = z.object({
  version: z.literal("identity-email.v1"), category: z.literal("identity_challenge"),
  challengeId: z.guid({ error: "Invalid uuid" }), email: z.email({ error: "Invalid email" }), code: z.string().regex(/^\d{8}$/u),
  environment: z.enum(["synthetic_demo", "pilot_no_charge"]),
}).strict();
export const identityEmailV1 = identityChallengeMessage.extend({ environment: z.literal("synthetic_demo") });
export type IdentityChallenge = z.infer<typeof identityChallengeMessage>;
export interface IdentityChallengeDelivery {
  assertRecipient(email: string, environment: string): void;
  deliver(message: IdentityChallenge): Promise<unknown>;
}
export class IdentityRouteBlocked extends Error { readonly code = "IDENTITY_ROUTE_BLOCKED"; }
export function assertIdentityEmailEnabled(): void {
  if ((process.env.JOBGUARD_IDENTITY_EMAIL ?? "enabled") !== "enabled") {
    throw new IdentityRouteBlocked("Identity email delivery is disabled");
  }
}
/** D04 is proposed. No live transport can be constructed, regardless of a supplied mode flag. */
export class FixtureIdentityEmail implements IdentityChallengeDelivery {
  assertRecipient(email: string, environment: string): void {
    if (environment !== "synthetic_demo" || !email.toLowerCase().endsWith(".invalid")) throw new IdentityRouteBlocked("D04 has not approved an identity email route");
  }
  async deliver(raw: unknown): Promise<{ environment: "synthetic_demo"; externalActions: 0 }> {
    assertIdentityEmailEnabled();
    const message = identityEmailV1.parse(raw);
    this.assertRecipient(message.email, message.environment);
    // Local fixture transport. No SMTP/HTTP, logging, or commercial message body.
    return { environment: "synthetic_demo", externalActions: 0 };
  }
}
