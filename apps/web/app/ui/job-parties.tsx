"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { customerTypes, jobPartiesCommandResultV1, jobPartiesImportResultV1, jobPartiesWorkspaceV1, siteMatchKey, type JobPartiesCommandV1 } from "@jobguard/core";
import type { z } from "zod";
import { MAX_ADDRESS_LINES, addressLinesFromDraft, moreAddressLines, sameSite } from "./job-parties-draft";
import styles from "./job-parties.module.css";
const labels = ["A person (homeowner)", "A business", "Landlord or letting agent", "Insurer", "Main contractor", "Housing association", "Council"];
type View = z.infer<typeof jobPartiesWorkspaceV1>;
const CHANGED_MESSAGE = "This job changed. Reload the details before saving again. The latest saved details are now shown. If a shared customer or payer changed in the registry, its latest registry details are shown in the draft; saving again uses that revision. Check them before saving again.";
const WENT_LIVE_MESSAGE = "This job went live after you opened these details. The latest details are now shown; a change now needs a reason for the correction.";
const REASON_MESSAGE = "A change to a live job needs a reason for the correction. Add the reason and save again.";
class PartiesConflict extends Error {}
type DraftRefs = { customerId: string; payer: string; reuse: string };
const isLive = (status: string) => ["live", "invoiced", "paid"].includes(status);
/** Has what the draft depends on (binding, referenced customer, payer or site revisions) changed since `observed`? Job progress alone is not a change. */
function partiesChanged(observed: View, latest: View, refs: DraftRefs): boolean {
  if ((observed.currentIds?.bindingId ?? null) !== (latest.currentIds?.bindingId ?? null)) return true;
  const revisionOf = (view: View, id: string) => view.customers.find(c => c.id === id)?.revisionId ?? null;
  const referenced = [refs.customerId, observed.customers.find(c => c.revisionId === refs.payer)?.id ?? (observed.current?.payingPartyRevisionId === refs.payer ? observed.currentIds?.payingPartyId : "") ?? ""].filter(Boolean);
  if (referenced.some(id => revisionOf(observed, id) !== revisionOf(latest, id))) return true;
  return !!refs.reuse && observed.sites.find(x => x.id === refs.reuse)?.revisionId !== latest.sites.find(x => x.id === refs.reuse)?.revisionId;
}
/** Why a save must be refused before anything is written, or null when the draft is still current. */
function conflictSince(observed: View, latest: View, refs: DraftRefs): string | null {
  if (isLive(observed.status) !== isLive(latest.status)) return WENT_LIVE_MESSAGE;
  return partiesChanged(observed, latest, refs) ? CHANGED_MESSAGE : null;
}
export function JobParties({ jobId }: { jobId: string }) {
  const [view, setView] = useState<View | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [customerRevisionId, setCustomerRevisionId] = useState("");
  const [customerId, setCustomerId] = useState(""), [name, setName] = useState("Practice Customer"), [type, setType] = useState<(typeof customerTypes)[number]>("person");
  const [email, setEmail] = useState("practice-customer@example.invalid"), [payer, setPayer] = useState("");
  const [phone,setPhone]=useState(""),[companyNumber,setCompanyNumber]=useState("");
  const [address, setAddress] = useState("14 Fictional Street"), [more, setMore] = useState(""), [town, setTown] = useState("London"), [postcode, setPostcode] = useState("SW1A 1AA");
  const [unit, setUnit] = useState(""), [uprn, setUprn] = useState(""), [reuse, setReuse] = useState(""), [confirm, setConfirm] = useState(false), [reason, setReason] = useState("");
  const errorRef = useRef<HTMLParagraphElement>(null);
  const fetchView = useCallback(async () => {
    const response = await fetch(`/api/jobs/${jobId}/parties`, { cache: "no-store" });
    if (!response.ok) throw new Error("Customer and site could not load. Try again.");
    return jobPartiesWorkspaceV1.parse(await response.json());
  }, [jobId]);
  // `view` is what the panel shows and may be refreshed at any time. `baseline` is what the draft was edited against: it is set when the
  // panel first loads (the draft is then filled from the saved parties), after a save, and when a stale draft is reloaded. Background
  // refreshes never advance it.
  const baseline = useRef<View | null>(null), draftRefs = useRef({ customerId: "", payer: "", reuse: "" });
  draftRefs.current = { customerId, payer, reuse };
  const load = useCallback(async () => { const snapshot = await fetchView(); setView(snapshot); if (baseline.current === null) { baseline.current = snapshot; resetDraft(snapshot); } return snapshot; }, [fetchView]);
  useEffect(() => {
    const refresh = (event: Event) => {
      if ((event as CustomEvent).detail !== jobId) return;
      void fetchView().then(latest => {
        setView(latest);
        // Another writer changed what the draft depends on: reload the draft now rather than keep stale text beside a refreshed view.
        if (baseline.current && partiesChanged(baseline.current, latest, draftRefs.current)) { baseline.current = latest; resetDraft(latest, true); setError(CHANGED_MESSAGE); }
      }).catch(e => setError(e.message));
    };
    void load().catch(e => setError(e.message)); window.addEventListener("job-lifecycle-changed", refresh); return () => window.removeEventListener("job-lifecycle-changed", refresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, fetchView, jobId]);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  const site = { version: "site.v1" as const, addressLines: addressLinesFromDraft(address, more), town, postcode, ...(unit ? { unit } : {}), ...(uprn ? { uprn } : {}) };
  let key: string | null = null; try { key = siteMatchKey(site); } catch { /* The form shows validation errors on save. */ }
  const suggestions = view?.sites.filter(s => (key!==null&&JSON.stringify(JSON.parse(s.matchKey))===key)||s.site.postcode.replace(/\s/gu, "") === postcode.toUpperCase().replace(/\s/gu, "")) ?? [];
  async function command(input: JobPartiesCommandV1) {
    const response = await fetch(`/api/jobs/${jobId}/parties`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
    const result = await response.json();
    if (!response.ok) {
      if (result.code === "REVISION_CONFLICT") throw new PartiesConflict(CHANGED_MESSAGE);
      if (result.code === "CORRECTION_REASON_REQUIRED") throw new Error(REASON_MESSAGE);
      throw new Error(result.code ?? "Details could not be saved.");
    }
    return jobPartiesCommandResultV1.parse(result) as { id: string; revisionId: string };
  }
  /** Hydrate the bound snapshot; only an explained registry conflict prepares newer party revisions for a deliberate retry. */
  function resetDraft(snapshot: View, registryConflict = false) {
    setReuse(""); setConfirm(false); setReason("");
    const saved = snapshot.current, ids = snapshot.currentIds; if (!saved || !ids) return;
    const registry = snapshot.customers.find(c => c.id === ids.customerId);
    const customer = registryConflict ? registry?.customer ?? saved.customer : saved.customer;
    setCustomerRevisionId(registryConflict ? registry?.revisionId ?? saved.customerRevisionId : saved.customerRevisionId);
    setCustomerId(ids.customerId); setName(customer.name); setType(customer.type); setEmail(customer.email ?? ""); setPhone(customer.phone ?? ""); setCompanyNumber(customer.companyNumber ?? "");
    setPayer(saved.payingPartyRevisionId === saved.customerRevisionId ? "" : registryConflict
      ? snapshot.customers.find(c => c.id === ids.payingPartyId)?.revisionId ?? saved.payingPartyRevisionId : saved.payingPartyRevisionId);
    setAddress(saved.site.addressLines[0] ?? ""); setMore(moreAddressLines(saved.site.addressLines)); setTown(saved.site.town); setPostcode(saved.site.postcode); setUnit(saved.site.unit ?? ""); setUprn(saved.site.uprn ?? "");
  }
  /** Choosing a customer, payer or site copies the values being shown into the draft, so the baseline now records those revisions. */
  function rebase(change: (b: View) => View) { if (baseline.current) baseline.current = change(baseline.current); }
  async function save() {
    const observed = baseline.current; if (!view || !observed || busy) return; setBusy(true); setError("");
    try {
      // The job moves on without this panel (scope confirmed, quote saved), so bind against the revision the server holds now,
      // but only when the parties and customer revisions this draft was edited against are unchanged. Otherwise nothing is
      // written: show the latest details and let the user decide. The database still compares the expected revision, so two
      // writers racing on one revision get one success and one typed conflict.
      const latest = await fetchView();
      const conflict = conflictSince(observed, latest, draftRefs.current);
      if (conflict) { setView(latest); baseline.current = latest; resetDraft(latest, conflict === CHANGED_MESSAGE); setError(conflict); return; }
      setView(latest);
      if (site.addressLines.length > MAX_ADDRESS_LINES) { setError("A site address can have at most four lines. Remove the extra lines and save again."); return; }
      const selected = latest.customers.find(c => c.id === customerId);
      const customer = { version: "customer.v1" as const, name, type, ...(email ? { email } : {}), ...(phone ? { phone } : {}), ...(companyNumber ? { companyNumber } : {}) };
      const matchesDraft = (value: View["customers"][number]["customer"]) => value.name === name && value.type === type && (value.email ?? "") === email && (value.phone ?? "") === phone && (value.companyNumber ?? "") === companyNumber;
      // The registry lists the newest revisions for explicit selection and stale-edit checks. It is never the source of an
      // unchanged saved party. Editing an older snapshot needs an explained conflict before it can revise the registry.
      const savedCustomer = latest.current && latest.currentIds?.customerId === customerId && latest.current.customerRevisionId === customerRevisionId && matchesDraft(latest.current.customer);
      if (selected && !savedCustomer && selected.revisionId !== customerRevisionId) throw new PartiesConflict(CHANGED_MESSAGE);
      const customerResult = savedCustomer ? { revisionId: customerRevisionId } : selected ? matchesDraft(selected.customer)
        ? { revisionId: selected.revisionId } : await command({ version: "job-parties-command.v1", commandId: crypto.randomUUID(), action: "revise_customer", customerId: selected.id, expectedRevision: selected.revision, customer })
        : await command({ version: "job-parties-command.v1", commandId: crypto.randomUUID(), action: "create_customer", customer });
      // The saved site keeps its identity unless the user chose another place or changed it; only then is a site created (or reused with confirmation).
      const bound = latest.current;
      const siteResult = !reuse && bound && sameSite(site, bound.site) ? { revisionId: bound.siteRevisionId }
        : await command({ version: "job-parties-command.v1", commandId: crypto.randomUUID(), action: "create_site", site, confirmSamePlace: confirm, ...(reuse ? { reuseSiteId: reuse } : {}) });
      await command({ version: "job-parties-command.v1", commandId: crypto.randomUUID(), action: ["live", "invoiced", "paid"].includes(latest.status) ? "correct" : "bind", expectedJobRevision: latest.jobRevision,
        parties: { version: "job-parties.v1", customerRevisionId: customerResult.revisionId, siteRevisionId: siteResult.revisionId, payingPartyRevisionId: payer || null }, ...(reason ? { reason } : {}) });
      const saved = await fetchView(); setView(saved); baseline.current = saved; resetDraft(saved); window.dispatchEvent(new CustomEvent("job-parties-saved", { detail: jobId }));
    } catch (e) {
      if (e instanceof PartiesConflict) { try { const latest = await fetchView(); setView(latest); baseline.current = latest; resetDraft(latest, true); } catch { /* the message below still tells the user to reload */ } }
      setError(e instanceof Error ? e.message : "Details could not be saved.");
    } finally { setBusy(false); }
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
      {view.current && customerRevisionId === view.current.customerRevisionId && view.customers.some(c => c.id === customerId && c.revisionId !== customerRevisionId) && <p>This job keeps its saved customer revision. Choose the customer again to use the latest registry details.</p>}
      <fieldset disabled={busy} style={{ minWidth: 0, border: 0, padding: 0 }}>
        <label>Choose a customer<select aria-label="Choose a customer" value={customerId} onChange={e => { setCustomerId(e.target.value); setCustomerRevisionId(""); const c = view.customers.find(x => x.id === e.target.value); if (c) { setCustomerRevisionId(c.revisionId); rebase(b => ({ ...b, customers: [...b.customers.filter(x => x.id !== c.id), c] })); setName(c.customer.name); setType(c.customer.type); setEmail(c.customer.email ?? ""); setPhone(c.customer.phone ?? "");setCompanyNumber(c.customer.companyNumber ?? ""); } }}><option value="">Create a customer</option>{view.customers.map(c => <option key={c.id} value={c.id}>{c.customer.name}</option>)}</select></label>
        <label>Customer name<input aria-label="Customer name" value={name} onChange={e => setName(e.target.value)} required maxLength={160}/></label>
        <label>Customer type<select aria-label="Customer type" value={type} onChange={e => setType(e.target.value as typeof type)}>{customerTypes.map((t, i) => <option key={t} value={t}>{labels[i]}</option>)}</select></label>
        <label>Customer email (fictional, optional)<input aria-label="Customer email (fictional, optional)" value={email} onChange={e => setEmail(e.target.value)} type="email"/></label>
        <label>Customer phone (fictional, optional)<input aria-label="Customer phone (fictional, optional)" value={phone} onChange={e=>setPhone(e.target.value)} maxLength={40}/></label>
        <label>Company number (optional)<input aria-label="Company number (optional)" value={companyNumber} onChange={e=>setCompanyNumber(e.target.value.toUpperCase())} maxLength={8}/></label>
        <label>Who pays?<select aria-label="Who pays?" value={payer} onChange={e => { const c = view.customers.find(x => x.revisionId === e.target.value); if (c) rebase(b => ({ ...b, customers: [...b.customers.filter(x => x.id !== c.id), c] })); setPayer(e.target.value); }}><option value="">Same as customer</option>{view.current && view.current.payingPartyRevisionId !== view.current.customerRevisionId && !view.customers.some(c => c.revisionId === view.current!.payingPartyRevisionId) && <option value={view.current.payingPartyRevisionId}>{view.current.payingParty.name} (saved revision)</option>}{view.customers.map(c => <option key={c.id} value={c.revisionId}>{c.customer.name}</option>)}</select></label>
        <label>Premises address<input aria-label="Premises address" value={address} onChange={e => { setAddress(e.target.value); setReuse(""); setConfirm(false); }} required/></label>
        <label>More address lines (optional, one per line)<textarea aria-label="More address lines (optional, one per line)" value={more} onChange={e => { setMore(e.target.value); setReuse(""); setConfirm(false); }} rows={3}/></label>
        <label>Town<input aria-label="Town" value={town} onChange={e => { setTown(e.target.value); setReuse(""); setConfirm(false); }} required/></label>
        <label>UK postcode<input aria-label="UK postcode" value={postcode} onChange={e => { setPostcode(e.target.value); setReuse(""); setConfirm(false); }} required/></label>
        <label>Flat or unit (optional)<input aria-label="Flat or unit (optional)" value={unit} onChange={e => { setUnit(e.target.value); setReuse(""); setConfirm(false); }}/></label>
        <label>UPRN (optional)<input aria-label="UPRN (optional)" value={uprn} onChange={e => { setUprn(e.target.value); setReuse(""); setConfirm(false); }} inputMode="numeric"/></label>
        {suggestions.length > 0 && <><label>Possible existing places<select aria-label="Possible existing places" value={reuse} onChange={e => { const x = view.sites.find(y => y.id === e.target.value); if (x) rebase(b => ({ ...b, sites: [...b.sites.filter(y => y.id !== x.id), x] })); setReuse(e.target.value); setConfirm(false); }}><option value="">Create a separate site</option>{suggestions.map(s => <option key={s.id} value={s.id}>{s.site.unit ?? "No unit recorded"} · {s.site.addressLines.join(", ")}{key && JSON.stringify(JSON.parse(s.matchKey)) === key ? " (matching address)" : " (near match)"}</option>)}</select></label>{reuse && <label><input type="checkbox" aria-label="I confirm this is the same place" checked={confirm} onChange={e => setConfirm(e.target.checked)}/>I confirm this is the same place</label>}<p>Suggestions are never merged automatically. Different flats remain separate.</p></>}
        {["live", "invoiced", "paid"].includes(view.status) && <label>Reason for correction<input aria-label="Reason for correction" value={reason} onChange={e => setReason(e.target.value)} required maxLength={500}/></label>}
        <button type="submit" className="primary" disabled={!!reuse && !confirm} style={{ minHeight: 44, minWidth: 44 }}>Save customer and site</button>
      </fieldset>
    </form>}
  </section>;
}
