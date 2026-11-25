"use client";
import React, { useEffect, useRef, useState } from "react";
import type { ChoiceAllowanceView } from "@jobguard/api/workspace";

type Form = { basis: "per_unit" | "total"; amount: string; quantity: string; unit: string; decideBy: string; item: string; chosen: string };
const formFor = (choice: ChoiceAllowanceView): Form => ({
  basis: choice.allowance?.basis ?? "per_unit", amount: choice.allowance?.amount ?? "",
  quantity: choice.allowance?.basis === "per_unit" ? choice.allowance.quantity : "", unit: choice.allowance?.basis === "per_unit" ? choice.allowance.unit : "",
  decideBy: choice.allowance?.decideBy ?? choice.neededBy, item: choice.chosen?.item ?? "", chosen: choice.chosen?.amount ?? "",
});
const per = (choice: ChoiceAllowanceView) => choice.allowance?.basis === "per_unit" ? ` per ${choice.allowance.unit}` : "";
const draftWords: Record<NonNullable<ChoiceAllowanceView["draft"]>["state"], string> = {
  being_drafted: "Being drafted", awaiting_approval: "Draft extra, waiting for your review in Extras",
  approved: "Extra approved", rejected: "Draft extra rejected",
};

export function V2ChoiceAllowances({ jobId }: { jobId: string }) {
  const [choices, setChoices] = useState<ChoiceAllowanceView[] | null>(null);
  const [forms, setForms] = useState<Record<string, Form>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef<{ fingerprint: string; commandId: string } | null>(null);
  const path = `/api/jobs/${jobId}/choice-allowances`;
  const show = (next: ChoiceAllowanceView[]) => {
    setChoices(next);
    setForms(Object.fromEntries(next.map(choice => [choice.factId, formFor(choice)])));
  };
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch(path, { cache: "no-store" });
        const data = await response.json();
        if (!active) return;
        if (!response.ok) { setError("Customer choices unavailable. Try again."); return; }
        show(data); setError("");
      } catch { if (active) setError("Customer choices unavailable. Try again."); }
    })();
    return () => { active = false; };
  }, [path]);
  const change = (factId: string, patch: Partial<Form>) => setForms(current => ({ ...current, [factId]: { ...current[factId]!, ...patch } }));
  const save = async (choice: ChoiceAllowanceView) => {
    const form = forms[choice.factId]!;
    const body = { version: "v2-choice-allowance-command.v1", factId: choice.factId, expectedVersion: choice.allowance?.version ?? 0,
      allowance: form.basis === "per_unit" ? { basis: "per_unit", amount: form.amount, quantity: form.quantity, unit: form.unit }
        : { basis: "total", amount: form.amount },
      decideBy: form.decideBy, chosen: form.item.trim() ? { item: form.item, amount: form.chosen } : null };
    const fingerprint = JSON.stringify(body);
    if (pending.current?.fingerprint !== fingerprint) pending.current = { fingerprint, commandId: crypto.randomUUID() };
    setBusy(true); setError("");
    try {
      const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, commandId: pending.current.commandId }) });
      const data = await response.json();
      if (!response.ok) {
        setError(data.code === "CHOICE_ALLOWANCE_VERSION_CONFLICT" ? "Someone else changed this choice. Reload before trying again."
          : data.code === "CHOICE_ALLOWANCE_DRAFT_REFUSED" ? "The extra could not be drafted. Switch the job live first, then try again."
          : "Could not save. Check the amounts (pounds, up to 2 decimal places) and dates.");
        return;
      }
      pending.current = null;
      show(data.choices);
    } catch { setError("Could not load the saved choice. Reload to check before trying again."); }
    finally { setBusy(false); }
  };
  return <section aria-labelledby="choice-allowances-heading" className="card" data-testid="v2-choice-allowances">
    <h2 id="choice-allowances-heading">Customer choices and allowances</h2>
    <p>Practice sandbox — synthetic data; nothing is sent or charged.</p>
    <p>A choice over its allowance drafts one extra for the difference. You review it in Extras; nothing is added to the price until you approve it. Amounts exclude VAT.</p>
    {error && <p role="alert">{error}</p>}
    {!choices && !error && <p>Loading customer choices…</p>}
    {choices?.length === 0 && <p>No customer choices logged yet. Log one as an open fact first.</p>}
    {choices && choices.length > 0 && <ul style={{ listStyle: "none", padding: 0 }}>{choices.map(choice => {
      const form = forms[choice.factId]!;
      return <li key={choice.factId} style={{ minWidth: 0, marginBottom: 24 }}>
        <h3>{choice.question}</h3>
        {choice.late === "overdue" && <p role="status"><strong>Late:</strong> not chosen by {choice.allowance?.decideBy}.</p>}
        {choice.late === "chosen_late" && <p role="status"><strong>Late:</strong> chosen after {choice.allowance?.decideBy}.</p>}
        {choice.allowance ? <p>Allowance £{choice.allowance.amount}{per(choice)}{choice.allowance.basis === "per_unit" ? ` for ${choice.allowance.quantity} ${choice.allowance.unit}` : " in total"} · decide by {choice.allowance.decideBy}</p>
          : <p>No allowance set.</p>}
        {choice.chosen && <p>Chosen: {choice.chosen.item} at £{choice.chosen.amount}{per(choice)}</p>}
        {choice.draft && <p>{draftWords[choice.draft.state]}{choice.draft.amount ? `: £${choice.draft.amount}` : ""}</p>}
        {choice.allowance && choice.chosen && !choice.draft && !choice.warning && <p>Within the allowance: no extra drafted.</p>}
        {choice.withdrawn.filter(entry => entry.outcome === "withdrawn").length > 0 && <p>Earlier draft withdrawn: superseded by a choice change.</p>}
        {choice.warning && <p role="alert">{choice.warning}</p>}
        {choice.unfinished && <p role="alert">This choice change is not finished yet. Reload to finish it.</p>}
        <form onSubmit={event => { event.preventDefault(); void save(choice); }}>
          <fieldset style={{ minWidth: 0 }}><legend>Allowance and choice</legend>
            <label>Allowance basis <select value={form.basis} onChange={event => change(choice.factId, { basis: event.target.value as Form["basis"] })}>
              <option value="per_unit">Per unit</option><option value="total">Total</option></select></label>
            <label>Allowance (£{form.basis === "per_unit" ? " per unit" : ""}) <input required inputMode="decimal" value={form.amount}
              onChange={event => change(choice.factId, { amount: event.target.value })}/></label>
            {form.basis === "per_unit" && <>
              <label>Quantity <input required inputMode="decimal" value={form.quantity} onChange={event => change(choice.factId, { quantity: event.target.value })}/></label>
              <label>Unit <input required maxLength={40} value={form.unit} onChange={event => change(choice.factId, { unit: event.target.value })}/></label>
            </>}
            <label>Decide by <input required type="date" value={form.decideBy} onChange={event => change(choice.factId, { decideBy: event.target.value })}/></label>
            <label>Chosen item <input maxLength={500} value={form.item} onChange={event => change(choice.factId, { item: event.target.value })}/></label>
            <label>Chosen price (£{form.basis === "per_unit" ? " per unit" : ""}) <input inputMode="decimal" required={Boolean(form.item.trim())} value={form.chosen}
              onChange={event => change(choice.factId, { chosen: event.target.value })}/></label>
            <button type="submit" disabled={busy}>{busy ? "Saving…" : "Save choice"}</button>
          </fieldset>
        </form>
      </li>;
    })}</ul>}
  </section>;
}
