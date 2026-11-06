"use client";
import React, { useEffect, useState } from "react";
import type { MerchantDeliveryRecord } from "@jobguard/core";
export function MerchantDeliverySummary({ view }: { view: MerchantDeliveryRecord }) {
 return <>{view.suppliers.length === 0 && <p>No ready delivery records.</p>}{view.suppliers.map(row=><section key={row.supplierContext}>
  <h2>{row.supplierContext}</h2>
  <p>Orders received: {row.ordersReceived}</p>
  {row.sample === "not enough to say" ? <p>not enough to say — fewer than 3 orders</p> : <>
   <p>Orders with anything missing: {row.ordersMissing}</p><p>Orders with anything rejected: {row.ordersRejected}</p>
   <p>Orders first short with more added later: {row.ordersAddedLater}</p>
  </>}
 </section>)}</>;
}
export function MerchantReliabilityScreen({ jobId }: { jobId: string }) {
 const [view,setView] = useState<MerchantDeliveryRecord | null>(null);
 const [error,setError] = useState(false);
 useEffect(()=>{
  let active=true;
  setView(null); setError(false);
  void fetch(`/api/jobs/${encodeURIComponent(jobId)}/merchant-reliability`,{cache:"no-store",credentials:"same-origin"})
   .then(async response=>{ if (!response.ok) throw new Error(); return response.json() as Promise<MerchantDeliveryRecord>; })
   .then(result=>{if(active)setView(result);}).catch(()=>{if(active)setError(true);});
  return ()=>{active=false;};
 },[jobId]);
 return <main><h1>Your merchant delivery record — practice</h1>
  <p>This is your own record on fictional data, not a judgement on the merchant. Counts are descriptive and uncertain; they are not a score or ranking.</p>
  {error ? <p role="alert">Record unavailable. Sign in to your company and refresh.</p> : view ? <MerchantDeliverySummary view={view}/> : <p>Loading record…</p>}
 </main>;
}
