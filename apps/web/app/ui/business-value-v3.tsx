"use client";
import { useEffect, useState } from "react";
import { z } from "zod";

const resultV1 = z.object({
 version: z.literal("business-value-result.v1"), state: z.literal("unavailable"),
 code: z.enum(["BUSINESS_VALUE_BINDING_HELD", "BUSINESS_VALUE_SELECTION_HELD", "INVALID_BUSINESS_VALUE_SELECTION", "UNAUTHENTICATED", "SYNTHETIC_MODE_REQUIRED", "BUSINESS_VALUE_UNAVAILABLE"]),
}).strict();

export function BusinessValueV3() {
 const [state, setState] = useState("Loading current availability…");
 const [revision, refresh] = useState(0);
 useEffect(() => {
  const abort = new AbortController();
  setState("Loading current availability…");
  void (async () => {
   try {
    // Selection is checked by the server; never turn browser values into amounts.
    const response = await fetch(`/api/value${window.location.search}`, { cache: "no-store", signal: abort.signal });
    const parsed = resultV1.safeParse(await response.json());
    if (abort.signal.aborted) return;
    if (!parsed.success) { setState("Value is unavailable. Refresh to try again."); return; }
    switch (parsed.data.code) {
     case "UNAUTHENTICATED": setState("Sign in to your practice session to view availability."); break;
     case "SYNTHETIC_MODE_REQUIRED": setState("This page is available in synthetic practice only."); break;
     case "INVALID_BUSINESS_VALUE_SELECTION": setState("This value selection is unsupported."); break;
     case "BUSINESS_VALUE_SELECTION_HELD": setState("The selected period or value window is unavailable."); break;
     case "BUSINESS_VALUE_BINDING_HELD": setState("Business value is unavailable while source and billing-period access are being connected."); break;
     default: setState("Value is unavailable. Refresh to try again.");
    }
   } catch { if (!abort.signal.aborted) setState("Value is unavailable. Refresh to try again."); }
  })();
  return () => abort.abort();
 }, [revision]);
 return <main style={{ maxWidth: 760, margin: "0 auto", padding: 20, overflowWrap: "anywhere" }}>
  <p>Practice sandbox — synthetic data; nothing is sent or charged</p>
  <h1>Business value</h1>
  <p role="status" aria-live="polite" data-testid="business-value-status">{state}</p>
  <section aria-labelledby="business-sources-title">
   <h2 id="business-sources-title">Job sources</h2>
   <p>Source-linked totals and original or reversal movements are unavailable.</p>
   <p>Existing job receipts and exports remain available from each job.</p>
  </section>
  <section aria-labelledby="business-subscription-title">
   <h2 id="business-subscription-title">Subscription by billing period</h2>
   <p>Unavailable. Subscription periods are separate from job amounts and success fees.</p>
  </section>
  <section aria-labelledby="business-receipt-title">
   <h2 id="business-receipt-title">As-of value receipt</h2>
   <p>Unavailable until an authorised source snapshot can be read. No receipt has been created by this page.</p>
  </section>
  <button type="button" onClick={() => refresh(n => n + 1)} style={{ minHeight: 44, minWidth: 44 }}>Refresh availability</button>
  <p><a href="/" style={{ display: "inline-block", minHeight: 44, paddingTop: 12 }}>Back to jobs</a></p>
 </main>;
}
