"use client";
import { useState, useSyncExternalStore } from "react";
import { parsePoundsToPence, parseQuantity } from "@jobguard/core";
import { materialsCommandFor } from "./materials-command";

type Fact = {
  document_id: string; document_type: "invoice" | "credit"; quantity_decimal: string | null;
  unit_price_pence: number | null; net_pence: number | null; source_page: number;
  span_start: number; span_end: number; source_region: string; source_hash: string;
  version_id: string; source_text: string; issues: string[];
  confirmed: null | { revision: number; quantity_decimal: string | number; unit_price_pence: string | number; net_pence: string | number; origin: string };
};
const pounds = (p: number | null) => p === null ? "—" : new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(p / 100);
const inputPounds = (p: string | number | null) => {
  if (p === null) return "";
  const value = BigInt(p);
  return `${value / 100n}.${String(value % 100n).padStart(2, "0")}`;
};

/** Tolerates a JSON number or string: confirmed rows may arrive from the API either way. */
export const initialQuantity = (fact: Pick<Fact, "quantity_decimal" | "confirmed">) =>
  String(fact.confirmed?.quantity_decimal ?? fact.quantity_decimal ?? "").replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");

export function SupplierFactEditor({ jobId, fact }: { jobId: string; fact: Fact }) {
  const [q, setQ] = useState(initialQuantity(fact));
  const [price, setPrice] = useState(inputPounds(fact.confirmed?.unit_price_pence ?? fact.unit_price_pence));
  const [net, setNet] = useState(inputPounds(fact.confirmed?.net_pence ?? fact.net_pence));
  const [changed, setChanged] = useState(false), [error, setError] = useState("");
  const flow = materialsCommandFor(jobId);
  const busy = useSyncExternalStore(flow.subscribe, flow.isBusy, () => false);
  let pricePence: number | null = null, netPence: number | null = null, validationError = "";
  try {
    pricePence = parsePoundsToPence(price);
    netPence = parsePoundsToPence(net);
    const quantity = parseQuantity(q);
    if (quantity.scaled * BigInt(pricePence) !== quantity.scale * BigInt(netPence)) {
      validationError = "Quantity and unit price must match the net total. Check the source.";
    }
  } catch (cause) {
    validationError = cause instanceof Error ? cause.message : "Enter valid quantity and prices.";
  }
  const issues = fact.issues.length > 0 || Boolean(validationError);
  async function confirm() {
    if (issues || pricePence === null || netPence === null) return;
    setError("");
    try {
      await flow.run(async () => {
        const r = await fetch(`/api/jobs/${jobId}/supplier-documents/facts/confirm`, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ version: "supplier-fact-correction.v1", documentId: fact.document_id,
            commandId: crypto.randomUUID(), documentType: fact.document_type, quantity: q,
            unitPricePence: pricePence, netPence, disposition: changed ? "source_verified" : undefined,
            expectedRevision: fact.confirmed?.revision ?? 0 }),
        });
        if (!r.ok) throw new Error((await r.json()).code);
      });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not confirm supplier document"); }
  }
  return <article className="supplier-facts" aria-busy={busy}>
    <div><h3>Original source</h3><pre>{fact.source_text}</pre><details><summary>Open source citation</summary>
      <p>Version {fact.version_id} · page {fact.source_page} · span {fact.span_start}–{fact.span_end} · region {fact.source_region}</p><code>{fact.source_hash}</code>
    </details></div>
    <div><h3>Editable facts</h3>
      <label>Quantity<input disabled={busy} value={q} onChange={e => { setQ(e.target.value); setChanged(true); }} /></label>
      <label>Unit price (£)<input disabled={busy} inputMode="decimal" value={price} onChange={e => { setPrice(e.target.value); setChanged(true); }} /></label>
      <label>Net total (£)<input disabled={busy} inputMode="decimal" value={net} onChange={e => { setNet(e.target.value); setChanged(true); }} /></label>
      <dl><dt>Quantity</dt><dd data-testid="supplier-line-quantity">{q}</dd><dt>Unit price</dt><dd data-testid="supplier-line-unit-price">{pounds(pricePence)}</dd><dt>Invoice net</dt><dd data-testid="supplier-invoice-net">{pounds(netPence)}</dd></dl>
      {(changed || fact.confirmed?.origin === "entered_by_you") && <p>Entered by you</p>}
      {issues && <p>Check the source before confirming these figures</p>}
      {validationError && <p role="alert">{validationError}</p>}{error && <p role="alert">{error}</p>}
      <button className="primary" type="button" disabled={busy || issues} onClick={() => void confirm()}>Confirm supplier document</button>
      {fact.confirmed && <p data-testid="supplier-confirmed-revision">Confirmed revision {fact.confirmed.revision}; no supplier debt or settled cash recorded.</p>}
    </div>
  </article>;
}
