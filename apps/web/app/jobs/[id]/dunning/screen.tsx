"use client";
import { useEffect, useState } from "react";
import type { DunningView } from "@jobguard/api/dunning-contracts";

type View = DunningView;
type Row = View["invoices"][number];
const pounds = (pence: number) => `£${Math.trunc(pence / 100)}.${String(pence % 100).padStart(2, "0")}`;
const categories = { customer: "Customer reminder", supplier: "Supplier reminder", platform_to_builder: "Platform invoice reminder" };
const reasons: Record<string, string> = {
  pilot_no_charge: "No-charge pilot — reminders unavailable", disputed: "Disputed — collection stopped",
  reversed: "Reversed — collection stopped", paid: "Paid — nothing to pursue", cancelled: "Collection cancelled",
  refund_pending: "Refund pending", source_not_current: "Invoice source is no longer current",
  reconcile_attempt: "Payment needs reconciliation", not_due: "Not due yet",
};
async function companyHeaders() {
  const response = await fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin" });
  if (!response.ok) throw new Error("Sign in to your company to use this workbench.");
  const session = await response.json() as { csrfToken?: string; memberships?: { tenantId: string }[] };
  const tenant = session.memberships?.[0]?.tenantId;
  if (!session.csrfToken || !tenant) throw new Error("Sign in to your company to use this workbench.");
  return { "x-csrf-token": session.csrfToken, "x-tenant-id": tenant };
}
async function load(jobId: string): Promise<View> {
  const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/dunning`, {
    cache: "no-store", credentials: "same-origin", headers: await companyHeaders(),
  });
  if (!response.ok) throw new Error("Workbench unavailable. Sign in and refresh to try again.");
  return response.json() as Promise<View>;
}
export function DunningScreen({ jobId }: { jobId: string }) {
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void load(jobId).then(value => { if (active) setView(value); })
      .catch(() => { if (active) setError("Workbench unavailable. Sign in and refresh to try again."); });
    return () => { active = false; };
  }, [jobId]);
  async function refresh() {
    setBusy(true); setError("");
    try { setView(await load(jobId)); } catch { setView(null); setError("Workbench unavailable. Refresh to try again."); }
    finally { setBusy(false); }
  }
  async function command(row: Row, operation: "request" | "approve") {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/dunning/${operation}`, {
        method: "POST", credentials: "same-origin", headers: { ...await companyHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ version: "dunning-persist-command.v1", commandId: crypto.randomUUID(),
          invoiceId: row.invoiceId, snapshotHash: row.snapshotHash, nowTick: Date.now(),
          ...(operation === "approve" ? { decisionId: row.decision?.decisionId } : {}) }),
      });
      if (!response.ok) throw new Error("The balance, permission or preview may have changed. Refresh and review again.");
      setView(await load(jobId));
    } catch (reason) {
      setView(null);
      setError(reason instanceof Error ? reason.message : "Workbench unavailable. Refresh to try again.");
    } finally { setBusy(false); }
  }
  return <main className="workspace-page" style={{ overflowWrap: "anywhere" }}>
    <h1>Unpaid invoice workbench</h1>
    <p>Synthetic practice only. Sending is disabled. Approval records a reminder Decision only.</p>
    <button disabled={busy} onClick={() => void refresh()}>Refresh balances and previews</button>
    {error ? <p role="alert">{error} <a href="/sign-in">Sign in</a></p> : null}
    {busy ? <p role="status">Updating workbench…</p> : null}
    {!view && !error ? <p role="status">Loading invoices…</p> : null}
    {view?.invoices.length === 0 ? <p>No unpaid invoices.</p> : null}
    {view?.skippedCount ? <p role="status">Some invoice records need checking and cannot be pursued.</p> : null}
    {view?.invoices.map(row => <section key={row.invoiceId} aria-label={`Invoice ${row.invoiceId}`}>
      <h2>Invoice {row.invoiceId}</h2><p>Outstanding: {pounds(row.amount.pence)} · {categories[row.category]}</p>
      <p>{row.suppression ? reasons[row.suppression] ?? "Unavailable for reminders" : "Eligible for a practice reminder"}</p>
      {row.reminder ? <>
        <p>To: {row.reminder.recipient}</p><blockquote>{row.reminder.body}</blockquote>
        <p>Policy: {row.reminder.policyVersion}</p>
        {row.decision ? <>
          <p>Preview {row.decision.status}. Expires: {row.decision.expiresAt}</p>
          {row.decision.status === "pending" ? <button disabled={busy} onClick={() => void command(row, "approve")}>
            Approve this exact {pounds(row.amount.pence)} reminder preview
          </button> : <p role="status">Approved preview only. Nothing was sent.</p>}
        </> : <button disabled={busy} onClick={() => void command(row, "request")}>Draft reminder Decision</button>}
      </> : null}
    </section>)}
    <p>Ledger, evidence and export access remain available from the <a href={`/jobs/${encodeURIComponent(jobId)}`}>job</a>.</p>
  </main>;
}
