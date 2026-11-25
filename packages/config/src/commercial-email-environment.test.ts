import { expect, it } from "vitest";
import { commercialEmailEnabled } from "./commercial-email-environment.js";
import { pilotApprovalFixture, unavailablePilotApproval } from "./policy-gates.pilot-test-fixture.js";

it.each([undefined, "", "production_billing", "production", "provider_sandbox", "pilot_no_charge"])(
  "refuses unapproved delivery in %s", mode => {
    expect(commercialEmailEnabled(mode, { JOBGUARD_ENV: mode })).toBe(false);
    expect(commercialEmailEnabled("synthetic_demo", { JOBGUARD_ENV: mode })).toBe(false);
  },
);

it("accepts only the matching synthetic deployment or a currently approved pilot", () => {
  expect(commercialEmailEnabled("synthetic_demo", { JOBGUARD_ENV: "synthetic_demo" })).toBe(true);
  expect(commercialEmailEnabled("pilot_no_charge", pilotApprovalFixture().env)).toBe(true);
  expect(commercialEmailEnabled("pilot_no_charge", unavailablePilotApproval("revoked"))).toBe(false);
});
