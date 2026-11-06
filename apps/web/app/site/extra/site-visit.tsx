"use client";
import { useEffect, useRef, useState } from "react";
import { closeoutQuestionText, siteOrderLinesV1, siteSorItemsV1, siteSorRecentItemsV1, siteVisitStartedV1, siteVisitCompletedV1, type SiteSorItems } from "@jobguard/core";
import styles from "../../northside/northside.module.css";

async function read(response: Response) {
  const body: unknown = await response.json();
  if (!response.ok) throw new Error(`Request refused (${response.status}). Reload the job before trying again.`);
  return body;
}

/** Keyed by job: changing jobs discards the previous job's data and command identities. */
export function SiteVisit({ jobId, openVisitId, onSelect, onVisitChange, locked = false }: { jobId: string; openVisitId: string | null; onSelect?: (item: SiteSorItems["items"][number]) => void; onVisitChange?: (id: string | null) => void; locked?: boolean }) {
  const [visitId, setVisitId] = useState(openVisitId), [answer, setAnswer] = useState<"" | "yes" | "no">("");
  const [lines, setLines] = useState<ReturnType<typeof siteOrderLinesV1.parse> | null>(null), [items, setItems] = useState<SiteSorItems | null>(null);
  const [recent, setRecent] = useState<ReturnType<typeof siteSorRecentItemsV1.parse> | null>(null);
  const [query, setQuery] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false), [completed, setCompleted] = useState(false);
  const command = useRef(crypto.randomUUID());
  const pending = useRef(false);
  // Bind the exact body across an uncertain outcome. Editing an answer after a failed request must not reuse its ID.
  const attempt = useRef<{ path: string; body: string } | null>(null);
  useEffect(() => {
    let active = true;
    void fetch(`/api/contractor/jobs/${jobId}/order-lines`, { cache: "no-store" }).then(read).then(body => {
      const parsed = siteOrderLinesV1.parse(body);
      if (parsed.jobId !== jobId) throw new Error("Job response mismatch.");
      if (active) setLines(parsed);
    }).catch(() => { if (active) setError("Order lines could not load."); });
    return () => { active = false; };
  }, [jobId]);
  useEffect(() => {
    setItems(null);
    if (!query.trim()) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void fetch(`/api/contractor/jobs/${jobId}/sor-items?q=${encodeURIComponent(query.trim())}`, { cache: "no-store", signal: controller.signal }).then(read).then(body => {
        const parsed = siteSorItemsV1.parse(body);
        if (parsed.jobId !== jobId) throw new Error("Job response mismatch.");
        if (!controller.signal.aborted) setItems(parsed);
      }).catch(() => { if (!controller.signal.aborted) setError("Schedule search could not load."); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [jobId, query]);
  useEffect(() => {
    const controller = new AbortController();
    setRecent(null);
    void fetch(`/api/contractor/jobs/${jobId}/sor-items/recent`, { cache: "no-store", signal: controller.signal }).then(read).then(body => {
      const parsed = siteSorRecentItemsV1.parse(body);
      if (parsed.jobId !== jobId) throw new Error("Job response mismatch.");
      if (!controller.signal.aborted) setRecent(parsed);
    }).catch(() => { /* Recents are optional; search remains available. */ });
    return () => controller.abort();
  }, [jobId]);
  const shownItems = query.trim() ? items?.items : recent?.items;
  async function submit() {
    if (pending.current || completed || (visitId && !answer)) return;
    pending.current = true; setBusy(true); setError("");
    const path = `/api/contractor/jobs/${jobId}/site-visits/${visitId ? `${visitId}/complete` : "start"}`;
    attempt.current ??= { path, body: JSON.stringify(visitId ? { version: "complete-site-visit.v1", commandId: command.current, closeoutAnswer: answer } : { version: "start-site-visit.v1", commandId: command.current }) };
    try {
      const body = await read(await fetch(attempt.current.path, { method: "POST", headers: { "content-type": "application/json" }, body: attempt.current.body }));
      if (visitId) {
        const result = siteVisitCompletedV1.parse(body);
        if (result.jobId !== jobId || result.visitId !== visitId) throw new Error("Visit response mismatch.");
        setCompleted(true); onVisitChange?.(null);
      } else {
        const result = siteVisitStartedV1.parse(body);
        if (result.jobId !== jobId) throw new Error("Job response mismatch.");
        setVisitId(result.visitId); onVisitChange?.(result.visitId);
      }
      attempt.current = null; command.current = crypto.randomUUID();
    } catch { setError("Visit request could not be confirmed. Retry sends the same answer and command."); }
    finally { pending.current = false; setBusy(false); }
  }
  return <section className={styles.card} aria-label="Site visit">
    <h2>Site visit</h2>
    {error && <p role="alert">{error}</p>}
    {completed ? <p role="status">Visit completed. Your answer has been recorded.</p> : visitId ? <>
      <div className={styles.row}><label htmlFor="closeout">{closeoutQuestionText}</label>
        <select id="closeout" value={answer} disabled={busy || attempt.current !== null} onChange={e => setAnswer(e.target.value as "" | "yes" | "no")}>
          <option value="">Choose an answer</option><option value="yes">Yes</option><option value="no">No</option>
        </select></div>
      <button disabled={locked || busy || !answer} onClick={() => void submit()}>Complete visit</button>
    </> : <button disabled={locked || busy} onClick={() => void submit()}>Start visit</button>}
    <h3>Order lines</h3>
    {lines ? <ul>{lines.lines.map(line => <li key={line.scopeItemId}>{line.sorCode}: {line.description} · {line.quantity} {line.unit}</li>)}</ul> : <p>Order lines unavailable until loaded.</p>}
    <div className={styles.row}><label htmlFor="sor-search">Search schedule of rates</label><input id="sor-search" maxLength={80} value={query} onChange={e => setQuery(e.target.value)} /></div>
    {!query.trim() && !!recent?.items.length && <h3>Recent items</h3>}
    {shownItems && <ul>{shownItems.map(item => <li key={item.code}>{onSelect ? <button disabled={locked} onClick={() => onSelect(item)}>{item.code}: {item.description} ({item.unit})</button> : <>{item.code}: {item.description} ({item.unit})</>}</li>)}</ul>}
    {!!query.trim() && items && <>{items.items.length === 0 && <p>No matching items.</p>}{items.truncated && <p>More results available. Narrow your search.</p>}</>}
  </section>;
}
