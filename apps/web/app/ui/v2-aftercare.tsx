"use client";
// V2-G9: the aftercare switch and the 6- and 12-month practice offers, mounted under G8's review request.
import { useCallback, useEffect, useRef, useState } from "react";
import { aftercareMessage, aftercareProblemText, aftercareSend, aftercareSentLine, aftercareStateLine, aftercareSwitchLabel,
  type AftercareState } from "./v2-aftercare-label";

type View = { enabled: boolean; state: AftercareState; months: 6 | 12 | null; nextAt: string | null; offers: { months: 6 | 12; sentAt: string }[] };

export function Aftercare({ jobId }: { jobId: string }) {
  const endpoint = `/api/jobs/${encodeURIComponent(jobId)}/handover/aftercare`;
  const [view, setView] = useState<View | null>(null), [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  // One command id per intent until a response arrives, so a retry records it once.
  const pending = useRef<{ key: string; commandId: string } | null>(null);
  const load = useCallback(async () => {
    const response = await fetch(endpoint, { cache: "no-store" });
    if (!response.ok) throw new Error();
    setView(await response.json() as View);
  }, [endpoint]);
  useEffect(() => { void load().catch(() => setNotice("Aftercare could not load. Reload to try again.")); }, [load]);

  async function post(key: string, body: Record<string, unknown>) {
    if (pending.current?.key !== key) pending.current = { key, commandId: crypto.randomUUID() };
    setBusy(true); setNotice("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, commandId: pending.current.commandId }) });
      const result = await response.json().catch(() => ({})) as View & { code?: string };
      if (!response.ok) { if (response.status !== 503) pending.current = null; setNotice(aftercareProblemText(result.code)); await load().catch(() => undefined); return; }
      pending.current = null; setView(result);
    } catch { setNotice("Result unknown. Reload before trying again."); }
    finally { setBusy(false); }
  }

  if (!view) return notice ? <p role="alert">{notice}</p> : null;
  return <div className="form" data-testid="aftercare">
    <label><input type="checkbox" checked={view.enabled} disabled={busy || view.state === "done"}
      onChange={event => void post(`switch:${event.target.checked}`, { version: "v2-aftercare-switch.v1", enabled: event.target.checked })}/>
    {" "}{aftercareSwitchLabel}</label>
    <p role="status">{aftercareStateLine(view)}</p>
    {view.offers.length > 0 && <ul aria-label="Aftercare offers">{view.offers.map(row => <li key={row.months}>{aftercareSentLine(row)}</li>)}</ul>}
    {view.state === "due" && view.months && <div className="form">
      <blockquote>{aftercareMessage(view.months)}</blockquote>
      <div className="form-actions"><button type="button" className="btn" disabled={busy}
        onClick={() => void post(`send:${view.months}`, { version: "v2-aftercare-send.v1" })}>{aftercareSend(view.months)}</button></div>
    </div>}
    {notice && <p role="alert">{notice}</p>}
  </div>;
}
