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

describe.each([
  ["tax invoice issue", issueTaxInvoice, proposedDecisionRecords.D02],
  ["provider dispatch", dispatchToProvider, proposedDecisionRecords.D04],
] as const)("deployment mode policy gate: %s", (_name, effect, decision) => {
  it.each([undefined, "", "production", "disabled", "Production_billing", "random-mode-91"])(
    "requires matching approval for unknown runtime mode %s", rawMode => {
      // Simulate runtime configuration bypassing the compile-time mode type.
      const mode = rawMode as Parameters<typeof effect>[0];
      expect(() => effect(mode, decision)).toThrow(PolicyGateDeniedError);
      expect(effect(mode, { ...decision, status: "approved" })).toBe("gate_passed");
      const otherDecision = decision.id === "D02" ? proposedDecisionRecords.D04 : proposedDecisionRecords.D02;
      expect(() => effect(mode, { ...otherDecision, status: "approved" })).toThrow(PolicyGateDeniedError);
    },
  );

  it.each(["synthetic_demo", "pilot_no_charge", "provider_sandbox", "production_billing"] as const)(
    "preserves known mode %s", mode => {
      if (mode === "production_billing") {
        expect(() => effect(mode, decision)).toThrow(PolicyGateDeniedError);
      } else {
        expect(effect(mode, decision)).toBe("gate_passed");
      }
      expect(effect(mode, { ...decision, status: "approved" })).toBe("gate_passed");
    },
  );
});
