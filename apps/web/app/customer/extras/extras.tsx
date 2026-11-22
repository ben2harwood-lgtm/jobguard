"use client";
import { useEffect, useState } from "react";
import { candidateM1TaxPolicy, customerVariationViewV1, money, type CustomerVariationView } from "@jobguard/core";
const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const pounds = (pence: number) => `${pence < 0 ? "−" : ""}${gbp.format(Math.abs(pence) / 100)}`;

export function extraPriceWords(pence: number, revision: number) {
  const vat = candidateM1TaxPolicy.calculateGroup(money(pence), "standard_rate_20");
  const total = pounds(pence + vat.pence);
  return {
    price: `Revision ${revision} · ${pounds(pence)} plus VAT ${pounds(vat.pence)} · total ${total}`,
    approval: `Approve revision ${revision} for ${total} including VAT`,
  };
}

export default function CustomerExtras({ pilot = false }: { pilot?: boolean }) {
  const [view, setView] = useState<CustomerVariationView>(), [notice, setNotice] = useState("Loading extras…"), [busy, setBusy] = useState(false);
  async function load() {
    setView(undefined);
    try {
      const jobId = new URLSearchParams(window.location.search).get("jobId");
      const response = await fetch("/api/customer-portal/variations/read", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({version:"customer-variations-read.v1",jobId}), cache:"no-store" });
      if (!response.ok) throw new Error();
      setView(customerVariationViewV1.parse(await response.json())); setNotice("");
    } catch { setNotice("Extras are unavailable. Sign in using your builder’s latest email link."); }
  }
  useEffect(() => { void load(); }, []);
  async function approve(item: CustomerVariationView["variations"][number]) {
    if (!view || busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/customer-portal/variation-approvals", { method:"POST", headers:{"Content-Type":"application/json"}, cache:"no-store",
        body:JSON.stringify({version:"customer-portal-approval.v1",commandId:crypto.randomUUID(),jobId:view.jobId,expectedJobRevision:view.jobRevision,
          target:{kind:"variation",id:item.id,revision:item.revision,hash:item.hash,amount:item.amount}}) });
      await load();
      setNotice(response.ok ? "Your approval has been recorded for that exact revision." : "Approval was not confirmed. Review the current revision before trying again.");
    } catch { setView(undefined); setNotice("Approval could not be confirmed. Reload extras to check before trying again."); }
    finally { setBusy(false); }
  }
  return <main style={{ overflowWrap: "anywhere" }}><h1>Review extras</h1><p>{pilot ? "No-charge pilot fixture" : "Synthetic practice"} · each approval applies only to the revision and signed amount shown.</p><p role="status">{notice}</p>
    <button disabled={busy} onClick={() => void load()}>Reload extras</button>
    {view?.variations.length === 0 && <p>No priced extras to review.</p>}
    {view?.variations.map(item => {
      const { price, approval } = pilot ? {
        price: `Revision ${item.revision} · ${pounds(item.amount.pence)} net`,
        approval: `Approve revision ${item.revision} for ${pounds(item.amount.pence)} net`,
      } : extraPriceWords(item.amount.pence, item.revision);
      return <section key={item.id}><h2>{item.description}</h2><p>{price}</p><p>Content hash: <code>{item.hash}</code></p>
        {item.approved ? <p>Approved · {item.method === "customer_authenticated" ? "authenticated customer" : item.method === "builder_attestation" ? "builder attestation" : "customer evidence"}</p> : <button disabled={busy} onClick={() => void approve(item)}>{approval}</button>}
      </section>;
    })}
  </main>;
}
