"use client";
import { useEffect, useState } from "react";
import { JOB_SAVED_EVENT } from "./job-page-fetch";

/** TOMMY-DEMO: only a saved simulated delivery counts as a sent quote; anything else keeps the plain status. */
export function quoteDeliveredFrom(raw: unknown): boolean {
  return typeof raw === "object" && raw !== null && (raw as { status?: unknown }).status === "simulated_delivery";
}

/** Reads the saved quote delivery for a quoting job, and again after any save on this page. */
export function useQuoteSent(jobId: string, status: string | undefined): boolean {
  const [sent, setSent] = useState(false);
  useEffect(() => {
    setSent(false);
    if (status !== "quoting") return;
    let current = true, controller: AbortController | null = null;
    const check = () => {
      controller?.abort(); const mine = new AbortController(); controller = mine;
      globalThis.fetch(`/api/jobs/${encodeURIComponent(jobId)}/quotes/delivery`, { cache: "no-store", signal: mine.signal })
        .then(async response => { const delivered = response.ok && quoteDeliveredFrom(await response.json()); if (current && !mine.signal.aborted) setSent(delivered); })
        .catch(() => { /* a failed read keeps the plain status */ });
    };
    const changed = (event: Event) => { const id = (event as CustomEvent<{ jobId?: string }>).detail?.jobId; if (!id || id === jobId) check(); };
    check();
    window.addEventListener(JOB_SAVED_EVENT, changed);
    return () => { current = false; controller?.abort(); window.removeEventListener(JOB_SAVED_EVENT, changed); };
  }, [jobId, status]);
  return sent;
}

/** The job's status words, reading "Quote sent" once a quoting job's quote has gone out. */
export function QuoteStatusLabel({ jobId, status, label }: { jobId: string; status: string; label: string }) {
  const sent = useQuoteSent(jobId, status);
  return sent && status === "quoting" ? "Quote sent" : label;
}
