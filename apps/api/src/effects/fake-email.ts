import { FixtureIdentityEmail, type IdentityChallengeDelivery } from "../auth/identity-email.js";
import type { CommercialEmail, CommercialEmailDelivery, EmailDeliveryOutcome } from "./commercial-email.js";

type FixtureOutcome = EmailDeliveryOutcome["kind"];
type DeliveryRecord = Readonly<{ request: Readonly<{ category: "identity_challenge" | "commercial"; id: string }>; outcome: EmailDeliveryOutcome }>;

/** Constructed explicitly by isolated tests. Keep codes, links, recipients and bodies out of the recording. */
export class FakeEmail {
  private readonly history: DeliveryRecord[] = [];

  constructor(private readonly commercialOutcomes: readonly FixtureOutcome[] = []) {}

  get records(): readonly DeliveryRecord[] { return this.history.slice(); }

  identity(): IdentityChallengeDelivery {
    const fixture = new FixtureIdentityEmail();
    return {
      assertRecipient: (email, mode) => fixture.assertRecipient(email, mode),
      deliver: async message => {
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
        if (process.env.JOBGUARD_ENV === "pilot_no_charge") throw new Error("EMAIL_ADAPTER_UNAVAILABLE");
        return this.record("commercial", email.id, outcomes.next().value ?? "delivered");
      },
    };
  }

  private record(category: DeliveryRecord["request"]["category"], id: string, kind: FixtureOutcome): EmailDeliveryOutcome {
    const outcome = Object.freeze(kind === "delivered" ? { kind, receipt: `fixture:${id}` } : { kind });
    this.history.push(Object.freeze({ request: Object.freeze({ category, id }), outcome }));
    return outcome;
  }
}
