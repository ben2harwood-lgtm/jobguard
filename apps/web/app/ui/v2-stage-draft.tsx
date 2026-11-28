import React from "react";

// V2-K5B-1: a draft of a deposit or stage invoice. Text only; never an invoice, never numbered or sent.
export type StageDraftView = { draftNo: number; amount: string; extras: string[]; madeAt: string; withdrawnAt: string | null };
export const STAGE_DRAFT_LABEL = "Draft · not an invoice · not sent";
export const STAGE_DRAFT_VAT_NOTE = "VAT and the invoice number are added when it is issued. Issuing comes next.";

export function stageDraftLines(stageLabel: string, draft: StageDraftView) {
  return [STAGE_DRAFT_LABEL, `${stageLabel} · draft ${draft.draftNo}`, `£${draft.amount} net`,
    draft.extras.length ? `Includes extras: ${draft.extras.join(", ")}` : "Includes extras: none", STAGE_DRAFT_VAT_NOTE];
}

export function StageDraftCard({ stageLabel, draft, busy, onWithdraw }: {
  stageLabel: string; draft: StageDraftView; busy: boolean; onWithdraw: () => void;
}) {
  if (draft.withdrawnAt) return <p data-testid="stage-draft-withdrawn">{`${stageLabel} · draft ${draft.draftNo} withdrawn`}</p>;
  return <div data-testid="stage-draft" className="card" style={{ minWidth: 0 }}>
    {stageDraftLines(stageLabel, draft).map(line => <p key={line}>{line}</p>)}
    <button type="button" disabled={busy} onClick={onWithdraw}>Withdraw draft</button>
  </div>;
}
