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

// Explicit grammar table (ACTION = paint/painted, fit/fitted, install/installed;
// ITEM = existing nouns/locations plus distinct heated towel rail and towel rail):
// Form                 | Statement body                              | Diary requirement
// extra noun           | extra/additional/added ITEM                 | completed ACTION it today
// extra action         | ACTION ITEM as an extra/as well/on top      | completed ACTION
// site request         | Customer asked for an extra ITEM while ...  | completed ACTION it today
// customer go-ahead    | [Hi, yes] please go ahead and ACTION ITEM... | customer request only
// price                | Agreed MONEY / MONEY is fine / Estimated extra: MONEY / attached MONEY
// Entire statements, optional price sentences and terminal Thanks are tested below.
const ordinaryGrammar = [
  ["Customer asked for an extra heated towel rail while we were on site. Agreed 180 pounds. Fitted it today.", "note_or_voice", 18000],
  ["Hi, yes please go ahead and fit the heated towel rail as well. 180 pounds is fine. Thanks.", "customer_request", 18000],
  ["extra towel rail", "customer_request", null],
  ["Customer asked for an extra heated towel rail while we were on site. Agreed £180.", "customer_request", 18000],
  ["Customer asked for an extra heated towel rail while we were on site. Installed it today.", "note_or_voice", null],
  ["Please go ahead and install the towel rail as well.", "customer_request", null],
  ["Hi, yes, please go ahead and paint the kitchen ceiling as well. Thanks.", "customer_request", null],
  ["additional towel rail", "customer_request", null],
  ["added towel rail. Installed it today.", "note_or_voice", null],
  ["Fitted the towel rail as an extra £180", "note_or_voice", 18000],
  ["Installed the towel rail as well 180 quid", "note_or_voice", 18000],
  ["Painted the kitchen ceiling on top £180.00", "note_or_voice", 18000],
  ["Painted the kitchen ceiling as an extra, customer asked for it. Estimated extra: £150", "note_or_voice", 15000],
] as const;
it.each(ordinaryGrammar)("ordinary grammar: %s", (text, kind, estimatedValuePence) => {
  expect(decodeFinalCheckTypedText(text, null, kind)).toMatchObject({ status: "proposal", proposal: {
    facts: { estimatedValuePence }, text, citations: [{ start: 0, end: text.length, quote: text }],
  } });
});
it.each(["£180", "180 pounds", "180 quid", "£180.00"])("one complete money token: %s", amount => {
  expect(decodeFinalCheckTypedText(`Fitted the towel rail as an extra. Agreed ${amount}.`, null, "note_or_voice"))
    .toMatchObject({ status: "proposal", proposal: { facts: { estimatedValuePence: 18000 } } });
});
it.each(["£180 or £180", "£180 or £200", "£180.001", "-180 pounds", "£10000000000.01", "3 hours", "£180. Agreed £180"])("unclear money stays a possible extra: %s", amount => {
  expect(decodeFinalCheckTypedText(`Fitted the towel rail as an extra. Agreed ${amount}.`, null, "note_or_voice"))
    .toMatchObject({ status: "proposal", ambiguousPrice: true, proposal: { facts: { estimatedValuePence: null } } });
});
const refusals = ["The agreed job price is £180", "added 180 pounds", "12/11/2026", "07123456789", "3 hours", "2 items", "no extra charge", "included in the agreed price", "not extra", "cancelled work", "Do not fit the towel rail as an extra", "Please do not go ahead and fit the towel rail as well"];
it.each(refusals)("refuses alone and beside a work noun: %s", text => {
  for (const statement of [text, `${text}. Heated towel rail.`, `Fitted the heated towel rail as an extra. ${text}.`])
    for (const kind of ["note_or_voice", "customer_request"] as const)
      expect(decodeFinalCheckTypedText(statement, null, kind).status).not.toBe("proposal");
});
it.each(["There is a safety risk", "Written agreement is legally required", "There is an active dispute", "Do not proceed"])("does not discard trailing clauses: %s", clause => {
  expect(decodeFinalCheckTypedText(`Fitted the towel rail as an extra. Agreed £180. ${clause}.`, null, "note_or_voice").status).not.toBe("proposal");
});
it("pronouns stay local, diary work needs completion, and towel descriptions stay distinct", () => {
  for (const text of ["Fitted it today. Agreed £180.", "Customer asked for an extra heated towel rail while we were on site.", "extra towel rail", "added towel rail"])
    expect(decodeFinalCheckTypedText(text, null, "note_or_voice").status).not.toBe("proposal");
  const refs = ["heated towel rail", "towel rail"].map(item => decodeFinalCheckTypedText(`Fitted the ${item} as an extra.`, null, "note_or_voice"));
  expect(refs.every(r => r.status === "proposal")).toBe(true);
  if (refs[0]!.status === "proposal" && refs[1]!.status === "proposal") expect(refs[0]!.proposal.facts.workReference).not.toBe(refs[1]!.proposal.facts.workReference);
});

it.each(["Agreed £180", "The agreed job price is £180. Fitted the towel rail."])("agreed alone never establishes added work: %s", text => {
  expect(decodeFinalCheckTypedText(text, null, "note_or_voice").status).not.toBe("proposal");
});

it("both verbatim towel-rail originals keep one stable identity and their own exact citations", () => {
  const results = ordinaryGrammar.slice(0,2).map(([text,kind])=>decodeFinalCheckTypedText(text,null,kind));
  expect(results.every(r=>r.status === "proposal")).toBe(true);
  if (results[0]!.status === "proposal" && results[1]!.status === "proposal")
    expect(results[0]!.proposal.facts.workReference).toBe(results[1]!.proposal.facts.workReference);
});
