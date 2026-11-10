import { expect, it } from "vitest";
import { decodeFinalCheckTypedText } from "./final-check-typed-text.js";

const diary = "also painted the hallway ceiling, customer asked";
const request = "Please paint the hallway ceiling as an extra.";
it.each([diary, "ALSO PAINTED THE HALLWAY CEILING, CUSTOMER ASKED!", "Painted hallway ceiling.", "I also painted the hallway ceiling as requested."])("recognises bounded completion with original citations: %s", text => {
  const result = decodeFinalCheckTypedText(text, null, "note_or_voice");
  expect(result).toMatchObject({ status: "proposal", proposal: { text, facts: { workReference: "practice:hallway-ceiling", status: "completed", estimatedValuePence: null }, citations: [{ start: 0, end: text.length, quote: text }] } });
});
it.each([request, "CAN YOU ALSO PAINT THE HALLWAY CEILING?", "Please fit the outside tap.", "Please install a cupboard!"])("recognises requests: %s", text => {
  expect(decodeFinalCheckTypedText(text, null, "customer_request")).toMatchObject({ status: "proposal", proposal: { facts: { status: "requested", estimatedValuePence: null } } });
});
it.each(["150 pounds.", "£150.", "150 quid.", "£150.00.", "150.01 pounds."])("parses exact bounded estimates: %s", amount => {
  expect(decodeFinalCheckTypedText(`${diary}. Estimated extra ${amount}`, null, "note_or_voice")).toMatchObject({ status: "proposal", proposal: { facts: { estimatedValuePence: amount.includes("150.01") ? 15001 : 15000 } } });
});
it.each(["3 hours.", "£150.001.", "-150 pounds.", "£10000000000.01.", "£150 or £200.", "150 pounds. Estimated extra £200."])("keeps invalid/conflicting estimates unknown: %s", amount => {
  expect(decodeFinalCheckTypedText(`${diary}. Estimated extra ${amount}`, null, "note_or_voice")).toMatchObject({ status: "proposal", proposal: { facts: { estimatedValuePence: null } } });
});
it.each(["Weather was sunny today.", "Do not paint the hallway ceiling.", "Painted the ceiling; there is a safety risk", "Please paint the hallway ceiling; written agreement is legally required.", "Painted hallway ceiling for 3 hours.", "Painted hallway ceiling. Estimated extra £150. There is a safety risk.", "Painted hallway ceiling. Estimated extra £150. Written agreement is legally required."])("readable outside grammar is examined without inventing facts: %s", text => {
  expect(decodeFinalCheckTypedText(text, null, "note_or_voice")).toEqual({ status: "readable" });
});
it("preserves legacy identity and must-surface fixtures before any grammar", () => {
  expect(decodeFinalCheckTypedText("Painted the hallway ceiling as asked, three hours extra, about 150 pounds", null, "note_or_voice")).toMatchObject({ status: "proposal", proposal: { facts: { workReference: "practice:hallway-ceiling", estimatedValuePence: 15000 } } });
  expect(decodeFinalCheckTypedText("Fictional practice customer request: please build a garden room for £8,000 net; written agreement is required before work starts.", null, "customer_request")).toMatchObject({ status: "proposal", proposal: { facts: { needsPriorWrittenAgreement: true, significantWork: { significant: true } } } });
  expect(decodeFinalCheckTypedText(diary, "unknown-fixture", "note_or_voice")).toEqual({ status: "invalid" });
  expect(decodeFinalCheckTypedText("", null, "note_or_voice")).toEqual({ status: "invalid" });
});
it("uses the same work identity for fit/install requests and completions", () => {
  const requested = decodeFinalCheckTypedText("Please install a cupboard.", null, "customer_request");
  const completed = decodeFinalCheckTypedText("Also fitted the cupboard, customer requested for it.", null, "note_or_voice");
  expect(requested.status).toBe("proposal"); expect(completed.status).toBe("proposal");
  if (requested.status === "proposal" && completed.status === "proposal")
    expect(requested.proposal.facts.workReference).toBe(completed.proposal.facts.workReference);
});
