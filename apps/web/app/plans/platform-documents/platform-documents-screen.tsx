"use client";
import { useEffect, useState } from "react";
import { PLATFORM_INVOICE_WARNING } from "@jobguard/core";

type DocumentView = { number: string; lines: { id: string; kind: string; policyVersion: string;
  references: { name: string; id: string; hash: string }[] }[] };
export type PlatformDocumentsView = { version: "platform-documents.v1"; collectionStarted: false;
  documents: { issuerId: string; invoice: DocumentView; credits: DocumentView[];
    account: { principalPence: number; taxPence: number; grossPence: number; alreadyPaidPence: number;
      remainingCashDuePence: number; refundDuePence: number; collectionStarted: false } }[] };
const money = (pence: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
function DocumentLines({ document }: { document: DocumentView }) {
  return <section><h3>{document.number}</h3>{[
    { title: "Subscription lines", lines: document.lines.filter(l => l.kind === "subscription") },
    { title: "Fee and other lines", lines: document.lines.filter(l => l.kind !== "subscription") },
  ].filter(group => group.lines.length).map(group => <section key={group.title}><h4>{group.title}</h4>
    {group.lines.map(line => <div key={line.id}><p>Kind: {line.kind}</p><p>Policy: {line.policyVersion}</p>
      {line.references.map((ref, i) => <p key={`${ref.name}-${i}`}>{ref.name}: {ref.id}<br />Hash: {ref.hash}</p>)}
    </div>)}</section>)}</section>;
}
export default function PlatformDocumentsScreen({ initial }: { initial?: PlatformDocumentsView }) {
  const [view, setView] = useState(initial), [error, setError] = useState("");
  useEffect(() => {
    if (initial) return;
    const controller = new AbortController();
    void fetch("/api/plans/platform-documents", { cache: "no-store", signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error(response.status === 401 ? "Sign in with your company session to see these documents." : "Documents are unavailable for this session.");
      setView(await response.json() as PlatformDocumentsView);
    }).catch((failure: Error) => { if (!controller.signal.aborted) { setView(undefined); setError(failure.message); } });
    return () => controller.abort();
  }, [initial]);
  return <main style={{ maxWidth: 800, margin: "0 auto", padding: 16, minWidth: 0, overflowWrap: "anywhere" }}>
    <p role="note">{PLATFORM_INVOICE_WARNING}</p><h1>Simulated platform documents</h1>
    {error ? <p role="alert">{error}</p> : !view ? <p>Loading documents…</p> : !view.documents.length ? <p>No documents have been issued.</p>
      : view.documents.map(item => <article key={`${item.issuerId}-${item.invoice.number}`}>
        <DocumentLines document={item.invoice} />
        {!!item.credits.length && <section><h3>Linked credit notes</h3>{item.credits.map(note => <DocumentLines key={note.number} document={note} />)}</section>}
        <dl>{([
          ["Principal", item.account.principalPence], ["Tax", item.account.taxPence], ["Gross", item.account.grossPence],
          ["Already paid", item.account.alreadyPaidPence], ["Remaining cash due", item.account.remainingCashDuePence], ["Refund due", item.account.refundDuePence],
        ] as const).map(([label, amount]) => <div key={label}><dt>{label}</dt><dd>{money(amount)}
          {label === "Already paid" && <p>No payment is linked to these simulated documents yet.</p>}</dd></div>)}</dl>
      </article>)}
  </main>;
}
