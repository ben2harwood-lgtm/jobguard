"use client";
import * as React from "react";
import { useEffect, useState, type FormEvent } from "react";
import type { CisFixtureView } from "@jobguard/api/workspace";
import type { CisFixtureBook } from "@jobguard/core";
async function companyHeaders() {
  const response = await fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin" });
  const session = await response.json() as { csrfToken?: string; memberships?: { tenantId: string }[] };
  const tenant = session.memberships?.[0]?.tenantId;
  if (!response.ok || !session.csrfToken || !tenant) throw Error("Sign in to your company and refresh.");
  return { "x-csrf-token": session.csrfToken, "x-tenant-id": tenant, "Content-Type": "application/json" };
}
const figures = { invoiceNet: "Invoice net", vatToSupplier: "Supplier VAT", reverseChargeVat: "Reverse-charge VAT",
  retention: "Retention", cisDeduction: "CIS deduction (not unpaid debt)", actualCash: "Actual cash",
  unpaidCash: "Remaining allocated cash", invoiceUnpaidCash: "Remaining invoice cash (not an overdue debt assertion)",
  refundDue: "Allocated refund due", feeEligibleRecovery: "Fee-eligible recovery" } as const;
const amount = (pence: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
export function CisFixtureScreen({ jobId }: { jobId: string }) {
  const [view, setView] = useState<CisFixtureView | null>(null), [error, setError] = useState("");
  const [busy, setBusy] = useState(false), [pending, setPending] = useState<string | null>(null);
  const url = `/api/jobs/${encodeURIComponent(jobId)}/cis-fixtures`, retryKey = `cis-fixture-command:${jobId}`;
  async function load() {
    const response = await fetch(url, { cache: "no-store", credentials: "same-origin", headers: await companyHeaders() });
    const body = await response.json() as CisFixtureView & { reason?: string };
    if (!response.ok && !(response.status === 404 && body.starter)) throw Error(body.reason ?? "Statements unavailable.");
    setView(body);
  }
  useEffect(() => {
    setPending(sessionStorage.getItem(retryKey));
    void load().catch(reason => { setView(null); setError((reason as Error).message); });
    // Each job mounts its own screen.
  }, [jobId]);
  async function send(payload: string) {
    setBusy(true); setError("");
    try {
      const response = await fetch(url, { method: "POST", credentials: "same-origin", headers: await companyHeaders(), body: payload });
      const body = await response.json() as { reason?: string };
      if (response.status < 500) { sessionStorage.removeItem(retryKey); setPending(null); }
      if (!response.ok) throw Error(body.reason ?? "Statement refused. Review its fixture fields.");
      await load();
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!view || pending) return;
    const form = new FormData(event.currentTarget), text = (key: string) => String(form.get(key) ?? "");
    const book = view.starter, previous = view.stored?.book.statements.at(-1), base = book.statements[0]!;
    const uuid = () => crypto.randomUUID(), context = { tenantId: book.tenantId, jobId: book.jobId };
    const verificationId = previous?.verificationId ?? uuid(), paymentId = uuid();
    const correction = text("kind") === "correction";
    const statement: CisFixtureBook["statements"][number] = { ...base, ...context, id: uuid(),
      previousStatementId: previous?.id ?? null, correctionOfStatementId: correction ? previous?.id ?? null : null,
      kind: correction ? "correction" : "payment", documentReference: text("reference"), documentDate: text("date"), taxMonthEnd: text("month"),
      humanApproval: { actorId: text("actor"), decisionId: text("decision"), sourceCalculationReference: text("calculation") },
      verificationId, cumulativePaidNetPence: Number(text("net")), cumulativeDirectMaterialsPence: Number(text("materials")),
      materialsEvidenceId: text("materialsEvidence"), cumulativePaidVatPence: Number(text("vat")),
      paymentRecordIds: text("paymentReference") ? [paymentId] : [] };
    const { tenantId: _tenant, jobId: _job, ...fixture } = book;
    const payload = JSON.stringify({ version: "cis.persist-fixture.v1", commandId: uuid(), jobId, fixture: { ...fixture,
      statements: [statement], verifications: previous || text("status") === "missing" ? [] : [{ ...book.verifications[0], ...context,
        id: verificationId, status: text("status"), validFrom: text("from"), validThrough: text("through"),
        evidenceId: text("verificationEvidence"), evidenceReference: text("verificationReference"), recordedBy: text("actor") }],
      payments: text("paymentReference") ? [{ version: "cis.payment-fixture.v1", ...context, id: paymentId,
        paymentReference: text("paymentReference"), paymentDate: text("paymentDate"), evidenceId: text("paymentEvidence"),
        cashPence: Number(text("cash")), reversalOfPaymentId: text("reversal") || null }] : [] } });
    sessionStorage.setItem(retryKey, payload); setPending(payload); void send(payload);
  }
  const starter = view?.starter, prior = view?.stored?.book.statements.at(-1), base = prior ?? starter?.statements[0];
  const input = (label: string, name: string, value: string | number, type = "text", required = true) => <label style={{ display: "grid", gap: 4 }}>{label}
    <input name={name} type={type} defaultValue={value} required={required} step={type === "number" ? 1 : undefined}
      min={type === "number" ? 0 : undefined} style={{ minHeight: 44, minWidth: 0, width: "100%", boxSizing: "border-box" }} /></label>;
  return <main className="workspace-page" style={{ overflowWrap: "anywhere", minWidth: 0 }}>
    <h1>Stored CIS practice statements</h1>
    <p>Practice calculation. Approved by no adviser. Nothing is submitted to HMRC.</p>
    <p>Evidence IDs, status records, certification and approval fields are fictional fixture values that prove nothing.
      No evidence, HMRC verification or human approval is asserted.</p>
    <p>The labelled fictional starting VAT and retention book joins no commercial books.</p>
    {error && <p role="alert">{error}</p>}
    <button style={{ minHeight: 44 }} disabled={busy} onClick={() => { setError(""); void load().catch(reason => { setView(null); setError((reason as Error).message); }); }}>Reload statements</button>
    {pending && <p>Outcome may be uncertain. The exact command is saved for retry; fields cannot change until its outcome is known.
      <button style={{ minHeight: 44 }} disabled={busy} onClick={() => void send(pending)}>Retry same command</button></p>}
    {starter && base && <form onSubmit={submit} key={prior?.id ?? "first"}>
      <fieldset disabled={busy || !!pending} style={{ minWidth: 0, display: "grid", gap: 12 }}><legend>Enter fictional statement (amounts in whole pence)</legend>
        <label>Statement kind<select name="kind" style={{ minHeight: 44, width: "100%" }}><option value="payment">Payment statement</option><option value="correction">Correction against preceding statement</option></select></label>
        {prior && <p>Preceding statement: {prior.id}. Correction appends; the original stays unchanged. Status changes are unsupported.</p>}
        {input("Statement reference", "reference", "")}{input("Statement date", "date", base.documentDate, "date")}
        {input("Declared fixture tax-month end", "month", base.taxMonthEnd, "date")}
        {input("Cumulative paid net (pence)", "net", base.cumulativePaidNetPence, "number")}
        {input("Cumulative direct materials (pence)", "materials", base.cumulativeDirectMaterialsPence, "number")}
        {input("Cumulative paid supplier VAT (pence)", "vat", base.cumulativePaidVatPence, "number")}
        {input("Fictional materials evidence ID", "materialsEvidence", base.materialsEvidenceId)}
        {!prior && <><label>Fictional status record<select name="status" style={{ minHeight: 44, width: "100%" }}>
          <option value="missing">Missing — refuse calculation</option><option value="registered">Registered fixture</option><option value="unregistered">Unregistered fixture</option><option value="gross_payment">Gross-payment fixture</option></select></label>
          {input("Fixture valid from", "from", starter.verifications[0]!.validFrom, "date")}
          {input("Fixture valid through", "through", starter.verifications[0]!.validThrough, "date")}
          {input("Fictional verification evidence ID", "verificationEvidence", starter.verifications[0]!.evidenceId)}
          {input("Fictional status reference", "verificationReference", starter.verifications[0]!.evidenceReference)}</>}
        {input("Fictional approval actor ID (no approval occurs)", "actor", base.humanApproval.actorId)}
        {input("Fictional approval Decision ID (no approval occurs)", "decision", base.humanApproval.decisionId)}
        {input("Fictional source calculation reference", "calculation", base.humanApproval.sourceCalculationReference)}
        {input("New payment reference (blank for no new cash)", "paymentReference", "", "text", false)}
        {input("Payment date", "paymentDate", base.documentDate, "date")}
        {input("New actual cash (pence)", "cash", 0, "number")}
        {input("Fictional payment evidence ID", "paymentEvidence", base.materialsEvidenceId)}
        {input("Payment ID to reverse (optional)", "reversal", "", "text", false)}
        <button style={{ minHeight: 44 }} type="submit">Store practice statement</button>
      </fieldset>
    </form>}
    {view?.stored?.reconciliation.statements.map(row => <section key={row.source.id} aria-label={`Statement ${row.source.documentReference}`}>
      <h2>{row.source.documentReference}</h2><p>Statement ID: {row.source.id}</p>
      <p>Policy {view.stored!.reconciliation.policyVersion}; rate {row.rateNumerator}/100</p>
      <dl>{Object.entries(figures).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{amount(row[key as keyof typeof figures].pence)}</dd></div>)}</dl>
    </section>)}
    {view && <><button disabled style={{ minHeight: 44 }}>Issue statement — disabled</button><p>{view.issueReason}</p></>}
  </main>;
}
