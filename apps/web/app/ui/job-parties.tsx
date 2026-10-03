"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { customerTypes, jobPartiesCommandResultV1, jobPartiesImportResultV1, jobPartiesWorkspaceV1, siteMatchKey, type JobPartiesCommandV1 } from "@jobguard/core";
import type { z } from "zod";
import styles from "./job-parties.module.css";
const labels = ["A person (homeowner)", "A business", "Landlord or letting agent", "Insurer", "Main contractor", "Housing association", "Council"];
type View = z.infer<typeof jobPartiesWorkspaceV1>;
export function JobParties({ jobId }: { jobId: string }) {
  const [view, setView] = useState<View | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [customerId, setCustomerId] = useState(""), [name, setName] = useState("Practice Customer"), [type, setType] = useState<(typeof customerTypes)[number]>("person");
  const [email, setEmail] = useState("practice-customer@example.invalid"), [payer, setPayer] = useState("");
  const [phone,setPhone]=useState(""),[companyNumber,setCompanyNumber]=useState("");
  const [address, setAddress] = useState("14 Fictional Street"), [town, setTown] = useState("London"), [postcode, setPostcode] = useState("SW1A 1AA");
  const [unit, setUnit] = useState(""), [uprn, setUprn] = useState(""), [reuse, setReuse] = useState(""), [confirm, setConfirm] = useState(false), [reason, setReason] = useState("");
  const errorRef = useRef<HTMLParagraphElement>(null);
  const load = useCallback(async () => {
    const response = await fetch(`/api/jobs/${jobId}/parties`, { cache: "no-store" });
    if (!response.ok) throw new Error("Customer and site could not load. Try again.");
    const snapshot = jobPartiesWorkspaceV1.parse(await response.json()); setView(snapshot); return snapshot;
  }, [jobId]);
  useEffect(() => { const refresh=(event:Event)=>{if((event as CustomEvent).detail===jobId)void load().catch(e=>setError(e.message));};void load().catch(e=>setError(e.message));window.addEventListener("job-lifecycle-changed",refresh);return()=>window.removeEventListener("job-lifecycle-changed",refresh); }, [load,jobId]);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  const site = { version: "site.v1" as const, addressLines: [address], town, postcode, ...(unit ? { unit } : {}), ...(uprn ? { uprn } : {}) };
  let key: string | null = null; try { key = siteMatchKey(site); } catch { /* The form shows validation errors on save. */ }
  const suggestions = view?.sites.filter(s => (key!==null&&JSON.stringify(JSON.parse(s.matchKey))===key)||s.site.postcode.replace(/\s/gu, "") === postcode.toUpperCase().replace(/\s/gu, "")) ?? [];
  async function command(input: JobPartiesCommandV1) {
    const response = await fetch(`/api/jobs/${jobId}/parties`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
    const result = await response.json(); if (!response.ok) throw new Error(result.code === "REVISION_CONFLICT" ? "This job changed. Reload the details before saving again." : result.code ?? "Details could not be saved.");
    return jobPartiesCommandResultV1.parse(result) as { id: string; revisionId: string };
  }
  async function save() {
    if (!view || busy) return; setBusy(true); setError("");
    try {
      const selected = view.customers.find(c => c.id === customerId);
      const customer = { version: "customer.v1" as const, name, type, ...(email ? { email } : {}), ...(phone ? { phone } : {}), ...(companyNumber ? { companyNumber } : {}) };
      const customerResult = selected ? selected.customer.name === name && selected.customer.type === type && (selected.customer.email ?? "") === email && (selected.customer.phone ?? "") === phone && (selected.customer.companyNumber ?? "") === companyNumber
        ? { revisionId: selected.revisionId } : await command({ version: "job-parties-command.v1", commandId: crypto.randomUUID(), action: "revise_customer", customerId: selected.id, expectedRevision: selected.revision, customer })
        : await command({ version: "job-parties-command.v1", commandId: crypto.randomUUID(), action: "create_customer", customer });
      const siteResult = await command({ version: "job-parties-command.v1", commandId: crypto.randomUUID(), action: "create_site", site, confirmSamePlace: confirm, ...(reuse ? { reuseSiteId: reuse } : {}) });
      await command({ version: "job-parties-command.v1", commandId: crypto.randomUUID(), action: ["live", "invoiced", "paid"].includes(view.status) ? "correct" : "bind", expectedJobRevision: view.jobRevision,
        parties: { version: "job-parties.v1", customerRevisionId: customerResult.revisionId, siteRevisionId: siteResult.revisionId, payingPartyRevisionId: payer || null }, ...(reason ? { reason } : {}) });
      await load(); window.dispatchEvent(new CustomEvent("job-parties-saved", { detail: jobId }));
    } catch (e) { setError(e instanceof Error ? e.message : "Details could not be saved."); } finally { setBusy(false); }
  }
  async function adopt() {
    if (!view?.current || busy) return; setBusy(true); setError("");
    try { const response=await fetch(`/api/jobs/${jobId}/parties/import`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({version:"job-parties-import.v1",commandId:crypto.randomUUID(),expectedBindingId:view.current.bindingId})}); const result=await response.json(); if(!response.ok)throw new Error(result.code??"Import could not be confirmed"); location.assign(`/jobs/${jobPartiesImportResultV1.parse(result).jobId}`); }
    catch(e) { setError(e instanceof Error?e.message:"Import could not be confirmed");setBusy(false); }
  }
  return <section className={`review ${styles.panel}`} aria-labelledby={`parties-${jobId}`} style={{ minWidth: 0 }}>
    <h2 id={`parties-${jobId}`}>Customer and site</h2>
    <p>Use the supplied fictional details only. Do not enter real names, addresses or contact details.</p>
    {view?.current ? <dl data-testid="job-party-details"><dt>Customer</dt><dd data-testid="party-customer">{view.current.customer.name}</dd><dt>Site</dt><dd data-testid="party-site">{[view.current.site.unit, ...view.current.site.addressLines, view.current.site.town, view.current.site.postcode].filter(Boolean).join(", ")}</dd><dt>Who pays?</dt><dd data-testid="party-payer">{view.current.payingParty.name}</dd><dt>Saved binding</dt><dd style={{ overflowWrap: "anywhere" }} data-testid="party-binding-id">{view.current.bindingId}</dd></dl> : <p>{view ? "Details needed — add a customer and site before previewing a quote or switching live." : "Loading customer and site…"}</p>}
    <p>The supplied fictional underway job can be imported with these saved parties. Its £1,000.00 baseline is builder-attested; it creates no historic billing.</p>
    <button type="button" disabled={!view?.current||busy} onClick={()=>void adopt()}>Import the fictional underway job</button>
    {!view?.current&&<p>Customer and site are required before adopting an underway job.</p>}
    {error && <p ref={errorRef} tabIndex={-1} role="alert">{error}</p>}
    {!view ? <button onClick={() => void load().catch(e => setError(e.message))}>Try loading details again</button> : <form onSubmit={e => { e.preventDefault(); void save(); }} aria-label="Customer and site details">
      <p>Unsaved draft — use Save customer and site to record it.</p>
      <fieldset disabled={busy} style={{ minWidth: 0, border: 0, padding: 0 }}>
        <label>Choose a customer<select aria-label="Choose a customer" value={customerId} onChange={e => { setCustomerId(e.target.value); const c = view.customers.find(x => x.id === e.target.value); if (c) { setName(c.customer.name); setType(c.customer.type); setEmail(c.customer.email ?? ""); setPhone(c.customer.phone ?? "");setCompanyNumber(c.customer.companyNumber ?? ""); } }}><option value="">Create a customer</option>{view.customers.map(c => <option key={c.id} value={c.id}>{c.customer.name}</option>)}</select></label>
        <label>Customer name<input aria-label="Customer name" value={name} onChange={e => setName(e.target.value)} required maxLength={160}/></label>
        <label>Customer type<select aria-label="Customer type" value={type} onChange={e => setType(e.target.value as typeof type)}>{customerTypes.map((t, i) => <option key={t} value={t}>{labels[i]}</option>)}</select></label>
        <label>Customer email (fictional, optional)<input aria-label="Customer email (fictional, optional)" value={email} onChange={e => setEmail(e.target.value)} type="email"/></label>
        <label>Customer phone (fictional, optional)<input aria-label="Customer phone (fictional, optional)" value={phone} onChange={e=>setPhone(e.target.value)} maxLength={40}/></label>
        <label>Company number (optional)<input aria-label="Company number (optional)" value={companyNumber} onChange={e=>setCompanyNumber(e.target.value.toUpperCase())} maxLength={8}/></label>
        <label>Who pays?<select aria-label="Who pays?" value={payer} onChange={e => setPayer(e.target.value)}><option value="">Same as customer</option>{view.customers.map(c => <option key={c.id} value={c.revisionId}>{c.customer.name}</option>)}</select></label>
        <label>Premises address<input aria-label="Premises address" value={address} onChange={e => { setAddress(e.target.value); setReuse(""); setConfirm(false); }} required/></label>
        <label>Town<input aria-label="Town" value={town} onChange={e => setTown(e.target.value)} required/></label>
        <label>UK postcode<input aria-label="UK postcode" value={postcode} onChange={e => setPostcode(e.target.value)} required/></label>
        <label>Flat or unit (optional)<input aria-label="Flat or unit (optional)" value={unit} onChange={e => { setUnit(e.target.value); setReuse(""); setConfirm(false); }}/></label>
        <label>UPRN (optional)<input aria-label="UPRN (optional)" value={uprn} onChange={e => setUprn(e.target.value)} inputMode="numeric"/></label>
        {suggestions.length > 0 && <><label>Possible existing places<select aria-label="Possible existing places" value={reuse} onChange={e => { setReuse(e.target.value); setConfirm(false); }}><option value="">Create a separate site</option>{suggestions.map(s => <option key={s.id} value={s.id}>{s.site.unit ?? "No unit recorded"} · {s.site.addressLines.join(", ")}{key && JSON.stringify(JSON.parse(s.matchKey)) === key ? " (matching address)" : " (near match)"}</option>)}</select></label>{reuse && <label><input type="checkbox" aria-label="I confirm this is the same place" checked={confirm} onChange={e => setConfirm(e.target.checked)}/>I confirm this is the same place</label>}<p>Suggestions are never merged automatically. Different flats remain separate.</p></>}
        {["live", "invoiced", "paid"].includes(view.status) && <label>Reason for correction<input aria-label="Reason for correction" value={reason} onChange={e => setReason(e.target.value)} required maxLength={500}/></label>}
        <button type="submit" className="primary" disabled={!!reuse && !confirm} style={{ minHeight: 44, minWidth: 44 }}>Save customer and site</button>
      </fieldset>
    </form>}
  </section>;
}
