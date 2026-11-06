"use client";
import Link from"next/link";import{useCallback,useEffect,useRef,useState}from"react";import{jobValueResponseV1,type JobValueResponse}from"@jobguard/api/value-contracts";
const pounds=(pence:number)=>`£${(pence/100).toLocaleString("en-GB",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
function Card({testId,title,outcome}:{testId:string;title:string;outcome:JobValueResponse["approvedExtras"]}){return <article className="value-card"><h2>{title}</h2><strong data-testid={testId}>{outcome.pence===null?"No recorded outcome yet":pounds(outcome.pence)}</strong><p>{outcome.basis==="net"?"Net — VAT excluded":"Gross — VAT included"} · Synthetic practice facts</p>{outcome.sources.map(source=><Link key={source.id} href={source.href}>{source.label} · source {source.id}</Link>)}</article>}
type ReadState =
 | { jobId: string; status: "loading" }
 | { jobId: string; status: "failed"; focusError: boolean }
 | { jobId: string; status: "ready"; value: JobValueResponse };

export function ValuePage({jobId}:{jobId:string}) {
 const [state, setState] = useState<ReadState>({ jobId, status: "loading" });
 const requestId = useRef(0);
 const heading = useRef<HTMLHeadingElement>(null);
 const retry = useRef<HTMLButtonElement>(null);
 const load = useCallback(async (focusError = false) => {
  const request = ++requestId.current;
  setState({ jobId, status: "loading" });
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
  if (state.jobId === jobId && state.status === "failed" && state.focusError && (document.activeElement === document.body || document.activeElement === retry.current)) heading.current?.focus();
 }, [state, jobId]);
 if (state.jobId !== jobId || state.status === "loading") return <main className="workspace-page" aria-busy="true"><p role="status">Loading your persisted money position…</p><button type="button" onClick={()=>void load()}>Refresh persisted facts</button></main>;
 if (state.status === "failed") return <main className="workspace-page"><section role="alert"><h1 ref={heading} tabIndex={-1}>Your job value could not load</h1></section><button ref={retry} className="primary" onClick={()=>void load(true)}>Try again</button></main>;
 const value = state.value;
 return <main className="workspace-page value-page"><p className="sandbox-banner">Practice sandbox — synthetic data; nothing is sent or charged</p><Link href={`/jobs/${jobId}`}>← Back to job</Link><header><p className="eyebrow">Inspectable facts, not estimated savings</p><h1>How JobGuard helps protect your money</h1><p>This page does not guess ROI or add approved extras to invoice totals. Every outcome below links to its persisted source.</p></header><section className="value-grid" aria-label="Job money position"><Card testId="value-approved-extras" title="Approved extra work" outcome={value.approvedExtras}/><Card testId="value-approved-reductions" title="Approved reductions" outcome={value.approvedReductions}/><Card testId="value-invoiced-gross" title="Customer invoices" outcome={value.invoicedGross}/><Card testId="value-recorded-gross" title="Customer receipts recorded" outcome={value.recordedGross}/><Card testId="value-outstanding-gross" title="Still outstanding" outcome={value.outstandingGross}/></section><section><h2>Quote coverage</h2>{value.quoteCoverage.length?value.quoteCoverage.map(source=><Link key={source.id} href={source.href}>{source.label} · source {source.id}</Link>):<p>No recorded outcome yet</p>}</section><section><h2>Waiting for a decision</h2>{value.pendingExtras.length?value.pendingExtras.map(extra=><article key={extra.id}><h3>{extra.description}</h3><strong>Awaiting approval</strong><p>{pounds(extra.pence)} net · Synthetic proposal, not earned or saved</p><Link href={extra.href}>Variation revision {extra.revision} · source {extra.id}</Link></article>):<p>No recorded outcome yet</p>}</section><section><h2>Actions blocked until proof was ready</h2>{value.blockedActions.length?value.blockedActions.map(blocker=><article key={blocker.id}><h3>{blocker.title}</h3><p>{blocker.explanation}</p><Link href={blocker.href}>Inspect source {blocker.sourceRef}</Link></article>):<p>No recorded outcome yet</p>}</section><button type="button" onClick={()=>void load()}>Refresh persisted facts</button></main>}
