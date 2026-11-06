"use client";
import React, { useEffect, useState } from "react";
type View = { invoiceNumber: string; amountDue: { pence: number; currency: "GBP" }; options: { rail: "card" | "pay_by_bank" | "bank_transfer"; customerTotal: { pence: number; currency: "GBP" } }[] };
const names = { card: "Card", pay_by_bank: "Pay by bank", bank_transfer: "Bank transfer" };
const gbp = (pence: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
export function PracticePayNowView({ view }: { view: View }) {
  return <><h2>Invoice {view.invoiceNumber}</h2><p>Amount due {gbp(view.amountDue.pence)}</p>
    <ul aria-label="Practice payment options" style={{ padding: 0, listStyle: "none" }}>
      {view.options.map(option => <li key={option.rail} style={{ padding: "16px", border: "1px solid currentColor", marginBottom: "12px", fontWeight: 400 }}>
        <span>{names[option.rail]}</span><span> · {gbp(option.customerTotal.pence)}</span>
      </li>)}
    </ul>{view.options.length === 0 && <p>No amount remains due.</p>}</>;
}
export default function PracticePayNow() {
  const [view, setView] = useState<View>(), [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    void fetch("/api/customer-portal/practice-pay-now", { cache: "no-store" })
      .then(async response => { if (!response.ok) throw new Error(); return response.json() as Promise<View>; })
      .then(data => { if (active) setView(data); }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, []);
  return <main style={{ maxWidth: "40rem", padding: "16px", overflowWrap: "anywhere" }}>
    <h1>Practice payment options</h1><p>Practice only — no money moves. These options are display only.</p>
    {view ? <PracticePayNowView view={view} /> : <p role="status">{failed ? "This practice invoice is unavailable. Ask your builder for a new sign-in link." : "Loading your practice invoice…"}</p>}
  </main>;
}
