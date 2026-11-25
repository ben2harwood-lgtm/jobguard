"use client";
import { useEffect, useRef, useState } from "react";
import { candidateM1TaxPolicy, customerVariationViewV2, money, type CustomerVariationView } from "@jobguard/core";
const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const pounds = (pence: number) => `${pence < 0 ? "−" : ""}${gbp.format(Math.abs(pence) / 100)}`;
type Extra = CustomerVariationView["variations"][number];
type Photo = Extra["photos"][number];

export function extraPriceWords(pence: number, revision: number) {
  const vat = candidateM1TaxPolicy.calculateGroup(money(pence), "standard_rate_20");
  const total = pounds(pence + vat.pence);
  return {
    price: `Revision ${revision} · ${pounds(pence)} plus VAT ${pounds(vat.pence)} · total ${total}`,
    approval: `Approve revision ${revision} for ${total} including VAT`,
  };
}

/** QW-1b: the approval binds the exact photos shown, in the order shown (withdrawn ones included).
 * An extra without photos sends no `photos` key, so its request is unchanged from before QW-1. */
export function extraApprovalRequest(view: CustomerVariationView, item: Extra, commandId: string) {
  return { version: "customer-portal-approval.v1" as const, commandId, jobId: view.jobId, expectedJobRevision: view.jobRevision,
    target: { kind: "variation" as const, id: item.id, revision: item.revision, hash: item.hash, amount: item.amount,
      ...(item.photos.length > 0 ? { photos: item.photos.map(photo => photo.sha256) } : {}) } };
}

export const PHOTOS_CHANGED_NOTICE = "The photos on this extra have changed. Check them again before approving.";

/** Sends one approval, always reloads the view afterwards, and returns the notice to show. */
export async function submitExtraApproval(post: (body: unknown) => Promise<Response>, reload: () => Promise<void>,
  view: CustomerVariationView, item: Extra, commandId: string): Promise<string> {
  const response = await post(extraApprovalRequest(view, item, commandId));
  const code = response.ok ? undefined : await response.json().then((body: { code?: unknown }) => body?.code, () => undefined);
  await reload();
  if (response.ok) return "Your approval has been recorded for that exact revision.";
  if (response.status === 409 && code === "PHOTOS_CHANGED") return PHOTOS_CHANGED_NOTICE;
  return "Approval was not confirmed. Review the current revision before trying again.";
}

const photoBox = { width: 160, height: 120, border: "1px solid #999", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center" as const, fontSize: 13, padding: 4 };

/** Fetches a 60-second signed download only when the photo scrolls into view. Pilot evidence store only. */
function ExtraPhoto({ jobId, photo, index, canDownload }: { jobId: string; photo: Photo; index: number; canDownload: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<{ url?: string; failed?: boolean }>({});
  const fetchable = canDownload && !photo.withdrawn;
  useEffect(() => {
    if (!fetchable || !ref.current) return;
    let cancelled = false;
    const fetchPhoto = async () => {
      try {
        const response = await fetch("/api/customer-portal/variation-photo", { method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
          body: JSON.stringify({ version: "customer-variation-photo-read.v1", jobId, evidenceId: photo.evidenceId }) });
        const body = response.ok ? await response.json() as { downloadUrl?: unknown } : undefined;
        if (cancelled) return;
        setState(typeof body?.downloadUrl === "string" ? { url: body.downloadUrl } : { failed: true });
      } catch { if (!cancelled) setState({ failed: true }); }
    };
    if (typeof IntersectionObserver === "undefined") { void fetchPhoto(); return () => { cancelled = true; }; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); void fetchPhoto(); }
    });
    observer.observe(ref.current);
    return () => { cancelled = true; observer.disconnect(); };
  }, [fetchable, jobId, photo.evidenceId]);
  const label = `Photo ${index + 1}`;
  return <figure style={{ margin: 0 }}>
    <div ref={ref} style={photoBox}>
      {photo.withdrawn ? <span>{label} was withdrawn by your builder. It is still part of this revision.</span>
        : !canDownload ? <span>{label} · preview not available here</span>
        : state.url ? <img src={state.url} alt={label} style={{ maxWidth: "100%", maxHeight: "100%" }}/>
        : state.failed ? <span>{label} could not be loaded. Reload extras to try again.</span>
        : <span>Loading {label.toLowerCase()}…</span>}
    </div>
    <figcaption style={{ fontSize: 12 }}>{label}{photo.withdrawn ? " · withdrawn" : ""}</figcaption>
  </figure>;
}

export default function CustomerExtras({ pilot = false }: { pilot?: boolean }) {
  const [view, setView] = useState<CustomerVariationView>(), [notice, setNotice] = useState("Loading extras…"), [busy, setBusy] = useState(false);
  async function load() {
    setView(undefined);
    try {
      const jobId = new URLSearchParams(window.location.search).get("jobId");
      const response = await fetch("/api/customer-portal/variations/read", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({version:"customer-variations-read.v1",jobId}), cache:"no-store" });
      if (!response.ok) throw new Error();
      setView(customerVariationViewV2.parse(await response.json())); setNotice("");
    } catch { setNotice("Extras are unavailable. Sign in using your builder’s latest email link."); }
  }
  useEffect(() => { void load(); }, []);
  async function approve(item: Extra) {
    if (!view || busy) return;
    setBusy(true);
    try {
      const post = (body: unknown) => fetch("/api/customer-portal/variation-approvals", { method:"POST", headers:{"Content-Type":"application/json"}, cache:"no-store", body:JSON.stringify(body) });
      setNotice(await submitExtraApproval(post, load, view, item, crypto.randomUUID()));
    } catch { setView(undefined); setNotice("Approval could not be confirmed. Reload extras to check before trying again."); }
    finally { setBusy(false); }
  }
  return <main style={{ overflowWrap: "anywhere" }}><h1>Review extras</h1><p>{pilot ? "No-charge pilot fixture" : "Synthetic practice"} · each approval applies only to the revision, signed amount and photos shown.</p><p role="status">{notice}</p>
    <button disabled={busy} onClick={() => void load()}>Reload extras</button>
    {view?.variations.length === 0 && <p>No priced extras to review.</p>}
    {view?.variations.map(item => {
      const { price, approval } = pilot ? {
        price: `Revision ${item.revision} · ${pounds(item.amount.pence)} net`,
        approval: `Approve revision ${item.revision} for ${pounds(item.amount.pence)} net`,
      } : extraPriceWords(item.amount.pence, item.revision);
      return <section key={item.id}><h2>{item.description}</h2><p>{price}</p><p>Content hash: <code>{item.hash}</code></p>
        {item.photos.length > 0 && <div aria-label={`Photos for ${item.description}`} style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {item.photos.map((photo, index) => <ExtraPhoto key={photo.evidenceId} jobId={view.jobId} photo={photo} index={index} canDownload={pilot}/>)}
        </div>}
        {item.approved ? <p>Approved · {item.method === "customer_authenticated" ? "authenticated customer" : item.method === "builder_attestation" ? "builder attestation" : "customer evidence"}</p> : <button disabled={busy} onClick={() => void approve(item)}>{approval}</button>}
      </section>;
    })}
  </main>;
}
