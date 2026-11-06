"use client";
import { useEffect, useState } from "react";
import type { DebitPracticeView } from "@jobguard/api/direct-debit-practice-contracts";
export function DirectDebitPracticeScreen({ jobId }: { jobId: string }) {
  const [view, setView] = useState<DebitPracticeView | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const url = `/api/jobs/${encodeURIComponent(jobId)}/direct-debit-practice`;
  useEffect(() => {
    let active = true;
    void fetch(url, { cache: "no-store", credentials: "same-origin" }).then(async response => {
      if (!response.ok) throw new Error();
      const data = await response.json() as DebitPracticeView;
      if (active) setView(data);
    }).catch(() => { if (active) setError("Practice history unavailable. Refresh to try again."); });
    return () => { active = false; };
  }, [url]);
  async function advance() {
    if (!view?.nextAction) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(url, { method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(view.nextAction) });
      if (!response.ok) throw new Error();
      setView(await response.json() as DebitPracticeView);
    } catch { setView(null); setError("Practice history unavailable. Refresh to try again."); }
    finally { setBusy(false); }
  }
  return <main className="workspace-page" style={{ overflowWrap: "anywhere" }}>
    <h1>Practice Direct Debit lifecycle</h1>
    <p>Fictional practice only. No bank or real Direct Debit is involved. No money is collected.</p>
    {error && <p role="alert">{error}</p>}
    {view && <>
      <DirectDebitPracticeHistory view={view} />
      <button disabled={busy || !view.nextAction} onClick={() => void advance()}>{view.nextAction ? "Show next practice event" : "Practice sequence complete"}</button>
    </>}
  </main>;
}

export function DirectDebitPracticeHistory({ view }: { view: DebitPracticeView }) {
  return <>
      <h2>{view.mandate}</h2>
      <p>{view.blocksNewCollection ? "New collection blocked by mandate state." : "Practice mandate active."}</p>
      {view.payments.map(payment => <p key={payment.label}>{payment.label}: {payment.state}</p>)}
      <h2>Stored history</h2>
      <ol>{view.history.map(row => <li key={row.sequence}>{row.label}{row.current ? " (current)" : ""}</li>)}</ol>
  </>;
}
