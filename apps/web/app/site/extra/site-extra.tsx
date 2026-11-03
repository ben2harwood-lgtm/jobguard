"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { siteOrderCheckV1, sorSiteExtraLoggedV1, siteExtraLoggedV3, type SiteOrderCheck } from "@jobguard/core";
import { SiteVisit } from "./site-visit";
import { NorthsidePractice } from "../../northside/northside-practice";
import { pounds } from "../../lib/pounds";
import styles from "../../northside/northside.module.css";

type Job = { jobId: string; reference: string; openVisitId: string | null };
type Photo = { photoEvidenceId: string; photoSha256: string; shownContentSha256: string };
type Extra = { extraId: string; jobId: string; orderReference: string; description: string; state: string; hasPhoto: boolean; residentConfirmed: boolean; quotedPence: number | null; outcome: string | null };
const labels: Record<string, string> = { logged: "Logged - waiting for a price and approval", awaiting_approval: "Waiting for approval", approved: "Approved", rejected: "Not approved" };

/** The operative's extra form: description, practice photo, the resident's confirmation, then log. Mobile first, plain, labelled. */
export function SiteExtra() {
  const [jobs, setJobs] = useState<Job[] | null>(null), [extras, setExtras] = useState<Extra[]>([]), [error, setError] = useState(""), [done, setDone] = useState(""), [busy, setBusy] = useState(false);
  const [jobId, setJobId] = useState(""), [description, setDescription] = useState(""), [note, setNote] = useState(""), [photo, setPhoto] = useState<Photo | null>(null), [confirmed, setConfirmed] = useState(false);
  const commandId = useRef(crypto.randomUUID());
  const attempt = useRef<string | null>(null), pending = useRef(false);
  const [sorCode, setSorCode] = useState(""), [quantity, setQuantity] = useState("1"), [visitId, setVisitId] = useState<string | null>(null);
  const [check, setCheck] = useState<SiteOrderCheck["orderCheck"] | null>(null);
  const [proceedLimit, setProceedLimit] = useState<number | null>(null);
  useEffect(() => {
    setCheck(null);
    if (!jobId || !sorCode || !quantity) return;
    const controller = new AbortController();
    void fetch(`/api/contractor/jobs/${jobId}/order-check?sorCode=${encodeURIComponent(sorCode)}&quantity=${encodeURIComponent(quantity)}`, { cache: "no-store", signal: controller.signal }).then(async r => {
      if (!r.ok) throw new Error("Order check refused");
      const result = siteOrderCheckV1.parse(await r.json());
      if (result.jobId !== jobId) throw new Error("Job mismatch");
      if (!controller.signal.aborted) setCheck(result.orderCheck);
    }).catch(() => { if (!controller.signal.aborted) setError("Order check unavailable. Do not submit until checked."); });
    return () => controller.abort();
  }, [jobId, sorCode, quantity]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "failed">("loading");
  const load = useCallback(async () => {
    setLoadState("loading"); setError("");
    try {
      const [j, e] = await Promise.all([fetch("/api/contractor/site/jobs", { cache: "no-store" }), fetch("/api/northside/extras", { cache: "no-store" })]);
      if (j.status === 401 || e.status === 401) throw new Error("Sign in to the practice first (open the practice hub).");
      if (!j.ok || !e.ok) throw new Error(`Jobs and extras could not load (jobs: ${j.status}; extras: ${e.status}).`);
      const jobsBody = await j.json(), extrasBody = await e.json();
      if (!Array.isArray(jobsBody.jobs) || !Array.isArray(extrasBody.extras)) throw new Error("Jobs and extras returned an unreadable response.");
      setProceedLimit(extrasBody.settings?.settings?.rules?.proceedLimit?.pence ?? null);
      setJobs(jobsBody.jobs.map((x: Job) => ({ jobId: x.jobId, reference: x.reference, openVisitId: x.openVisitId }))); setExtras(extrasBody.extras); setLoadState("ready");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Jobs and extras could not load."); setLoadState("failed");
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (jobs && jobs.length && !jobId) { setJobId(jobs[0]!.jobId); setVisitId(jobs[0]!.openVisitId); } }, [jobs, jobId]);
  const locked = photo !== null || busy;
  function chooseJob(id: string) { setJobId(id); setSorCode(""); setCheck(null); setVisitId(jobs?.find(j => j.jobId === id)?.openVisitId ?? null); }
  async function attach() {
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/northside/photo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ version: "northside-command.v1", jobId, description, note }) });
      const body = await r.json(); if (!r.ok) throw new Error(`The practice photo could not be attached (${body.code}).`);
      setPhoto(body);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function log() {
    if (!photo || !confirmed || pending.current || (sorCode && (!check || check.outcome === "already_on_order"))) return; pending.current = true; setBusy(true); setError(""); setDone("");
    try {
      attempt.current ??= JSON.stringify(sorCode ? { version: "log-sor-site-extra.v2", commandId: commandId.current, sorCode, quantity, description, note, photoEvidenceId: photo.photoEvidenceId, residentConfirmation: { shownContentSha256: photo.shownContentSha256 }, ...(visitId ? { siteVisitId: visitId } : {}) } : { version: "log-site-extra.v3", commandId: commandId.current, description, note, photoEvidenceId: photo.photoEvidenceId, residentConfirmation: { shownContentSha256: photo.shownContentSha256 } });
      const r = await fetch(`/api/contractor/jobs/${jobId}/site-extras${sorCode ? "/sor" : ""}`, { method: "POST", headers: { "content-type": "application/json" }, body: attempt.current });
      const body = await r.json(); if (!r.ok) throw new Error(`The extra was not logged (${body.code}).`);
      const result = sorCode ? sorSiteExtraLoggedV1.parse(body) : siteExtraLoggedV3.parse(body);
      if (result.jobId !== jobId) throw new Error("Job response mismatch.");
      attempt.current = null; setSorCode(""); setCheck(null); setQuantity("1");
      setDone(sorCode ? "Extra logged and priced by the server. Approval is still required." : "Extra logged. It is waiting for a price and approval."); setPhoto(null); setConfirmed(false); setDescription(""); setNote(""); commandId.current = crypto.randomUUID(); await load();
    } catch (e) { setError((e as Error).message); } finally { pending.current = false; setBusy(false); }
  }
  return <main className={styles.page} data-site-extra-state={loadState}>
    <NorthsidePractice />
    <Link href="/northside">Practice hub</Link>
    <h1>Log an extra</h1>
    <p className={styles.note}>Practice data for the generated fictional contractor. The photo is a generated picture, nothing is sent.</p>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {done && <p role="status" className={styles.ok} data-testid="extra-logged">{done}</p>}
    {loadState === "loading" ? <p role="status">Loading…</p> : loadState === "failed" ? <button onClick={() => void load()}>Reload jobs and extras</button> : jobs?.length === 0 ? <p>No jobs are assigned to you.</p> : <section className={styles.card}>
      <div className={styles.row}><label htmlFor="job">Job</label><select id="job" value={jobId} disabled={locked} onChange={e => chooseJob(e.target.value)}>{jobs?.map(j => <option key={j.jobId} value={j.jobId}>{j.reference}</option>)}</select></div>
      <SiteVisit key={jobId} jobId={jobId} openVisitId={jobs?.find(job => job.jobId === jobId)?.openVisitId ?? null} locked={locked} onVisitChange={setVisitId} onSelect={item => { if (item.code !== sorCode || quantity !== "1") setCheck(null); setSorCode(item.code); setDescription(item.description); setNote(item.description); setQuantity("1"); }} />
      {sorCode && <><p>Schedule item: {sorCode}</p><label htmlFor="quantity">Total quantity</label><input className={styles.quantity} id="quantity" inputMode="decimal" value={quantity} disabled={locked} onChange={e => { setQuantity(e.target.value); setCheck(null); }} />
        <p role="status">{!check ? "Checking order…" : check.outcome === "already_on_order" ? "Already on the order. Ask your supervisor; this cannot be logged as an extra." : check.outcome === "new" ? "New extra" : `${check.extraQuantity} ${check.unit} more than ordered`}</p></>}
      <p>Proceed limit: {proceedLimit === null ? "unavailable" : `${pounds(proceedLimit)} (demo setting, not a real rule)`}. This does not grant permission to proceed.</p>
      <p>Work status: not recorded. Work timing is unavailable in this practice.</p>
      <div className={styles.row}><label htmlFor="description">What is the extra work?</label><input id="description" value={description} disabled={locked} maxLength={500} onChange={e => setDescription(e.target.value)} /></div>
      <div className={styles.row}><label htmlFor="note">Note for the office</label><textarea id="note" rows={3} value={note} disabled={locked} maxLength={5000} onChange={e => setNote(e.target.value)} /></div>
      {!photo ? <div className={styles.actions}><button disabled={busy || !jobId || !description.trim() || !note.trim() || Boolean(sorCode && (!check || check.outcome === "already_on_order"))} onClick={() => void attach()}>Attach practice photo</button></div>
        : <><p className={styles.ok} data-testid="photo-attached">Practice photo attached. Show the resident this description and photo.</p><p>Content hash: <code>{photo.shownContentSha256}</code></p>
          <label className={styles.confirmation}><input type="checkbox" checked={confirmed} disabled={busy || attempt.current !== null} onChange={e => setConfirmed(e.target.checked)} /> The resident has seen this and confirms it (identity not verified)</label>
          <div className={styles.actions}><button disabled={busy || !confirmed} onClick={() => void log()}>Log extra</button></div></>}
    </section>}
    <section className={styles.card} aria-label="My extras"><h2>My extras</h2>
      {loadState !== "ready" ? <p>{loadState === "loading" ? "Loading extras…" : "Extras are unavailable."}</p> : extras.length === 0 ? <p>None yet.</p> : <ul>{extras.map(x => <li key={x.extraId} data-testid="my-extra"><strong>{x.orderReference}</strong>: {x.description} <span className={styles.pill} data-testid="my-extra-state">{x.outcome ? labels[x.outcome] ?? x.outcome : labels[x.state] ?? x.state}</span>{x.quotedPence !== null && <> · price {pounds(x.quotedPence)}</>}{x.hasPhoto && " · photo"}{x.residentConfirmed && " · resident confirmed"}</li>)}</ul>}
    </section>
  </main>;
}
