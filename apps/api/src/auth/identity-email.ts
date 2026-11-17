import { z } from "zod";
export const identityEmailV1 = z.object({
  version: z.literal("identity-email.v1"), category: z.literal("identity_challenge"),
  challengeId: z.string().uuid(), email: z.string().email(), code: z.string().regex(/^\d{8}$/u),
  environment: z.literal("synthetic_demo"),
}).strict();
export class IdentityRouteBlocked extends Error { readonly code = "IDENTITY_ROUTE_BLOCKED"; }
/** D04 is proposed. No live transport can be constructed, regardless of a supplied mode flag. */
export class FixtureIdentityEmail {
  assertRecipient(email: string, environment: string): void {
    if (environment !== "synthetic_demo" || !email.toLowerCase().endsWith(".invalid")) throw new IdentityRouteBlocked("D04 has not approved an identity email route");
  }
  async deliver(raw: unknown): Promise<{ environment: "synthetic_demo"; externalActions: 0 }> {
    const message = identityEmailV1.parse(raw);
    this.assertRecipient(message.email, message.environment);
    // Local fixture transport. No SMTP/HTTP, logging, or commercial message body.
    return { environment: "synthetic_demo", externalActions: 0 };
  }
}
