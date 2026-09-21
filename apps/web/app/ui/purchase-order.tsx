"use client";

import { useCallback, useEffect, useState } from "react";

type Order = {
  draftId: string;
  revisionId: string;
  revision: number;
  quantity: string;
  unitPricePence: number;
  orderNetPence: number;
  agreedNetPence: number;
  differencePence: number;
  recipient: string;
  requiredDate: string;
  authorityHash: string;
  status: string;
  outboxEffectCount: number;
  availability: string;
  preventedFeePence: number;
};

const pounds = (pence: number) =>
  `${pence < 0 ? "−" : ""}£${(Math.abs(pence) / 100).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export function PurchaseOrder({ jobId }: { jobId: string }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [requirementId, setRequirementId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [quantity, setQuantity] = useState("10");
  const [unitPrice, setUnitPrice] = useState("25.00");
  const [recipient, setRecipient] = useState("orders@fictional-merchant.invalid");
  const [requiredDate, setRequiredDate] = useState("2026-10-01");

  const load = useCallback(async () => {
    const [materialsResponse, orderResponse] = await Promise.all([
      fetch(`/api/jobs/${jobId}/materials`, { cache: "no-store" }),
      fetch(`/api/jobs/${jobId}/purchase-orders`, { cache: "no-store" }),
    ]);
    if (materialsResponse.ok) setRequirementId((await materialsResponse.json()).materials[0]?.id ?? "");
    if (orderResponse.ok) setOrder((await orderResponse.json()).order);
  }, [jobId]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (requirementId) return;
    const timer = setInterval(() => void load(), 1_500);
    return () => clearInterval(timer);
  }, [requirementId, load]);
  async function revise() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/jobs/${jobId}/purchase-orders/revisions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          version: "purchase-order-draft.v1",
          requirementId,
          quantity,
          unitPricePence: Math.round(Number(unitPrice) * 100),
          recipient,
          requiredDate,
          expectedRevision: order?.revision ?? 0,
        }),
      });
      if (!response.ok) throw new Error((await response.json()).code);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not preview order");
    } finally {
      setBusy(false);
    }
  }

  async function place() {
    if (!order) return;
    setBusy(true);
    setError("");
    try {
      const commandId = crypto.randomUUID();
      const response = await fetch(`/api/jobs/${jobId}/purchase-orders/placement`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          version: "purchase-order-placement.v1",
          command: {
            version: "command.v1",
            commandId,
            authorizationId: crypto.randomUUID(),
            commandType: "purchase_order.simulate",
            semanticKey: `purchase-order:${order.draftId}`,
            actorMembershipId: "d1500000-0000-4000-8000-000000000003",
            subjectType: "purchase_order_revision",
            subjectRef: order.revisionId,
            action: {
              actionType: "purchase_order.simulate",
              recipient: order.recipient,
              contentHash: order.authorityHash,
              aggregateRevision: order.revision,
              amountPence: order.orderNetPence,
              currency: "GBP",
              policyVersion: "synthetic-po.v1",
              expiresAt: "2099-01-01T00:00:00.000Z",
            },
          },
        }),
      });
      if (!response.ok) throw new Error((await response.json()).code);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Authority changed — re-confirm this order");
    } finally {
      setBusy(false);
    }
  }

  return <section id="purchase-orders" className="materials-panel">
    <h2>Check a purchase order</h2>
    <p>Use the supplied fictional order only. No supplier is contacted and no order is placed.</p>
    {!requirementId ? <p>Save a material and agreed price before drafting an order.</p> : <form action={revise}>
      <label>Quantity<input name="quantity" inputMode="decimal" value={quantity} onChange={event => setQuantity(event.target.value)} required /></label>
      <label>Order unit price (£)<input name="price" inputMode="decimal" value={unitPrice} onChange={event => setUnitPrice(event.target.value)} required /></label>
      <label>Fictional recipient<input name="recipient" type="email" value={recipient} onChange={event => setRecipient(event.target.value)} required /></label>
      <label>Required date<input name="requiredDate" type="date" value={requiredDate} onChange={event => setRequiredDate(event.target.value)} required /></label>
      <button className="primary" disabled={busy}>{order ? "Preview changed order" : "Preview proposed order"}</button>
    </form>}
    {error && <p role="alert" tabIndex={-1}>{error}</p>}
    {order && <article>
      <p data-testid="purchase-order-availability">{order.availability}</p>
      <dl>
        <dt>Proposed order net</dt><dd data-testid="order-proposed-net">{pounds(order.orderNetPence)}</dd>
        <dt>Recorded agreed net</dt><dd data-testid="order-agreed-net">{pounds(order.agreedNetPence)}</dd>
        <dt>Price difference</dt><dd data-testid="order-price-difference">{pounds(order.differencePence)}</dd>
      </dl>
      {order.differencePence > 0 && <p>This order is {pounds(order.differencePence)} above the recorded agreed price</p>}
      <p data-testid="order-status">{busy ? "Updating order…" : order.status}</p>
      {order.status.startsWith("Simulated") && <><p data-testid="order-net">{pounds(order.orderNetPence)}</p><p data-testid="prevented-fee">{pounds(order.preventedFeePence)}</p></>}
      <button className="primary" type="button" onClick={() => void place()} disabled={busy || order.differencePence !== 0}>Approve simulated order</button>
      <p data-testid="purchase-order-outbox-effects">{order.outboxEffectCount}</p>
    </article>}
    <button type="button" onClick={() => void load()}>Refresh purchase order</button>
  </section>;
}
