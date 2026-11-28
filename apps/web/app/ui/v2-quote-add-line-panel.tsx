"use client";
import { useState } from "react";
import type { QuoteLine } from "@jobguard/core";
import { jobPageFetch as fetch } from "./job-page-fetch";
import { addedLine, addLineAddedText, addLineButton, addLineCommand, addLineHeading, addLineHelp, addLineInputLabel,
  addLineProblemText, type AddLineReceipt } from "./v2-quote-add-line";

/** V2-C6: posts one add-line command and returns the new unpriced line, or the reason it was not added. */
export async function postAddLine(jobId: string, description: string, promptId?: string):
  Promise<{ line: QuoteLine; notice: string } | { line: null; notice: string }> {
  try {
    const response = await fetch(`/api/v2-backend/jobs/${encodeURIComponent(jobId)}/quotes/lines`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(addLineCommand(description, promptId)),
    });
    const body = await response.json().catch(() => null) as (AddLineReceipt & { code?: string }) | null;
    if (!response.ok || !body?.scopeItemId) return { line: null, notice: addLineProblemText(body?.code) };
    return { line: addedLine(body), notice: addLineAddedText(body.description) };
  } catch {
    return { line: null, notice: addLineProblemText(undefined) };
  }
}

/** The quote editor's "Add a line" box. Shown only where the prompts are, before the quote is sent. */
export function V2QuoteAddLine({ jobId, onAdded }: { jobId: string; onAdded: (line: QuoteLine) => void }) {
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  async function add() {
    if (busy || !description.trim()) return;
    setBusy(true);
    const result = await postAddLine(jobId, description);
    setBusy(false);
    setNotice(result.notice);
    if (result.line) { onAdded(result.line); setDescription(""); }
  }
  return (
    <section className="quote-add-line" aria-labelledby="quote-add-line-title" data-testid="v2-quote-add-line">
      <h2 id="quote-add-line-title">{addLineHeading}</h2>
      <label>{addLineInputLabel}<input aria-label={addLineInputLabel} maxLength={500} value={description}
        onChange={event => setDescription(event.target.value)}/></label>
      <small style={{ display: "block" }}>{addLineHelp}</small>
      <button type="button" disabled={busy || !description.trim()} onClick={() => void add()}>{addLineButton}</button>
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
