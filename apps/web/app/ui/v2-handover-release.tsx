"use client";
// V2-G3 (Q57): "Release this version" and the release history, mounted in G2's Version history card.
import { useCallback, useEffect, useRef, useState } from "react";
import type { HandoverRelease } from "@jobguard/api/workspace";
import { earlierContact, linkStoppable, releaseBlocked, releaseIndependent, releaseLine, releaseLinkNote, releaseProblemText, releaseToCurrent,
  stopLink, stopProblemText, stopReasonLabel } from "./v2-handover-release-label";

type View = { siteComplete: boolean; releases: HandoverRelease[] };

/** onChanged (V2-G8): told after a release or a stop is saved, so the review request re-reads its state. */
export function HandoverReleases({ jobId, versions, onChanged }: { jobId: string; versions: number[]; onChanged?: () => void }) {
  const endpoint = `/api/jobs/${encodeURIComponent(jobId)}/handover/releases`;
  const [view, setView] = useState<View | null>(null), [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  const [link, setLink] = useState<{ version: number; url: string } | null>(null);
  // One command id per version until a response arrives, so a retried release makes one link.
  const pending = useRef<{ version: number; commandId: string } | null>(null);
  // V2-G4: the reason box for one link at a time, with its own retry-safe command id.
  const [stopping, setStopping] = useState<{ releaseId: string; reason: string } | null>(null);
  const stopCommand = useRef<{ releaseId: string; commandId: string } | null>(null);
  const load = useCallback(async () => {
    const response = await fetch(endpoint, { cache: "no-store" });
    if (!response.ok) throw new Error();
    setView(await response.json() as View);
  }, [endpoint]);
  useEffect(() => { void load().catch(() => setNotice("Releases could not load. Reload to try again.")); }, [load]);

  async function release(version: number) {
    if (pending.current?.version !== version) pending.current = { version, commandId: crypto.randomUUID() };
    setBusy(true); setNotice(""); setLink(null);
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ version: "v2-handover-release-command.v1", commandId: pending.current.commandId, handoverVersion: version }) });
      const result = await response.json().catch(() => ({})) as { code?: string; token?: string | null };
      if (!response.ok) { if (response.status !== 503) pending.current = null; setNotice(releaseProblemText(result.code)); return; }
      pending.current = null;
      if (result.token) setLink({ version, url: `${window.location.origin}/handover/${result.token}` });
      onChanged?.();
      await load().catch(() => undefined);
    } catch { setNotice("Result unknown. Reload before trying again."); }
    finally { setBusy(false); }
  }

  async function stop(releaseId: string, reason: string) {
    if (stopCommand.current?.releaseId !== releaseId) stopCommand.current = { releaseId, commandId: crypto.randomUUID() };
    setBusy(true); setNotice("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ version: "v2-handover-stop-command.v1", commandId: stopCommand.current.commandId, releaseId, reason }) });
      const result = await response.json().catch(() => ({})) as { code?: string };
      if (!response.ok) { if (response.status !== 503) stopCommand.current = null; setNotice(stopProblemText(result.code)); return; }
      stopCommand.current = null; setStopping(null);
      onChanged?.();
      await load().catch(() => undefined);
    } catch { setNotice("Result unknown. Reload before trying again."); }
    finally { setBusy(false); }
  }

  if (!view) return notice ? <p role="alert">{notice}</p> : null;
  const latest = versions.at(-1);
  return <div className="form" data-testid="handover-releases">
    <p>{releaseIndependent}</p>
    {latest !== undefined && <div className="form-actions" style={{ flexWrap: "wrap" }}>
      <button type="button" className="btn primary" disabled={busy || !view.siteComplete} onClick={() => void release(latest)}>
        {`Release this version · version ${latest}`}</button>
      {!view.siteComplete && <p role="status">{releaseBlocked}</p>}
    </div>}
    {notice && <p role="alert">{notice}</p>}
    {link && <div role="status"><p>{releaseLinkNote}</p><p><a href={link.url} data-testid="handover-link">{link.url}</a></p></div>}
    {view.releases.length > 0 && <ul aria-label="Releases">{view.releases.map(row => <li key={row.releaseId}>{releaseLine(row)}
      {linkStoppable(row) && (stopping?.releaseId === row.releaseId
        ? <div className="form">
          <label>{stopReasonLabel}<textarea maxLength={200} value={stopping.reason}
            onChange={event => setStopping({ releaseId: row.releaseId, reason: event.target.value })}/></label>
          <div className="form-actions"><button type="button" className="btn" disabled={busy || !stopping.reason.trim()}
            onClick={() => void stop(row.releaseId, stopping.reason)}>{stopLink}</button>
          <button type="button" className="btn" disabled={busy} onClick={() => setStopping(null)}>Keep it</button></div>
        </div>
        : <button type="button" className="btn" disabled={busy} onClick={() => setStopping({ releaseId: row.releaseId, reason: "" })}>{stopLink}</button>)}
    </li>)}</ul>}
    {latest !== undefined && view.releases.some(row => !row.stoppedAt && !row.recipientCurrent) && <div role="status">
      <p>{earlierContact}</p>
      <button type="button" className="btn" disabled={busy || !view.siteComplete} onClick={() => void release(latest)}>{releaseToCurrent}</button>
    </div>}
  </div>;
}
