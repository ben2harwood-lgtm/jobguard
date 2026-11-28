"use client";
import { INVOICE_CHANGED_EVENT } from "./customer-payment-status";
import { JOB_SAVED_EVENT } from "./job-page-fetch";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { jobValueResponseV1, type JobValueResponse } from "@jobguard/api/value-contracts";
const pounds=(pence:number)=>`£${(pence/100).toLocaleString("en-GB",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
function sourceHref(href: string, jobId?: string) {
 if (!jobId) return href;
 const prefix = `/jobs/${jobId}#`;
 if (!href.startsWith(prefix)) return href;
 const anchor = href.slice(prefix.length);
 return `/jobs/${jobId}/${anchor.startsWith("invoice-") ? "money" : "work"}#${anchor}`;
}
function Card({ testId, title, outcome, jobId }: {
 testId: string; title: string; outcome: JobValueResponse["approvedExtras"]; jobId?: string | undefined;
}) {
 const SourceLink = jobId ? "a" : Link;
 return <article className="value-card">
  <h2>{title}</h2>
  <strong data-testid={testId}>{outcome.pence === null ? "No recorded outcome yet" : pounds(outcome.pence)}</strong>
  <p>{outcome.basis === "net" ? "Net — VAT excluded" : "Gross — VAT included"} · Synthetic practice facts</p>
  {outcome.sources.map(source => <SourceLink key={source.id} href={sourceHref(source.href, jobId)}>{source.label} · source {source.id}</SourceLink>)}
 </article>;
}
type ReadState =
 | { jobId: string; status: "loading" }
 | { jobId: string; status: "failed"; focusError: boolean }
 | { jobId: string; status: "ready"; value: JobValueResponse };

export function ValuePage({jobId,designed=false}:{jobId:string;designed?:boolean}) {
 const [state, setState] = useState<ReadState>({ jobId, status: "loading" });
 const requestId = useRef(0);
 const heading = useRef<HTMLHeadingElement>(null);
 const retry = useRef<HTMLButtonElement>(null);
 const load = useCallback(async (focusError = false, refresh = false) => {
  const request = ++requestId.current;
  if (!refresh) setState({ jobId, status: "loading" });
  try {
   const response = await fetch(`/api/jobs/${jobId}/value`, { method: "GET", cache: "no-store" });
   if (!response.ok) throw new Error();
   const value = jobValueResponseV1.parse(await response.json());
   if (value.jobId !== jobId) throw new Error();
   if (request === requestId.current) setState({ jobId, status: "ready", value });
  } catch {
   if (request === requestId.current) setState({ jobId, status: "failed", focusError });
  }
 }, [jobId]);
 useEffect(() => {
  void load();
  // Invalidate responses from the previous job or an unmounted page.
  return () => { ++requestId.current; };
 }, [load]);
 useEffect(() => {
  if (!designed) return;
  const changed = (event: Event) => {
   if ((event as CustomEvent<{ jobId?: string }>).detail?.jobId === jobId) void load(false, true);
  };
  // A credit note or other correction saved on this page publishes a job save, not an invoice change.
  window.addEventListener(INVOICE_CHANGED_EVENT, changed);
  window.addEventListener(JOB_SAVED_EVENT, changed);
  return () => { window.removeEventListener(INVOICE_CHANGED_EVENT, changed); window.removeEventListener(JOB_SAVED_EVENT, changed); };
 }, [designed, jobId, load]);
 useEffect(() => {
  if (state.jobId === jobId && state.status === "failed" && state.focusError && (document.activeElement === document.body || document.activeElement === retry.current)) heading.current?.focus();
 }, [state, jobId]);
 const reportReady = state.jobId === jobId && state.status === "ready";
 useEffect(() => {
  if (!designed || !reportReady || location.hash !== "#paid-report") return;
  document.getElementById("paid-report")?.scrollIntoView({ block: "start" });
 }, [designed, jobId, reportReady]);
 if (state.jobId !== jobId || state.status === "loading") return <main className="workspace-page" aria-busy="true"><p role="status">Loading your persisted money position…</p><button type="button" onClick={()=>void load()}>Refresh persisted facts</button></main>;
 if (state.status === "failed") return <main className="workspace-page"><section role="alert"><h1 ref={heading} tabIndex={-1}>Your job value could not load</h1></section><button ref={retry} className="primary" onClick={()=>void load(true)}>Try again</button></main>;
 const value = state.value;
 const designedJob = designed ? jobId : undefined;
 const priced = value.foundAfterLock.filter(extra => extra.pence !== null);
 const Report = designed ? "section" : "main";
 return <Report id={designed ? "paid-report" : undefined} className={designed ? "card card-body designed-money-card value-page" : "workspace-page value-page"}>
  {!designed && <><p className="sandbox-banner">Practice sandbox — synthetic data; nothing is sent or charged</p><Link href={`/jobs/${jobId}`}>← Back to job</Link></>}
  <header>
   <p className="eyebrow">Inspectable facts, not estimated savings</p>
   <h1>How JobGuard helps protect your money</h1>
   {value.foundAfterLock.length > 0 && <section data-testid="value-found-after-lock" aria-label="Found after your bill was complete">
    {priced.length > 0 && <p>Found after your bill was complete: {pounds(priced.reduce((sum, extra) => sum + extra.pence!, 0))} — from JobGuard's final check</p>}
    {value.foundAfterLock.map(extra => <p key={extra.id}><Link href={sourceHref(extra.href, designedJob)}>{extra.description}</Link>{extra.pence === null ? " — found, not priced yet" : " — net, VAT excluded"}{!extra.approved && " · awaiting approval"}</p>)}
    <Link href={sourceHref(`/jobs/${jobId}#final-check`, designedJob)}>Inspect the Final Check result</Link>
   </section>}
   <p>This page does not guess what the job earned you, and does not add approved extras to invoice totals. Each result below links to where it was saved.</p>
  </header>
  <section className="value-grid" aria-label="Job money position">
   <Card testId="value-approved-extras" title="Approved extra work" jobId={designedJob} outcome={value.approvedExtras}/>
   <Card testId="value-approved-reductions" title="Approved reductions" jobId={designedJob} outcome={value.approvedReductions}/>
   <Card testId="value-invoiced-gross" title="Customer invoices" jobId={designedJob} outcome={value.invoicedGross}/>
   <Card testId="value-recorded-gross" title="Customer receipts recorded" jobId={designedJob} outcome={value.recordedGross}/>
   <Card testId="value-outstanding-gross" title="Still outstanding" jobId={designedJob} outcome={value.outstandingGross}/>
  </section>
  <section><h2>Quote coverage</h2>
   {value.quoteCoverage.length ? value.quoteCoverage.map(source => <Link key={source.id} href={sourceHref(source.href, designedJob)}>{source.label} · source {source.id}</Link>) : <p>No recorded outcome yet</p>}
  </section>
  <section><h2>Waiting for a decision</h2>
   {value.pendingExtras.length ? value.pendingExtras.map(extra => <article key={extra.id}>
    <h3>{extra.description}</h3><strong>Awaiting approval</strong>
    <p>{pounds(extra.pence)} net · Synthetic proposal, not earned or saved</p>
    <Link href={sourceHref(extra.href, designedJob)}>Variation revision {extra.revision} · source {extra.id}</Link>
   </article>) : <p>No recorded outcome yet</p>}
  </section>
  <section><h2>Actions blocked until proof was ready</h2>
   {value.blockedActions.length ? value.blockedActions.map(blocker => <article key={blocker.id}>
    <h3>{blocker.title}</h3><p>{blocker.explanation}</p>
    <Link href={sourceHref(blocker.href, designedJob)}>Inspect source {blocker.sourceRef}</Link>
   </article>) : <p>No recorded outcome yet</p>}
  </section>
  <button className={designed ? "btn" : undefined} type="button" onClick={() => void load()}>Refresh persisted facts</button>
 </Report>;
}
