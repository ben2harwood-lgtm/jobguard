import { subscriptionConsentText } from "@jobguard/core";
import { PlanScreen } from "./plan-screen";
export default function PlansPage() { return <PlanScreen consentTerms={<p data-testid="subscription-consent">{subscriptionConsentText}</p>} consentText={subscriptionConsentText} />; }
