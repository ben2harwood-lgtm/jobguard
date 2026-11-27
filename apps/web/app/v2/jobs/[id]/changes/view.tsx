"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeDraftLineRow, ChangeDraftRow } from "@jobguard/api/workspace";
import { changeDescription, changeMaterialsLine, changePendingNote, changePriceLine, changeProblemText, changeStateLabel,
  changeTimeLine, penceFromPounds, pounds } from "../../../../ui/v2-change-draft-label";

type State = { lines: ChangeDraftLineRow[]; drafts: ChangeDraftRow[] };
type Preview = { delta: string; direction: "addition" | "omission"; previewPence: number;
  priceProposal: { quantity: string; unit: string; unitRatePence: number };
  tasks: { taskKey: string; title: string; proposedMinutes: number; materialNeeds: string[] }[] };
type Revise = { variationId: string; expectedRevisionId: string } | null;
type Inputs = { lineId: string; quantity: string; rate: string };
const sameInputs = (a: Inputs, b: Inputs) => a.lineId === b.lineId && a.quantity === b.quantity && a.rate === b.rate;

export function ChangeDrafts({ jobId }: { jobId: string }) {
  const endpoint = `/api/jobs/${encodeURIComponent(jobId)}/change-drafts`;
  const [state, setState] = useState<State | null>(null), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  const [lineId, setLineId] = useState(""), [quantity, setQuantity] = useState(""), [rate, setRate] = useState("");
  const [preview, setPreview] = useState<(Preview & { inputs: Inputs }) | null>(null), [minutes, setMinutes] = useState<Record<string, string>>({});
  const [revise, setRevise] = useState<Revise>(null);
  // One command id per drafted change until a response arrives, so a retried Confirm prices once.
  const pending = useRef<{ key: string; commandId: string } | null>(null);
  const load = useCallback(async () => {
    const response = await fetch(endpoint, { cache: "no-store" });
    if (!response.ok) throw new Error();
    setState(await response.json() as State);
  }, [endpoint]);
  useEffect(() => { void load().catch(() => setNotice("Sign in to the correct practice firm to change quantities.")); }, [load]);
  const line = state?.lines.find(row => row.quoteLineId === lineId) ?? null;
  // The inputs as they are now, read after a request returns: a preview for older inputs is discarded.
  const inputs = useRef<Inputs>({ lineId, quantity: quantity.trim(), rate });
  inputs.current = { lineId, quantity: quantity.trim(), rate };

  async function post(body: Record<string, unknown>) {
    setBusy(true); setNotice("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => ({})) as { code?: string };
      if (!response.ok) {
        if (response.status !== 503) pending.current = null;
        setNotice(changeProblemText(result.code));
        if (response.status === 409) await load().catch(() => undefined);
        return null;
      }
      pending.current = null;
      return result;
    } catch { setNotice("Result unknown. Reload before trying again."); return null; }
    finally { setBusy(false); }
  }

  function pick(id: string, reviseFrom: Revise = null) {
    const next = state?.lines.find(row => row.quoteLineId === id);
    setLineId(id); setPreview(null); setRevise(reviseFrom); setQuantity("");
    setRate(next?.unitRatePence === null || next?.unitRatePence === undefined ? "" : (next.unitRatePence / 100).toFixed(2));
  }

  async function draft() {
    const asked = { ...inputs.current };
    const unitRatePence = penceFromPounds(rate);
    // Changing a draft again: that draft is the one being replaced, so it is not a separate pending change.
    const result = await post({ version: "v2-change-draft-preview.v1", quoteLineId: lineId, newQuantity: quantity.trim(),
      ...(unitRatePence !== null && { unitRatePence }), ...(revise && { variationId: revise.variationId }) }) as Preview | null;
    if (result && !sameInputs(asked, inputs.current)) return;
    if (result) { setPreview({ ...result, inputs: asked }); setMinutes(Object.fromEntries(result.tasks.map(task => [task.taskKey, String(task.proposedMinutes)]))); }
  }

  async function confirm() {
    if (!preview || !line) return;
    // Confirm only the inputs the shown preview was drafted from.
    if (!sameInputs(preview.inputs, inputs.current)) { setPreview(null); return; }
    const body = { version: "v2-change-draft-command.v1", newQuantity: quantity.trim(), unitRatePence: preview.priceProposal.unitRatePence,
      description: changeDescription(line.description, quantity.trim(), line.unit ?? ""),
      tasks: preview.tasks.map(task => ({ taskKey: task.taskKey, proposedMinutes: Math.max(0, Math.round(Number(minutes[task.taskKey] ?? task.proposedMinutes))) })),
      ...(revise ? { action: "revise", ...revise } : { action: "confirm", quoteLineId: lineId }) };
    const key = JSON.stringify(body);
    if (pending.current?.key !== key) pending.current = { key, commandId: crypto.randomUUID() };
    if (await post({ ...body, commandId: pending.current.commandId })) { setPreview(null); setLineId(""); setRevise(null); await load(); }
  }

  async function addTime(row: ChangeDraftRow) {
    if (await post({ version: "v2-change-draft-command.v1", action: "add_time", revisionId: row.revisionId })) await load();
  }

  return <main style={{ maxWidth: 760, margin: "0 auto", padding: 16, overflowWrap: "anywhere" }} data-testid="change-drafts">
    <h1>Change a quantity</h1>
    <p>Practice job. A change is priced as a variation of the agreed quote, and goes to the customer to agree.</p>
    {notice && <p role="alert">{notice}</p>}
    <section aria-label="Change a quantity">
      <label style={{ display: "block" }}>Quote line<select value={lineId} disabled={busy} onChange={event => pick(event.target.value)}>
        <option value="">Choose a line</option>
        {state?.lines.map(row => <option key={row.quoteLineId} value={row.quoteLineId}>
          {row.description}{row.quantity ? ` · ${row.quantity} ${row.unit ?? ""}` : ""}</option>)}
      </select></label>
      {line && <>
        {revise && <p>Changing the quantity again makes a new version. The customer agrees the new version.</p>}
        <p>Agreed: {line.quantity ?? "no quantity"} {line.unit ?? ""}{line.unitRatePence !== null ? ` at ${pounds(line.unitRatePence)} per ${line.unit}` : ""}</p>
        <label style={{ display: "block" }}>New total quantity<input inputMode="decimal" value={quantity} onChange={event => { setQuantity(event.target.value); setPreview(null); }}/></label>
        <label style={{ display: "block" }}>Rate per {line.unit ?? "unit"} (£)<input inputMode="decimal" value={rate} onChange={event => { setRate(event.target.value); setPreview(null); }}/></label>
        <button type="button" disabled={busy || !quantity.trim()} onClick={() => void draft()}>Draft the change</button>
      </>}
      {preview && line && <section aria-label="Drafted change">
        <p>{changePriceLine({ ...preview, unit: preview.priceProposal.unit, unitRatePence: preview.priceProposal.unitRatePence })}</p>
        {preview.tasks.filter(task => task.proposedMinutes > 0).map(task => <p key={task.taskKey}>{changeTimeLine(task.title, Number(minutes[task.taskKey] ?? task.proposedMinutes))}</p>)}
        {preview.direction === "addition" && preview.tasks.map(task => <label key={task.taskKey} style={{ display: "block" }}>Extra minutes: {task.title}
          <input inputMode="numeric" value={minutes[task.taskKey] ?? ""} onChange={event => setMinutes(rows => ({ ...rows, [task.taskKey]: event.target.value }))}/></label>)}
        {changeMaterialsLine(preview.tasks) && <p>{changeMaterialsLine(preview.tasks)}</p>}
        <button type="button" disabled={busy} onClick={() => void confirm()}>Confirm the price</button>
      </section>}
    </section>
    <section aria-label="Pending changes">
      <h2>Pending changes</h2>
      <p>{changePendingNote}</p>
      {!state?.drafts.length && <p>No changes yet.</p>}
      {state?.drafts.map(row => <article key={row.revisionId} aria-label={`Change version ${row.revision}: ${row.lineDescription}`}>
        <p><strong>{row.lineDescription}</strong> · {row.acceptedQuantity} to {row.newQuantity} {row.unit} · version {row.revision} · {pounds(row.signedDeltaPence)}</p>
        {row.tasks.filter(task => task.proposedMinutes > 0).map(task => <p key={task.taskKey}>{changeTimeLine(task.title, task.proposedMinutes)}</p>)}
        <p data-testid="change-state">{changeStateLabel(row)}</p>
        {row.current && row.state === "priced" && <p>
          <a href={`/v2/jobs/${encodeURIComponent(jobId)}/extra-links`}>Send for approval</a>{" "}
          <button type="button" disabled={busy} onClick={() => pick(row.quoteLineId, { variationId: row.variationId, expectedRevisionId: row.revisionId })}>Change the quantity again</button>
        </p>}
        {row.current && row.state === "approved" && !row.timeOnPlan && row.tasks.some(task => task.proposedMinutes > 0) &&
          <button type="button" disabled={busy} onClick={() => void addTime(row)}>Add the extra time to the plan</button>}
      </article>)}
    </section>
  </main>;
}
