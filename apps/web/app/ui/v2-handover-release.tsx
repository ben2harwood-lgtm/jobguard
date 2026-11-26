"use client";
// V2-G3 (Q57): "Release this version" and the release history, mounted in G2's Version history card.
import { useCallback, useEffect, useRef, useState } from "react";
import type { HandoverRelease } from "@jobguard/api/workspace";
import { releaseBlocked, releaseIndependent, releaseLine, releaseLinkNote, releaseProblemText } from "./v2-handover-release-label";

type View = { siteComplete: boolean; releases: HandoverRelease[] };

export function HandoverReleases({ jobId, versions }: { jobId: string; versions: number[] }) {
  const endpoint = `/api/jobs/${encodeURIComponent(jobId)}/handover/releases`;
  const [view, setView] = useState<View | null>(null), [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  const [link, setLink] = useState<{ version: number; url: string } | null>(null);
  // One command id per version until a response arrives, so a retried release makes one link.
  const pending = useRef<{ version: number; commandId: string } | null>(null);
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
    {view.releases.length > 0 && <ul aria-label="Releases">{view.releases.map(row => <li key={row.releaseId}>{releaseLine(row)}</li>)}</ul>}
  </div>;
}
