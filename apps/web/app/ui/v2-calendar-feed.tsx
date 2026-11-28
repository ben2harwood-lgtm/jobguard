"use client";
import React, { useEffect, useRef, useState } from "react";
import type { CalendarFeed } from "@jobguard/api/workspace";
import { jobPageFetch as fetch } from "./job-page-fetch";

type View = { feeds: CalendarFeed[]; stale: boolean };
const control = { minHeight: 44, maxWidth: "100%" };

/** V2-K2A: the builder's private calendar link for this job, kept up to date from the work plan. */
export function V2CalendarFeed({ jobId }: { jobId: string }) {
  const [view, setView] = useState<View | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [status, setStatus] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const pending = useRef<{ key: string; commandId: string; feedId: string } | null>(null);
  const url = `/api/jobs/${encodeURIComponent(jobId)}/calendar-feeds`;
  const live = view?.feeds.find(feed => !feed.revoked) ?? null;

  async function load(): Promise<View> {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error("Could not load the calendar link");
    const next = await response.json() as View;
    setView(next);
    return next;
  }
  async function change(action: "create" | "refresh" | "revoke", feed?: CalendarFeed) {
    const key = JSON.stringify({ action, feedId: feed?.feedId, expectedVersion: feed?.feedVersion ?? 0 });
    // Keep the same retry identity after an unknown outcome, including a new link's id.
    if (pending.current?.key !== key) {
      const commandId = crypto.randomUUID();
      pending.current = { key, commandId, feedId: feed?.feedId ?? crypto.randomUUID() };
    }
    const { commandId, feedId } = pending.current;
    const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ version: "calendar-feed-command.v1", commandId, feedId, action,
        expectedVersion: feed?.feedVersion ?? 0 }) });
    const body = await response.json();
    if (!response.ok) {
      pending.current = null; await load();
      throw new Error(body.code === "CALENDAR_FEED_VERSION_CONFLICT" || body.code === "CALENDAR_FEED_EXISTS"
        ? "The calendar link changed. Check it again." : "Could not change the calendar link. Try again.");
    }
    pending.current = null;
    if (action === "create" && body.token) setLink(`${window.location.origin}/api/v2/calendar/${body.token}.ics`);
    if (action === "revoke") setLink(null);
    await load();
  }
  async function run(work: () => Promise<void>) {
    setBusy(true); setError("");
    try { await work(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not change the calendar link"); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    // Opening the Work tab brings an out-of-date saved copy up to date.
    void run(async () => {
      const first = await load();
      const feed = first.feeds.find(entry => !entry.revoked);
      if (feed && first.stale) { await change("refresh", feed); setStatus("Calendar updated from the work plan."); }
    });
  }, [jobId]); // request-scoped endpoint

  return <section data-testid="v2-calendar-feed" aria-label="Calendar link" className="materials-panel" aria-busy={busy} style={{ overflowWrap: "anywhere" }}>
    <h2>Calendar link</h2>
    <p>Practice sandbox — synthetic data; nothing is sent or charged. Builder only.</p>
    <p>A private link for your own calendar app. It lists every plan task that has a date, with its trade and who it's assigned to. No prices.</p>
    {error && <p role="alert" tabIndex={-1} ref={element => { element?.focus(); }}>{error}</p>}
    {status && <p role="status">{status}</p>}
    {view && !live && <button style={control} disabled={busy} onClick={() => void run(() => change("create"))}>Make calendar link</button>}
    {link && <div>
      <p><strong>Copy this link now.</strong> JobGuard keeps only a fingerprint of it, so it can't show it again. Anyone with the link can see these tasks.</p>
      <input style={{ ...control, width: "100%" }} readOnly aria-label="Calendar link address" value={link} onFocus={event => event.target.select()}/>
      <button style={control} disabled={busy} onClick={() => void navigator.clipboard?.writeText(link).then(
        () => setStatus("Calendar link copied."), () => setStatus("Copy didn't work. Select the link and copy it."))}>Copy calendar link</button>
    </div>}
    {live && <div>
      <p>Calendar link on. {live.taskCount} dated {live.taskCount === 1 ? "task" : "tasks"}. Last updated {new Date(live.updatedAt).toLocaleString("en-GB", { timeZone: "Europe/London" })}.</p>
      <p>Your calendar app checks the link on its own schedule, so a change can take a while to show there.</p>
      <button style={control} disabled={busy} onClick={() => void run(async () => { await change("refresh", live); setStatus("Calendar updated from the work plan."); })}>Update calendar now</button>
      <button style={control} disabled={busy} onClick={() => void run(async () => { await change("revoke", live); setStatus("Calendar link turned off. It no longer works anywhere."); })}>Turn off calendar link</button>
    </div>}
  </section>;
}
