import { PolicyGateDeniedError, proposedDecisionRecords } from "@jobguard/config";
import { describe, expect, it } from "vitest";
import { postFeeObligation } from "./fee-posting.js";
import { dispatchToProvider } from "./provider-dispatch.js";
import { issueTaxInvoice } from "./tax-invoice.js";

describe("production policy gates", () => {
  it.each([
    ["plan/recovery fee posting", postFeeObligation, proposedDecisionRecords.D01],
    ["tax invoice issue", issueTaxInvoice, proposedDecisionRecords.D02],
    ["provider dispatch", dispatchToProvider, proposedDecisionRecords.D04],
  ] as const)("denies %s while its decision is proposed", (_name, effect, decision) => {
    expect(() => effect("production_billing", decision)).toThrow(PolicyGateDeniedError);
    expect(() => effect("production_billing", decision)).toThrow(decision.id);
  });

  it("allows synthetic development without implying approval", () => {
    expect(postFeeObligation("synthetic_demo", proposedDecisionRecords.D01)).toBe("gate_passed");
  });
});
