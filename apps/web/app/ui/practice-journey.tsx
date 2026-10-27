"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { practiceInvoiceResponseV1 } from "@jobguard/api/customer-invoice-contracts";
import { feeIllustrationResponseV1 } from "@jobguard/api/fee-illustration-contracts";
import { variationWorkspaceResponseV1 } from "@jobguard/api/variation-contracts";

const proofView = z.object({
 version: z.literal("practice-proof-view.v1"), environment: z.literal("synthetic_demo"), jobId: z.string().uuid(),
 completion: z.object({ id: z.string().uuid(), reviewRequired: z.boolean() }).nullable(), realExternalActions: z.literal(0),
});
type Snapshot = { proofComplete: boolean; variationsApproved: boolean; invoiceIssued: boolean; balancePence: number; feePrepared: boolean; realExternalActions: 0 };
type ReadState = { jobId: string; status: string } & (
 { phase: "loading" | "failed" } | { phase: "ready"; snapshot: Snapshot }
);

// Absence is allowed only for the named endpoint's documented lifecycle response.
async function readJson(path: string, signal: AbortSignal, absent?: { status: number; code: string }) {
 const response = await fetch(path, { cache: "no-store", signal });
 const body: unknown = await response.json();
 if (response.ok) return body;
 if (absent && response.status === absent.status && z.object({ code: z.literal(absent.code) }).strict().safeParse(body).success) return undefined;
 throw new Error("Practice progress unavailable");
}

/** Persisted read models decide the next step; this component never advances a job locally. */
export function PracticeJourney({ jobId, status }: { jobId: string; status: string }) {
 const [state, setState] = useState<ReadState>({ jobId, status, phase: "loading" });
 const generation = useRef(0), activeRequest = useRef<AbortController | null>(null);
 const currentJob = useRef({ jobId, status }); currentJob.current = { jobId, status };
 const errorHeading = useRef<HTMLHeadingElement>(null);
 const load = useCallback(async () => {
  const request = ++generation.current;
  activeRequest.current?.abort();
  const controller = new AbortController(); activeRequest.current = controller;
  const isCurrent = () => request === generation.current && !controller.signal.aborted && currentJob.current.jobId === jobId && currentJob.current.status === status;
  setState({ jobId, status, phase: "loading" });
  try {
   const path = `/api/jobs/${jobId}`, beforeActivation = ["draft", "quoting", "accepted"].includes(status);
   const [proofRaw, variationsRaw, invoicesRaw, feeRaw] = await Promise.all([
    readJson(`${path}/proof`, controller.signal, status === "draft" ? { status: 404, code: "NOT_FOUND" } : undefined),
    readJson(`${path}/variations`, controller.signal, beforeActivation ? { status: 400, code: "ACTIVATION_REQUIRED" } : undefined),
    readJson(`${path}/customer-invoices`, controller.signal),
    readJson(`${path}/fee-illustration`, controller.signal, { status: 404, code: "NOT_FOUND" }),
   ]);
   const proof = proofRaw === undefined ? null : proofView.parse(proofRaw);
   const variations = variationsRaw === undefined ? null : variationWorkspaceResponseV1.parse(variationsRaw);
   const invoices = practiceInvoiceResponseV1.parse(invoicesRaw);
   const fee = feeRaw === undefined ? null : feeIllustrationResponseV1.parse(feeRaw);
   if ((proof && proof.jobId !== jobId) || (variations && variations.jobId !== jobId) || invoices.jobId !== jobId) throw new Error("Wrong job projection");
   const invoice = invoices.invoices.at(-1);
   if (isCurrent()) setState({ jobId, status, phase: "ready", snapshot: {
    proofComplete: !!proof?.completion && !proof.completion.reviewRequired,
    variationsApproved: !!variations?.variations.some(item => item.revisions.some(revision => revision.approved)),
    invoiceIssued: !!invoice, balancePence: invoice?.balancePence ?? 0, feePrepared: !!fee, realExternalActions: proof?.realExternalActions ?? 0,
   } });
  } catch {
   if (isCurrent()) setState({ jobId, status, phase: "failed" });
  }
 }, [jobId, status]);
 useEffect(() => { void load(); return () => { generation.current++; activeRequest.current?.abort(); }; }, [load]);
 const phase = state.jobId === jobId && state.status === status ? state.phase : "loading";
 useEffect(() => { if (phase === "failed") errorHeading.current?.focus(); }, [phase]);
 const retry = <button type="button" style={{ minHeight: 44, minWidth: 44 }} onClick={() => void load()}>{phase === "failed" ? "Try checking saved progress again" : "Check saved progress"}</button>;
 if (phase !== "ready" || state.phase !== "ready") return <section className="journey-progress" aria-label="Practice journey progress" data-testid="uiwire15-journey">
  <p className="eyebrow">One persisted practice job</p>
  {phase === "failed" ? <div role="alert"><h2 ref={errorHeading} tabIndex={-1}>Saved progress could not be checked</h2><p>Earlier progress may be out of date. Balance, next step and completion are unavailable until a fresh check succeeds.</p></div> : <p role="status">Checking saved progress… Balance and completion are not yet known.</p>}
  {retry}
 </section>;
 const snapshot = state.snapshot;
 const completed=snapshot.invoiceIssued&&snapshot.balancePence===0&&snapshot.feePrepared;let next={label:"Review and confirm the captured work",target:"#scope"};if(status==="quoting")next={label:"Finish quote v2 and record acceptance",target:"#quote"};if(status==="accepted")next={label:"Start this practice job",target:"#quote"};if(status==="live")next=!snapshot.proofComplete?{label:"Resolve the Decision and finish proof",target:"#work-proof"}:!snapshot.variationsApproved?{label:"Record and approve the variations",target:"#job-variations"}:!snapshot.invoiceIssued?{label:"Build and issue the £1,320 final invoice",target:"#final-account-title"}:snapshot.balancePence>0?{label:"Record the next customer payment",target:"#customer-invoices"}:!snapshot.feePrepared?{label:"Open the fee illustration",target:"#fee-illustration"}:next;return <section className="journey-progress" aria-label="Practice journey progress" data-testid="uiwire15-journey"><p className="eyebrow">One persisted practice job</p>{completed?<><h2>You finished this practice job</h2><p>The capture, accepted quote, proof, variations, invoice and receipts remain linked to this job.</p><a className="primary" href={`/jobs/${jobId}/value`}>How JobGuard helps protect your money</a></>:<><h2>Continue this job</h2><a className="primary" data-testid="uiwire15-continue" href={next.target}>{next.label}</a></>}<dl><div><dt>Customer balance</dt><dd data-testid="journey-customer-balance">GBP {(snapshot.balancePence/100).toLocaleString("en-GB",{minimumFractionDigits:2,maximumFractionDigits:2})}</dd></div><div><dt>Real external actions</dt><dd data-testid="journey-real-external-actions">{snapshot.realExternalActions}</dd></div></dl>{retry}</section>;
}
