import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { StatementDetails, type StatementView } from "./enterprise-statement";
vi.stubGlobal("React", React);
it("traces statement delta through cumulative/prior fees, exact principal, allocations and balanced journals", () => {
  const view: StatementView = {
    statement: { id: "statement", period: "2026-10", revision: 1, predecessorId: null, contentHash: "hash", totalDeltaPence: 806, superseded: false, dispute: null, approval: null,
      sections: [{ agreementVersionId: "agreement", derivationId: "derivation", cumulativeFeePence: 806, priorNetPostedPence: 0, deltaPence: 806 }] },
    derivations: [{ id: "derivation", agreementVersionId: "agreement", period: "2026-10", recordedCutoff: "cutoff", inputHash: "input", cumulativeFeePence: 806, qualifyingPrincipal: { numerator: "250000", denominator: "31" },
      contributions: [{ extraId: "extra", originKind: "site_user", exportLineId: "export", allocationId: "allocation", runId: "run", rule: "pro_rata", qualifyingPrincipal: { numerator: "250000", denominator: "31" } }] }],
    postings: [{ id: "journal", kind: "accrual", agreementVersionId: "agreement", amountPence: 806, compensatesFeeId: null, environment: "synthetic_demo", lines: [
      { account: "contractor_fee_receivable", debitPence: 806, creditPence: 0 }, { account: "platform_fee_revenue", debitPence: 0, creditPence: 806 }] }],
  };
  const html = renderToStaticMarkup(<StatementDetails view={view} />);
  for (const text of ["Statement delta: £8.06", "Cumulative fee £8.06 less prior net posted £0.00", "250000/31 pence", "Extra extra", "export export", "allocation allocation", "run run", "input", "debit £8.06, credit £0.00", "debit £0.00, credit £8.06"]) expect(html).toContain(text);
});
