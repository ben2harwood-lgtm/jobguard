"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { SupplierLinesView } from "../lib/supplier-lines-service";

export function SupplierLinesReview({ jobId }: { jobId: string }) {
  const [view, setView] = useState<SupplierLinesView | null>(null);
  const [checked, setChecked] = useState<string[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const endpoint = `/api/jobs/${encodeURIComponent(jobId)}/supplier-lines`;
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`${endpoint}?version=supplier-lines-read.v1`, { cache: "no-store", signal: controller.signal })
      .then(async r => { if (!r.ok) throw new Error((await r.json()).code); return r.json(); })
      .then(value => { if (!controller.signal.aborted) setView(value); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause.message); });
    return () => controller.abort();
  }, [endpoint]);
  async function command(body: unknown) {
    setBusy(true); setError("");
    try {
      const r = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error((await r.json()).code);
      setView(await r.json());
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save review"); }
    finally { setBusy(false); }
  }
  return <main className="workspace-page" style={{ overflowWrap: "anywhere" }} aria-busy={busy}>
    <Link href={`/jobs/${jobId}`}>Back to job</Link><h1>Review supplier lines</h1>
    <p>Fictional proposal — synthetic practice only. Review against the source before confirming. No debt, delivery or fee is created.</p>
    {error && <p role="alert">{error === "MATCH_REVISION_CONFLICT" ? "This review changed. Reload to review the latest revision before correcting." : error}</p>}
    {!view && !error && <p>Loading review…</p>}
    {view && <><p>Revision {view.revision} · {view.confirmed ? "Human-confirmed lines" : "Unconfirmed proposal"}</p>
      <p>Overall matching state: {view.result.unresolved.length ? "needs review" : "complete"}. Group flags still need review.</p>
      {[...view.facts.orders, ...view.facts.receipts, ...view.facts.bills].map(row => <article key={row.versionId}>
        <h2>{"acceptedQuantity" in row ? "Delivery proposal" : "kind" in row ? "Invoice proposal" : "Order proposal"}: {row.sku}</h2>
        <p>Quantity {"acceptedQuantity" in row ? row.acceptedQuantity : row.quantity} {row.unit}; pack {row.unitsPerPack ?? "unknown"} {row.baseUnit}</p>
        {"netPence" in row && <p>Net {row.netPence} pence; basis {row.taxBasis}; supply date {row.supplyDate}</p>}
        {"unitNetPence" in row && <p>Unit net {row.unitNetPence} pence; discount {row.discountBps} basis points</p>}
        <details><summary>Source citation</summary><p>Document {row.documentVersionId}; page {row.page}; SHA-256 {row.sourceHash}; line version {row.versionId}</p></details>
        {!view.confirmed && <label><input type="checkbox" disabled={busy} checked={checked.includes(row.versionId)} onChange={e => setChecked(old => e.target.checked ? [...old, row.versionId] : old.filter(id => id !== row.versionId))} />I reviewed {row.versionId}</label>}
        {view.confirmed && !("unitNetPence" in row) && <form key={`${row.versionId}:${view.revision}`} onSubmit={e => {
          e.preventDefault(); const order = new FormData(e.currentTarget).get("order");
          void command({ version: "supplier-line-correction.v1", commandId: crypto.randomUUID(), snapshotId: view.snapshotId,
            expectedRevision: view.revision, sourceVersionId: row.versionId, orderVersionId: order || null });
        }}><label>Match for {row.versionId}<select name="order" style={{ width: "100%", maxWidth: "100%" }} disabled={busy} defaultValue={view.facts.mappings.find(m => m.sourceVersionId === row.versionId)?.orderVersionId ?? ""}>
          <option value="">Automatic matching (withdraw correction)</option>{view.facts.orders.map(order => <option key={order.versionId} value={order.versionId}>{order.sku} · {order.versionId}</option>)}
        </select></label><button disabled={busy}>Record correction</button></form>}
      </article>)}
      {!view.confirmed && <button disabled={busy || checked.length !== view.facts.orders.length + view.facts.receipts.length + view.facts.bills.length} onClick={() => void command({ version: "supplier-lines-confirm.v1", commandId: crypto.randomUUID(), snapshotId: view.snapshotId, lineVersionIds: checked })}>Confirm reviewed lines</button>}
      <h2>Unresolved sources</h2>{view.result.unresolved.map(issue => <p key={issue.id}>{issue.code}: {issue.sourceVersionIds.join(", ")}</p>)}
      {view.result.groups.map(group => <section key={group.id} aria-label={`Match group ${group.orderVersionId}`}><h2>Group {group.orderVersionId}</h2>
        <p>Quantity scale: {group.quantityScale}; ordered {group.orderedQuantity ?? "unknown"}; delivered {group.deliveredQuantity ?? "unknown"}; billed {group.billedQuantity ?? "unknown"}</p>
        <h3>Group flags</h3>{group.issues.length ? <ul>{group.issues.map(issue => <li key={issue.id}>{issue.code}: {issue.sourceVersionIds.join(", ")}</li>)}</ul> : <p>No group flags</p>}
      </section>)}
      <details><summary>Correction history</summary><ol>{view.history.map(row => <li key={row.id}>Revision {row.revision}; audit {row.audit_event_id}</li>)}</ol></details>
    </>}
  </main>;
}
