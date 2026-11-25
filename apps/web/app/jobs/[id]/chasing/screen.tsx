"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
type Item = { id: string; kind: "quote" | "invoice"; reference: string; stoppedReason: string | null;
  next: { step: number; due: string } | null };
type View = { enabled: boolean; revision: number; items: Item[];
  log: { kind: string; item_id: string; step: number; stopped_reason: string | null; message: string | null; sent_at: string | null }[] };
export function ChasingScreen({ jobId }: { jobId: string }) {
  const [view, setView] = useState<View | null>(null), [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const path = `/api/jobs/${jobId}/chasing`;
  const reload = useCallback(async () => {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) throw new Error("Reminders could not be loaded. Please try again.");
    setView(await response.json() as View);
  }, [path]);
  useEffect(() => { void reload().catch((e: Error) => setError(e.message)); }, [reload]);
  async function command(input: Record<string, unknown>) {
    if (!view || busy) return;
    setBusy(true); setError("");
    try {
      const sessionResponse = await fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin" });
      if (!sessionResponse.ok) throw new Error("Sign in again to change reminders.");
      const session = await sessionResponse.json() as { csrfToken?: string };
      if (!session.csrfToken) throw new Error("Sign in again to change reminders.");
      const response = await fetch(path, { method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json", "x-csrf-token": session.csrfToken },
        body: JSON.stringify({ version: "v2-chase-command.v1", commandId: crypto.randomUUID(), expectedVersion: view.revision, ...input }) });
      if (!response.ok) throw new Error(response.status === 409 ? "The setting changed. Refresh and try again." : "That change could not be saved. Please try again.");
      await reload();
    } catch (e) { setError(e instanceof Error ? e.message : "Please try again."); }
    finally { setBusy(false); }
  }
  const skipped = view?.log.filter(row => row.step > 0 && row.stopped_reason === "chase_skipped") ?? [];
  return <main style={{ maxWidth: 760, margin: "0 auto", padding: 20, overflowWrap: "anywhere" }}>
    <Link href={`/jobs/${jobId}`}>Back to job</Link>
    <h1>Polite reminders</h1>
    <p>Practice only. Messages stay in the local catcher.</p>
    <p>Quotes: days 3 and 7 after sending. Invoices: days 3 and 10 after their due date. A reminder more than two days late is skipped.</p>
    <p>Replies, decisions, payments and disputes stop reminders. A no-charge pilot invoice is never chased.</p>
    {error && <p role="alert">{error}</p>}
    {!view ? <p role="status">Loading reminders…</p> : <>
      <p>Automatic chasing for your business is <strong>{view.enabled ? "on" : "off"}</strong>.</p>
      <button disabled={busy} onClick={() => void command({ action: "setting", enabled: !view.enabled })}>
        {view.enabled ? "Switch chasing off" : "Switch chasing on"}</button>
      <p>Switching on allows these fixed reminders for this fictional business. Switching off stops all upcoming reminders.</p>
      <button disabled={busy || !view.enabled} onClick={() => void command({ action: "run" })}>Run due practice reminders</button>
      <h2>What happens next</h2>
      {view.items.length === 0 && <p>No sent quotes or issued invoices yet.</p>}
      {view.items.map(item => <article key={`${item.kind}:${item.id}`} style={{ borderTop: "1px solid #ddd", padding: "16px 0" }}>
        <h3>{item.kind === "quote" ? "Quote" : "Invoice"} {item.reference}</h3>
        <p>{item.stoppedReason ? `Stopped: ${item.stoppedReason.replaceAll("_", " ")}` : item.next
          ? `Next reminder: ${new Date(item.next.due).toLocaleString("en-GB", { timeZone: "Europe/London" })}`
          : view.enabled ? "No more reminders." : "Chasing is off."}</p>
        <button disabled={busy || !!item.stoppedReason || view.revision === 0} onClick={() => void command({
          action: "stop", itemId: item.id, kind: item.kind, reason: "builder_stop" })}>Stop {item.reference}</button>{" "}
        <button disabled={busy || !!item.stoppedReason || view.revision === 0} onClick={() => void command({
          action: "stop", itemId: item.id, kind: item.kind, reason: "reply" })}>Record a reply</button>{" "}
        <button disabled={busy || !!item.stoppedReason || view.revision === 0} onClick={() => void command({
          action: "stop", itemId: item.id, kind: item.kind, reason: "dispute" })}>Record a dispute</button>
        {item.kind === "quote" && <button disabled={busy || !!item.stoppedReason || view.revision === 0}
          onClick={() => void command({ action: "stop", itemId: item.id, kind: item.kind, reason: "decision" })}>
          Stop reminders after a quote decision</button>}
      </article>)}
      {skipped.length > 0 && <section>
        <h2>Skipped reminders</h2>
        <ul>{skipped.map(row => {
          const item = view.items.find(candidate => candidate.kind === row.kind && candidate.id === row.item_id);
          return <li key={`${row.kind}:${row.item_id}:${row.step}`}>
            {row.kind === "quote" ? "Quote" : "Invoice"} {item?.reference} reminder {row.step}: chase skipped.
          </li>;
        })}</ul>
      </section>}
      <h2>Local catcher</h2>
      {view.log.filter(row => row.message).length === 0 && <p>No reminders captured.</p>}
      {view.log.filter(row => row.message).map(row => <p key={`${row.kind}:${row.item_id}:${row.step}`}>{row.message}</p>)}
    </>}
  </main>;
}
