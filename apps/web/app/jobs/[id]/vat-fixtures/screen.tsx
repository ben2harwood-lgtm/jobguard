"use client";
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { VAT_FIXTURE_LABEL, VAT_SUPPORT_MATRIX_VERSION } from "@jobguard/core";
import type { VatTreatmentFixtureBook } from "@jobguard/core";
import type { VatFixtureView } from "@jobguard/api/workspace";

type Book = Omit<VatTreatmentFixtureBook, "tenantId" | "jobId" | "documents">;
type Command = { version: "vat.fixture-append.v1"; commandId: string; jobId: string; book: Book;
  document: VatTreatmentFixtureBook["documents"][number] };
const target: CSSProperties = { minHeight: 44, maxWidth: "100%", width: "100%", boxSizing: "border-box" };
const labels = { net: "Net", taxBasis: "Tax basis", vatToSupplier: "Supplier VAT", reverseChargeVat: "Customer-accounted reverse-charge VAT",
  gross: "Gross", fullValueGross: "Full value gross", retained: "Retained principal", retainedVat: "Deferred retained VAT", expectedCash: "Expected cash" };
const facts = ["supplierVatRegistered", "customerVatRegistered", "customerEndUser", "intermediarySupplier", "constructionReverseChargeInScope"] as const;
const factLabels = ["Supplier VAT registered", "Customer VAT registered", "Customer end user", "Intermediary supplier", "Construction reverse charge in scope"];
const treatments = ["standard_20", "zero", "reduced_5", "non_vat", "drc_20", "drc_5"] as const;
async function company() {
  const response = await fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin" });
  if (!response.ok) throw new Error("Sign in to your company to use practice VAT fixtures.");
  const session = await response.json() as { csrfToken: string; memberships: { id: string; tenantId: string }[] };
  const member = session.memberships[0];
  if (!member || !session.csrfToken) throw new Error("Sign in to your company to use practice VAT fixtures.");
  return { headers: { "x-csrf-token": session.csrfToken, "x-tenant-id": member.tenantId }, key: `${member.tenantId}:${member.id}` };
}
function Field({ name, label, value, type = "text" }: { name: string; label: string; value?: string | number | undefined; type?: string }) {
  return <label style={{ display: "block", marginBottom: 12 }}>{label}<input style={target} name={name} type={type} required defaultValue={value} step={type === "number" ? "1" : undefined} min={type === "number" ? "0" : undefined} /></label>;
}
export function VatFixtureScreen({ jobId, issueRefusal }: { jobId: string; issueRefusal: string }) {
  const [view, setView] = useState<VatFixtureView | null>(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const retry = useRef<Command | null>(null);
  const storageKey = useRef("");
  const url = `/api/jobs/${encodeURIComponent(jobId)}/vat-fixtures`;
  async function refresh() {
    setBusy(true); setError(""); setReady(false);
    try {
      const session = await company();
      storageKey.current = `vat-fixture:${session.key}:${jobId}`;
      const saved = sessionStorage.getItem(storageKey.current);
      retry.current = saved ? JSON.parse(saved) as Command : null; setPending(!!retry.current);
      const response = await fetch(url, { headers: session.headers, cache: "no-store", credentials: "same-origin" });
      const value = await response.json() as VatFixtureView & { code?: string; message?: string };
      if (!response.ok) {
        setView(null);
        if (response.status !== 404 || value.code !== "NOT_FOUND") throw new Error(value.message ?? "VAT fixtures unavailable.");
        // Empty, foreign and absent books share the repository's not-found response.
        setError(value.message ?? "No stored VAT fixtures are available for this job.");
      } else setView(value);
      setReady(true);
    } catch (failure) { setView(null); setError(failure instanceof Error ? failure.message : "VAT fixtures unavailable."); }
    finally { setBusy(false); }
  }
  useEffect(() => { void refresh(); }, [jobId]); // Page is keyed by job; no shared cross-job state.
  function clearPending() { sessionStorage.removeItem(storageKey.current); retry.current = null; setPending(false); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Capture before awaiting: React clears currentTarget and busy disables the form.
    const data = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try {
      const session = await company();
      if (storageKey.current !== `vat-fixture:${session.key}:${jobId}`) throw new Error("Company session changed. Reload before continuing.");
      if (!retry.current) {
        const text = (name: string) => String(data.get(name) ?? "");
        const prior = view?.book.documents.at(-1);
        const { tenantId: _tenant, jobId: _job, documents: _documents, ...storedBook } = view?.book ?? {};
        const book = view ? storedBook as Book : { version: "vat.fixture-book.v1" as const, matrixVersion: VAT_SUPPORT_MATRIX_VERSION,
          environment: "synthetic" as const, label: VAT_FIXTURE_LABEL, roundingVersion: "fixture_cumulative_group_half_up_v1" as const,
          supplierReference: text("supplierReference"), customerReference: text("customerReference"), taxBasis: text("taxBasis") as Book["taxBasis"] };
        const kind = text("kind") as Command["document"]["kind"];
        const command: Command = { version: "vat.fixture-append.v1", commandId: crypto.randomUUID(), jobId, book,
          document: { id: crypto.randomUUID(), previousDocumentId: prior?.id ?? null, kind,
            documentReference: text("documentReference"), documentDate: text("documentDate"), interimCertificationId: text("interimCertificationId"),
            retentionProfileId: text("retentionProfileId"), retentionReleaseId: text("retentionReleaseId") || null,
            creditOfDocumentId: kind === "credit_note" ? prior?.id ?? null : null,
            groups: Array.from({ length: prior?.groups.length ?? 1 }, (_, i) => ({
              treatment: text(`treatment-${i}`) as Command["document"]["groups"][number]["treatment"],
              cumulativeNetPence: Number(text(`net-${i}`)), retainedNetPence: Number(text(`retained-${i}`)),
              eligibility: { source: "human_fixture", actorId: text(`actor-${i}`), evidenceId: text(`evidence-${i}`),
                supplierVatRegistered: text(`supplierVatRegistered-${i}`) === "true", supplierVatNumber: text(`supplierNumber-${i}`) || null,
                customerVatRegistered: text(`customerVatRegistered-${i}`) === "true", customerVatNumber: text(`customerNumber-${i}`) || null,
                customerEndUser: text(`customerEndUser-${i}`) === "true", intermediarySupplier: text(`intermediarySupplier-${i}`) === "true",
                constructionReverseChargeInScope: text(`constructionReverseChargeInScope-${i}`) === "true", qualifyingBasisReference: text(`basis-${i}`) },
            })) } };
        // Persist the complete request before sending: even a reload retries the identical identity and payload.
        sessionStorage.setItem(storageKey.current, JSON.stringify(command)); retry.current = command; setPending(true);
      }
      const response = await fetch(url, { method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { ...session.headers, "Content-Type": "application/json" }, body: JSON.stringify(retry.current) });
      const value = await response.json() as VatFixtureView & { message?: string };
      if (!response.ok) {
        if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) clearPending();
        throw new Error(value.message ?? "Uncertain result. Retry the same document.");
      }
      setView(value); clearPending();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Uncertain result. Retry the same document."); }
    finally { setBusy(false); }
  }
  const prior = view?.book.documents.at(-1);
  return <main style={{ maxWidth: 720, margin: "0 auto", padding: 16, overflowWrap: "anywhere" }}>
    <h1>Practice VAT documents</h1>
    <p>This is a practice calculation, approved by no adviser. No invoice is issued.</p>
    <p>Interim and retention references are fixture lineage, not proof or authority.</p>
    <p>Credit calculations use core’s candidate method; the legal credit method is pending.</p>
    {error && <p role="alert">{error}</p>}
    <button type="button" style={target} disabled={busy} onClick={() => void refresh()}>Reload stored documents</button>
    {view ? <VatFixtureDocuments view={view} /> : <p aria-disabled="true">Issue invoice — refused: {issueRefusal}</p>}
    {ready && <form onSubmit={event => void submit(event)} key={prior?.id ?? "first"}>
      <h2>Add one synthetic document</h2>
      {pending && <p>The result is uncertain. Retry sends the saved document unchanged, including after a reload.</p>}
      <fieldset disabled={busy || pending} style={{ minWidth: 0 }}>
        <legend>Book fixed fields</legend>
        {view ? <dl>{Object.entries(view.book).filter(([key]) => !["tenantId", "jobId", "documents"].includes(key)).map(([key, value]) => <div key={key}><dt>{key} (fixed)</dt><dd>{String(value)}</dd></div>)}</dl>
          : <><Field name="supplierReference" label="Fictional supplier reference" /><Field name="customerReference" label="Fictional customer reference" />
            <label>Candidate tax basis<select style={target} required name="taxBasis" defaultValue=""><option value="">Choose explicitly</option><option value="full_net">full_net</option><option value="net_after_retention">net_after_retention</option></select></label></>}
        <label>Document kind<select style={target} name="kind" required defaultValue=""><option value="">Choose explicitly</option>{["interim", "credit_note", "retention_release"].map(kind => <option key={kind}>{kind}</option>)}</select></label>
        <Field name="documentReference" label="Document reference" /><Field name="documentDate" label="Document date" type="date" />
        <Field name="interimCertificationId" label="Interim certification UUID (fixture lineage)" />
        <Field name="retentionProfileId" label="Retention profile UUID (fixture lineage)" value={prior?.retentionProfileId} />
        <label>Retention release UUID (only for release fixture)<input style={target} name="retentionReleaseId" /></label>
        {Array.from({ length: prior?.groups.length ?? 1 }, (_, i) => { const group = prior?.groups[i], e = group?.eligibility;
          return <fieldset key={i} style={{ minWidth: 0 }}><legend>Treatment and human fixture eligibility {i + 1}</legend>
            <label>Treatment<select style={target} name={`treatment-${i}`} required defaultValue={group?.treatment ?? ""}><option value="">Choose explicitly — no default</option>{treatments.map(code => <option key={code}>{code}</option>)}</select></label>
            <Field name={`net-${i}`} label="Cumulative net (integer pence)" type="number" /><Field name={`retained-${i}`} label="Retained principal (integer pence)" type="number" />
            {facts.map((fact, n) => <label key={fact} style={{ display: "block", marginBottom: 12 }}>{factLabels[n]}<select style={target} name={`${fact}-${i}`} required defaultValue={e ? String(e[fact]) : ""}><option value="">Choose explicitly</option><option value="true">Yes</option><option value="false">No</option></select></label>)}
            <label>Supplier VAT number (blank only if unregistered)<input style={target} name={`supplierNumber-${i}`} defaultValue={e?.supplierVatNumber ?? ""} /></label>
            <label>Customer VAT number (blank only if unregistered)<input style={target} name={`customerNumber-${i}`} defaultValue={e?.customerVatNumber ?? ""} /></label>
            <Field name={`actor-${i}`} label="Fictional eligibility actor UUID (not authorization)" value={e?.actorId} />
            <Field name={`evidence-${i}`} label="Fictional eligibility evidence UUID" value={e?.evidenceId} />
            <Field name={`basis-${i}`} label="Qualifying basis reference (fictional assertion)" value={e?.qualifyingBasisReference} />
          </fieldset>;
        })}
      </fieldset>
      <button style={target} type="submit" disabled={busy}>{pending ? "Retry saved document unchanged" : "Store practice document"}</button>
    </form>}
  </main>;
}

export function VatFixtureDocuments({ view }: { view: VatFixtureView }) {
  return <section aria-label="Stored documents">
      <p>{view.reconciliation.matrixVersion} · {view.label}</p><p>{view.creditMethod}</p>
      {view.reconciliation.documents.map(doc => <article key={doc.source.id}>
        <h2>{doc.source.documentReference} — {doc.source.kind}</h2><p>{doc.source.documentDate}</p>
        <p>Interim fixture lineage: {doc.source.interimCertificationId}; retention fixture lineage: {doc.source.retentionProfileId}; release: {doc.source.retentionReleaseId ?? "none"}</p>
        {doc.groups.map(group => <section key={group.treatment}><h3>Treatment: {group.treatment}</h3><p>{group.wording}</p>
          {(["delta", "cumulative"] as const).map(basis => <div key={basis}><h4>{basis === "delta" ? "This document movement" : "Cumulative figures"}</h4>
            <dl>{Object.entries(labels).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{group[basis][key as keyof typeof labels].pence}p GBP</dd></div>)}</dl>
          </div>)}
        </section>)}
      </article>)}
      <p aria-disabled="true">Issue invoice — refused: {view.issueRefusal}</p>
    </section>;
}
