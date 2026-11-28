"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./practice-receipts.module.css";
import { ATTENDANCE_COPY, attendancePeople, attendanceRefusal, currentTap, siteAttendanceScreenV1, tapCommand, weekSummary,
  type AttendanceCommand, type AttendancePerson, type SiteAttendanceScreen } from "./v2-site-attendance-model";

/** V2-F8: who was on site today. The builder taps each person; no location is collected. */
export function SiteAttendanceCard({ jobId }: { jobId: string }) {
  const path = `/api/v2-backend/jobs/${encodeURIComponent(jobId)}/attendance`;
  const [screen, setScreen] = useState<SiteAttendanceScreen | null>(null);
  const [busy, setBusy] = useState(true), [error, setError] = useState<string | null>(null);
  // An unknown outcome keeps the exact command, so a retry replays it and counts once.
  const pending = useRef<AttendanceCommand | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const response = await fetch(path, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setError(attendanceRefusal(response.status, body.code)); return; }
      setScreen(siteAttendanceScreenV1.parse(body));
    } catch { setError("The on-site list couldn't be loaded. Reload the page to try again."); }
    finally { setBusy(false); }
  }, [path]);
  useEffect(() => { void load(); }, [load]);

  const send = async (command: AttendanceCommand) => {
    setBusy(true); setError(null); pending.current = command;
    try {
      const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(command) });
      const body = await response.json().catch(() => ({}));
      if (response.ok || response.status < 500) pending.current = null;
      if (!response.ok) setError(attendanceRefusal(response.status, body.code));
    } catch { setError(attendanceRefusal(0, undefined)); }
    await load();
  };
  const tap = (person: AttendancePerson, onSite: boolean) =>
    screen && void send(tapCommand(screen, screen.today, person, onSite, crypto.randomUUID()));

  return <section id="site-attendance" className={styles.panel} aria-labelledby="site-attendance-title" aria-busy={busy} data-testid="site-attendance">
    <h2 id="site-attendance-title">On site today</h2>
    <p>{ATTENDANCE_COPY}</p>
    {error && <p role="alert">{error}</p>}
    {pending.current && !busy && <button type="button" onClick={() => pending.current && void send(pending.current)}>Retry the same tap</button>}
    {screen && <>
      <ul data-testid="site-attendance-today">{attendancePeople(screen).map(person => {
        const onSite = currentTap(screen, screen.today, person)?.onSite === true;
        return <li key={person.key} data-testid="site-attendance-person" data-on-site={onSite}>
          <span>{person.label} <small>{person.detail}</small></span>{" "}
          <button type="button" disabled={busy || !!pending.current} aria-pressed={onSite}
            onClick={() => tap(person, !onSite)}>{onSite ? `${person.label === "Me" ? "I'm" : "Marked"} on site · Undo` : "On site"}</button>
        </li>;
      })}</ul>
      {screen.crew.length === 0 && <p>Add crew records to your firm to tap them here.</p>}
      <h3>Last 7 days</h3>
      <ol data-testid="site-attendance-week">{weekSummary(screen).map(day =>
        <li key={day.day} data-day={day.day}><strong>{day.label}</strong>: {day.names.length ? day.names.join(", ") : "Nobody recorded"}</li>)}</ol>
    </>}
  </section>;
}
