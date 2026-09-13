import { describe, expect, it } from "vitest";
import { canTransitionJob, canTransitionProgress, projectPaymentStatus } from "./job.js";

describe("job lifecycle", () => {
  const legal = [
    ["draft","quoting","start_quote"], ["quoting","accepted","accept_quote"], ["quoting","lost","quote_lost"],
    ["accepted","live","switch_live"], ["accepted","quoting","cancel_acceptance"], ["live","invoiced","issue_invoice"],
    ["invoiced","paid","balance_settled"], ["paid","invoiced","payment_reversal"],
    ["paid","invoiced","additional_amount_due"], ["lost","quoting","reopen_quote"],
  ] as const;
  it.each(legal)("allows %s -> %s (%s)", (from,to,reason) => expect(canTransitionJob(from,to,reason)).toBe(true));
  it.each([
    ["draft","live","switch_live"], ["accepted","lost","quote_lost"], ["live","quoting","cancel_acceptance"],
    ["lost","live","switch_live"], ["paid","draft","payment_reversal"], ["accepted","quoting","reopen_quote"],
  ] as const)("rejects %s -> %s (%s)", (from,to,reason) => expect(canTransitionJob(from,to,reason)).toBe(false));
  it("projects settlement and reversals without a writable paid flag", () => {
    expect(projectPaymentStatus("invoiced",0,false)).toBe("paid");
    expect(projectPaymentStatus("paid",500,true)).toBe("invoiced");
  });
});

describe("progress lifecycle", () => {
  it.each([["not_started","in_progress","start"],["in_progress","complete","complete"],["complete","in_progress","rework"]] as const)
    ("allows %s -> %s", (from,to,reason) => expect(canTransitionProgress(from,to,reason)).toBe(true));
  it.each([["not_started","complete","complete"],["complete","not_started","rework"],["in_progress","not_started","start"]] as const)
    ("rejects %s -> %s", (from,to,reason) => expect(canTransitionProgress(from,to,reason)).toBe(false));
});
