import type { Pool } from "pg";
import { CustomerInvoiceApplication } from "../customer-invoice.application.js";
import { FinalAccountLockApplication } from "../final-account-lock.application.js";
import { FinalCheckApplication } from "../final-check.application.js";
import { JobSourceApplication } from "../job-source.application.js";
import { afterEach, expect, it, vi } from "vitest";
import { PilotG1DeniedError, PolicyGateDeniedError, proposedDecisionRecords } from "@jobguard/config";
import { pilotApprovalFixture, unavailablePilotApproval, unavailablePilotApprovals } from "../../../../packages/config/dist/policy-gates.pilot-test-fixture.js";
import { dispatchToProvider, executePracticeDispatch } from "./provider-dispatch.js";
import { issueTaxInvoice } from "./tax-invoice.js";

afterEach(() => vi.unstubAllEnvs());
function configure(env: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
}

it.each([[dispatchToProvider, proposedDecisionRecords.D04, "D02"], [issueTaxInvoice, proposedDecisionRecords.D02, "D04"]] as const)(
  "requires the effect decision even when G1 is open (%s)", (effect, proposed, wrongId) => {
    configure(pilotApprovalFixture().env);
    const approved = { ...proposed, status: "approved" } as const;
    for (const record of [undefined, proposed, { ...approved, id: wrongId }, { ...approved, policyVersion: "wrong" },
      { ...approved, status: "superseded" }] as const) {
      expect(() => effect("pilot_no_charge", record)).toThrow(PolicyGateDeniedError);
    }
    expect(effect("pilot_no_charge", approved)).toBe("gate_passed");
  },
);

it.each(unavailablePilotApprovals)("refuses effects and previously queued dispatch when evidence is %s", async (_name, value) => {
  configure(unavailablePilotApproval(value));
  expect(() => dispatchToProvider("pilot_no_charge", { ...proposedDecisionRecords.D04, status: "approved" })).toThrow(PilotG1DeniedError);
  expect(() => issueTaxInvoice("pilot_no_charge", { ...proposedDecisionRecords.D02, status: "approved" })).toThrow(PilotG1DeniedError);
  const execute = vi.fn();
  await expect(executePracticeDispatch("pilot_no_charge", execute)).rejects.toThrow(PilotG1DeniedError);
  expect(execute).not.toHaveBeenCalled();
});

it("approved pilot evidence never selects the practice dispatcher", async () => {
  configure(pilotApprovalFixture().env);
  const execute = vi.fn();
  await expect(executePracticeDispatch("pilot_no_charge", execute)).rejects.toThrow("PILOT_OUTBOUND_ADAPTER_UNAVAILABLE");
  expect(execute).not.toHaveBeenCalled();
});

it.each(unavailablePilotApprovals)("refuses direct invoice and Final Check calls at %s evidence", async (_name, value) => {
  configure(unavailablePilotApproval(value));
  const query = vi.fn(), connect = vi.fn();
  const pool = { query, connect } as unknown as Pool;
  const job = "10000000-0000-4000-8000-000000000001";
  await expect(new CustomerInvoiceApplication(pool).issue(job, {})).rejects.toThrow(PilotG1DeniedError);
  await expect(new FinalAccountLockApplication(pool).issueInvoice(job, {})).rejects.toThrow(PilotG1DeniedError);
  const check = new FinalCheckApplication(pool);
  await expect(check.get(job)).rejects.toThrow(PilotG1DeniedError);
  await expect(check.requestRun(job, {})).rejects.toThrow(PilotG1DeniedError);
  expect(() => new JobSourceApplication(pool)).toThrow("SYNTHETIC_MODE_REQUIRED");
  expect(query).not.toHaveBeenCalled();
  expect(connect).not.toHaveBeenCalled();
});
