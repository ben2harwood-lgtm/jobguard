"use client";
// V2-G8: the review-request switch and the one practice send, mounted under G3's releases.
import { useCallback, useEffect, useRef, useState } from "react";
import { reviewMessage, reviewProblemText, reviewSend, reviewStateLine, reviewSwitchLabel, type ReviewRequestState } from "./v2-review-request-label";

type View = { enabled: boolean; state: ReviewRequestState; dueAt: string | null; sentAt: string | null };

export function ReviewRequest({ jobId, refresh = 0 }: { jobId: string; refresh?: number }) {
  const endpoint = `/api/jobs/${encodeURIComponent(jobId)}/handover/review-request`;
  const [view, setView] = useState<View | null>(null), [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  // One command id per intent until a response arrives, so a retry records it once.
  const pending = useRef<{ key: string; commandId: string } | null>(null);
  const load = useCallback(async () => {
    const response = await fetch(endpoint, { cache: "no-store" });
    if (!response.ok) throw new Error();
    setView(await response.json() as View);
  }, [endpoint]);
  // refresh changes after a release or a stop on the same screen (Codex P2 on #1035).
  useEffect(() => { void load().catch(() => setNotice("The review request could not load. Reload to try again.")); }, [load, refresh]);

  async function post(key: string, body: Record<string, unknown>) {
    if (pending.current?.key !== key) pending.current = { key, commandId: crypto.randomUUID() };
    setBusy(true); setNotice("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, commandId: pending.current.commandId }) });
      const result = await response.json().catch(() => ({})) as View & { code?: string };
      if (!response.ok) { if (response.status !== 503) pending.current = null; setNotice(reviewProblemText(result.code)); await load().catch(() => undefined); return; }
      pending.current = null; setView(result);
    } catch { setNotice("Result unknown. Reload before trying again."); }
    finally { setBusy(false); }
  }

  if (!view) return notice ? <p role="alert">{notice}</p> : null;
  return <div className="form" data-testid="review-request">
    <label><input type="checkbox" checked={view.enabled} disabled={busy || view.state === "sent"}
      onChange={event => void post(`switch:${event.target.checked}`, { version: "v2-review-request-switch.v1", enabled: event.target.checked })}/>
    {" "}{reviewSwitchLabel}</label>
    <p role="status">{reviewStateLine(view)}</p>
    {view.enabled && <blockquote>{reviewMessage}</blockquote>}
    {view.state === "due" && <div className="form-actions">
      <button type="button" className="btn" disabled={busy} onClick={() => void post("send", { version: "v2-review-request-send.v1" })}>{reviewSend}</button>
    </div>}
    {notice && <p role="alert">{notice}</p>}
  </div>;
}
