"use client";
import { jobPageFetch as fetch } from "./job-page-fetch";
import React, { useRef, useState } from "react";
import type { MerchantOrderPreview } from "@jobguard/api/merchant-order-contracts";

const pounds = (pence: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
export function MerchantOrder({ jobId }: { jobId: string }) {
  const [preview, setPreview] = useState<MerchantOrderPreview | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [fact, setFact] = useState("");
  const [reference, setReference] = useState("synthetic-practice-1");
  const confirmId = useRef<string | null>(null), manualId = useRef<string | null>(null);
  async function request(body: object) {
    const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/purchase-orders/merchant-order`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), cache: "no-store",
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.code);
    return result;
  }
  async function run(action: () => Promise<void>) {
    setBusy(true); setError("");
    try { await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not check order"); }
    finally { setBusy(false); }
  }
  async function review() {
    setPreview(null); setFact(""); confirmId.current = null; manualId.current = null;
    const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/purchase-orders`, { cache: "no-store" });
    const current = await response.json();
    if (!response.ok || !current.order?.revisionId) throw new Error("Save a proposed purchase order first");
    const next: MerchantOrderPreview = await request({ version: "merchant-order-screen.v1", kind: "preview", revisionId: current.order.revisionId });
    setPreview(next);
  }
  async function confirm() {
    if (!preview) return;
    confirmId.current ??= crypto.randomUUID();
    await request({ version: "merchant-order-screen.v1", kind: "approve", commandId: confirmId.current,
      revisionId: preview.order.revisionId, revision: preview.order.revision, contentHash: preview.contentHash,
      recipient: preview.order.recipient, amountPence: preview.amountPence, expiresAt: preview.approvalExpiresAt });
    setFact("Practice approval recorded. One fake order action queued; no order is really sent.");
  }
  async function manual() {
    if (!preview) return;
    manualId.current ??= crypto.randomUUID();
    await request({ version: "merchant-order-screen.v1", kind: "manual", commandId: manualId.current,
      revisionId: preview.order.revisionId, supplierReference: reference });
    setFact("Separate fact: owner manual placement attestation recorded for practice. Provider confirmation: none. No order is really sent.");
  }
  const line = preview?.order.line;
  return <section aria-label="Practice merchant order" className="materials-panel" aria-busy={busy}>
    <h2>Practice merchant order</h2>
    <p>Fictional practice only — no order is really sent. Stock: unknown. Lead time: unknown.</p>
    <button disabled={busy} onClick={() => void run(review)}>Review current merchant order</button>
    {error && <p role="alert">{error} — review the current order before trying again.</p>}
    {preview && line && <article>
      <dl style={{ overflowWrap: "anywhere" }}>
        <dt>Recipient</dt><dd>{preview.order.recipient}</dd>
        <dt>Order line (SKU)</dt><dd>{line.skuId}</dd>
        <dt>Quantity and unit</dt><dd>{line.quantity} {line.unit}</dd>
        <dt>Unit price</dt><dd>{pounds(line.unitPricePence)}</dd>
        <dt>Amount (net GBP)</dt><dd>{pounds(preview.amountPence)}</dd>
        <dt>Cited agreed rate</dt><dd>{line.rateId}, version {line.rateVersion}: {pounds(line.agreedPricePence)} per {line.rateUnit}</dd>
        <dt>Tax basis</dt><dd>{line.taxBasis}</dd>
        <dt>Pack quantity</dt><dd>{line.packQuantity} each</dd>
        <dt>Required date</dt><dd>{preview.order.deliveryDate}</dd>
        <dt>Content hash approved by confirm</dt><dd>{preview.contentHash}</dd>
      </dl>
      {preview.finding.aboveAgreedRate && <p>Above agreed rate — cited rate {line.rateId}, version {line.rateVersion}. Decision on confirmation: approve this exact above-rate order. Prevention only; fee £0.00.</p>}
      <p>Stock: unknown. Lead time: unknown. Availability is unverified.</p>
      <button disabled={busy || !!fact} onClick={() => void run(confirm)}>Confirm this exact practice order</button>
      <p>Manual placement attestation is a separate owner assertion, without provider confirmation. Use it instead of the fake order action.</p>
      <label>Practice supplier reference<input value={reference} disabled={busy || !!fact} onChange={e => { setReference(e.target.value); manualId.current = null; }} /></label>
      <button disabled={busy || !!fact} onClick={() => void run(manual)}>Record practice manual attestation</button>
    </article>}
    {fact && <p role="status">{fact}</p>}
  </section>;
}
