"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { NorthsidePractice } from "../../northside/northside-practice";
import { pounds } from "../../lib/pounds";
import styles from "../../northside/northside.module.css";

type Job = { jobId: string; reference: string };
type Photo = { photoEvidenceId: string; photoSha256: string; shownContentSha256: string };
type Extra = { extraId: string; jobId: string; orderReference: string; description: string; state: string; hasPhoto: boolean; residentConfirmed: boolean; quotedPence: number | null; outcome: string | null };
const labels: Record<string, string> = { logged: "Logged - waiting for a price and approval", awaiting_approval: "Waiting for approval", approved: "Approved", rejected: "Not approved" };

/** The operative's extra form: description, practice photo, the resident's confirmation, then log. Mobile first, plain, labelled. */
export function SiteExtra() {
  const [jobs, setJobs] = useState<Job[] | null>(null), [extras, setExtras] = useState<Extra[]>([]), [error, setError] = useState(""), [done, setDone] = useState(""), [busy, setBusy] = useState(false);
  const [jobId, setJobId] = useState(""), [description, setDescription] = useState(""), [note, setNote] = useState(""), [photo, setPhoto] = useState<Photo | null>(null), [confirmed, setConfirmed] = useState(false);
  const commandId = useRef(crypto.randomUUID());
  const load = useCallback(async () => {
    const [j, e] = await Promise.all([fetch("/api/contractor/site/jobs", { cache: "no-store" }), fetch("/api/northside/extras", { cache: "no-store" })]);
    if (j.status === 401 || e.status === 401) { setError("Sign in to the practice first (open the practice hub)."); setJobs([]); return; }
    const jobsBody = await j.json(); setJobs((jobsBody.jobs ?? []).map((x: Job) => ({ jobId: x.jobId, reference: x.reference }))); setExtras((await e.json()).extras ?? []);
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (jobs && jobs.length && !jobId) setJobId(jobs[0]!.jobId); }, [jobs, jobId]);
  const locked = photo !== null;
  async function attach() {
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/northside/photo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ version: "northside-command.v1", jobId, description, note }) });
      const body = await r.json(); if (!r.ok) throw new Error(`The practice photo could not be attached (${body.code}).`);
      setPhoto(body);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function log() {
    if (!photo) return; setBusy(true); setError(""); setDone("");
    try {
      const r = await fetch(`/api/contractor/jobs/${jobId}/site-extras`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ version: "log-site-extra.v3", commandId: commandId.current, description, note, photoEvidenceId: photo.photoEvidenceId, residentConfirmation: { shownContentSha256: photo.shownContentSha256 } }) });
      const body = await r.json(); if (!r.ok) throw new Error(`The extra was not logged (${body.code}).`);
      setDone("Extra logged. It is waiting for a price and approval."); setPhoto(null); setConfirmed(false); setDescription(""); setNote(""); commandId.current = crypto.randomUUID(); await load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <main className={styles.page}>
    <NorthsidePractice />
    <Link href="/northside">Practice hub</Link>
    <h1>Log an extra</h1>
    <p className={styles.note}>Practice data for the generated fictional contractor. The photo is a generated picture, nothing is sent.</p>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {done && <p role="status" className={styles.ok} data-testid="extra-logged">{done}</p>}
    {jobs === null ? <p role="status">Loading…</p> : jobs.length === 0 ? <p>No jobs are assigned to you.</p> : <section className={styles.card}>
      <div className={styles.row}><label htmlFor="job">Job</label><select id="job" value={jobId} disabled={locked} onChange={e => setJobId(e.target.value)}>{jobs.map(j => <option key={j.jobId} value={j.jobId}>{j.reference}</option>)}</select></div>
      <div className={styles.row}><label htmlFor="description">What is the extra work?</label><input id="description" value={description} disabled={locked} maxLength={500} onChange={e => setDescription(e.target.value)} /></div>
      <div className={styles.row}><label htmlFor="note">Note for the office</label><textarea id="note" rows={3} value={note} disabled={locked} maxLength={5000} onChange={e => setNote(e.target.value)} /></div>
      {!photo ? <div className={styles.actions}><button disabled={busy || !jobId || !description.trim() || !note.trim()} onClick={() => void attach()}>Attach practice photo</button></div>
        : <><p className={styles.ok} data-testid="photo-attached">Practice photo attached. Show the resident this description and photo.</p>
          <label><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /> The resident has seen this and confirms it</label>
          <div className={styles.actions}><button disabled={busy || !confirmed} onClick={() => void log()}>Log extra</button></div></>}
    </section>}
    <section className={styles.card} aria-label="My extras"><h2>My extras</h2>
      {extras.length === 0 ? <p>None yet.</p> : <ul>{extras.map(x => <li key={x.extraId} data-testid="my-extra"><strong>{x.orderReference}</strong>: {x.description} <span className={styles.pill} data-testid="my-extra-state">{x.outcome ? labels[x.outcome] ?? x.outcome : labels[x.state] ?? x.state}</span>{x.quotedPence !== null && <> · price {pounds(x.quotedPence)}</>}{x.hasPhoto && " · photo"}{x.residentConfirmed && " · resident confirmed"}</li>)}</ul>}
    </section>
  </main>;
}
