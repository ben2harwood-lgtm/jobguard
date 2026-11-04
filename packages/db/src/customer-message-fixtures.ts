import type { Observation } from "@jobguard/core";

export const CUSTOMER_MESSAGE_SAFETY_FIXTURE = "customer-message:exposed-wires.synthetic.v1";
export const CUSTOMER_MESSAGE_SAFETY_TEXT = "There are exposed live wires beside the new socket.";

/** Exact synthetic original only. No production classifier, threshold or request-supplied rule facts. */
export function decodeCustomerMessageFixture(reference: string | null, text: string, kind: Observation["kind"]): Pick<Observation, "text" | "facts" | "citations"> | null {
 if (reference !== CUSTOMER_MESSAGE_SAFETY_FIXTURE || text !== CUSTOMER_MESSAGE_SAFETY_TEXT || kind !== "customer_request") return null;
 return { text, citations: [{ start: 0, end: text.length, quote: text }], facts: {
  workReference: "synthetic:exposed-wires", scopeArea: "job", description: "exposed live wires", status: "requested", estimatedValuePence: null,
  safetyImplication: true, customerClearlyRequested: false, needsPriorWrittenAgreement: false, significantWork: null,
  activeDispute: false, silenceMateriallyWorsensDispute: false, disclosureDuty: false,
 } };
}
