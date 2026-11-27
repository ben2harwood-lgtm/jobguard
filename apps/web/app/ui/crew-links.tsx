"use client";
// V2-F7M: the builder's "Crew links" card on Brief progress, and crew presses with Confirm.
import { useEffect, useRef, useState } from "react";
import type { BriefProgress, CrewBrief } from "@jobguard/api/workspace";
import { Card, Note, Tag } from "../(designed)/designed-ui";
import { crewKindLabel, crewLinkOnce, crewLinkState, crewPressLabel, crewPressState, type CrewKind } from "./v2-crew-link-label";

type Link = { linkId: string; crewId: string; crewName: string; trade: string; issuedAt: string; expiresAt: string;
  cancelled: boolean; replaced: boolean };
type Press = { commandId: string; linkId: string; crewName: string; trade: string; briefVersion: number; scopeItemId: string;
  taskKey: string; kind: CrewKind; note: string; recordedAt: string; confirmed: boolean };
type View = { crew: { crewId: string; name: string; trade: string }[]; links: Link[]; presses: Press[] };

export function CrewLinks({ jobId, briefs, progress, progressPath, onConfirmed }: { jobId: string;
  briefs: (CrewBrief & { current: boolean })[]; progress: BriefProgress[]; progressPath: string; onConfirmed: () => void }) {
  const path = `/api/jobs/${encodeURIComponent(jobId)}/crew-links`;
  const [view, setView] = useState<View | null>(null), [loads, setLoads] = useState(0);
  const [crewId, setCrewId] = useState(""), [made, setMade] = useState<string | null>(null);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const pending = useRef<{ key: string; commandId: string } | null>(null);
  useEffect(() => {
    let active = true;
    fetch(path, { cache: "no-store" }).then(async response => {
      if (!response.ok) throw new Error("Could not load crew links.");
      const result = await response.json() as View;
      if (active) setView(result);
    }).catch(cause => { if (active) setError(String(cause.message)); });
    return () => { active = false; };
  }, [path, loads]);

  async function post(key: string, body: Record<string, unknown>) {
    if (pending.current?.key !== key) pending.current = { key, commandId: crypto.randomUUID() };
    setBusy(true); setError("");
    try {
      const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ version: "v2-crew-link-command.v1", commandId: pending.current.commandId, ...body }) });
      const result = await response.json().catch(() => ({})) as { code?: string; token?: string | null };
      if (response.status !== 503) pending.current = null;
      if (!response.ok) { setError(result.code === "CREW_LINK_CREW_UNAVAILABLE" ? "That crew member can't get a link for this job." : "Not saved. Try again."); return null; }
      setLoads(count => count + 1);
      return result;
    } catch { setError("Not saved. Try again."); return null; }
    finally { setBusy(false); }
  }

  async function make() {
    const result = await post(`issue:${crewId}`, { action: "issue", crewId });
    if (result?.token) setMade(`${window.location.origin}/brief/${result.token}`);
  }

  async function confirm(press: Press) {
    // Confirm against the brief the crew member pressed on: after a newer brief, F1 refuses it as stale.
    const brief = briefs.find(row => row.trade === press.trade);
    if (!brief) { setError("Make this trade's brief first."); return; }
    if (brief.version !== press.briefVersion) { setError("The brief changed after this update. Check it with the crew member before confirming."); return; }
    const head = progress.filter(row => row.trade === press.trade && row.scopeItemId === press.scopeItemId && row.taskKey === press.taskKey)
      .reduce((max, row) => Math.max(max, row.version), 0);
    setBusy(true); setError("");
    try {
      // An ordinary F1 builder press, so the live-job and stage guards hold.
      const response = await fetch(progressPath, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ version: "v2-brief-progress-command.v1", commandId: crypto.randomUUID(), trade: press.trade,
          briefVersion: press.briefVersion, scopeItemId: press.scopeItemId, taskKey: press.taskKey, expectedVersion: head,
          kind: press.kind, note: press.note }) });
      if (!response.ok) setError("Not confirmed. The task or brief changed; the page has reloaded, check and try again.");
      setLoads(count => count + 1); onConfirmed();
    } catch { setError("Not confirmed. Try again."); }
    finally { setBusy(false); }
  }

  const now = Date.now();
  return <section aria-label="Crew links"><Card title="Crew links" sub="A link shows one trade's brief to one crew member, with no sign-in and no prices.">
    <div className="card-body form">
      {error && <p role="alert">{error}</p>}
      {!view && !error && <p>Loading crew links…</p>}
      {view && <>
        <label>Crew member<select value={crewId} onChange={event => { setCrewId(event.target.value); setMade(null); }}>
          <option value="">Choose a crew member</option>
          {view.crew.map(row => <option key={row.crewId} value={row.crewId}>{row.name} · {row.trade}</option>)}
        </select></label>
        <div className="form-actions"><button type="button" className="btn primary" disabled={!crewId || busy} onClick={() => void make()}>Make link</button></div>
        {made && <div role="status"><Note><strong>{crewLinkOnce}</strong></Note>
          <input readOnly aria-label="New crew link" value={made} onFocus={event => event.currentTarget.select()}/>
          <button type="button" className="btn" onClick={() => void navigator.clipboard?.writeText(made)}>Copy</button></div>}
        {view.links.map(link => <article key={link.linkId} aria-label={`Link for ${link.crewName}`} className="job-caption">
          <span>{link.crewName} · {link.trade}</span> <Tag>{crewLinkState(link, now)}</Tag>
          {!link.cancelled && !link.replaced && new Date(link.expiresAt).getTime() > now &&
            <button type="button" className="btn" disabled={busy} onClick={() => void post(`cancel:${link.linkId}`, { action: "cancel", linkId: link.linkId })}>Cancel</button>}
        </article>)}
        {view.presses.length > 0 && <h3>From crew links</h3>}
        {view.presses.map(press => <article key={press.commandId} aria-label={crewPressLabel(press.kind, press.crewName)}>
          <p><Tag tone={press.kind === "done" ? "green" : press.kind === "blocked" ? "amber" : "blue"}>{crewKindLabel(press.kind)}</Tag>{" "}
            {crewPressLabel(press.kind, press.crewName)} · {briefs.find(row => row.trade === press.trade)?.content.tasks
              .find(task => task.scopeItemId === press.scopeItemId && task.taskKey === press.taskKey)?.title ?? press.taskKey}
            {press.note && ` · ${press.note}`}</p>
          <p data-testid="crew-press-state">{crewPressState(press.confirmed)}</p>
          {!press.confirmed && <button type="button" className="btn" disabled={busy} onClick={() => void confirm(press)}>Confirm</button>}
        </article>)}
      </>}
    </div>
  </Card></section>;
}
