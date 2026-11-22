import { commercialEmailEnabled } from "@jobguard/config";
import { FixtureIdentityEmail, IdentityRouteBlocked, type IdentityChallengeDelivery } from "../auth/identity-email.js";
import { isFictionalEmailRecipient, type CommercialEmail, type CommercialEmailDelivery, type EmailDeliveryOutcome } from "./commercial-email.js";

type FixtureOutcome = EmailDeliveryOutcome["kind"];
type DeliveryRecord = Readonly<{ request: Readonly<{ category: "identity_challenge" | "commercial"; id: string }>; outcome: EmailDeliveryOutcome }>;

/** Local fixture delivery. Keep codes, links, recipients and bodies out of the recording. */
export class FakeEmail {
  private readonly history: DeliveryRecord[] = [];

  constructor(private readonly commercialOutcomes: readonly FixtureOutcome[] = [], private readonly recordHistory = true) {}

  get records(): readonly DeliveryRecord[] { return this.history.slice(); }

  identity(): IdentityChallengeDelivery {
    const fixture = new FixtureIdentityEmail();
    const assertRecipient: IdentityChallengeDelivery["assertRecipient"] = (email, mode) => {
      if (!commercialEmailEnabled(mode, process.env)) throw new IdentityRouteBlocked("D04 identity fixture route is unavailable");
      fixture.assertRecipient(email, mode);
    };
    return {
      assertRecipient,
      deliver: async message => {
        assertRecipient(message.email, message.environment);
        const result = await fixture.deliver(message);
        this.record("identity_challenge", message.challengeId, "delivered");
        return result;
      },
    };
  }

  commercial(): CommercialEmailDelivery {
    const outcomes = this.commercialOutcomes.values();
    return {
      deliver: async (email: CommercialEmail) => {
        if (!commercialEmailEnabled(process.env.JOBGUARD_ENV, process.env)) throw new Error("EMAIL_ADAPTER_UNAVAILABLE");
        if (email.recipient === null || !isFictionalEmailRecipient(email.recipient)) throw new Error("EMAIL_ACTION_MISMATCH");
        return this.record("commercial", email.id, outcomes.next().value ?? "delivered");
      },
    };
  }

  private record(category: DeliveryRecord["request"]["category"], id: string, kind: FixtureOutcome): EmailDeliveryOutcome {
    const outcome = Object.freeze(kind === "delivered" ? { kind, receipt: `fixture:${id}` } : { kind });
    if (this.recordHistory) this.history.push(Object.freeze({ request: Object.freeze({ category, id }), outcome }));
    return outcome;
  }
}
