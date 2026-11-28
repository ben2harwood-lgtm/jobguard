"use client";
import { useEffect, useState } from "react";
import { v2JobProfitV1, type V2JobProfit as Profit } from "@jobguard/core";
import { JOB_SAVED_EVENT } from "./job-page-fetch";

export function V2JobProfit({ jobId }: { jobId: string }) {
  const [state, setState] = useState<{ jobId: string; profit: Profit | null; failed: boolean } | null>(null);
  useEffect(() => {
    // V2 only: outside local V2 the flag is absent, so the job page makes no profit request.
    if (process.env.NEXT_PUBLIC_JOBGUARD_V2_PROFIT !== "1") return;
    let current = 0, closed = false;
    const load = async () => {
      const generation = ++current;
      // Never show an old figure while a newer save is being read.
      setState(null);
      try {
        const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/profit-so-far`, { cache: "no-store" });
        const profit = response.ok ? v2JobProfitV1.parse(await response.json()) : null;
        if (!closed && generation === current) setState({ jobId, profit, failed: response.status >= 500 });
      } catch { if (!closed && generation === current) setState({ jobId, profit: null, failed: true }); }
    };
    const saved = (event: Event) => {
      if ((event as CustomEvent<{ jobId: string }>).detail?.jobId === jobId) void load();
    };
    void load();
    window.addEventListener(JOB_SAVED_EVENT, saved);
    return () => { closed = true; window.removeEventListener(JOB_SAVED_EVENT, saved); };
  }, [jobId]);
  if (!state || state.jobId !== jobId || (!state.profit && !state.failed)) return null;
  return <section aria-label="Job profit so far" className="detail-block" aria-live="polite">
    <h2>Job profit so far</h2>
    {state.profit ? <><p>{state.profit.summary}</p><p>{state.profit.notice}</p></>
      : <p>Job profit could not load. Refresh to try again.</p>}
  </section>;
}
