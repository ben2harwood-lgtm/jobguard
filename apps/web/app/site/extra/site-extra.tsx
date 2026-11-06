"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { siteOrderCheckV1, siteSupervisorQueryV1, siteSupervisorQueriesV1, sorSiteExtraSubmittedV2, siteExtraLoggedV4, siteExtraContentSha256V1, type SiteOrderCheck } from "@jobguard/core";
import { LocalDictation } from "../../ui/local-dictation";
import { ExtraProceed } from "./extra-proceed";
import { SiteVisit } from "./site-visit";
import { NorthsidePractice } from "../../northside/northside-practice";
import { pounds } from "../../lib/pounds";
import styles from "../../northside/northside.module.css";

type Job = { jobId: string; reference: string; openVisitId: string | null };
type Photo = { photoEvidenceId: string; photoSha256: string; shownContentSha256: string };
type Extra = { extraId: string; jobId: string; orderReference: string; description: string; state: string; hasPhoto: boolean; residentConfirmed: boolean; quotedPence: number | null; outcome: string | null };
const workLabels = { not_started: "Not started", under_way: "Under way", finished: "Finished" } as const;
const labels: Record<string, string> = { logged: "Logged - waiting for a price and approval", awaiting_approval: "Waiting for approval", approved: "Approved", rejected: "Not approved" };

/** The operative's extra form: description, practice photo, the resident's confirmation, then log. Mobile first, plain, labelled. */
export function SiteExtra() {
  const [jobs, setJobs] = useState<Job[] | null>(null), [extras, setExtras] = useState<Extra[]>([]), [error, setError] = useState(""), [done, setDone] = useState(""), [busy, setBusy] = useState(false);
  const [jobId, setJobId] = useState(""), [description, setDescription] = useState(""), [note, setNote] = useState(""), [photo, setPhoto] = useState<Photo | null>(null), [confirmed, setConfirmed] = useState(false);
  const commandId = useRef(crypto.randomUUID());
  const attempt = useRef<string | null>(null), pending = useRef(false);
  const [sorCode, setSorCode] = useState(""), [quantity, setQuantity] = useState("1"), [visitId, setVisitId] = useState<string | null>(null);
  const [check, setCheck] = useState<SiteOrderCheck["orderCheck"] | null>(null);
  const [operative, setOperative] = useState(false);
  const [supervisor, setSupervisor] = useState(false), [queries, setQueries] = useState<Array<ReturnType<typeof siteSupervisorQueryV1.parse>>>([]), [queryReadError, setQueryReadError] = useState("");
  const [workStatus, setWorkStatus] = useState<"" | keyof typeof workLabels>("");
  const [workStatements, setWorkStatements] = useState<NonNullable<ReturnType<typeof siteSupervisorQueriesV1.parse>["workStatuses"]>>([]);
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
      setSupervisor(extrasBody.role === "supervisor"); setOperative(extrasBody.role === "operative");
      setJobs(jobsBody.jobs.map((x: Job) => ({ jobId: x.jobId, reference: x.reference, openVisitId: x.openVisitId }))); setExtras(extrasBody.extras); setLoadState("ready");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Jobs and extras could not load."); setLoadState("failed");
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (jobs && jobs.length && !jobId) { setJobId(jobs[0]!.jobId); setVisitId(jobs[0]!.openVisitId); } }, [jobs, jobId]);
  useEffect(() => {
    setQueries([]); setWorkStatements([]); setQueryReadError("");
    if (!supervisor || !jobId) return;
    const controller = new AbortController();
    void fetch(`/api/contractor/jobs/${jobId}/supervisor-queries`, { cache: "no-store", signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("Supervisor questions are unavailable.");
      const body = siteSupervisorQueriesV1.parse(await response.json());
      if (body.jobId !== jobId) throw new Error("Job response mismatch.");
      if (!controller.signal.aborted) { setQueries(body.queries); setWorkStatements(body.workStatuses ?? []); }
    }).catch(() => { if (!controller.signal.aborted) setQueryReadError("Supervisor questions are unavailable."); });
    return () => controller.abort();
  }, [supervisor, jobId]);
  const queryAttempt = useRef<string | null>(null);
  const locked = photo !== null || busy || queryAttempt.current !== null;
  function chooseJob(id: string) { setWorkStatus(""); setJobId(id); setSorCode(""); setCheck(null); setVisitId(jobs?.find(j => j.jobId === id)?.openVisitId ?? null); }
  async function attach() {
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/northside/photo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ version: "northside-command.v1", jobId, description: sorCode ? description : "Generated practice photo", note: sorCode ? note : "Attach a generated practice photo" }) });
      const body = await r.json(); if (!r.ok) throw new Error(`The practice photo could not be attached (${body.code}).`);
      // Free-text words stay on this device until Log extra. Bind the reviewed
      // field values to the returned photo hash; the log verifies it server-side.
      setPhoto(sorCode ? body : { ...body, shownContentSha256: siteExtraContentSha256V1({ jobId, description, note, photoSha256: body.photoSha256 }) });
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function log() {
    if (!photo || !confirmed || !workStatus || pending.current || (sorCode && (!workStatus || !check || check.outcome === "already_on_order"))) return; pending.current = true; setBusy(true); setError(""); setDone("");
    try {
      attempt.current ??= JSON.stringify(sorCode ? { version: "log-sor-site-extra.v2", workStatus, commandId: commandId.current, sorCode, quantity, description, note, photoEvidenceId: photo.photoEvidenceId, residentConfirmation: { shownContentSha256: photo.shownContentSha256 }, ...(visitId ? { siteVisitId: visitId } : {}) } : { version: "log-site-extra.v4", workStatus, commandId: commandId.current, description, note, photoEvidenceId: photo.photoEvidenceId, residentConfirmation: { shownContentSha256: photo.shownContentSha256 } });
      const r = await fetch(`/api/contractor/jobs/${jobId}/site-extras${sorCode ? "/sor" : ""}`, { method: "POST", headers: { "content-type": "application/json" }, body: attempt.current });
      const body = await r.json(); if (!r.ok) throw new Error(`The extra was not logged (${body.code}).`);
      const result = sorCode ? sorSiteExtraSubmittedV2.parse(body) : siteExtraLoggedV4.parse(body);
      if (result.jobId !== jobId) throw new Error("Job response mismatch.");
      attempt.current = null; setWorkStatus(""); setSorCode(""); setCheck(null); setQuantity("1");
      setDone(sorCode ? "Extra logged and priced by the server, and submitted for approval." : "Extra logged. It is waiting for a price and approval."); setPhoto(null); setConfirmed(false); setDescription(""); setNote(""); commandId.current = crypto.randomUUID(); await load();
    } catch (e) { setError((e as Error).message); } finally { pending.current = false; setBusy(false); }
  }
  async function askSupervisor() {
    if (!check || check.outcome !== "already_on_order" || !check.orderRevisionId || !check.orderLineScopeItemId || pending.current) return;
    pending.current = true; setBusy(true); setError(""); setDone("");
    try {
      queryAttempt.current ??= JSON.stringify({ version: "record-site-supervisor-query.v1", commandId: commandId.current, orderLineScopeItemId: check.orderLineScopeItemId, sorCode, quantity, expectedOrderRevisionId: check.orderRevisionId });
      const r = await fetch(`/api/contractor/jobs/${jobId}/supervisor-queries`, { method: "POST", headers: { "content-type": "application/json" }, body: queryAttempt.current });
      const body = await r.json(); if (!r.ok) throw new Error(`Supervisor question could not be confirmed (${body.code}). Retry the same question.`);
      const answer = siteSupervisorQueryV1.parse(body);
      if (answer.jobId !== jobId) throw new Error("Job response mismatch.");
      queryAttempt.current = null; commandId.current = crypto.randomUUID(); setSorCode(""); setCheck(null); setQuantity("1");
      setDone("Question recorded for your supervisor. No extra was created.");
    } catch (cause) { setError((cause as Error).message); } finally { pending.current = false; setBusy(false); }
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
        <p role="status">{!check ? "Checking order…" : check.outcome === "already_on_order" ? "Already on the order. Record a question for your supervisor; this is not an extra." : check.outcome === "new" ? "New extra" : `${check.extraQuantity} ${check.unit} more than ordered`}</p>{check?.outcome === "already_on_order" && <div className={styles.actions}><button disabled={busy || !check.orderRevisionId} onClick={() => void askSupervisor()}>Ask supervisor</button></div>}</>}
      <p data-testid="proceed-comparison">Proceed limit comparison: {sorCode ? check?.proceedComparison === "within" ? "within the limit" : check?.proceedComparison === "above" ? "above the limit" : "unavailable" : "above the limit (unpriced)"}. This is a comparison and does not grant permission to proceed.</p>
      <fieldset disabled={locked}><legend>Work status — your own statement</legend><div className={styles.actions}>{(Object.keys(workLabels) as Array<keyof typeof workLabels>).map(value => <button key={value} type="button" aria-pressed={workStatus === value} onClick={() => setWorkStatus(value)}>{workLabels[value]}</button>)}</div>{workStatus && <p role="status">Your statement: {workLabels[workStatus]}</p>}<p>Work timing and any preapproval breach are not determined by this statement. Later approval does not erase a breach.</p></fieldset>
      <div className={styles.row}><label htmlFor="description">What is the extra work?</label><input id="description" value={description} disabled={locked} maxLength={500} onChange={e => setDescription(e.target.value)} /></div>
      {!sorCode && !locked && <div className={styles.row}><LocalDictation onUse={text => setDescription(text.slice(0, 500))} /></div>}
      <div className={styles.row}><label htmlFor="note">Note for the office</label><textarea id="note" rows={3} value={note} disabled={locked} maxLength={5000} onChange={e => setNote(e.target.value)} /></div>
      {!photo ? <div className={styles.actions}><button disabled={busy || !workStatus || !jobId || !description.trim() || !note.trim() || Boolean(sorCode && (!workStatus || !check || check.outcome === "already_on_order"))} onClick={() => void attach()}>Attach practice photo</button></div>
        : <><p className={styles.ok} data-testid="photo-attached">Practice photo attached. Show the resident this description and photo.</p><p>Content hash: <code>{photo.shownContentSha256}</code></p>
          <label className={styles.confirmation}><input type="checkbox" checked={confirmed} disabled={busy || attempt.current !== null} onChange={e => setConfirmed(e.target.checked)} /> The resident has seen this and confirms it (identity not verified)</label>
          <div className={styles.actions}><button disabled={busy || !confirmed || !workStatus} onClick={() => void log()}>Log extra</button></div></>}
    </section>}
    <section className={styles.card} aria-label="My extras"><h2>My extras</h2>
      {loadState !== "ready" ? <p>{loadState === "loading" ? "Loading extras…" : "Extras are unavailable."}</p> : extras.length === 0 ? <p>None yet.</p> : <ul>{extras.map(x => <li key={x.extraId} data-testid="my-extra"><strong>{x.orderReference}</strong>: {x.description} <span className={styles.pill} data-testid="my-extra-state">{x.outcome ? labels[x.outcome] ?? x.outcome : labels[x.state] ?? x.state}</span>{x.quotedPence !== null && <> · price {pounds(x.quotedPence)}</>}{x.hasPhoto && " · photo"}{x.residentConfirmed && " · resident confirmed"}{supervisor && workStatements.filter(statement => statement.extraId === x.extraId).map(statement => <p key={statement.extraId}>Operative statement: {workLabels[statement.workStatus]} · operative {statement.operativeMembershipId} · recorded {statement.recordedAt}. Work timing and any preapproval breach remain separate; later approval does not erase a breach.</p>)}<ExtraProceed jobId={x.jobId} extraId={x.extraId} canRecord={operative} /></li>)}</ul>}
    </section>
    {supervisor && <section className={styles.card} aria-label="Supervisor questions"><h2>Questions on this job</h2>
      <p>These are within the order. No extra or price was created. Resolving questions is not available yet.</p>
      {queryReadError ? <p role="alert">{queryReadError}</p> : queries.length === 0 ? <p>No questions to show.</p> : <ul>{queries.map(query => <li key={query.queryId} data-testid="supervisor-query"><strong>{query.sorCode}</strong>: claimed quantity {query.quantity} · order line {query.orderLineScopeItemId} · operative {query.operativeMembershipId} · recorded {query.recordedAt}</li>)}</ul>}
    </section>}
  </main>;
}
